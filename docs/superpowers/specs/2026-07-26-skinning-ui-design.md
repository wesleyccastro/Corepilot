# Skinning da UI — protótipo Claude Design vira o app real

## 1. Contexto

Desde a Fase 1, o app real (`AuthGate` → `FundacaoStatus` → `ModulosList`/`ModuloWorkspace`) foi
construído com telas simples e sem estilo, fase a fase, enquanto o protótipo visual completo
(Claude Design, em `frontend/src/corepilot/{CorePilotApp,views,components,useCorePilotState,...}`)
ficou disponível só como referência estática ("Ver protótipo (mock)"), rodando inteiramente sobre
dados fake.

Chefe deixou claro que não faz sentido manter as duas coisas separadas: o protótipo já tem o
visual definitivo (inclusive a tela de Fontes de Dados/TOTVS RM feita a partir do brief da Fase 4)
e deve ser isso que roda de verdade. Esta fase substitui a UI bare-bones das Fases 1-4 pelo
protótipo, conectando-o ao backend real onde já existe funcionalidade, e mantendo mock apenas as
partes que ainda não têm fase implementada.

## 2. Objetivo

Fazer do protótipo (`CorePilotApp`) o único frontend real da aplicação: a mesma UI polida, mas
lendo e escrevendo dados reais para tudo que já foi construído (Módulos, Chat, Agentes, Skills,
Fontes de Dados, Consultas). Aposentar o botão "Ver protótipo (mock)" e o par de telas simples
(`FundacaoStatus`'s módulo-list/workspace) que ele deixa para trás.

## 3. Escopo — o que vira real vs. o que continua mock

Regra: uma tela só vira real se existe fase implementada por trás. Sem fase = sem dado real =
continua exatamente como está hoje (mock), navegável normalmente.

| Área | Fase que a sustenta | Decisão |
|---|---|---|
| Header (abas de módulo, "Criar módulo", nome da empresa/usuário) | Fase 1 (auth/tenant) + Fase 2 (módulos) | **Real** |
| Wizard Step1 — Identidade | Fase 2 (Módulo) | **Real** (schema estendido, ver §4) |
| Wizard Step2 — Base de conhecimento | nenhuma | Mock, sem mudança |
| Wizard Step3 — Fontes de dados | Fase 4 | **Real** |
| Wizard Step4 — Identidade do agente / Instruções / Skills / Testar agente | Fase 3 + Fase 4 (ferramentas) | **Real** |
| Wizard Step4 — Ferramentas (nível agente, genéricas) / Tarefas / Autonomia | nenhuma (é território de Orquestrador/Fase 5) | Mock, sem mudança |
| Wizard Step5 — Permissões | nenhuma (Fase 8) | Mock, sem mudança |
| Wizard Step6 — Revisão e publicação | Fases 2-4 (resumo) | **Real** (resumo com dados reais) |
| Tela de módulo (chat) | Fase 2 | **Real** |
| Overview (chat cross-módulo) | nenhuma | Mock, sem mudança |
| Compras / Financeiro (Kanban) | nenhuma (Fase 6) | Mock, sem mudança |
| Admin (Usuários/Configurações/Empresa) | nenhuma | Mock, sem mudança |

## 4. Modelo de dados

`Modulo` ganha os campos que o Step1 Identidade precisa e que hoje não existem:

```prisma
model Modulo {
  // ...campos existentes (nome, objetivo, instrucoes, modeloIA)...
  descricao   String?
  responsavel String?
  areas       String?
  icone       String?
  cor         String?
}
```

Todos opcionais (nullable) — módulos já existentes continuam válidos sem migração de dados.
Migração via `prisma migrate dev --create-only` + edição manual das linhas de RLS, seguindo o
padrão já estabelecido nas fases anteriores.

Nenhuma outra tabela muda. `Agente`, `Skill`, `FonteDeDados`, `ConsultaParametrizada`,
`ConsultaResultado`, `Conversa`, `Mensagem` continuam como estão.

## 5. Arquitetura

`AuthGate` passa a renderizar `CorePilotApp` diretamente após o login bem-sucedido (em vez de
`FundacaoStatus`). `CorePilotApp` recebe `accessToken`/sessão e injeta isso no lugar onde
`useCorePilotState` hoje monta estado 100% local.

`useCorePilotState` é dividido, campo a campo, em dois grupos — sem reescrever o hook do zero:

- **Estado real**: passa a ser preenchido via `apiFetch` (módulos, agentes, skills, fontes de
  dados, consultas, mensagens de chat). As ações correspondentes (`saveDraft`, `publishModule`,
  `testConnection`, `saveNewQuery`, `saveSkill`, etc.) passam a chamar as rotas reais do backend em
  vez de só mutar o estado local.
- **Estado mock**: tudo que suporta as telas sem fase (Compras/Financeiro/Admin/Step2/Step5/
  Ferramentas-Tarefas-Autonomia do agente) continua exatamente como está — nenhuma mudança nesses
  arquivos.

O botão "Ver protótipo (mock)" e o componente `FundacaoStatus` (na parte que lista módulos e abre
`ModuloWorkspace`) são removidos. As telas simples que ele usava
(`ModulosList`/`ModuloWorkspace`/`ChatView`/`AgentesList`/`SkillsList`/`SkillExecutor`/
`FontesDeDadosList`/`ConsultasList`/`CriarModuloForm`/etc. em `frontend/src/corepilot/{modulos,
agentes,fontes-de-dados,consultas}/`) são **substituídas nas telas**, mas sua lógica de chamada de
API (os arquivos `api.ts` de cada domínio) é reaproveitada pelas novas telas reais — não
duplicamos chamadas de rede, só trocamos quem renderiza.

Header: nome da empresa e usuário/avatar passam a vir de `GET /me` (hoje hardcoded "LFG Agro" /
"Marcos" / "MS").

## 6. Superfície da API — o que falta no backend

Hoje `Modulo`, `Agente` e `Skill` só têm `POST` (criar) e `GET` (listar) — não há edição. Como o
Wizard real precisa reabrir e editar módulos/agentes/skills já criados, esta fase adiciona:

- `PATCH /modulos/:id` — `nome`, `objetivo`, `instrucoes`, `modeloIA`, `descricao`, `responsavel`,
  `areas`, `icone`, `cor` (todos opcionais no body, atualiza só o que vier).
- `PATCH /modulos/:moduloId/agentes/:agenteId` — `nome`, `funcao`, `objetivo`.
- `PATCH /agentes/:agenteId/skills/:skillId` — `nome`, `objetivo`, `camposSaida`.

Mesmo padrão de tenant-scoping das rotas `POST`/`GET` existentes (`TenantGuard` +
`findByIdInEmpresa`/equivalente antes de atualizar) e mesmo padrão de auditoria já usado em
`FerramentaController` (`AuditService.record` com uma ação tipo `modulo_atualizado`/
`agente_atualizado`/`skill_atualizada`).

## 7. Fluxo de módulo — criação e edição

Não existe conceito de rascunho no backend, então "Salvar rascunho" e "Publicar módulo" viram a
mesma ação real: persistir o `Modulo` (criar ou atualizar). O módulo aparece na navegação assim
que criado — sem estado invisível.

Sequência ao criar um módulo novo pelo Wizard:

1. **Step1 (Identidade)**: ao clicar "Continuar" pela primeira vez, `POST /modulos` cria o
   `Modulo` com os campos do formulário (nome, descrição, objetivo, responsável, áreas, ícone,
   cor). Da em diante, os próximos passos operam sobre esse `moduloId`; qualquer edição posterior
   do Step1 (inclusive voltando a ele) vira `PATCH` sobre o mesmo módulo, nunca cria um segundo.
   Antes desse primeiro save, os passos 2 em diante ficam bloqueados no menu lateral do Wizard
   (clique não navega) — não há `moduloId` ainda para eles operarem.
2. **Step3 (Fontes de dados)**: lista/cria `FonteDeDados` (nível empresa) e
   `ConsultaParametrizada` (nível módulo, `moduloId` do passo 1) — ações reais de "Salvar e testar
   conexão", "Testar consulta", toggle de sincronização, exatamente como a Fase 4 já implementa,
   só que dentro do visual do Step3DataSources em vez do `FontesDeDadosList`/`ConsultasList`
   simples.
3. **Step4 (Agente e instruções)**: ganha uma lista/seletor de agentes do módulo no topo (chips
   horizontais + "+ Novo agente"), já que o backend suporta vários agentes por módulo. Selecionar
   um agente carrega suas sub-abas:
   - **Identidade**: `Agente.nome/funcao/objetivo`. "Modelo de IA" fica travado em Claude (as
     opções GPT/Outro do mock ficam desabilitadas com tooltip "não suportado nesta versão").
   - **Instruções**: mapeia para `Modulo.instrucoes` (não é por-agente — é o mesmo campo usado
     hoje pelo chat livre do módulo). Essa aba não muda com o agente selecionado, já que o campo é
     do módulo.
   - **Skills**: lista as `Skill[]` do agente selecionado. O editor (antigo `SkillEditor`) ganha:
     - um builder de `camposSaida` (nome/tipo/descrição/obrigatório, adicionar/remover linhas) —
       tela que o mock nunca teve, necessária porque é campo obrigatório no `Skill` real;
     - uma seção "Ferramentas de dados" listando as `ConsultaParametrizada` testadas do módulo com
       toggle de anexar/remover (usa `anexarFerramenta`/`removerFerramenta` já implementados).
     - os campos "frases que acionam" e "nível de autonomia" são removidos (sem campo real).
   - **Ferramentas / Tarefas / Autonomia** (nível agente): continuam mock, sem mudança.
   - **Testar agente**: substitui as perguntas sugeridas/respostas canned por uma execução real de
     skill (reaproveita a lógica de `executarSkill`) — usuário escolhe a skill, digita a entrada
     livre, vê a saída estruturada real.
4. **Step6 (Revisão)**: mostra resumo real (nome/responsável do módulo, contagem de agentes/
   skills/fontes de dados). Botão único de salvar (ver acima).

Editar um módulo existente (ícone de engrenagem na tela de módulo) recarrega Step1-4 com os dados
reais atuais (módulo, agentes, skills, fontes de dados, consultas) antes de abrir o Wizard.

O botão "Testar módulo" na barra superior do Wizard deixa de ser uma ação separada — ao ser
clicado, leva direto para a aba "Testar agente" do Step4 (evita duplicar superfície de teste).

## 8. Tela de módulo (chat)

`CustomModuleView` vira a tela real de conversa do módulo, reaproveitando a lógica já existente em
`ChatView.tsx` (`criarConversa`/`listarMensagens`/`enviarMensagemStreaming`, streaming de resposta)
— mas com o chrome visual do protótipo (ícone do módulo, título, texto de contexto) em vez do
cabeçalho simples do `ChatView` atual.

Seguindo o design à risca: uma conversa contínua por módulo (sem sidebar de múltiplas conversas —
isso existe no `ChatView` real de hoje via `ChatSidebarReal`, mas o protótipo não desenha esse
conceito). Ao entrar no módulo, reabre a conversa mais recente ou cria uma nova se não houver
nenhuma.

O ícone de engrenagem (topo direito) chama `editActiveModule`, que agora recarrega os dados reais
do módulo e abre o Wizard em modo edição (ver §7).

## 9. Fora de escopo

- Qualquer coisa que dependa do Orquestrador BPM (Fase 5): Ferramentas/Tarefas/Autonomia por
  agente, Kanban de Compras/Financeiro, execução agendada de tarefas.
- Base de Conhecimento (Step2) — não existe fase para isso ainda.
- Permissões avançadas (Step5) e telas de Admin — Fase 8.
- Chat cross-módulo da Overview — não há orquestrador cross-módulo construído.
- Multi-conversa por módulo (sidebar de histórico) na tela de chat — o protótipo não prevê essa
  UI; fica para quando (se) o design for revisitado.

## 10. Critério de aceite

- Login não mostra mais `FundacaoStatus`/"Ver protótipo (mock)" — vai direto para `CorePilotApp`
  real.
- Criar um módulo pelo Wizard (Identidade → Fontes de Dados → Agente/Skills → Revisão) persiste
  de verdade no backend e aparece na navegação do Header.
- Anexar uma `ConsultaParametrizada` testada como ferramenta de uma Skill funciona a partir do
  editor de skill do Wizard (não só pela tela antiga).
- Conversar com um módulo na tela real produz uma resposta real da Anthropic (mesmo fluxo de
  streaming que `ChatView` já valida hoje).
- Editar um módulo existente recarrega os dados reais corretos no Wizard.
- Compras, Financeiro, Admin, Step2 e Step5 continuam navegáveis e idênticos ao protótipo atual
  (nenhuma regressão visual ou de comportamento nessas partes).
- Isolamento multi-tenant se mantém: um usuário de uma empresa nunca vê módulos/agentes/dados de
  outra (mesma garantia já testada nas fases anteriores, agora através da nova UI).

## 11. Decisões já tomadas (não reabrir)

- Sem estado de rascunho no backend — salvar é sempre a ação real.
- Campos de Skill sem equivalente real (`trigger`, `autonomia`) são removidos da tela, não apenas
  ocultos.
- Wizard Step4 suporta múltiplos agentes por módulo (seletor no topo), não um agente único.
