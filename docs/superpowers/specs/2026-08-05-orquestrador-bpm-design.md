# CorePilot — Fase 5: Orquestrador BPM (design)

## 0. Contexto

Este é o quinto sub-projeto derivado de `COREPILOT_GUIA_IMPLEMENTACAO.md`. As Fases 1
(Fundação), 2 (Módulo + Chat), 3 (Agentes + Skills) e 4 (Fontes de Dados) estão mergeadas
em `main`, mais a fase de Skinning UI (protótipo Claude Design virou o app real) e o
add-on de Rascunho com IA. `Modulo`, `Agente`, `Skill` (com saída estruturada e
ferramentas de consulta parametrizada) e `FonteDeDados`/`ConsultaParametrizada` são
reais e produtivos.

O guia (seção 10) define a Fase 5 como "Orquestrador BPM — motor de estado, canvas
visual, execução de etapa em fila assíncrona", e marca explicitamente como "a fase mais
arriscada tecnicamente" (§10), recomendando não generalizar o builder antes de validar
o caso de ponta a ponta descrito na seção 11 (fluxo de Compras).

Três documentos complementam o guia principal e foram lidos por completo antes deste
desenho:

- `docs/workflow-builder-reference.md` — referência técnica de um builder de workflow
  real (CoreFlow), com o modelo Template/Instância, tipos de etapa, motor de aprovação
  por alçada, campos customizados (`table`/`reference-table`/`summary`) e a limitação
  central: é **estritamente linear**, sem branch nem loop.
- `COREPILOT_ADENDO_TIPO_EXECUTOR.md` — Executor é derivado do Tipo de etapa, não um
  campo livre independente.
- `COREPILOT_ADENDO_CAMPOS_PERSONALIZADOS.md` — o builder de campos livre só vale para
  Executor = Usuário (ou a parte extra de Agente+usuário); etapas de agente espelham o
  `schema_saida` da Skill, somente leitura.
- `COREPILOT_ADENDO_TELA_INTERACAO.md` — a tela de detalhe da interação tem que ser
  100% genérica (`FieldRenderer` + shell + motor de ações via `etapa.acoes[]`), sem
  vocabulário de domínio no código.

Além disso, o usuário forneceu um design completo em Claude Design
(`CorePilot.dc.html`, Step 5 do Wizard) já implementando os dois primeiros adendos: uma
lista vertical linear de etapas (Início → cards em sequência → Fim, não um canvas de
nós arrastáveis), painel lateral de edição, Tipo×Executor travado
(`typeExecutorMap`), e um único desvio possível — `loopToId` numa etapa de Aprovação,
usado quando a ação "Solicitar ajustes" é acionada. Este design é a fonte de verdade
para a UX do builder; este documento formaliza o modelo de dados e o motor por trás
dele.

## 1. Objetivo da Fase 5

Um motor de orquestração real: cada módulo pode ter um `Fluxo` (etapas, macroetapas,
transições) desenhado pelo usuário através do builder (Step5 do Wizard, portado do
design fornecido), executado por uma máquina de estados com fila assíncrona para
etapas de agente/integração, e operável por humanos através de uma tela de interação
genérica (nenhum componente conhece o processo de negócio em si — só renderiza tipos
de campo e tipos de ação, dados vindos do que foi configurado no builder).

Critério de "pronto": o fluxo de Compras da seção 11 do guia rodando de ponta a ponta
— desenhado pelo próprio usuário no builder, não semeado via script — incluindo envio
real de WhatsApp (Evolution API) na etapa final, com auditoria e idempotência.

## 2. Fora de escopo (explicitamente adiado)

- **Canvas de nós arrastáveis / grafo não-linear.** O design fornecido já resolveu isso
  como lista sequencial + um único `loopToId` por etapa de aprovação. Bifurcação
  condicional genérica ("se resultado X vai pro nó A, se Y vai pro nó B") não existe
  nem no CoreFlow nem no design fornecido — não é construída nesta fase.
