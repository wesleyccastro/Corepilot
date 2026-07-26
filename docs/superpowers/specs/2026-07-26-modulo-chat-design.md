# CorePilot — Fase 2: Módulo + Chat (design)

## 0. Contexto

Este é o segundo sub-projeto derivado de `COREPILOT_GUIA_IMPLEMENTACAO.md`. A Fase 1
(Fundação) está mergeada em `main`: autenticação real via Supabase, multi-tenant
(`Empresa`/`Usuario`/`Perfil`), auditoria (`AuditLog`), e um endpoint `GET /me`
protegido por `JwtAuthGuard`+`TenantGuard`, tudo coberto por testes (incluindo um
e2e real de isolamento entre tenants).

O guia (seção 10) define a Fase 2 como "Módulo + Chat — chat conectado de
verdade à Messages API, sem orquestrador ainda". A Fase 1 deixou explicitamente
de fora: a entidade `Modulo` e qualquer chamada real à API da Anthropic.

Estado atual do frontend: existe um protótipo navegável estático
(`frontend/src/corepilot/`) com um wizard de 6 passos para "criar módulo"
(Identidade, Conhecimento, Fontes de Dados, Agente/Skills/Tools, Permissões,
Revisão) e uma UI de chat (`ModuleChatSidebar`, `ChatComposer`, `MessageBubble`)
— mas tudo é mock: o "publicar módulo" só grava `{id, nome, cor}` num estado em
memória (perdido ao recarregar), e o chat responde com uma frase aleatória de
uma lista fixa após um `setTimeout`. Não existe nenhuma chamada real à
Anthropic em lugar nenhum do repositório.

## 1. Objetivo da Fase 2

Ter um `Modulo` real persistido no Postgres (multi-tenant, múltiplos por
empresa) e um chat livre real, conectado à Messages API da Anthropic através
do backend, com histórico persistido e auditado — sem motor de orquestração
(BPM), sem Skills estruturadas, sem fontes de dados externas.

## 2. Fora de escopo (explicitamente adiado)

- Builder completo do módulo (Base de conhecimento, Fontes de Dados, Skills,
  Ferramentas, Tarefas do agente, Permissões granulares) — Fases 3, 4 e 8. O
  wizard existente continua como protótipo visual, intocado.
- Qualquer RAG/busca semântica sobre base de conhecimento — não existe ainda
  conceito de "base de conhecimento" persistida nesta fase; o "contexto" do
  módulo é só o texto de `objetivo`/`instrucoes` injetado no system prompt.
- Tool use / structured output / `tool_choice` forçado — isso é o padrão da
  seção 5 do guia para **Skills** (Fase 3), não para o Chat livre. O Chat desta
  fase é conversa aberta, sem ferramentas.
- Skills, Agentes com autonomia configurável, tarefas agendadas — Fase 3.
- Orquestrador BPM / Kanban / Interação — Fases 5 e 6.
- Múltiplos modelos de IA selecionáveis por módulo via UI — o campo
  `modeloIA` existe no schema (para não travar o design), mas fixo em
  `claude-sonnet-5` nesta fase; escolha por módulo fica para quando isso for
  realmente pedido.

## 3. Arquitetura

```
Frontend (Vite SPA)                         Backend (NestJS)                    Anthropic
  FundacaoStatus (real, pós-login)     ──▶  JwtAuthGuard + TenantGuard          Messages API
    ├─ lista/cria Módulo real          ──▶  ModuloController (Prisma)           (claude-sonnet-5,
    └─ abre chat de um Módulo          ──▶  ConversaController (Prisma)          streaming)
         └─ fetch + ReadableStream     ──▶  MensagemController
                                             ├─ monta system (Modulo)
                                             ├─ client.messages.stream(...)  ───▶
                                             ├─ repassa deltas via chunked HTTP
                                             ├─ grava Mensagem final
                                             └─ grava AuditLog (tokens)
```

Princípio herdado da Fase 1 (e do CLAUDE.md): o frontend nunca fala com a
Anthropic diretamente e nunca recebe `ANTHROPIC_API_KEY`. Toda chamada passa
pelo NestJS, que também é o único lugar que monta o `system` prompt e decide o
que vira contexto da conversa.

**Streaming sem `EventSource`:** o navegador `EventSource` nativo não permite
enviar o header `Authorization: Bearer <jwt>`, e as rotas já são protegidas por
JWT — em vez disso, o frontend usa `fetch` (via o `apiFetch` já existente da
Fase 1) e lê a resposta como `ReadableStream`, decodificando incrementalmente.
O backend responde com um corpo HTTP chunked, uma linha JSON por evento
(NDJSON):

```
{"type":"delta","text":"Ol"}
{"type":"delta","text":"á! Como"}
{"type":"delta","text":" posso ajudar?"}
{"type":"done","mensagemId":"...","tokensEntrada":123,"tokensSaida":45}
```

