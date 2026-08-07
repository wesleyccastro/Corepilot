# Design — SkillExecutorService compartilhado (Achados 1 e 2)

> Spec derivado de `docs/superpowers/plans/2026-08-07-skills-execucao-correta.md`. Cobre os
> Achados 1 (ferramentas não chegam ao agente em runtime no Orquestrador) e 2
> (`modulo.instrucoes` não chega ao Orquestrador). O Achado 3 (campo `Skill.instrucoes`) fica
> fora de escopo — é decisão de produto em aberto, não um gap confirmado contra o desenho.

## Contexto

Hoje existem duas implementações independentes de "executar uma skill contra o modelo":

1. `SkillExecucaoController` (`backend/src/skill/skill-execucao.controller.ts`) — endpoint manual
   "Testar skill". Já implementa corretamente o padrão da seção 5 do guia: decide entre
   `parseStructured` direto (sem ferramentas) ou um loop de `createWithTools` (com ferramentas,
   máx. 5 iterações) terminando em `parseStructuredFromHistory`.
2. `OrquestradorFilaWorker.processarExecucaoDeAgente`
   (`backend/src/orquestrador/orquestrador-fila.worker.ts`) — execução real de uma etapa
   `tarefa_agente` do BPM. Só chama `parseStructured`: não busca `skill.ferramentas` do banco, não
   monta `tools`, e seu `montarSystemPromptDaEtapa` nunca inclui `modulo.instrucoes` (only
   `agente.*` + `skill.objetivo`).

O risco de duas implementações divergentes já era apontado no documento de achados original. A
correção proposta aqui resolve os dois achados extraindo um único serviço compartilhado, em vez de
copiar o loop de tool-use (e agora também `modulo.instrucoes`) pela segunda vez dentro do worker.

## Arquitetura

Novo serviço `SkillExecutorService` em `backend/src/skill/skill-executor.service.ts`, com seu
próprio módulo `SkillExecutorModule` (`backend/src/skill/skill-executor.module.ts`). Os dois
lugares que hoje chamam o modelo pra executar uma skill passam a chamar este serviço:

- `SkillExecucaoController` — perde a lógica inline de `montarSystemPrompt`/
  `executarComFerramentas`, que migra pro serviço.
- `OrquestradorFilaWorker.processarExecucaoDeAgente` — ganha acesso ao mesmo comportamento
  (ferramentas + `modulo.instrucoes`) sem duplicar o loop.

### Interface

```ts
interface ExecutarSkillParams {
  agente: {
    nome: string;
    funcao: string;
    objetivo: string;
    guardrails: string | null;
    regraEscalonamento: string | null;
    modeloIA: string;
  };
  modulo: { instrucoes: string | null };
  skill: {
    objetivo: string;
    camposSaida: CampoSaida[];
    ferramentas: { id: string; nome: string; camposFiltro: unknown }[];
  };
  entrada: string; // já serializado pelo chamador (JSON.stringify quando aplicável)
}

interface ExecutarSkillResultado {
  output: unknown; // response.parsed_output — pode ser undefined/null
  usage: { input_tokens: number; output_tokens: number };
}
```

`SkillExecutorService.executar(params): Promise<ExecutarSkillResultado>`:

1. Monta o system prompt (função interna, substitui as duas cópias hoje existentes em
   `skill-execucao.controller.ts` e `orquestrador-fila.worker.ts`):
   - `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`
   - `Objetivo do agente: ${agente.objetivo}`
   - `Você está executando a skill com o seguinte objetivo: ${skill.objetivo}`
   - Se `agente.guardrails` preenchido: seção `RESTRIÇÕES (nunca viole)`.
   - Se `agente.regraEscalonamento` preenchido: seção `ESCALONAMENTO PARA HUMANO`.
   - Se `modulo.instrucoes` preenchido: seção `Instruções adicionais: ...` — mesmo padrão já usado
     em `backend/src/chat/mensagem.controller.ts:42-43` pro Chat manual. Fica por último, mesma
     posição relativa usada lá.
2. Constrói o schema de saída via `construirSchemaSaida(skill.camposSaida)` (já existe, reusado
   sem mudança).
3. Decide o caminho:
   - `skill.ferramentas.length === 0` → `anthropicService.parseStructured({ system, mensagem:
     entrada, model: agente.modeloIA, maxTokens: 4096, schema })` (caminho barato, sem overhead de
     loop).
   - Caso contrário → loop de até `MAX_ITERACOES_TOOL_USE = 5` chamadas a
     `anthropicService.createWithTools`, resolvendo cada `tool_use` via
     `buscarDadosLocaisConsulta` (já existe em `consulta-ferramenta.util.ts`, sem mudança), até
     `stop_reason !== 'tool_use'` ou esgotar as iterações; finaliza com
     `anthropicService.parseStructuredFromHistory`. Comportamento idêntico ao já implementado hoje
     em `SkillExecucaoController.executarComFerramentas` — só muda de lugar.
