# CorePilot — Fase 3: Agentes + Skills (design)

## 0. Contexto

Este é o terceiro sub-projeto derivado de `COREPILOT_GUIA_IMPLEMENTACAO.md`. A Fase 1
(Fundação) e a Fase 2 (Módulo + Chat) estão mergeadas em `main`: autenticação real via
Supabase, multi-tenant (`Empresa`/`Usuario`/`Perfil`), auditoria (`AuditLog`), um `Modulo`
real persistido (multi-tenant, múltiplos por empresa) e um chat livre real conectado à
Messages API da Anthropic (streaming, histórico persistido, auditado).

O guia (seção 10) define a Fase 3 como "Agentes + Skills — builder de agentes, execução
de skill avulsa (sem BPM), schema de saída estruturada validado". A seção 4 do guia
define o modelo de dados núcleo: `Modulo → Agente (nome, função, objetivo, modelo_ia) →
Skill (nome, objetivo, fontes[], ferramentas[], schema_saída)`. A seção 5 define a regra
central: **cada Skill corresponde a uma chamada escopada à Messages API — não ao
histórico de chat do usuário** — e que a saída de uma Skill é sempre estruturada, nunca
texto livre interpretado por regex/heurística (princípio não-negociável §2.3 do guia).

## 1. Objetivo da Fase 3

Ter `Agente`s reais (multi-tenant, múltiplos por `Modulo`) com `Skill`s reais (múltiplas
por `Agente`), cada Skill com um schema de saída definido por um construtor guiado de
campos, e uma execução avulsa de Skill (sem BPM) que chama a Messages API de forma
escopada, valida a saída estruturada contra o schema declarado, persiste a execução e
audita — sem motor de orquestração, sem fontes de dados reais como ferramentas, sem
integrações externas.

## 2. Fora de escopo (explicitamente adiado)

- Orquestrador BPM / Fluxo / Etapa / Kanban / Interação — Fases 5 e 6. Uma Skill não
  está amarrada a nenhuma `InstanciaDeProcesso` ou `ExecucaoDeEtapa` nesta fase; a
  execução é sempre um disparo manual e independente.
- Fontes de dados reais (`FonteDeDados`/`ConsultaParametrizada`) — Fase 4. Uma Skill não
  tem `ferramentas[]` reais habilitadas nesta fase; a única "ferramenta" em jogo é o
  mecanismo de saída estruturada (ver seção 5).
- Integrações externas (ERP, WhatsApp, fornecedores, MCP remoto) — Fase 7.
- Schema de **entrada** por campo — a entrada de uma execução avulsa é um único campo de
  texto livre (vira o conteúdo da mensagem de usuário enviada à Messages API). Um schema
  de entrada estruturado por campo (equivalente a `Etapa.entrada[]` do BPM) só faz
  sentido quando existir o motor de orquestração alimentando essa entrada — Fase 5.
- Autonomia configurável de etapa (`Apenas notificar | Executar e notificar | Executar
  com aprovação`) — é lógica do motor de orquestração (seção 5 do guia), não existe
  "etapa" nesta fase.
- Builder wizard completo (Identidade → Conhecimento → Fontes → Agentes → Orquestrador →
  Permissões → Revisão) — o wizard existente no protótipo mock continua intocado; a
  criação de Agente/Skill desta fase é um formulário simples, não esse wizard.

## 3. Arquitetura

```
Frontend (Vite SPA)                          Backend (NestJS)                   Anthropic
  FundacaoStatus (módulo aberto)
    ├─ aba "Chat"            ──────────▶  (inalterado, Fase 2)
    └─ aba "Agentes"
         ├─ lista/cria Agente ─────────▶  AgenteController (Prisma)
         ├─ lista/cria Skill  ─────────▶  SkillController (Prisma)
         └─ executa Skill (texto livre) ▶ SkillExecucaoController
                                              ├─ monta system (Agente + Skill)
                                              ├─ monta z.object() a partir de
                                              │   Skill.camposSaida
                                              ├─ client.messages.parse(...)  ──▶  Messages API
                                              │   output_config.format:            (Structured
                                              │   zodOutputFormat(schema)           Outputs)
                                              ├─ grava SkillExecucao (saida validada)
                                              └─ grava AuditLog (acao: 'skill_execucao')
```