## 4. Modelo de dados (Prisma) — novo

```prisma
model Modulo {
  id         String   @id @default(uuid())
  empresaId  String
  nome       String
  objetivo   String
  instrucoes String?
  modeloIA   String   @default("claude-sonnet-5")
  criadoEm   DateTime @default(now())

  empresa    Empresa    @relation(fields: [empresaId], references: [id])
  conversas  Conversa[]
}

model Conversa {
  id           String   @id @default(uuid())
  empresaId    String
  moduloId     String
  usuarioId    String
  titulo       String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  empresa   Empresa    @relation(fields: [empresaId], references: [id])
  modulo    Modulo     @relation(fields: [moduloId], references: [id])
  usuario   Usuario    @relation(fields: [usuarioId], references: [id])
  mensagens Mensagem[]
}

enum PapelMensagem {
  usuario
  agente
}

model Mensagem {
  id            String        @id @default(uuid())
  conversaId    String
  papel         PapelMensagem
  conteudo      String
  tokensEntrada Int?
  tokensSaida   Int?
  criadoEm      DateTime      @default(now())

  conversa Conversa @relation(fields: [conversaId], references: [id])
}
```

`Empresa` e `Usuario` (já existentes, Fase 1) ganham os back-relations
`modulos Modulo[]` / `conversas Conversa[]` (em `Usuario`) — mudança aditiva,
sem impacto nos modelos já em produção.

Notas:
- `Conversa` é **privada por usuário** (`usuarioId`) — cada funcionário tem seu
  próprio histórico de chat dentro de um módulo, mesmo que o `Modulo` em si
  seja compartilhado por toda a empresa. Bate com a seção 1 do guia: "Chat"
  é uma área de trabalho do funcionário, não um canal compartilhado.
- `Modulo` não tem `usuarioId` — é um recurso da empresa, visível/usável por
  qualquer usuário dela nesta fase (permissões granulares por módulo são
  Fase 8).
- `tokensEntrada`/`tokensSaida` ficam também na própria `Mensagem` (não só no
  `AuditLog`) para permitir consultas de custo por conversa sem precisar
  cruzar com auditoria.

## 5. Integração com a Messages API

1. Login real via Supabase Auth (já existe, Fase 1) — o frontend já tem o JWT.
2. Usuário cria/abre um `Modulo` e uma `Conversa` (endpoints REST simples,
   sem streaming).
3. Ao enviar uma mensagem (`POST /conversas/:id/mensagens`):
   - Backend valida que a `Conversa` pertence ao `usuarioId` do
     `TenantContext` e que o `Modulo` pertence ao `empresaId` do tenant —
     nunca confia em IDs vindos do cliente sem essa checagem (mesmo princípio
     da Fase 1: escopo de tenant explícito no código, nunca implícito).
   - Monta `system` a partir de `Modulo.nome` + `Modulo.objetivo` +
     `Modulo.instrucoes` (template simples, sem RAG).
   - Monta `messages[]` a partir do histórico de `Mensagem` daquela
     `Conversa` (papel `usuario`→`role: "user"`, `agente`→`role:
     "assistant"`) + a mensagem nova.
   - Chama `client.messages.stream({ model: Modulo.modeloIA, system,
     messages, max_tokens: 4096 })` — sem `tools`, sem `thinking` explícito
     (deixa o comportamento adaptativo padrão do modelo; ver seção 12 sobre
     por que isso é uma escolha deliberada, não uma omissão).
   - Repassa cada delta de texto ao cliente como uma linha NDJSON (`{"type":
     "delta", ...}`), sem esperar a resposta completa.
   - Ao terminar (`stream.finalMessage()`), grava a `Mensagem` do agente
     (texto completo, tokens) e um `AuditLog` (`acao: 'chat_mensagem'`,
     `ator = usuarioId`, `dadosDepois: { moduloId, tokensEntrada,
     tokensSaida, modelo }`), depois envia a linha `{"type": "done", ...}`.
4. Se a chamada à Anthropic falhar no meio do stream, o backend envia uma
   linha `{"type": "erro", "mensagem": "..."}` e **não** grava uma `Mensagem`
   de agente incompleta — o usuário pode tentar reenviar.

**Segredos:** `ANTHROPIC_API_KEY` só em `backend/.env.local` (nunca
commitado, nunca exposto ao frontend) — mesmo padrão das credenciais Supabase
da Fase 1.

## 6. Superfície da API (Fase 2)

- `POST /modulos` — cria um `Modulo` (`nome`, `objetivo`, `instrucoes?`) na
  empresa do tenant atual.
- `GET /modulos` — lista os `Modulo` da empresa do tenant atual.
- `POST /modulos/:moduloId/conversas` — cria uma `Conversa` vazia nesse
  módulo para o usuário atual.