- **Validar a genericidade da Tela de Interação com um segundo módulo de domínio
  diferente** (ex.: Operações Agrícolas). A arquitetura é construída genérica desde o
  início (sem vocabulário de domínio no código), mas só é exercitada com Compras nesta
  fase. Rodar um segundo módulo pela mesma tela sem alterar código fica registrado como
  critério de aceite formal a verificar depois (§16), não bloqueia o fechamento desta
  fase.
- **"Minhas pendências"** (subvisão do Kanban filtrada pelo usuário logado, guia §7) —
  só o quadro geral é construído agora.
- **Cadastro/Master Data reutilizável** (`entity_types`/`entity_records` do CoreFlow,
  §7 da referência) para o tipo de campo `entity-reference`. O CorePilot não tem, e não
  ganha nesta fase, um sistema de cadastros. `entity-reference` funciona com opções
  estáticas digitadas no builder (como um `select`) ou apontando para uma
  `ConsultaParametrizada`/saída de agente já existente — sem tabela de cadastro
  dedicada. Revisão mais profunda deste tipo de campo fica para quando um fluxo real
  exigir mais do que isso.
- **Redis/BullMQ.** Fila assíncrona implementada em Postgres (mesmo padrão de worker
  in-process já usado pelo `SyncCronService` da Fase 4) — ver §6.
- **Envio de WhatsApp fora do contexto de uma etapa de Integração do motor.** A
  integração Evolution API é construída (§8), mas a tela de admin "Usar WhatsApp para
  notificações de tarefas" (toggle já mockado em `AdminSettings.tsx`, ligado a
  `agentTasks`) continua fora desta fase — só a etapa de Integração do Orquestrador usa
  a conexão configurada.
- **Escrita em fontes de dados a partir de uma etapa do fluxo.** Etapas de Integração
  que não sejam WhatsApp (ex.: gravar no ERP) permanecem como extensão futura — só a
  integração WhatsApp é implementada de ponta a ponta nesta fase, o suficiente para
  validar a etapa de Finalização do fluxo de Compras.

## 3. Arquitetura

```
Wizard Step5 (builder)                     Tela de Interação (genérica)
        │ CRUD                                       │ ações (calculadas da Etapa)
        ▼                                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Fluxo (versionado) ── Macroetapa[] ── Etapa[] (ordem, tipo,      │
│         executor, camposUsuario, loopParaEtapaId)                │
└───────────────────────────┬────────────────────────────────────┘
                             │ publicar()
                             ▼
                  InstanciaDeProcesso (fluxoId travado na criação)
                             │
              ┌──────────────┼───────────────┐
              ▼              ▼               ▼
     ExecucaoDeEtapa   ExecucaoDeEtapa   ação humana síncrona
     (agente) — fila   (integração) —    (aprovação/interação
     Postgres, worker  fila Postgres,    usuário) via API
     in-process         worker in-process
              │              │
              ▼              ▼
     Messages API      Evolution API
     (tool_choice      (WhatsApp)
      = schema Skill)
```