Mesmo princípio herdado das Fases 1 e 2: o frontend nunca fala com a Anthropic
diretamente e nunca recebe `ANTHROPIC_API_KEY`. `JwtAuthGuard`/`TenantGuard`/
`AuditService`/`PrismaService` são reaproveitados sem alteração.

Diferença central em relação ao Chat (Fase 2): uma execução de Skill não usa histórico
de conversa nem streaming. É uma chamada única, síncrona, com uma entrada de texto livre
e uma saída estruturada — não incremental.

## 4. Modelo de dados (Prisma) — novo

```prisma
model Agente {
  id        String   @id @default(uuid())
  empresaId String
  moduloId  String
  nome      String
  funcao    String
  objetivo  String
  modeloIA  String   @default("claude-sonnet-5")
  criadoEm  DateTime @default(now())

  empresa Empresa @relation(fields: [empresaId], references: [id])
  modulo  Modulo  @relation(fields: [moduloId], references: [id])
  skills  Skill[]
}

model Skill {
  id          String   @id @default(uuid())
  agenteId    String
  nome        String
  objetivo    String
  camposSaida Json
  criadoEm    DateTime @default(now())

  agente    Agente          @relation(fields: [agenteId], references: [id])
  execucoes SkillExecucao[]
}

model SkillExecucao {
  id            String   @id @default(uuid())
  skillId       String
  usuarioId     String
  entrada       String
  saida         Json
  tokensEntrada Int?
  tokensSaida   Int?
  criadoEm      DateTime @default(now())

  skill   Skill   @relation(fields: [skillId], references: [id])
  usuario Usuario @relation(fields: [usuarioId], references: [id])
}
```

`Empresa` ganha `agentes Agente[]`; `Modulo` ganha `agentes Agente[]`; `Usuario` ganha
`skillExecucoes SkillExecucao[]` — mudanças aditivas, sem impacto nos modelos já em
produção.

`camposSaida` é um array (armazenado como `Json`) do formato TypeScript:

```typescript
interface CampoSaida {
  nome: string;
  tipo: 'string' | 'number' | 'boolean' | 'string[]';
  descricao?: string;
  obrigatorio: boolean;
}
```

Este array é a fonte da verdade editada pelo construtor guiado de campos no frontend; o
schema Zod usado na chamada à Messages API é construído dinamicamente a partir dele em
tempo de execução — não existe um JSON Schema redundante persistido em paralelo.

Notas de escopo de tenant:
- `empresaId` fica direto em `Agente` (não só via `Modulo`) — mesmo padrão que
  `Conversa` já usa na Fase 2, para manter o escopo de tenant explícito em cada query.
- `Skill` e `SkillExecucao` não duplicam `empresaId`: a validação de tenant acontece
  checando o pai (`Agente`/`Skill`) antes de tocar o filho — mesmo padrão que `Mensagem`
  já segue hoje em relação a `Conversa`.
- `Agente`/`Skill` são recursos da empresa (como `Modulo`), não privados de um usuário —
  qualquer usuário da empresa pode ver/usar. `SkillExecucao.usuarioId` registra quem
  disparou aquela execução (para histórico/auditoria), não para restringir acesso.

Toda tabela nova (`Agente`, `Skill`, `SkillExecucao`) nasce com RLS habilitada e sem
policies, na mesma migração que as cria (regra permanente estabelecida na revisão final
da Fase 1, `docs/superpowers/specs/2026-07-24-fundacao-design.md` §3.1).

## 5. Integração com a Messages API (Structured Outputs)

O guia (seção 5) descreve o mecanismo de saída estruturada como "uma tool obrigatória de
retorno (`tool_choice` forçando o schema de saída da Skill)". Esse era o padrão usual
antes de existir o recurso de **Structured Outputs** do SDK oficial
(`client.messages.parse()` + `output_config.format`), hoje o caminho recomendado pela
própria documentação da Anthropic para exatamente este caso de uso — "sempre devolva
JSON validado contra este schema", sem que o modelo precise executar de fato uma tool
com efeito colateral. Esta fase usa `messages.parse()` + Zod (`zodOutputFormat`) em vez
de forçar uma tool call manualmente: mesmo princípio não-negociável do guia (saída
sempre estruturada, nunca texto livre interpretado), mecanismo mais simples e atual (ver
seção 12).

