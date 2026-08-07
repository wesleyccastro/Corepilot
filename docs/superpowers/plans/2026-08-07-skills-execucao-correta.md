# Execução correta de Skills no Orquestrador — Backlog de conclusão

> Documento de registro, não um plano pronto pra executar tarefa-a-tarefa. Os 3 itens abaixo
> precisam de uma decisão de design antes de virar um plano com passos (`docs/superpowers/plans/`
> no formato bite-sized). Escrito em 2026-08-07 durante uma sessão de dúvida sobre "a forma que
> estamos criando skill hoje está correta / vai funcionar", pra não perder os achados.

## Contexto

O guia principal (`COREPILOT_GUIA_IMPLEMENTACAO.md`, seção 5) define o padrão de chamada por
etapa de agente:

> Chamar a Messages API com: `system` = identidade + objetivo do Agente; **`tools` = ferramentas
> habilitadas para aquela Skill** (consultas de dados, integrações); uma tool obrigatória de
> retorno (`tool_choice` forçando o schema de saída da Skill).

A implementação real (`backend/src/orquestrador/orquestrador-fila.worker.ts`,
`montarSystemPromptDaEtapa` + `processarExecucaoDeAgente`) diverge desse desenho em 3 pontos,
todos verificados no código, não hipóteses.

## Achado 1 — Ferramentas da skill não chegam ao agente em runtime

**Evidência:** `orquestrador-fila.worker.ts` chama
`this.anthropicService.parseStructured({ system, mensagem, model, maxTokens, schema })` — sem
`tools`. `grep -n "tools\|tool_choice\|createWithTools\|anexarFerramenta"` no arquivo não retorna
nada. As ferramentas anexadas a uma skill no builder (`anexarFerramenta`/`removerFerramenta`,
tabela implícita skill↔consulta) ficam salvas no banco mas nunca são passadas na chamada real —
o agente nunca consegue consultar a fonte de dados durante a execução da etapa, só recebe o
`entrada` já pronto (dados acumulados do card, filtrados por `entradaRefs`).

**Direção recomendada:** trocar `parseStructured` por um loop com `createWithTools` (já existe em
`AnthropicService`) quando a etapa tiver ferramentas habilitadas: montar `tools` a partir das
`ConsultaParametrizada` anexadas à skill (schema de parâmetros da consulta → tool de execução real
via `fonte-de-dados`), rodar o loop até `stop_reason !== 'tool_use'`, e só então validar contra o
schema de saída da skill (seguindo literalmente o padrão do guia: "tool obrigatória de retorno").
Precisa decidir: limite de iterações do loop, como expor erro de consulta pro agente (`is_error`),
e se cai de volta pra `parseStructured` quando a skill não tem nenhuma ferramenta habilitada
(caminho mais barato, sem overhead de loop).

## Achado 2 — `modulo.instrucoes` não chega ao Orquestrador

**Evidência:** `montarSystemPromptDaEtapa(agente, skill)` monta o system prompt só a partir de
`agente.nome`/`funcao`/`objetivo`/`guardrails`/`regraEscalonamento` + `skill.objetivo` — nunca lê
`modulo.instrucoes`. Comparado com `backend/src/chat/mensagem.controller.ts:42-43`, que inclui
`"Instruções adicionais: ${modulo.instrucoes}"` no system prompt do Chat manual. Ou seja: o campo
"Instruções" do módulo (com autosave e botão de rascunho com IA, `gerarRascunhoInstrucoesModulo`)
tem efeito real só no Chat — fica completamente ignorado quando o mesmo módulo roda uma etapa do
fluxo BPM. Um usuário que configura instruções gerais esperando que guiem o comportamento
automatizado está sendo enganado pela UI (nada indica que esse campo só vale pro chat).

**Direção recomendada:** passar `modulo.instrucoes` pra `montarSystemPromptDaEtapa` (precisa da
assinatura receber `modulo`, não só `agente`/`skill` — checar todos os callers) e incluir como mais
uma seção do system prompt, no mesmo padrão do Chat (`"Instruções adicionais: ..."`). Mudança
pequena e de baixo risco comparada ao Achado 1.

## Achado 3 — Skill não tem campo de instruções detalhadas própria

**Evidência:** o formulário de skill (`SkillEditor.tsx`) só tem `nome`, `objetivo` (uma
textarea de 2 linhas), `camposSaida` e `ferramentas` — sem um campo equivalente ao
`Agente.guardrails`/`regraEscalonamento` ou ao `Modulo.instrucoes`, isto é, sem espaço pra
descrever *como* a skill deve fazer a tarefa (passo a passo, regras de desempate, exemplos,
convenções de formatação por campo). Todo o peso de "produzir a saída certa" recai sobre o
`camposSaida` (schema forçado via structured output) + uma frase de objetivo. Funciona bem pra
tarefas simples de extração/classificação (confirmado no teste ao vivo desta sessão — "Agrupar
solicitações"); não é suficiente por design pra tarefas mais elaboradas.

**Direção recomendada:** avaliar se vale adicionar um campo `Skill.instrucoes` (texto livre,
opcional) — precisa de migração de schema Prisma, campo no formulário do `SkillEditor.tsx`, e
inclusão em `montarSystemPromptDaEtapa`. Antes de implementar, vale confirmar com exemplos reais
de skills mais complexas que o time pretende configurar, pra não adicionar um campo que ninguém
usa (YAGNI) — ao contrário dos Achados 1 e 2, que já são gaps confirmados contra o desenho
existente, este é mais uma decisão de produto em aberto.

## Prioridade sugerida

1. **Achado 2** — menor risco, maior gap de expectativa (usuário já configura e acha que funciona).
2. **Achado 1** — maior valor arquitetural (fecha o desenho da seção 5 do guia), mais esforço.
3. **Achado 3** — decisão de produto, não bug — só avançar depois de confirmar necessidade real.

## Próximo passo

Quando o Chefe quiser avançar: brainstorming + spec por achado (ou um spec único cobrindo os 3,
se decidir atacar junto), seguido de plano de implementação no formato bite-sized padrão do
projeto. Nenhum código foi alterado por este documento.
