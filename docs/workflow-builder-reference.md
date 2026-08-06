# Referência: Builder de Processos BPM (CoreFlow)

> Documento de referência técnica e conceitual sobre como o builder de fluxos de aprovação funciona hoje no CoreFlow. Objetivo: servir de base conceitual para desenhar um fluxo BPM (em formato de fluxograma) num orquestrador de agentes em outra plataforma, definindo etapas, ações e campos por nó.

---

## 1. Conceitos fundamentais

O sistema separa claramente **modelo** (o que pode acontecer) de **execução** (o que está acontecendo):

| Conceito | O que é | Analogia |
|---|---|---|
| **Template** (`workflow_templates`) | A definição reutilizável do processo: etapas, campos, regras de aprovação | A "planta" do fluxo, o BPMN |
| **Instância** (`workflow_instances`) | Uma execução concreta do template, com dados preenchidos e progresso real | Um "processo em andamento" |

Um Template é composto por uma árvore:

```
WorkflowTemplate
 └─ Step[]                  (etapas, ordenadas)
     └─ FormSection[]       (seções dentro da etapa)
         └─ CustomField[]   (campos dentro da seção)
```

Uma Instância espelha essa árvore, mas guarda **estado de execução** por etapa (`workflow_instance_steps`) e **valores preenchidos** por campo (`workflow_instance_data`), além do **histórico de aprovações** (`approval_history`).

---

## 2. Anatomia de uma Etapa (Step)

Cada etapa do processo tem:

```typescript
interface Step {
  id: string;
  name: string;
  order: number;                    // posição no fluxo (sequencial, 1..N)
  stepType?: 'form' | 'checklist' | 'monitor';
  requiresApproval: 'none' | 'simple' | 'value-based';
  cascadeMode?: 'all' | 'skip';     // só relevante se requiresApproval='value-based'
  valueFieldKey?: string;           // label do campo numérico usado na alçada
  deadlineDays?: number;            // prazo em dias a partir do início da etapa
  icon?: string;                    // ícone visual (lucide-react)
  formSections: FormSection[];
  stepApprovers?: StepApproverConfig[];
}
```

### 2.1 Tipo de etapa (`stepType`)

O builder oferece três "modos de execução" para uma etapa — isso é o equivalente mais próximo a "tipo de nó/ação" num orquestrador:

| Tipo | Comportamento | Uso típico |
|---|---|---|
| **`form`** | Usuário preenche campos e submete. Pode exigir aprovação. | Solicitação, cadastro de dados, formulário de negócio |
| **`checklist`** | Cada "seção" da etapa vira um item marcável (concluído/pendente). A etapa avança quando todos os itens estão marcados. | Tarefas operacionais, conferências, onboarding |
| **`monitor`** | Etapa sem formulário — existe apenas para acompanhar prazo (`deadlineDays` é obrigatório) e disparar alerta visual quando perto de vencer. | SLA de espera, "aguardando terceiro", follow-up |

### 2.2 Prazo (`deadlineDays`)

Cada etapa pode ter um prazo em dias. Quando a instância entra na etapa, o sistema calcula `deadline_at = started_at + deadlineDays`. Isso é usado para alertas visuais (etapas atrasadas) no monitor do fluxo, não bloqueia a execução.

### 2.3 Ordem e navegação

As etapas são estritamente sequenciais e lineares (não há bifurcação condicional de caminho no modelo atual — todo processo percorre `Step[0] → Step[1] → ... → Step[N]` em ordem). A única "ramificação" existente é dentro da aprovação (quem aprova, ver seção 4) e no roteamento por alçada de valor (que decide **quem** aprova, não para onde o processo vai).

> **Observação para o orquestrador de agentes**: se o novo sistema precisar de fluxos não-lineares (bifurcações, loops, paralelismo), isso é uma evolução em relação ao modelo atual — vale desenhar isso deliberadamente, já que aqui o "próximo passo" é sempre "a próxima etapa na lista".

---

## 3. Seções e Campos (o que se coleta em cada etapa)

Uma etapa do tipo `form` é dividida em **seções** (`FormSection`), puramente organizacionais (agrupam campos visualmente), e cada seção contém uma lista de **campos customizados** (`CustomField`).

Numa etapa do tipo `checklist`, cada "seção" representa um item da lista de tarefas (o campo `title` da seção vira o nome da tarefa).

### 3.1 Tipos de campo disponíveis