Fluxo de `POST /skills/:skillId/execucoes`:

1. `JwtAuthGuard` + `TenantGuard` (reaproveitados, sem alteração).
2. Valida a cadeia Skill → Agente → Módulo → Empresa contra o `TenantContext` — nunca
   confia em um ID vindo do cliente sem essa checagem (mesmo princípio das Fases 1/2).
3. Monta `z.object({...})` dinamicamente a partir de `skill.camposSaida`: cada campo com
   `.describe(descricao)` quando houver descrição, e `.optional()` quando
   `obrigatorio === false`.
4. Monta `system` a partir da identidade do Agente (`nome`, `função`, `objetivo`) + o
   `objetivo` da Skill.
5. Chama:
   ```typescript
   const response = await client.messages.parse({
     model: agente.modeloIA,
     max_tokens: 4096,
     system,
     messages: [{ role: 'user', content: entrada }],
     output_config: { format: zodOutputFormat(schema) },
   });
   ```
6. Se `response.parsed_output` vier `null` (falha de parsing/validação contra o
   schema), retorna erro ao cliente e **não** persiste uma `SkillExecucao` incompleta.
7. Persiste `SkillExecucao` (`entrada`, `saida: response.parsed_output`,
   `tokensEntrada: response.usage.input_tokens`,
   `tokensSaida: response.usage.output_tokens`, `usuarioId`).
8. Grava `AuditLog` (`acao: 'skill_execucao'`, `atorUsuarioId: usuarioId`,
   `dadosDepois: { skillId, agenteId, moduloId, tokensEntrada, tokensSaida, modelo }`).
9. Retorna `{ execucaoId, saida, tokensEntrada, tokensSaida }` ao cliente.

**Sem streaming.** Diferente do Chat (Fase 2), a saída de uma Skill é um único objeto
estruturado, não texto incremental — a chamada é uma requisição HTTP síncrona comum.

**Segredos:** `ANTHROPIC_API_KEY` continua só em `backend/.env.local` — nenhuma mudança
de variável de ambiente nesta fase (mesma chave já configurada na Fase 2).

## 6. Superfície da API (Fase 3)

- `POST /modulos/:moduloId/agentes` — cria um `Agente` (`nome`, `funcao`, `objetivo`,
  `modeloIA?`) no módulo do tenant atual.
- `GET /modulos/:moduloId/agentes` — lista os `Agente` desse módulo.
- `POST /agentes/:agenteId/skills` — cria uma `Skill` (`nome`, `objetivo`,
  `camposSaida: CampoSaida[]`) no agente informado.
- `GET /agentes/:agenteId/skills` — lista as `Skill` desse agente.
- `POST /skills/:skillId/execucoes` — executa a skill avulsa (`{ entrada: string }`);
  resposta síncrona descrita na seção 5.
- `GET /skills/:skillId/execucoes` — histórico de execuções da skill (mais recentes
  primeiro).

Todos protegidos por `JwtAuthGuard` + `TenantGuard` (reaproveitados das Fases 1/2, sem
nenhuma alteração nesses dois guards).

## 7. Frontend

Nova pasta `frontend/src/corepilot/agentes/` (paralela a `frontend/src/corepilot/modulos/`
da Fase 2), com o mesmo estilo de formulário simples:

- `types.ts` — `Agente`, `Skill`, `CampoSaida`, `SkillExecucao`.
- `api.ts` — `listarAgentes`, `criarAgente`, `listarSkills`, `criarSkill`,
  `executarSkill`, `listarExecucoes`.
- `AgentesList.tsx` + `CriarAgenteForm.tsx` — listar/criar Agentes do módulo.
- `SkillsList.tsx` + `CriarSkillForm.tsx` — listar/criar Skills do agente. O formulário
  de criação de Skill inclui o **construtor guiado de campos**: uma lista dinâmica de
  linhas (nome, tipo: `string`/`number`/`boolean`/`string[]`, descrição, obrigatório)
  com botões de adicionar/remover linha, que vira `camposSaida` no `POST`.