- `GET /modulos/:moduloId/conversas` — lista as conversas do usuário atual
  nesse módulo (mais recentes primeiro).
- `GET /conversas/:conversaId/mensagens` — histórico de mensagens (verifica
  posse pelo usuário atual).
- `POST /conversas/:conversaId/mensagens` — envia uma mensagem do usuário;
  resposta é o stream NDJSON descrito na seção 5.

Todos protegidos por `JwtAuthGuard` + `TenantGuard` (reaproveitados da Fase 1,
sem nenhuma alteração nesses dois guards).

## 7. Frontend

- `FundacaoStatus` (tela real pós-login, já existe da Fase 1) passa a listar
  os `Modulo` reais da empresa (via `GET /modulos`) e ganha um formulário
  simples de criação (`nome`, `objetivo`, `instrucoes` — não o wizard de 6
  passos). O link "Ver protótipo (mock)" continua existindo, apontando para o
  `CorePilotApp` estático, sem nenhuma alteração nele.
- Ao entrar num módulo real, abre uma tela de chat nova que:
  - Reaproveita `ChatComposer` e `MessageBubble` (`frontend/src/corepilot/components/chat/`)
    **sem modificação** — já são componentes controlados por props, sem
    acoplamento ao estado mock.
  - **Não** reaproveita `ModuleChatSidebar` diretamente (ele lê
    `state.comprasChats`/`financeiroChats` fixos do estado mock) — cria uma
    versão nova e enxuta com o mesmo padrão visual, que busca conversas reais
    via `GET /modulos/:id/conversas` em vez do estado global do protótipo.
    Isso evita qualquer risco de quebrar `ComprasView`/`FinanceiroView`
    (que continuam usando a versão antiga do sidebar, intocada).
  - Consome o stream de `POST /conversas/:id/mensagens` via `fetch` +
    `ReadableStream` (usando o `apiFetch` já existente), atualizando a bolha
    da resposta do agente incrementalmente conforme as linhas `delta`
    chegam.

## 8. Auditoria

Toda troca de mensagem gera uma linha em `AuditLog` (`acao: 'chat_mensagem'`),
seguindo exatamente o padrão já estabelecido por `GET /me` na Fase 1 — mesma
tabela, mesmo `AuditService`, nenhuma mudança no serviço de auditoria em si.

## 9. Variáveis de ambiente (novas)

Backend (`backend/.env.local`):
- `ANTHROPIC_API_KEY` — chave da API da Anthropic. Nunca committed, nunca
  exposta ao frontend.

## 10. Critério de aceite (caso de validação da Fase 2)

1. Criar um `Modulo` real (nome/objetivo/instruções) pela UI — persistido no
   Postgres, sobrevive a reload.
2. Múltiplos módulos coexistem na mesma empresa (testado com pelo menos 2).
3. Abrir um módulo, iniciar uma conversa, enviar uma mensagem — a resposta da
   Claude (Sonnet 5) chega em streaming, incrementalmente, na tela.
4. Recarregar a página preserva o histórico completo da conversa.
5. Cada troca de mensagem (pergunta do usuário + resposta do agente) gera
   exatamente uma linha em `AuditLog` com `acao: 'chat_mensagem'` e os tokens
   de entrada/saída.
6. Um usuário de uma empresa nunca vê módulos/conversas de outra empresa
   (reaproveitando o isolamento já provado pelo `TenantGuard` na Fase 1) —
   validado por um teste e2e real, no mesmo espírito do e2e de `GET /me`.
7. `ANTHROPIC_API_KEY` nunca aparece no frontend nem é commitada no
   repositório.

## 11. Decisões em aberto (a resolver durante a implementação, não bloqueantes)

- Nome/tamanho exato de `max_tokens` para a resposta do chat (proposto: 4096,
  suficiente para uma resposta de chat corporativo típica; ajustável sem
  impacto de design se se mostrar curto demais na prática).
- Se o corpo chunked deve ser `Content-Type: application/x-ndjson` ou
  `text/event-stream` com o prefixo `data: ` por linha (SSE "informal", sem
  usar `EventSource`) — ambos funcionam igual do lado do `fetch`+
  `ReadableStream`; a escolha exata fica para a implementação.

## 12. Nota sobre `thinking` (adaptive)

O guia de integração com a API da Anthropic recomenda pensamento adaptativo
("adaptive thinking") por padrão para tarefas "remotamente complexas". Para o
Chat livre desta fase, a decisão é **não configurar `thinking` explicitamente**
— no `claude-sonnet-5`, omitir o campo já roda em modo adaptativo por padrão
(o próprio comportamento padrão do modelo), então isso não é uma omissão
acidental: é deixar o modelo decidir por conta própria quanto "pensar" por
mensagem, sem forçar nem desligar, mantendo a chamada mais simples possível
("sem orquestrador ainda" também vale para a configuração da chamada em si).
