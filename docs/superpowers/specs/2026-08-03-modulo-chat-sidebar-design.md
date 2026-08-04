# CorePilot — Sidebar de conversas para módulos custom (design)

## 0. Contexto

A Fase 2 (`2026-07-26-modulo-chat-design.md`) entregou chat real para módulos
custom (`Modulo` + `Conversa` + `Mensagem`, streaming via Anthropic), mas
deliberadamente **não** reaproveitou `ModuleChatSidebar` — a tela
(`CustomModuleView.tsx`) ficou single-thread: busca a lista de conversas do
módulo, mas descarta tudo exceto a primeira (`conversas[0]`), sem histórico,
sem nova conversa, sem organizar, sem arquivar. Compras e Financeiro têm essa
sidebar completa, mas ela é 100% mock — `ModuleChatSidebar.tsx` lê
`state.comprasChats`/`financeiroChats`, arrays hardcoded em `initialState.ts`,
sem nenhuma chamada ao backend, e `ModuleKey` está hardcoded como
`'compras' | 'financeiro'`.

Um módulo custom criado pelo usuário (ex.: "Agronomia") hoje aparece
visualmente inconsistente com Compras/Financeiro: sem histórico de conversas,
sem forma de organizar ou arquivar. Este design cobre como dar a módulos
custom o mesmo padrão visual, com dados reais.

## 1. Objetivo

Toda tela de módulo custom (Agronomia hoje, qualquer módulo criado depois)
ganha uma sidebar com: nova conversa, histórico de conversas real, busca,
tags, fixar, arquivar/desarquivar, excluir, e "bases conectadas" (fontes de
dados reais usadas pelo módulo) — sem alterar o comportamento de
Compras/Financeiro.

## 2. Fora de escopo

- Migrar Compras/Financeiro para dados reais — continuam mock, intocados.
- "Renomear conversa" — essa ação não existe no `ChatRow` mock hoje (só
  fixar/tag/arquivar/excluir existem), então não é replicada aqui.
- Tags compartilhadas entre módulos ou globais por empresa — cada tag
  pertence a um módulo (`ConversaTag.moduloId`), mesmo padrão do mock (listas
  de tags por módulo).
- Multi-módulo simultâneo em memória — segue o padrão já existente de
  "módulo custom atual" (campos flat em `CorePilotState`, um módulo montado
  por vez), não um `Record<moduloId, ...>`.

## 3. Arquitetura

```
Frontend                                    Backend
CustomModuleView.tsx (grid 280px 1fr)
 ├─ CustomModuleChatSidebar.tsx      ──▶   PATCH/DELETE /modulos/:id/conversas/:id
 │    └─ ChatSidebarShell.tsx (visual)      GET/POST/DELETE /modulos/:id/tags
 │         ▲ (mesmo shell)                  GET /modulos/:id/consultas (já existe)
 │         │                                GET /fontes-de-dados (já existe)
 └─ ModuleChatSidebar.tsx (Compras/Financeiro, inalterado por fora)
```

`ChatSidebarShell.tsx` é extraído de `ModuleChatSidebar.tsx` (refatoração
mecânica, sem mudança de comportamento): a parte puramente visual — busca,
pill "Tudo" + dropdown de tags, cabeçalho "Arquivadas", lista de itens, view
de arquivadas — vira um componente parametrizado por props. `ModuleChatSidebar`
passa a montar essas props a partir do estado mock existente; `CustomModuleChatSidebar`
(novo) monta as mesmas props a partir do estado/ações reais. Nenhuma mudança
de import ou de comportamento em `ComprasView.tsx`/`FinanceiroView.tsx`.

## 4. Modelo de dados (Prisma) — alterações

```prisma
model Conversa {
  id           String   @id @default(uuid())
  empresaId    String
  moduloId     String
  usuarioId    String
  titulo       String?
  arquivada    Boolean  @default(false)
  fixada       Boolean  @default(false)
  tagId        String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  empresa   Empresa       @relation(fields: [empresaId], references: [id])
  modulo    Modulo        @relation(fields: [moduloId], references: [id])
  usuario   Usuario       @relation(fields: [usuarioId], references: [id])
  tag       ConversaTag?  @relation(fields: [tagId], references: [id])
  mensagens Mensagem[]
}

model ConversaTag {
  id        String   @id @default(uuid())
  empresaId String
  moduloId  String
  nome      String
  criadoEm  DateTime @default(now())

  empresa   Empresa    @relation(fields: [empresaId], references: [id])
  modulo    Modulo     @relation(fields: [moduloId], references: [id])
  conversas Conversa[]
}
```

`Conversa.tagId` usa `onDelete: SetNull` (remover uma tag não apaga
conversas). Nova migration segue o padrão de RLS habilitado sem policies já
usado por toda tabela do projeto (`prisma/migrations/*_lock_down_data_api/`).

## 5. Superfície da API (novo/alterado)

Tudo protegido por `JwtAuthGuard` + `TenantGuard`, escopado por
`empresaId`/`usuarioId` do `TenantContext`, seguindo exatamente o padrão de
`ConversaController`/`ConversaService.findOwned` já existente.

- `PATCH /modulos/:moduloId/conversas/:id` — atualiza `{ titulo?, arquivada?,
  fixada?, tagId? }` de uma conversa do usuário atual.
- `DELETE /modulos/:moduloId/conversas/:id` — remove a conversa (e suas
  mensagens) do usuário atual.