- `SkillExecutor.tsx` — campo de texto livre para a entrada, botão "Executar", o
  resultado estruturado renderizado como pares label/valor (usando `camposSaida` para
  saber os labels), e a lista de execuções anteriores daquela skill.

**Navegação:** hoje (Fase 2), abrir um módulo em `FundacaoStatus` leva direto ao
`ChatView` em tela cheia. Esta fase introduz uma navegação simples de abas dentro do
módulo aberto — **Chat** | **Agentes** — em vez de ir direto para o chat. A aba Chat
continua sendo o `ChatView` existente, **sem nenhuma alteração**; a aba Agentes é a nova
hierarquia Agentes → Skills → Execução descrita acima.

## 8. Auditoria

Toda execução de Skill gera uma linha em `AuditLog` (`acao: 'skill_execucao'`), seguindo
exatamente o padrão já estabelecido por `chat_mensagem` na Fase 2 — mesma tabela, mesmo
`AuditService`, nenhuma mudança no serviço de auditoria em si.

## 9. Variáveis de ambiente (novas)

Nenhuma. `ANTHROPIC_API_KEY` já está configurada desde a Fase 2. A única adição é a
dependência de biblioteca `zod` (`npm install zod` no backend) — não é segredo, não
precisa de variável de ambiente.

## 10. Critério de aceite (caso de validação da Fase 3)

1. Criar um `Agente` real (nome/função/objetivo) dentro de um módulo existente, pela UI
   — persistido no Postgres, sobrevive a reload.
2. Múltiplos Agentes coexistem no mesmo módulo, e múltiplas Skills coexistem no mesmo
   Agente (testado com pelo menos 2 de cada).
3. Criar uma Skill com pelo menos 2 campos de saída de tipos diferentes (ex: `string` e
   `number`), usando o construtor guiado de campos.
4. Executar a skill avulsa com uma entrada de texto livre — a resposta chega como
   objeto estruturado validado contra o schema declarado (não texto livre, não erro de
   parsing).
5. O resultado estruturado aparece renderizado na UI (pares label/valor), e fica
   disponível no histórico de execuções daquela skill após reload.
6. Cada execução gera exatamente uma linha em `AuditLog` com `acao: 'skill_execucao'` e
   os tokens de entrada/saída.
7. Um usuário de uma empresa nunca vê/executa Agentes ou Skills de outra empresa —
   validado por um teste e2e real, no mesmo espírito do e2e de chat da Fase 2.
8. `ANTHROPIC_API_KEY` nunca aparece no frontend nem é commitada no repositório.

## 11. Decisões em aberto (a resolver durante a implementação, não bloqueantes)

- Valor exato de `max_tokens` para a execução de skill (proposto: 4096, mesmo valor da
  Fase 2; ajustável sem impacto de design).
- Comportamento exato quando `response.parsed_output` é `null` mas a chamada em si não
  lançou exceção (ex.: mensagem de erro genérica vs. incluir o texto bruto retornado
  pelo modelo para depuração) — fica para a implementação decidir o formato exato da
  resposta de erro, mantendo o princípio de nunca persistir uma execução incompleta.
- Se `string[]` como tipo de campo de saída precisa de um mínimo/máximo de itens
  configurável no construtor de campos, ou se um array livre (sem limite) é suficiente
  para esta fase.

## 12. Nota sobre a escolha de Structured Outputs em vez de `tool_choice` forçado

O guia original (`COREPILOT_GUIA_IMPLEMENTACAO.md` §5) foi escrito descrevendo o padrão
de "tool obrigatória de retorno" — uma técnica estabelecida e ainda válida para forçar
saída estruturada via tool use. O SDK oficial da Anthropic hoje oferece um primitivo mais
direto para exatamente este caso de uso (`client.messages.parse()` +
`output_config.format` via `zodOutputFormat()`), que dispensa a necessidade de simular
uma "tool" fictícia sem efeito colateral só para forçar o formato de saída. O próprio
preâmbulo do guia (`seção 0`) instrui tratar sugestões de stack/mecanismo como "ponto de
partida razoável, não decisão travada", reservando "não negociável" apenas para os
princípios de arquitetura da seção 2 — e o princípio real aqui (saída sempre estruturada
e validada, nunca texto livre interpretado) é preservado integralmente pela escolha
feita nesta fase.