| Tipo | Descrição | Configuração específica |
|---|---|---|
| `text` | Texto livre | `placeholder` |
| `number` | Numérico | pode ser usado como campo de valor para alçada de aprovação |
| `date` | Data | — |
| `select` | Lista de opções (dropdown) | `options: {label, value}[]` |
| `checkbox` | Booleano | — |
| `attachment` | Upload de arquivo (Supabase Storage) | `maxFiles`, `acceptedTypes` (ex: `.pdf,.xlsx` ou `image/*`) |
| `entity-reference` | Referência a um cadastro (fornecedor, cliente, solicitante, ou um "cadastro personalizado" dinâmico) | `entityType`, `customEntityTypeId` |
| `table` | Tabela interna com colunas tipadas, o usuário adiciona N linhas | `tableColumns: TableColumn[]` |
| `reference-table` | Expande uma tabela preenchida numa etapa **anterior**, adicionando colunas extras por linha (ex: etapa 1 lista itens; etapa 2 adiciona "fornecedor" e "preço" por item) | `referenceTableConfig: { referenceStepId, referenceFieldId, allowMultiplePerItem, additionalColumns }` |
| `summary` | Campo somente-leitura, calculado automaticamente a partir de uma coluna numérica de um campo `table`/`reference-table` da mesma etapa | `summaryConfig: { sourceTableFieldId, sourceColumnId, operation: sum\|average\|count\|min\|max, format }` |

Todo campo tem `required: boolean` e um `label`.

### 3.2 Colunas de tabela (`TableColumn`)

Campos `table` e `reference-table` têm colunas tipadas:

```typescript
type TableColumnType = 'text' | 'checkbox' | 'date' | 'datetime' | 'number' | 'select' | 'calculated';
```

Uma coluna `calculated` deriva seu valor de duas outras colunas numéricas da mesma linha:

```typescript
interface CalculatedColumnConfig {
  operation: 'multiply' | 'add' | 'subtract' | 'divide';
  column1Id: string;
  column2Id: string;
  format?: 'currency' | 'number' | 'percentage';
}
```

Isso permite, por exemplo, uma tabela de itens de compra com colunas `Quantidade` × `Preço Unitário` = `Total` (calculada), e depois um campo `summary` na mesma etapa somando a coluna `Total` de todas as linhas.

### 3.3 Referência entre etapas (`reference-table`)

Um padrão importante do modelo: uma etapa posterior pode **referenciar uma tabela de uma etapa anterior** e adicionar colunas extras por item, sem duplicar a digitação. Exemplo típico: etapa "Solicitação" lista itens desejados; etapa "Cotação" referencia essa tabela e adiciona colunas "Fornecedor" e "Preço" para cada item (com opção de permitir múltiplas cotações por item).

Isso é essencialmente uma forma de **encadear dados entre nós do fluxo** — relevante para o orquestrador: um "campo" pode ter uma dependência declarada em um nó anterior.

---

## 4. Motor de Aprovação

Este é o núcleo mais relevante para modelar "ações/gates" em um fluxograma BPM.

### 4.1 Tipos de aprovação por etapa (`requiresApproval`)

- **`none`** — a etapa não precisa de aprovação; ao ser submetida, avança automaticamente para a próxima.
- **`simple`** — a etapa precisa que uma lista ordenada de aprovadores (`workflow_step_approvers`) aprove, **todos em sequência**, antes de avançar.
- **`value-based`** — a aprovação depende do valor de um campo numérico do formulário (alçada), roteando para o(s) aprovador(es) certos.

### 4.2 Aprovadores sequenciais (`StepApproverConfig`)

```typescript
interface StepApproverConfig {
  userId: string;
  userName: string;
  order: number;                        // ordem de aprovação
  valueThresholdMax?: number | null;    // limite de alçada (null = sem limite / autoridade máxima)
  extraConditions?: ExtraCondition[];   // condições adicionais (definidas no modelo, pouco usadas hoje)
}
```

Regra geral: **uma etapa só avança quando TODOS os aprovadores "ativos" daquela execução tiverem aprovado** (na ordem definida). Uma única reprovação de qualquer aprovador **encerra a etapa e rejeita toda a instância** (não há "reenvio" — é um caminho terminal).

### 4.3 Alçada de valor (`value-based`) — como o roteamento funciona