- `POST /modulos/:moduloId/tags` — cria uma tag (`{ nome }`) nesse módulo.
- `GET /modulos/:moduloId/tags` — lista as tags do módulo.
- `DELETE /modulos/:moduloId/tags/:tagId` — remove uma tag do módulo.

"Bases conectadas" não precisa de endpoint novo: o frontend cruza
`GET /modulos/:moduloId/consultas` (cada `ConsultaParametrizada` tem
`fonteDeDadosId`) com `GET /fontes-de-dados` (já usado pelo Wizard) para
derivar os nomes das fontes usadas pelo módulo.

## 6. Frontend

### Estado (`initialState.ts`)

Segue o padrão flat já usado por `moduloConversaId`/`moduloMensagens` (um
módulo custom montado por vez): `moduloConversas: Conversa[]`,
`moduloConversasSearch: string`, `moduloTags: ConversaTag[]`,
`moduloActiveTagId: string` (`'all' | tagId`), `moduloTagsExpanded: boolean`,
`moduloShowNewTagForm: boolean`, `moduloNewTagName: string`,
`moduloArchiveView: boolean`, `moduloBasesOpen: boolean`,
`moduloBasesConectadas: string[]`. Reaproveita `state.chatMenuOpenId`
(já genérico, usado pelo mock) para o menu "..." por linha.

### Ações (`useCorePilotState.ts`)

`carregarConversaDoModulo(moduloId)` passa a carregar a lista completa de
conversas (incluindo arquivadas — `GET /modulos/:id/conversas` não filtra;
quem separa visíveis de arquivadas é a sidebar, filtrando client-side por
`arquivada`, mesmo padrão do mock com `chat.hidden`) + tags + bases
conectadas (via `consultas` + `fontesDeDados`), e a **não** escolher
`conversas[0]` cegamente — se não houver nenhuma conversa visível, mostra
estado vazio com CTA "nova conversa" em vez de criar uma automaticamente.
A lista visível ordena fixadas primeiro, depois por `atualizadoEm` desc —
mesmo critério de sort do `ChatRow` mock (`pinned` antes de `order`). Novas
ações: `criarConversaModulo`,
`selecionarConversaModulo`, `arquivarConversaModulo`/`desarquivarConversaModulo`,
`fixarConversaModulo`, `excluirConversaModulo`,
`atualizarBuscaConversasModulo`, `abrirArquivadasModulo`/`fecharArquivadasModulo`,
`toggleTagsExpandedModulo`, `definirTagAtivaModulo`, `criarTagModulo`,
`removerTagModulo`, `atribuirTagConversaModulo`, `toggleBasesModulo`.

### Componentes

- `components/chat/ChatSidebarShell.tsx` (novo): visual puro, props-driven,
  extraído de `ModuleChatSidebar.tsx`.
- `components/chat/ModuleChatSidebar.tsx` (existente): refatorado para
  montar props e delegar ao shell — saída idêntica, zero mudança de
  comportamento para Compras/Financeiro.
- `components/chat/CustomModuleChatSidebar.tsx` (novo): mesma composição,
  ligado a `moduloConversas`/`moduloTags`/ações reais.
- `views/CustomModuleView.tsx`: adota o mesmo layout em grid (`280px 1fr`)
  de `FinanceiroView.tsx`, com `CustomModuleChatSidebar` à esquerda; a coluna
  direita (hero + mensagens + `ChatComposer`) fica como está.

## 7. Erros e casos de borda

Falha ao carregar conversas/tags/bases usa `moduloChatErro` (já existe,
exibido no topo da tela). Falhas em ações de fundo (arquivar, fixar, tag,
excluir, criar/remover tag) usam `showToast` (já existe, mesmo padrão de
`salvarNovaFonteReal`). Excluir ou arquivar a conversa ativa seleciona
automaticamente a próxima conversa visível (mais recente, não arquivada); se
não sobrar nenhuma, volta ao estado vazio com CTA "nova conversa".

## 8. Testes

- Backend: specs unitários para `ConversaService.update`/`remove` e para o
  novo serviço de tags — escopo por tenant/dono, `NotFoundException` para
  conversa/tag de outro usuário ou empresa — seguindo o padrão de
  `conversa.service.spec.ts`/`conversa.controller.spec.ts` já existentes.
- Frontend: sem test runner configurado (ver `CLAUDE.md`) — validação via
  `npm run dev` no navegador: criar módulo custom, abrir chat, criar
  conversa, enviar mensagem, fixar, criar tag, atribuir tag, arquivar,
  desarquivar, excluir, buscar, e conferir que Compras/Financeiro continuam
  visualmente e funcionalmente idênticos.

## 9. Critério de aceite

1. Abrir um módulo custom (ex.: Agronomia) mostra a mesma sidebar visual do
   Compras/Financeiro, com dados reais (conversas do backend, não mock).
2. Criar nova conversa, enviar mensagens, trocar entre conversas — histórico
   persiste entre reloads.
3. Fixar, atribuir/criar/remover tag, arquivar/desarquivar, excluir —
   persistem no backend (sobrevivem a reload), escopados por usuário/tenant.
4. Buscar filtra a lista de conversas por título, cliente-side, igual ao
   mock.
5. "Bases conectadas" mostra as fontes de dados reais associadas ao módulo
   (via consultas parametrizadas), não uma lista estática.
6. Compras e Financeiro continuam funcionando exatamente como antes — mesmo
   comportamento, mesmo visual, nenhuma regressão.
7. Um módulo custom criado depois (não só Agronomia) recebe a mesma sidebar
   automaticamente, sem código específico por módulo.
