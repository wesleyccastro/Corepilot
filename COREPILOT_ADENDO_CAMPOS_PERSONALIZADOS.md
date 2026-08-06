# Adendo — Campos personalizados por etapa (Orquestrador)

> Complementa a seção 6 (Motor de orquestração) do `COREPILOT_GUIA_IMPLEMENTACAO.md`.
> Base conceitual: referência técnica do builder CoreFlow (`workflow-builder-reference.md`),
> adaptada ao modelo do CorePilot — que, diferente do CoreFlow, já suporta etapas executadas por
> agente e fluxo não estritamente linear (loops, ex: "solicitar correção").

## 1. Princípio central: quem constrói o campo depende do Executor da etapa

O CoreFlow deixa o usuário desenhar campos livremente em toda etapa `form`. No CorePilot isso
**não deve valer igual para todo Executor**, porque uma etapa de agente já tem um contrato de
saída definido na Skill (seção 5 do guia principal — schema estruturado, `tool_choice` forçado).
Se o builder de campos for independente desse schema, criamos exatamente o mesmo problema do
adendo anterior (Tipo × Executor): dois lugares descrevendo a mesma coisa, podendo divergir.

| Executor da etapa | Como os campos aparecem no builder |
|---|---|
| **Usuário** (Interação do usuário, Aprovação) | Builder livre de campos — o usuário da plataforma desenha o formulário (igual ao CoreFlow). |
| **Agente de IA** (Tarefa do agente) | Campos de **saída** são somente leitura, gerados automaticamente a partir do `schema_saida` da Skill escolhida — não editáveis aqui. Campos de **entrada** são apenas referências (checkbox) a campos já existentes em etapas anteriores. |
| **Agente + usuário** (Aprovação assistida) | Saída do agente (somente leitura, do schema da Skill) + campos extras editáveis pelo usuário (builder livre), tipicamente para decisão/ajuste. |
| **Integração** / **Agente + Integração** | Sem builder de campo de negócio; mapeamento técnico de request/response (fora do escopo deste adendo). |
| **Automático** (Decisão automática, Espera/SLA) | Sem campos — no máximo exibe o resultado da condição avaliada. |

Isso significa: **o builder de campos livre (seções 2 a 4 abaixo) só se aplica a etapas com
Executor = Usuário, ou à parte "extra" de Agente + usuário.** Para etapas de agente, o "campo" já
nasce do contrato da Skill — evitando redigitar o mesmo schema em dois lugares.

## 2. Modelo de dados

```
Etapa
 └─ FormSection[] (opcional, só organizacional — pode ter 1 seção implícita por etapa no MVP)
     └─ CustomField[]
         └─ TableColumn[]   (somente se CustomField.tipo = table | reference-table)
```

```typescript
interface CustomField {
  id: string;
  label: string;
  required: boolean;
  tipo: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'attachment'
      | 'entity-reference' | 'table' | 'reference-table' | 'summary';

  // específico por tipo
  placeholder?: string;                          // text
  options?: { label: string; value: string }[];  // select
  maxFiles?: number; acceptedTypes?: string;      // attachment
  entityType?: string; customEntityTypeId?: string; // entity-reference
  tableColumns?: TableColumn[];                   // table | reference-table
  referenceConfig?: {                             // reference-table
    referenceStepId: string;
    referenceFieldId: string;
    allowMultiplePerItem: boolean;
    additionalColumns: TableColumn[];
  };
  summaryConfig?: {                               // summary
    sourceTableFieldId: string;
    sourceColumnId: string;
    operation: 'sum' | 'average' | 'count' | 'min' | 'max';
    format?: 'currency' | 'number' | 'percentage';
  };
}

interface TableColumn {
  id: string;
  label: string;
  tipo: 'text' | 'checkbox' | 'date' | 'datetime' | 'number' | 'select' | 'calculated';
  calc?: { operation: 'multiply'|'add'|'subtract'|'divide'; column1Id: string; column2Id: string; format?: string };
}
```

Isso é praticamente o modelo do CoreFlow (seção 3 da referência), sem a camada Supabase — só o
essencial: `text, number, date, select, checkbox, attachment, entity-reference, table,
reference-table, summary`.

## 3. Referência entre etapas (`reference-table`) — encadeando dados sem redigitar

Esse é o padrão mais valioso da referência para o CorePilot, porque é exatamente o caso do seu
fluxo de Compras: a etapa **Triagem** produz uma lista de itens/solicitações; a etapa **Cotação**
precisa adicionar "fornecedor" e "preço" por item, sem duplicar a digitação.

- Um campo `reference-table` aponta para um campo `table` (ou saída de agente que gerou uma
  lista) de uma etapa **anterior**, e adiciona colunas extras por linha.
- `allowMultiplePerItem`: permite múltiplas cotações por item (ex: 3 fornecedores cotando a
  mesma peça).

**Ajuste necessário em relação ao CoreFlow**: como o CorePilot já suporta **loop** (ex:
"solicitar correção" volta para a etapa de Cotação), `referenceStepId` precisa apontar para a
**etapa do fluxo**, não para uma execução específica — e em runtime a engine resolve para a
**última execução daquela etapa nesta instância de processo**. No CoreFlow isso não existia
porque lá não há como uma etapa ser executada duas vezes na mesma instância.

## 4. Campo calculado e resumo (`table` + `summary`)

Mantém o mesmo padrão do CoreFlow: uma coluna `calculated` deriva de duas colunas numéricas da
mesma linha (`Quantidade × Preço Unitário = Total`), e um campo `summary` na mesma etapa soma
(ou tira média/mín/máx/contagem) de uma coluna de um campo `table`/`reference-table`. Útil para o
"Valor Total" da cotação, que também pode alimentar uma futura regra de alçada (seção 6).

## 5. Como isso conecta com o contrato de saída do agente (Skill)

Quando a etapa é `Tarefa do agente`, o campo de saída **não é redigitado no builder de campos** —
ele é espelhado do `schema_saida` já definido na Skill (guia principal, seção 5). Prática
recomendada para o Claude Code:

1. O schema da Skill já é JSON Schema (ou equivalente TS) — gerar a partir dele uma
   representação somente-leitura no builder de campos da etapa (mesmo componente visual de
   `CustomField`, mas travado para edição).
2. Se o schema da Skill mudar depois de o fluxo já estar publicado com etapas dependendo dele
   (via `reference-table`), tratar isso como uma mudança que exige nova versão do fluxo — não
   sobrescrever instâncias em andamento (mesmo princípio de versionamento do guia principal,
   seção 2, item 7).

## 6. Extensão futura, não obrigatória no MVP: motor de aprovação por alçada

A referência CoreFlow tem um motor de aprovação por valor (`value-based`, com `cascadeMode`
`skip`/`all` e `valueThresholdMax` por aprovador) mais sofisticado do que o simples
"Aprovar/Reprovar/Ajustar" hoje descrito no guia principal. Vale como evolução natural da etapa
tipo **Aprovação**, usando um campo `number` (ex: "Valor total da cotação") como `valueFieldKey` —
mas não é necessário para o caso de validação de ponta a ponta (guia principal, seção 11). Registrar
aqui como extensão conhecida, para não ser redescoberta do zero quando for necessária.

## 7. Fora de escopo deste adendo

- Mapeamento técnico de campos em etapas de Integração (request/response) — tratar junto da
  seção 5 do guia principal (tool use / MCP).
- Notificação de aprovador por link único sem login (seção 4.5 da referência) — é um recurso de
  UX valioso, mas não bloqueia a implementação do motor de campos; registrar como backlog.