1. No builder, o admin escolhe um **campo numérico** da própria etapa como `valueFieldKey` (ex: "Valor Total").
2. Cada aprovador recebe um `valueThresholdMax` — o teto de valor que ele tem autoridade para aprovar sozinho. O aprovador sem `valueThresholdMax` (null) é o "aprovador de teto", cobre qualquer valor.
3. Ao **submeter** a etapa, o sistema lê o valor preenchido no campo `valueFieldKey` e calcula quais aprovadores participam desta execução específica, conforme o **modo de escalonamento** (`cascadeMode`):

| Modo | Nome na UI | Comportamento |
|---|---|---|
| `skip` | "Alçada exata" | Só o aprovador com a **menor alçada que já cobre o valor** aprova (pula os de alçada menor) |
| `all` | "Escalada completa" | **Todos** os aprovadores da lista, do primeiro até o que cobre o valor (inclusive), precisam aprovar em sequência |

Essa lista resolvida fica congelada em `workflow_instance_steps.active_approver_ids` no momento da submissão — mudanças futuras na configuração do template não afetam instâncias já em andamento.

**Exemplo de "fórmula" que o builder mostra ao admin** (gerada automaticamente a partir da config):
```
SE "Valor Total" ≤ R$ 5.000,00        →  João aprova
SE R$ 5.000,00 < "Valor Total" ≤ R$ 20.000,00  →  João + Maria aprovam   (modo "all")
SE "Valor Total" > R$ 20.000,00       →  João + Maria + Diretor aprovam
```
(no modo `skip`, cada faixa listaria só um aprovador, o dono daquela faixa)

### 4.4 Máquina de estados da etapa/instância

Status de etapa (`workflow_instance_steps.status`): `pending → in-progress → (approved | rejected | completed)`

Status de instância (`workflow_instances.status`): `pending | in-progress | approved | rejected | completed`

Transições:

- **Submeter etapa sem aprovação** → etapa vira `completed`, instância avança `current_step_id` para a próxima etapa (ou vira `completed` se era a última).
- **Submeter etapa com aprovação** → etapa permanece `in-progress`; se `value-based`, calcula e grava `active_approver_ids`.
- **Aprovar** (`approveWorkflowStep`) → registra voto em `approval_history`; se **todos** os aprovadores necessários já votaram `approved`, etapa vira `approved` e a instância avança (ou conclui).
- **Reprovar** (`rejectWorkflowStep`) → registra voto `rejected`; etapa vira `rejected`; **instância inteira vira `rejected`** (fim do processo, sem retrabalho automático).
- **Checklist**: cada "seção/item" é marcado via `toggleSectionComplete`; quando todos os itens de uma etapa `checklist` estão marcados, `completeChecklistStep` avança a etapa exatamente como uma etapa sem aprovação.
- **Cancelamento manual**: `cancelWorkflowInstance` só é permitido se nenhuma etapa já tiver sido `completed`/`approved` (não é possível cancelar um processo que já avançou).

### 4.5 Notificação do aprovador

Ao submeter uma etapa com aprovação (ou após um voto parcial), o sistema identifica o **próximo aprovador na fila que ainda não votou** e dispara uma notificação via WhatsApp (`notifyNextApprover`), com um token de aprovação de uso único (expira em 7 dias) que permite aprovar/reprovar direto pelo link, sem login. A mensagem inclui um resumo dos campos preenchidos na etapa (até 8 campos simples: texto/número/data/select/checkbox).

---

## 5. Representação visual (fluxograma)

O sistema já renderiza os templates como um fluxograma SVG (`WorkflowFlowSection.tsx`), com uma gramática de nós equivalente a um BPMN simplificado:

| Nó | Forma | Significado |
|---|---|---|
| **Início** | Círculo verde | Entrada do processo |
| **Task** | Retângulo (card) | Uma etapa (`form`/`checklist`/`monitor`), colorido por tipo (azul=form, roxo=checklist, âmbar=monitor) |
| **Gateway** | Losango amarelo "Aprovação" | Inserido automaticamente logo após toda etapa com `requiresApproval !== 'none'` |
| **Fim** | Círculo vermelho | Saída do processo |

O grafo é sempre **linear** (uma sequência: start → task → [gateway] → task → [gateway] → ... → end), sem ramificações visuais — reforça que hoje não existe desvio condicional de caminho, só variação de **quem aprova**.

Cada nó "task" mostra um badge com a contagem de instâncias atualmente paradas naquela etapa (clicável, abre um drawer lateral com a lista de processos, tempo parado, aprovadores pendentes, e um botão de "cobrar" que envia lembrete via WhatsApp).

