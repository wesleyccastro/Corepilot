# Adendo — Arquitetura genérica da tela de interação

> Complementa a seção 7 (Kanban / Interação) do `COREPILOT_GUIA_IMPLEMENTACAO.md` e os adendos
> de Tipo × Executor e Campos personalizados.
> Contexto: a tela de "Detalhe da interação" (onde o usuário age sobre uma etapa — aprova,
> preenche, ajusta) precisa funcionar para **qualquer** módulo criado no builder, sem que a
> equipe programe uma tela por processo. Este adendo especifica a arquitetura que garante isso.

## 1. Princípio central

**Nenhum vocabulário de domínio pode existir no código do frontend.** Palavras como
"fornecedor", "peça", "talhão" ou "safra" nunca aparecem em um componente — elas existem apenas
como dado (`CustomField.label`), salvo quando alguém desenhou a etapa no builder. O frontend não
sabe se está renderizando uma etapa de Compras ou de Operações Agrícolas; ele sabe apenas
renderizar tipos de campo e tipos de ação.

Isso só é possível porque a tela é composta por três peças genéricas, nenhuma delas conhecendo o
processo de negócio em si: o **shell da tela**, o **FieldRenderer** e o **motor de ações**.

## 2. `FieldRenderer` — um componente por tipo de campo

```typescript
function renderField(
  field: CustomField,         // definição salva no builder (adendo de campos)
  valor: unknown,             // valor atual (entrada do usuário ou saída do agente)
  modo: 'leitura' | 'edicao', // leitura quando o campo veio de uma etapa de agente
): ReactNode
```

O `FieldRenderer` faz um `switch` em `field.tipo` (os mesmos ~9 tipos do adendo de campos:
`text, number, date, select, checkbox, attachment, entity-reference, table, reference-table,
summary`) e devolve o componente visual correspondente. Cada tipo tem exatamente um componente,
reaproveitado por todos os módulos:

| Tipo | Componente | Observação |
|---|---|---|
| `text`, `number`, `date`, `select`, `checkbox` | Campo de formulário simples | Editável só se `modo = edicao` |
| `attachment` | Upload/lista de arquivo | — |
| `entity-reference` | Seletor de cadastro (fixo ou dinâmico) | Não sabe qual cadastro é — só que aponta para um `entityType` |
| `table` | Tabela editável com colunas tipadas | Coluna `calculated` é sempre somente leitura, recalculada no client |
| `reference-table` | Tabela que resolve `referenceStepId` + `referenceFieldId` na `InstanciaDeProcesso` atual, e permite preencher `additionalColumns` | Ver seção 3 do adendo de campos sobre resolução em fluxos com loop |
| `summary` | Valor calculado, somente leitura | Nunca editável, sempre derivado |

O `FieldRenderer` nunca recebe "isso é uma cotação" — ele recebe um `CustomField` e um valor.

## 3. Tela-shell (`TelaDeInteracao`) — o layout, não o conteúdo

Um único componente de tela recebe três coisas e monta a UI:

```typescript
interface TelaDeInteracaoProps {
  etapa: Etapa;                          // definição da etapa atual (do fluxo publicado)
  instancia: InstanciaDeProcesso;        // dados acumulados até aqui
  historico: ExecucaoDeEtapa[];          // execuções já concluídas nesta instância
}
```

O shell:

1. Renderiza a **trilha de histórico** iterando `Fluxo.etapas` na ordem e cruzando com
   `historico` para marcar o que já foi concluído — não é uma lista fixa de nomes, é uma
   iteração sobre a configuração do fluxo.
2. Itera `etapa.formSections → CustomField[]` chamando `renderField` para cada um, no modo
   `leitura` se o campo veio de uma etapa de agente, `edicao` se pertence ao Executor humano
   (regra já definida no adendo de Tipo × Executor).
3. Renderiza os **botões de ação** a partir de `etapa.acoes[]` (seção 4) — nunca hardcoded.

## 4. Motor de ações — botões também são dado

```typescript
interface AcaoEtapa {
  label: string;                 // texto do botão, ex: "Solicitar correção"
  transicaoDestinoId: string;    // id da etapa para onde a instância vai
  exigeCampo?: {                 // campo extra exibido só quando essa ação é clicada
    key: string;                 // ex: "motivo_correcao"
    label: string;
    obrigatorio: boolean;
  };
  estilo: 'primario' | 'secundario' | 'perigo';
}
```

O botão "Aprovar cotação" e o botão "Solicitar correção" do mockup da etapa de Compras não estão
escritos em nenhum componente — são duas entradas de `etapa.acoes[]`, e o campo "Motivo da
correção" só aparece porque a segunda ação declara `exigeCampo`. Uma etapa de Operações Agrícolas
pode ter ações completamente diferentes ("Confirmar plantio" / "Revisar estimativa") sem tocar em
código — só configuração.

## 5. Onde o vocabulário de domínio realmente mora

A única coisa específica de um módulo é o **dado salvo no builder**: nome da etapa, `label` de
cada campo, `schema_saida` da Skill, texto de cada `AcaoEtapa`. Nada disso é código. Isso confirma
o princípio da seção 1: o mesmo `TelaDeInteracao` + `FieldRenderer` + motor de ações produz tanto
a tela de Compras quanto a de Operações Agrícolas — a diferença inteira está no banco de dados,
não no repositório.

## 6. Riscos conhecidos à genericidade (registrar, não ignorar)

- **Tipo de campo específico de um módulo** (ex: um seletor de mapa/geolocalização só faz
  sentido em Operações Agrícolas). Solução: ou vira mais um tipo no enum central de
  `CustomField.tipo` (disponível a todos os módulos, mesmo que só um o use), ou fica fora do MVP.
  Nunca criar um tipo de campo "só para o módulo X" no código do módulo X.
- **Densidade de dado muito diferente entre módulos** (uma tabela de 40 colunas em Financeiro vs.
  um formulário de 3 campos em Compras) — testar se o mesmo shell aguenta os extremos antes de
  assumir que está pronto.

## 7. Critério de aceite (não é opcional)

Validar com **um único** processo (o de Compras, seção 11 do guia principal) não prova que o
motor é genérico — só prova que ele funciona para aquele processo. O critério de aceite real
desta arquitetura é:

> Rodar um **segundo módulo, com domínio completamente diferente** (ex: Operações Agrícolas) pelo
> mesmo `TelaDeInteracao` + `FieldRenderer` + motor de ações, **sem alterar uma linha de código**
> — só configuração via builder.

Se isso funcionar, a arquitetura genérica está validada. Se exigir qualquer ajuste de código
específico para o segundo módulo, o vocabulário de domínio vazou para algum lugar que não
deveria — voltar à seção 1 e localizar onde.