O motor de estado (transição entre etapas) é um módulo isolado (`OrquestradorService` +
`FluxoEngineService`), sem dependência de UI — testável sozinho, seguindo a
recomendação explícita do guia (§12: "implementar o motor de estado como módulo
isolado, com testes automatizados, antes de plugar em qualquer UI").

## 4. Modelo de dados (Prisma) — novo

```prisma
model Fluxo {
  id         String   @id @default(uuid())
  moduloId   String
  versao     Int      @default(1)
  publicado  Boolean  @default(false)
  criadoEm   DateTime @default(now())

  modulo       Modulo               @relation(fields: [moduloId], references: [id])
  macroetapas  Macroetapa[]
  etapas       Etapa[]
  instancias   InstanciaDeProcesso[]
}

model Macroetapa {
  id       String @id @default(uuid())
  fluxoId  String
  nome     String
  ordem    Int

  fluxo  Fluxo   @relation(fields: [fluxoId], references: [id])
  etapas Etapa[]
}

enum TipoEtapa {
  tarefa_agente
  interacao_usuario
  aprovacao
  decisao_automatica
  integracao
  espera
}

enum ExecutorEtapa {
  agente
  usuario
  agente_mais_usuario
  integracao
  agente_mais_integracao
  automatico
}

model Etapa {
  id               String        @id @default(uuid())
  fluxoId          String
  macroetapaId     String
  ordem            Int
  nome             String
  tipo             TipoEtapa
  executor         ExecutorEtapa
  prazoDias        Int?
  agenteId         String?
  skillId          String?
  autonomia        String?       // 'Apenas notificar' | 'Executar e notificar' | 'Executar com aprovação'
  aprovadores      Json          // string[] (nomes; referência a Usuario fica para quando o fluxo tiver seleção real de usuário)
  loopParaEtapaId  String?       // alvo quando a ação de "ajuste" é acionada
  entradaRefs      Json          // string[] de Etapa.id anteriores, usadas como entrada quando executor = agente
  camposUsuario    Json          // CustomField[] — ver §7

  fluxo      Fluxo       @relation(fields: [fluxoId], references: [id])
  macroetapa Macroetapa  @relation(fields: [macroetapaId], references: [id])
  agente     Agente?     @relation(fields: [agenteId], references: [id])
  skill      Skill?      @relation(fields: [skillId], references: [id])
  execucoes  ExecucaoDeEtapa[]
}

enum StatusInstancia {
  em_andamento
  concluido
  erro
}

model InstanciaDeProcesso {
  id               String           @id @default(uuid())
  fluxoId          String           // versão travada na criação — não migra ao republicar
  moduloId         String
  empresaId        String
  etapaAtualId     String
  status           StatusInstancia  @default(em_andamento)
  dadosAcumulados  Json             @default("{}")
  criadoEm         DateTime         @default(now())
  atualizadoEm     DateTime         @updatedAt

  fluxo     Fluxo             @relation(fields: [fluxoId], references: [id])
  modulo    Modulo            @relation(fields: [moduloId], references: [id])
  empresa   Empresa           @relation(fields: [empresaId], references: [id])
  execucoes ExecucaoDeEtapa[]
}

enum StatusExecucao {
  pending
  processing
  done
  failed
}

enum AtorExecucao {
  agente
  usuario
  integracao
  automatico
}

model ExecucaoDeEtapa {
  id                  String          @id @default(uuid())
  instanciaId         String
  etapaId             String
  numeroDaExecucao    Int             // incrementa a cada vez que a instância reentra nesta etapa (loop)
  ator                AtorExecucao
  atorUsuarioId       String?
  input               Json
  output              Json?
  status              StatusExecucao  @default(pending)
  chaveIdempotencia   String?         @unique
  tokensEntrada       Int?
  tokensSaida         Int?
  mensagemErro        String?
  criadoEm            DateTime        @default(now())
  concluidoEm         DateTime?

  instancia InstanciaDeProcesso @relation(fields: [instanciaId], references: [id])
  etapa     Etapa                @relation(fields: [etapaId], references: [id])
  usuario   Usuario?             @relation(fields: [atorUsuarioId], references: [id])
}

model IntegracaoWhatsApp {
  id                 String    @id @default(uuid())
  empresaId          String    @unique
  apiUrl             String
  instanceName       String
  apiKeyCriptografada String
  phone              String?
  ultimoTesteEm      DateTime?
  ultimoTesteSucesso Boolean?
  ultimaMensagemErro String?
  criadoEm           DateTime  @default(now())

  empresa Empresa @relation(fields: [empresaId], references: [id])
}
```

`Modulo` ganha `fluxos Fluxo[]`; `Empresa` ganha `integracaoWhatsapp
IntegracaoWhatsApp?` e `instanciasDeProcesso InstanciaDeProcesso[]`; `Agente`/`Skill`
ganham `etapas Etapa[]` — mudanças aditivas.

`aprovadores`, `entradaRefs`, `camposUsuario` e `acoes` são `Json` (não tabelas
relacionais próprias) pelo mesmo motivo que `Skill.camposSaida` já é `Json` hoje: são
esquemas aninhados e variáveis por etapa, editados como blob pelo builder — normalizar
em tabelas adicionaria joins sem benefício de consulta real.

Toda tabela nova nasce com RLS habilitada e sem policies, mesma regra permanente da
Fase 1.

## 5. Motor de estado

### 5.1 Tipo × Executor (validado também no backend)

Mesma tabela do `COREPILOT_ADENDO_TIPO_EXECUTOR.md`, reaplicada como validação de
domínio (não só UI) antes de permitir publicar um `Fluxo`:

| Tipo de etapa | Executor(es) válido(s) |
|---|---|
| `tarefa_agente` | `agente` |
| `interacao_usuario` | `usuario` |
| `aprovacao` | `usuario`, `agente_mais_usuario` |
| `decisao_automatica` | `automatico` |
| `integracao` | `integracao`, `agente_mais_integracao` |
| `espera` | `automatico` |

`POST /modulos/:moduloId/fluxo/publicar` rejeita a publicação se qualquer etapa violar
essa tabela — mesmo ponto onde a Fase 3 já valida o schema de saída da Skill antes de
publicar.

### 5.2 Disparo de uma instância

Nenhum gatilho "de verdade" (formulário de solicitação, webhook, evento de ERP) é
construído nesta fase — isso é específico de cada processo e fica para quando o
processo real exigir. O motor expõe só o mecanismo genérico:

`POST /modulos/:moduloId/fluxo/instancias` cria uma `InstanciaDeProcesso` na primeira
etapa (`ordem = 1`) do `Fluxo` publicado do módulo, com um payload inicial livre
(`dadosAcumulados` inicial). Qualquer coisa — um botão de teste, um webhook futuro, uma
skill de chat — pode chamar esse endpoint.

### 5.3 Transições

```typescript
interface AcaoEtapa {
  label: string;
  transicaoDestinoId: string;   // Etapa.id de destino (próxima etapa, ou loopParaEtapaId)
  exigeCampo?: { key: string; label: string; obrigatorio: boolean };
  estilo: 'primario' | 'secundario' | 'perigo';
}
```

- Etapas com executor `automatico`, `agente`, `agente_mais_integracao`, `integracao`:
  ao concluir a `ExecucaoDeEtapa` com `status = done`, o motor avança
  automaticamente para a etapa de `ordem` seguinte no mesmo `Fluxo` (ou marca a
  instância como `concluido` se era a última).
- Etapas com executor `usuario` ou `agente_mais_usuario` (`interacao_usuario`,
  `aprovacao`): não avançam sozinhas. Ficam paradas até uma chamada a `POST
  /instancias/:id/acoes` com o `AcaoEtapa` escolhido. `AcaoEtapa[]` **não é
  persistido** — é calculado pela API a cada leitura da instância, a partir de
  `Etapa.tipo`/`loopParaEtapaId`: uma etapa de aprovação sempre gera duas ações,
  "Aprovar" (destino = próxima etapa) e "Solicitar ajustes" (destino =
  `loopParaEtapaId`, exige `motivo_correcao`, só existe se `loopParaEtapaId` estiver
  preenchido); uma etapa `interacao_usuario` gera uma ação "Concluir" (destino =
  próxima etapa). O design fornecido não expõe edição livre de rótulos de ação no
  builder — só a config de aprovadores/loop — então não há necessidade de guardar
  isso como dado próprio agora; formalizar `AcaoEtapa` como config editável do
  builder fica para quando um fluxo real precisar de ações com nomes/destinos
  livres.
- Falha (`status = failed`) de uma `ExecucaoDeEtapa` automática marca a
  `InstanciaDeProcesso.status = erro` — nunca conclui silenciosamente (guia §6). A
  Tela de Interação mostra um estado visível de erro com ação "Reenviar", que cria uma
  nova `ExecucaoDeEtapa` (mesma etapa, `numeroDaExecucao + 1`) com `status = pending`.

### 5.4 Resolução de `reference-table` sob loop

Como a mesma etapa pode executar mais de uma vez numa instância (loop), um campo
`reference-table` que aponta para `referenceStepId` resolve, em runtime, para a
**última** `ExecucaoDeEtapa` (`numeroDaExecucao` mais alto) daquela etapa dentro da
instância atual — não a primeira execução histórica. Mesmo ajuste que o adendo de
campos personalizados já antecipa (§3 daquele documento).

## 6. Fila assíncrona (sem Redis)

`ExecucaoDeEtapa` com `status = pending` e `ator` em (`agente`, `integracao`) funciona
como a fila. Um worker in-process (`@Interval()` do `@nestjs/schedule`, mesmo padrão já
usado pelo `SyncCronService` da Fase 4) roda a cada alguns segundos:

1. Busca até N `ExecucaoDeEtapa` `pending` mais antigas, marca `processing`.
2. Para `ator = agente`: monta a chamada à Messages API (§7) e valida a saída contra o
   schema da Skill.
3. Para `ator = integracao`: chama a `IntegracaoWhatsApp` (§8).
4. Grava `output`/`status`/`concluidoEm`, aciona a transição do §5.3.

Sem infraestrutura nova (Redis/Docker) para rodar localmente — mantém o princípio do
`CLAUDE.md` de backend local/self-hosted. Throughput baixo é aceitável: volume esperado
é etapas de processo BPM, não uma fila de alto volume.

## 7. Integração com a API do Claude (etapa `tarefa_agente`)

Segue a seção 5 do guia principal, já parcialmente implementada pela Fase 3
(`SkillExecucaoController`) — reaproveitada, não reescrita:

1. Contexto de entrada = `InstanciaDeProcesso.dadosAcumulados`, filtrado por
   `Etapa.entradaRefs` (só o que as etapas anteriores referenciadas produziram).
2. `system` = identidade/objetivo do `Agente` da etapa; `tool_choice` forçado ao schema
   de saída da `Skill` da etapa (mesmo mecanismo de saída estruturada da Fase 3).
3. Saída validada contra `Skill.camposSaida` antes de gravar em
   `ExecucaoDeEtapa.output` e mesclar em `InstanciaDeProcesso.dadosAcumulados`.
4. Autonomia (`Apenas notificar | Executar e notificar | Executar com aprovação`) é
   lida da própria `Etapa.autonomia` pelo motor — nunca decidida pelo prompt do agente
   (guia §5).

## 8. Integração WhatsApp (Evolution API)

Tela "WhatsApp · Evolution API" já existe mockada em `AdminSettings.tsx`
(`apiUrl`, `instanceName`, `apiKey`, `phone`) — vira real:

- `IntegracaoWhatsApp` por empresa, mesmo padrão de credencial em repouso da Fase 4
  (`apiKeyCriptografada`, AES-256-GCM, `ERP_ENCRYPTION_KEY`, nunca reenviada ao
  frontend).
- `POST /empresas/atual/integracao-whatsapp` — cria/atualiza a conexão.
- `POST /empresas/atual/integracao-whatsapp/testar` — chama a Evolution API (endpoint
  de status da instância) e atualiza `ultimoTesteEm`/`ultimoTesteSucesso`.
- `EvolutionApiAdapter.enviarMensagem(config, telefone, texto): Promise<{messageId}>`
  — isola o protocolo HTTP da Evolution API, mesmo espírito do `TotvsRmAdapter` da Fase
  4 (um módulo, testável, sem vazar detalhe de protocolo pro resto do motor).
- Usada pela etapa tipo `integracao`/`agente_mais_integracao` do motor: o worker (§6)
  monta o texto (a partir da saída do agente, se `agente_mais_integracao`) e chama
  `enviarMensagem`.
- **Idempotência**: `ExecucaoDeEtapa.chaveIdempotencia` = `instanciaId:etapaId:numeroDaExecucao`
  (constraint única no banco). Antes de enviar, o worker verifica se já existe uma
  `ExecucaoDeEtapa` `done` com essa chave — reenvio do worker (ex.: após restart do
  backend no meio de um envio) não duplica a mensagem.

## 9. Superfície da API (Fase 5)

Builder (CRUD do Fluxo em rascunho):
- `GET /modulos/:moduloId/fluxo` — retorna a versão em rascunho (cria uma vazia se não
  existir) com `macroetapas[]`/`etapas[]`.
- `POST /modulos/:moduloId/fluxo/macroetapas` / `PATCH .../:id` / `DELETE .../:id`
- `POST /modulos/:moduloId/fluxo/etapas` / `PATCH .../:id` / `DELETE .../:id`
- `POST /modulos/:moduloId/fluxo/publicar` — valida (§5.1 + schemas de Skill
  referenciados) e publica; `versao` incrementa a cada publicação; instâncias já
  criadas continuam na versão em que começaram (guia §2, item 7).

Execução:
- `POST /modulos/:moduloId/fluxo/instancias` — dispara uma instância (§5.2).
- `GET /modulos/:moduloId/fluxo/instancias` — lista, para o Kanban (§11).
- `GET /instancias/:id` — etapa atual + `dadosAcumulados` + histórico de
  `ExecucaoDeEtapa`, para a Tela de Interação.
- `POST /instancias/:id/acoes` — executa um `AcaoEtapa` (§5.3).

Integração:
- `POST /empresas/atual/integracao-whatsapp` / `POST .../testar`

Todos protegidos por `JwtAuthGuard` + `TenantGuard`, reaproveitados sem alteração.

## 10. Frontend — Builder do Orquestrador (Step5 do Wizard)

Porta `CorePilot.dc.html` (Step5) quase 1:1, trocando `this.state.orchestratorNodes` /
`setState` local por dados reais vindos da API do §9:

- Lista vertical: Início → card por `Etapa` (ordenada por `ordem`) → Fim. Clicar num
  card abre o painel lateral de edição.
- Painel: Nome, Tipo (`nodeTypeOptions`), Executor (travado/filtrado por
  `typeExecutorMap`, §5.1), Macroetapa, Prazo.
- **Criar Macroetapa inline**: o select "Coluna do Kanban" ganha uma opção "+ Nova
  coluna...", que abre um input inline e cria a `Macroetapa` via API antes de
  selecioná-la — resolve a lacuna que o mock original deixava em aberto (não tinha
  handler de criação).
- Campos condicionais por Executor (`executorFieldModeMap` do mock): agente
  responsável + autonomia (quando `agente`); aprovadores + "se reprovado, voltar
  para" (quando `usuario`/`agente_mais_usuario` numa etapa `aprovacao`); builder livre
  de campos (`camposUsuario`, quando `usuario` ou a parte extra de
  `agente_mais_usuario`); campos de saída somente-leitura espelhados do
  `Skill.camposSaida` (quando `agente`) + checkboxes de `entradaRefs` sobre etapas
  anteriores.
- "+ Nova etapa" / excluir etapa chamam os endpoints de CRUD; excluir uma etapa que é
  alvo de `loopParaEtapaId` de outra limpa essa referência (mesmo comportamento do
  mock).

## 11. Frontend — Tela de Interação genérica

Substitui `CardDetailDrawer.tsx` (hoje específico de Compras) por um componente
genérico, seguindo `COREPILOT_ADENDO_TELA_INTERACAO.md` à risca:

```typescript
function FieldRenderer(field: CustomField, valor: unknown, modo: 'leitura'|'edicao'): ReactNode
function TelaDeInteracao(props: { etapa: Etapa; instancia: InstanciaDeProcesso; historico: ExecucaoDeEtapa[] }): ReactNode
```

- `FieldRenderer` cobre os 9 tipos do adendo de campos (§2 daquele documento):
  `text, number, date, select, checkbox, attachment, entity-reference, table,
  reference-table, summary`. Coluna `calculated` de uma `table`/`reference-table` é
  sempre recalculada no client, nunca editável diretamente.
- O shell itera `Fluxo.etapas` cruzando com `historico` para a trilha de progresso,
  `etapa.camposUsuario`/saída-de-agente via `FieldRenderer`, e os botões a partir das
  `AcaoEtapa[]` calculadas pela API (§5.3) — nenhum nome de campo, botão ou processo
  está hardcoded no componente.
- Nenhum vocabulário de Compras (fornecedor, cotação) aparece no código deste
  componente — só existe como dado salvo pelo builder.

## 12. Frontend — Kanban board

`KanbanBoard.tsx` é mantido, mas alimentado por dados reais: colunas = `Macroetapa` do
fluxo publicado do módulo (na ordem), cards = `InstanciaDeProcesso` com
`status = em_andamento`, agrupadas pela macroetapa da etapa atual. Resumo do card
(hoje "6 itens · Urgente", hardcoded no mock) vira genérico: nome curto da instância
(id curto) + nome da etapa atual + tempo parado nela — sem tentar resumir o conteúdo
de negócio da instância no card (isso é o que a Tela de Interação mostra ao abrir).

## 13. Auditoria

Toda `AcaoEtapa` executada por um humano gera `AuditLog`
(`acao: 'etapa_acao_executada'`, `dadosAntes`/`dadosDepois` = etapa origem/destino +
dados do formulário). Publicar um `Fluxo` gera `AuditLog`
(`acao: 'fluxo_publicado'`). Execuções automáticas (`ator = agente | automatico |
integracao`) não passam por `AuditLog` — ficam registradas em `ExecucaoDeEtapa`, que já
tem ator/timestamp/input/output (mesmo raciocínio da Fase 4 para sincronizações
automáticas).

## 14. Variáveis de ambiente (novas)

Backend (`backend/.env.local`):
- Nenhuma nova chave de criptografia — reaproveita `ERP_ENCRYPTION_KEY` (Fase 4) para
  `IntegracaoWhatsApp.apiKeyCriptografada`, já que é o mesmo propósito (credencial de
  integração externa em repouso).

## 15. Critério de aceite (caso de validação da Fase 5)

Mesmo roteiro da seção 11 do guia principal, com uma condição adicional: **o fluxo é
desenhado pelo usuário através do builder real (§10), não semeado por script ou
migração.**

1. No Wizard de um módulo real (Compras), desenhar as 6 etapas do fluxo (Solicitação
   recebida → IA confere e agrupa → Comprador valida → Fornecedores cotam → Comprador
   aprova → Pedido gerado), incluindo o `loopParaEtapaId` de "Comprador aprova" de
   volta pra "Fornecedores cotam", e publicar.
2. Disparar uma `InstanciaDeProcesso` — a etapa automática grava e a etapa de agente
   (fila) processa sem bloquear a requisição HTTP.
3. Etapa de aprovação aparece na Tela de Interação genérica; aprovar avança, "Solicitar
   ajustes" volta pra Cotação com `motivo_correcao` preenchido (loop funcionando).
4. Etapa final de Integração envia uma mensagem WhatsApp real via Evolution API;
   reenviar a mesma execução não duplica o envio (idempotência).
5. Toda ação humana e toda execução de agente/integração tem registro auditável
   (`AuditLog` ou `ExecucaoDeEtapa`, conforme §13).
6. Isolamento multi-tenant: `Fluxo`/`InstanciaDeProcesso` de uma empresa nunca
   aparecem para outra (mesmo padrão e2e das fases anteriores).

## 16. Decisões em aberto (a resolver depois, não bloqueantes)

- Validar a Tela de Interação com um segundo módulo de domínio diferente, sem alterar
  código (critério de aceite formal do `COREPILOT_ADENDO_TELA_INTERACAO.md` §7) —
  registrado, não bloqueia esta fase (§2).
- Modelo definitivo de `entity-reference` (opções estáticas vs. vinculado a
  `ConsultaParametrizada`/saída de agente) — implementado no nível mínimo nesta fase,
  revisão maior fica para quando um fluxo real precisar de mais.
- Intervalo exato do worker da fila (`@Interval()`, §6) — proposto alguns segundos,
  ajustável sem impacto de design.
- "Minhas pendências" e outras subvisões do Kanban (guia §7) — Fase 6.