---

## 6. Restrições de acesso e escopo

- **Escopo por unidade** (`workflow_template_scopes`): um template pode ser restrito a determinadas `locations` (filiais/departamentos). Sem seleção = disponível para todos.
- **Permissão por etapa** (`workflow_step_permissions`): controla quem pode `fill` (preencher) ou `edit` uma etapa específica — granularidade abaixo do nível de aprovador.
- **Papéis de usuário**: `admin`, `approver`, `user`, `user_approver` (usuário que também pode aprovar).

---

## 7. Cadastros vinculáveis (Master Data)

Campos `entity-reference` conectam o formulário a registros de cadastro, dos quais existem dois tipos:

1. **Cadastros fixos do sistema**: `suppliers`, `customers`, `requesters`, `locations`.
2. **Cadastros dinâmicos** (`entity_types` / `entity_records`, tabela `DynamicEntityType`): o admin define um "tipo de cadastro" customizado com campos próprios (texto, email, telefone, número, data, select, multiselect, checkbox, referência a outro cadastro, etc.) — essencialmente um mini-builder de tabelas de apoio, reutilizável em qualquer campo `entity-reference` do fluxo.

---

## 8. Modelo de dados (tabelas principais)

```
workflow_templates
 └─ workflow_steps (order, step_type, requires_approval, approval_type,
                     cascade_mode, value_field_key, deadline_days)
     ├─ workflow_sections (order)
     │   └─ custom_fields (field_type, required, options, entity_type,
     │                     reference_step_id, reference_field_id,
     │                     summary_source_*, attachment_*)
     │       └─ table_columns (column_type, calc_*)
     ├─ workflow_step_approvers (user_id, approval_order, value_threshold_max, extra_conditions)
     └─ workflow_step_permissions (user_id, permission: fill|edit)

workflow_instances (status, current_step_id, location_id, created_by_user_id)
 ├─ workflow_instance_steps (status, started_at, deadline_at, active_approver_ids)
 ├─ workflow_instance_data (custom_field_id → value JSONB)
 ├─ workflow_instance_section_status (checklist: completed, completed_by, notes)
 └─ approval_history (approver_id, action: approved|rejected, comments)
```

---

## 9. Modelo conceitual (resumo para portar a outro sistema)

Se for desenhar isso como um fluxograma BPM genérico para orquestrar **agentes** (não apenas formulários humanos), o mapeamento natural é:

| Conceito CoreFlow | Equivalente genérico num orquestrador de agentes |
|---|---|
| `WorkflowTemplate` | Definição do fluxo/playbook |
| `Step` (nó sequencial, `order`) | Nó do fluxograma / etapa do agente |
| `stepType: form\|checklist\|monitor` | Tipo de ação do nó: **coletar dados** / **executar lista de tarefas** / **aguardar condição/prazo** |
| `FormSection` + `CustomField[]` | Schema de input/output do nó (o que o nó precisa produzir ou receber) |
| `requiresApproval: none\|simple\|value-based` | Gate de decisão: **auto-avança** / **precisa de aprovação humana (ou de outro agente) fixa** / **roteamento condicional por regra de valor** |
| `cascadeMode: all\|skip` | Estratégia de escalonamento: **todos os gates em sequência** vs **pular direto para quem tem autoridade** |
| `stepApprovers[]` (order + threshold) | Lista ordenada de "aprovadores"/agentes de decisão, cada um com sua condição de ativação |
| `reference-table` (referencia campo de etapa anterior) | Dependência de dado entre nós (nó consome output de um nó anterior) |
| `deadlineDays` / `stepType: monitor` | Timeout / SLA por nó |
| Gateway (losango) no fluxograma | Ponto de decisão explícito no diagrama, inserido sempre que há um gate de aprovação |
| `workflow_instance_steps.status` | Estado de execução do nó nesta instância (`pending/in-progress/approved/rejected/completed`) |
| `approval_history` | Log de auditoria de decisões |

### Limitação a ter em mente ao evoluir o modelo
O CoreFlow hoje é **estritamente linear** — não existe branch condicional de caminho (só variação de "quem decide", não "para onde vai"). Se o orquestrador de agentes precisar de bifurcações reais (ex: "se resultado X, vai para o nó A; se Y, vai para o nó B") ou paralelismo (múltiplos nós simultâneos), isso precisa ser desenhado como uma extensão — não existe precedente direto neste código para copiar.