4. Retorna `{ output: response.parsed_output, usage: response.usage }`. **Não** lança erro quando
   `parsed_output` é nulo/undefined — essa checagem continua no chamador, porque cada um reage
   diferente (o controller lança `UnprocessableEntityException`; o worker lança `Error` genérico,
   que seu `catch` externo já converte em `status: 'failed'` na `ExecucaoDeEtapa`). Preservar isso
   no chamador evita mudar o tipo de erro que cada caminho já produz hoje.

## Mudanças nos chamadores

### `SkillExecucaoController`

- Remove as funções locais `montarSystemPrompt` e `executarComFerramentas`, e o import de
  `MensagemConversa`/`AnthropicService` (deixa de precisar chamar a Anthropic diretamente).
- Injeta `SkillExecutorService` no construtor.
- `executar()` passa a chamar `skillExecutorService.executar({ agente: skill.agente, modulo:
  skill.agente.modulo, skill, entrada: body.entrada })`; mantém a checagem de `output` nulo →
  `UnprocessableEntityException`; mantém `appendExecucao` e `audit.record` como estão.
- `SkillService.findByIdInEmpresa` (`backend/src/skill/skill.service.ts:37-48`) muda o `include`
  de `agente: true` para `agente: { include: { modulo: true } }`, pra `skill.agente.modulo` ficar
  disponível. Mudança aditiva — os outros três callers de `findByIdInEmpresa`
  (`ferramenta.controller.ts`, e o próprio `skill.service.ts` internamente) só usam a checagem de
  existência ou não leem `agente`, então não quebram.

### `OrquestradorFilaWorker`

- Remove a função local `montarSystemPromptDaEtapa`.
- A query de `processarFilaAgentes` (`prisma.execucaoDeEtapa.findMany`, dentro do `include`) muda
  de:
  ```ts
  etapa: { include: { agente: true, skill: true } }
  ```
  para:
  ```ts
  etapa: { include: { agente: { include: { modulo: true } }, skill: { include: { ferramentas: true } } } }
  ```
  Esta é a lacuna raiz do Achado 1: hoje o worker nem busca `skill.ferramentas` do banco, então não
  há como montar `tools` mesmo que quisesse.
- O tipo `ExecucaoDeAgente` (linha 21-24) é ajustado para refletir os novos campos incluídos
  (`agente.modulo`, `skill.ferramentas`).
- `processarExecucaoDeAgente` passa a chamar `skillExecutorService.executar({ agente: etapa.agente,
  modulo: etapa.agente.modulo, skill: etapa.skill, entrada: JSON.stringify(this.montarEntrada(...))
  })` no lugar da chamada direta a `anthropicService.parseStructured`. Mantém a checagem de
  `output` nulo → `Error` (mesma mensagem de hoje) e o resto do método (transação de persistência)
  inalterado.
- `anthropicService` continua injetado no worker — ainda é usado diretamente por
  `montarTextoDaMensagem` (composição de mensagem de WhatsApp), que fica fora de escopo desta
  mudança.

## Módulos

- `SkillExecutorModule` novo: `imports: [AnthropicModule]`, `providers: [SkillExecutorService]`,
  `exports: [SkillExecutorService]`. Não precisa importar `PrismaModule` explicitamente (é
  `@Global()`).
- `SkillExecucaoModule`: troca o import de `ChatModule` por `SkillExecutorModule` (o controller
  deixa de injetar `AnthropicService` diretamente).
- `OrquestradorModule`: adiciona `SkillExecutorModule` aos `imports`, mantendo `AnthropicModule`
  (ainda necessário pro `montarTextoDaMensagem`).

## Testes

- **Novo** `backend/src/skill/skill-executor.service.spec.ts`: migra os casos hoje cobertos em
  `skill-execucao.controller.spec.ts` que testam comportamento de prompt/loop (caminho sem
  ferramenta; guardrails/escalonamento no prompt; loop de tool-use com 2 iterações e dados locais;
  esgotamento de `MAX_ITERACOES_TOOL_USE`) e adiciona casos novos:
  - `modulo.instrucoes` preenchido → aparece no `system` enviado à Anthropic.
  - `modulo.instrucoes` nulo/vazio → seção "Instruções adicionais" ausente do `system`.
- `skill-execucao.controller.spec.ts` simplifica: mocka `SkillExecutorService.executar` em vez de
  `AnthropicService`; mantém só as asserções de persistência (`appendExecucao`), auditoria e
  mapeamento de erro HTTP (`UnprocessableEntityException` quando `output` é nulo).
- `orquestrador-fila.worker.spec.ts`: mocka `SkillExecutorService.executar` em vez de
  `anthropicService.parseStructured` no teste de `processarFilaAgentes`; adiciona um caso novo
  verificando que `skill.ferramentas` e `modulo.instrucoes` (via fixture `execucaoPendente`
  atualizada) chegam nos `params` passados ao serviço.

## Fora de escopo

- Achado 3 (campo `Skill.instrucoes` livre) — decisão de produto em aberto, não implementado aqui.
- Qualquer mudança em `montarTextoDaMensagem` (composição de mensagem de WhatsApp) — não usa
  skill/schema de saída, fica fora do escopo de "executar uma skill".
