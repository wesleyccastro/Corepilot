# CorePilot — Fase 4: Fontes de Dados (TOTVS RM) (design)

## 0. Contexto

Este é o quarto sub-projeto derivado de `COREPILOT_GUIA_IMPLEMENTACAO.md`. As Fases 1
(Fundação), 2 (Módulo + Chat) e 3 (Agentes + Skills) estão mergeadas em `main`:
autenticação real, multi-tenant, auditoria, `Modulo`/`Agente`/`Skill` reais, chat livre
conectado à Messages API (streaming), e execução avulsa de Skill com saída estruturada
via Structured Outputs — sem tools ainda (explicitamente adiado na Fase 3).

O guia (seção 10) define a Fase 4 como "Fontes de dados — conectores somente leitura,
consultas parametrizadas expostas como tools". A seção 4 do guia define o modelo núcleo
`Modulo → FonteDeDados (tipo, conexão, somente_leitura=true) → ConsultaParametrizada
(nome, sql/params, testada:boolean)`. Os princípios não-negociáveis relevantes (§2): #5
("credenciais de fontes de dados vivem só no backend"), #6 ("fontes de dados são sempre
somente leitura, com consultas parametrizadas cadastradas previamente — nunca acesso
livre a SQL vindo do agente").

Diferente das fases anteriores, esta fase tem um alvo real e concreto desde o início: o
TOTVS RM (ERP), com dois documentos de referência fornecidos pelo usuário — um brief de
design (UX do fluxo de conexão) e uma referência técnica de implementação real em
produção (protocolo SOAP, autenticação, parsing, gotchas). A referência técnica cobre
tanto leitura (`wsConsultaSQL`/`RealizarConsultaSQL`) quanto escrita
(`wsDataServer`/`SaveRecord`) do RM; esta fase implementa **somente a leitura**, por ser
o que o princípio não-negociável #6 permite.

## 1. Objetivo da Fase 4

Conectar o CorePilot a uma fonte de dados real do TOTVS RM: uma conexão por empresa
(`FonteDeDados`), consultas parametrizadas por módulo (`ConsultaParametrizada`,
referenciando por nome uma consulta SQL já cadastrada dentro do próprio RM), sincronizadas
periodicamente para o Postgres local via um job agendado no próprio backend, e expostas
como ferramentas (`tools`) reais nas execuções de Skill da Fase 3 — o agente nunca chama
o RM ao vivo durante uma execução, só lê os dados já sincronizados localmente.

## 2. Fora de escopo (explicitamente adiado)

- Escrita no RM (`wsDataServer`/`SaveRecord`) — fere o princípio não-negociável #6
  ("fontes de dados são sempre somente leitura"). Se um dia for necessário gravar de
  volta no RM, isso é uma capacidade distinta (mais próxima de "integração externa",
  Fase 7, ou de uma ação de agente dentro do motor BPM, Fase 5+), não parte do conceito
  de Fonte de Dados desta fase.
- Sugestão de descrição de coluna via IA ("Descrever com IA" no brief de design) — o
  admin descreve manualmente por enquanto; sem nova chamada à Anthropic para esse fluxo
  nesta fase.
- Suporte a outros tipos de fonte de dados além de TOTVS RM — o campo `tipo` existe
  desde já (para não travar o design), mas só `'totvs_rm'` é implementado.
- Parâmetros de sincronização variáveis por sub-entidade (ex.: `codFilial` diferente por
  fazenda) — cadastrar múltiplas `ConsultaParametrizada` (uma por combinação de
  parâmetros fixos) é a solução desta fase, não modelar isso como dimensão dinâmica.
- Builder wizard completo do módulo — a criação de `FonteDeDados`/`ConsultaParametrizada`
  segue o padrão de formulário simples já usado nas Fases 2/3, com a revelação
  progressiva descrita no brief de design, não o wizard de 7 passos do guia original.

## 3. Arquitetura

```
                    ┌─ Empresa ─────────────────────────────────┐
                    │  FonteDeDados (conexão TOTVS RM)           │
                    └────────────────┬────────────────────────────┘
                                     │ referenciada por
                    ┌─ Modulo ───────┴────────────────────────────┐
                    │  ConsultaParametrizada (codSentenca + params)│
                    └────────────────┬────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │ Job agendado (@Cron, NestJS)│           │ Skill.ferramentas[] (Fase 3)
        ▼                            │           ▼
  TotvsRmAdapter                     │     SkillExecucaoController
  (SOAP wsConsultaSQL,          grava/lê      (tool-use loop, lê
   somente leitura)             ConsultaResultado   ConsultaResultado local)
        │                            │
        ▼                            ▼
  TOTVS RM (rede do cliente)   Postgres local (nosso)
```

O agente **nunca** fala com o TOTVS RM diretamente nem durante uma execução de Skill —
só o job de sincronização fala com o RM; a Skill só lê `ConsultaResultado` (Postgres
local via Prisma). Isso evita que uma execução de agente dependa da disponibilidade do
RM em tempo real, e evita expor credenciais do RM a qualquer coisa fora do job de sync.

**Scheduling**: o documento de referência usa `pg_cron` + `pg_net` chamando uma Supabase
Edge Function — um padrão adequado para um projeto sem backend próprio rodando
continuamente. Este projeto **tem** um NestJS rodando continuamente, e o CLAUDE.md já
estabelece: Supabase Functions são último recurso, scheduling é implementado localmente
no backend por padrão. Esta fase usa `@nestjs/schedule` (`@Cron()`) dentro do próprio
NestJS — sem Edge Function, sem extensões do Postgres.

## 4. Modelo de dados (Prisma) — novo

```prisma
model FonteDeDados {
  id                 String    @id @default(uuid())
  empresaId          String
  tipo               String    // 'totvs_rm' por enquanto
  nome               String
  configuracao       Json      // { serverUrl, username, senhaCriptografada, codSistema, codColigada }
  ultimoTesteEm      DateTime?
  ultimoTesteSucesso Boolean?
  ultimaMensagemErro String?
  criadoEm           DateTime  @default(now())

  empresa   Empresa                 @relation(fields: [empresaId], references: [id])
  consultas ConsultaParametrizada[]
}

model ConsultaParametrizada {
  id                           String    @id @default(uuid())
  moduloId                     String
  fonteDeDadosId               String
  nome                         String
  codSentenca                  String
  parametrosSincronizacao      Json      // { chave: valor }[] fixos, usados só pelo cron
  camposFiltro                 Json      // CampoFiltro[] — o que o agente informa na tool
  colunas                      Json?     // descoberto no primeiro teste bem-sucedido
  testada                      Boolean   @default(false)
  sincronizacaoAtiva           Boolean   @default(false)
  intervaloCron                String?
  ultimaSincronizacaoEm        DateTime?
  ultimoResultadoSincronizacao Json?
  criadoEm                     DateTime  @default(now())

  modulo       Modulo              @relation(fields: [moduloId], references: [id])
  fonteDeDados FonteDeDados        @relation(fields: [fonteDeDadosId], references: [id])
  resultados   ConsultaResultado[]
  skills       Skill[]             // many-to-many: Skills que usam esta consulta como tool
}

model ConsultaResultado {
  id                      String   @id @default(uuid())
  consultaParametrizadaId String
  dados                   Json     // a linha, com os aliases originais do RM como chaves
  sincronizadoEm          DateTime @default(now())

  consulta ConsultaParametrizada @relation(fields: [consultaParametrizadaId], references: [id])
}
```

`Empresa` ganha `fontesDeDados FonteDeDados[]`; `Modulo` ganha
`consultas ConsultaParametrizada[]`; `Skill` (Fase 3) ganha
`ferramentas ConsultaParametrizada[]` (many-to-many implícito do Prisma) — mudanças
aditivas, sem impacto nos modelos já em produção.

`camposFiltro` segue o mesmo formato `CampoSaida`-like já usado em `Skill.camposSaida`
(Fase 3): `{ nome: string; tipo: 'string'|'number'|'boolean'|'string[]'; descricao?:
string; obrigatorio: boolean }[]`.

Cada sincronização (manual via "Testar consulta", ou automática via cron) **substitui**
os `ConsultaResultado` anteriores daquela consulta — não acumula histórico indefinido, só
reflete o estado mais recente conhecido.

Toda tabela nova (`FonteDeDados`, `ConsultaParametrizada`, `ConsultaResultado`) nasce com
RLS habilitada e sem policies, na mesma migração que as cria (regra permanente
estabelecida na Fase 1, `docs/superpowers/specs/2026-07-24-fundacao-design.md` §3.1).

## 5. Integração TOTVS RM

Protocolo (extraído da referência técnica fornecida): dois webservices SOAP 1.1
distintos — `wsConsultaSQL`/`RealizarConsultaSQL` (leitura, único usado nesta fase) e
`wsDataServer`/`SaveRecord` (escrita, fora de escopo). `TotvsRmAdapter` isola todo o
protocolo:

- `realizarConsultaSQL(config, codSentenca, parametros): Promise<Record<string,string>[]>`
  - Envelope SOAP com `AutenticacaoHeader` (`Chave = usuario|senha|codSistema|codColigada`)
    **e** HTTP Basic Auth simultaneamente — ambos exigidos pelo RM.
  - `parametros` vira uma única string `CHAVE=valor;CHAVE2=valor2` (não JSON, não XML
    aninhado); tag vazia se não houver parâmetros.
  - Resposta: XML com entidades escapadas, decodificado manualmente; uma tag
    `<Resultado>` por linha; sub-tags = aliases de coluna definidos na própria sentença
    cadastrada no RM (não previsíveis de fora — só descobertos testando).
  - Matching de tag de coluna **case-insensitive** (nomes com espaço podem virar
    `_x0020_` ou perder o espaço dependendo da versão do RM); decimais convertidos de
    vírgula para ponto antes de `parseFloat`.
  - Datas como parâmetro no formato `yyyymmdd`, sem separador.
  - Distingue erro de rede (mensagem de "servidor inacessível") de erro de negócio do RM
    (mensagem extraída de `faultstring`/`Message`/`Mensagem` no corpo XML) — nunca confia
    só em `response.ok`.
  - Sem endpoint de ping: "testar" é sempre rodar a consulta de verdade com os
    `parametrosSincronizacao` configurados.

**Credenciais em repouso**: a senha do RM é criptografada na camada da aplicação (Node
`crypto`, AES-256-GCM) antes de gravar em `FonteDeDados.configuracao`, com a chave vindo
de uma variável de ambiente nova (`ERP_ENCRYPTION_KEY`, só em `backend/.env.local`) — não
`pgcrypto` no banco, para manter a criptografia inteiramente na camada NestJS, sem
depender de extensão do Postgres. Descriptografada só no momento da chamada ao RM; o
frontend nunca recebe usuário/senha de volta, só `{ configurada: boolean }` mais os
campos de status (`ultimoTesteEm`, `ultimoTesteSucesso`, `ultimaMensagemErro`). No
formulário, a senha é digitada uma única vez ao configurar/trocar a conexão; depois de
salva, o campo nunca recarrega o valor real — só mostra mascarado e oferece "trocar
senha".

## 6. Sincronização periódica

- Um único `@Cron()` (NestJS `@nestjs/schedule`, ex.: a cada 5 minutos) percorre as
  `ConsultaParametrizada` com `sincronizacaoAtiva = true` e verifica se já passou o
  `intervaloCron` configurado desde `ultimaSincronizacaoEm` antes de re-sincronizar —
  evita registrar N cron jobs dinâmicos via `SchedulerRegistry` (mais simples, sobrevive
  a restart do backend sem lógica de re-registro na inicialização).
- Para cada consulta devida: chama `TotvsRmAdapter.realizarConsultaSQL` com os
  `parametrosSincronizacao`, apaga os `ConsultaResultado` antigos daquela consulta,
  insere os novos, atualiza `ultimaSincronizacaoEm` e `ultimoResultadoSincronizacao`
  (`{ sucesso: true, linhasLidas: N }` ou `{ sucesso: false, erro }`).
- Falha de sincronização de uma consulta não derruba as demais — cada uma é isolada.
- "Testar consulta" (endpoint manual) roda o mesmo caminho de código do cron — dobra
  como descoberta inicial de schema **e** sincronização sob demanda; não há endpoint
  separado de "sincronizar agora".

## 7. Uso como tool na execução de Skill

Estende o `SkillExecucaoController` (Fase 3), que hoje só faz uma chamada única
`parseStructured` sem tools:

1. Skill sem nenhuma `ConsultaParametrizada` anexada → comportamento idêntico à Fase 3,
   sem mudança.
2. Skill com 1+ ferramentas anexadas:
   - Monta `tools[]`, um por `ConsultaParametrizada` anexada, com `input_schema`
     construído a partir de `camposFiltro` (mesmo builder dinâmico Zod da Fase 3).
   - Loop manual com `client.messages.create()` (API estável, **não** o Tool Runner beta):
     enquanto `stop_reason === 'tool_use'`, executa a tool localmente — uma query Prisma
     sobre `ConsultaResultado.dados` daquela consulta, filtrando pelos valores que o
     agente informou — e devolve `tool_result`. Nenhuma chamada ao RM acontece neste
     momento.
   - Ao terminar o loop (`stop_reason !== 'tool_use'`), uma **chamada final separada**
     com `messages.parse()` + `output_config.format` (sem tools), passando o histórico
     acumulado, garante a saída estruturada da Skill. `tools` e `output_config` não são
     combinados numa única chamada — a documentação disponível não confirma que isso é
     suportado junto, e sequenciar as duas chamadas é uma escolha segura independente
     desse detalhe da API.

## 8. Superfície da API (Fase 4)

- `POST /fontes-de-dados` — cria uma `FonteDeDados` (`tipo`, `nome`, `configuracao`) na
  empresa do tenant atual.
- `GET /fontes-de-dados` — lista as fontes da empresa do tenant atual.
- `POST /modulos/:moduloId/consultas` — cria uma `ConsultaParametrizada`
  (`fonteDeDadosId`, `nome`, `codSentenca`, `parametrosSincronizacao`, `camposFiltro`) no
  módulo informado.
- `GET /modulos/:moduloId/consultas` — lista as consultas desse módulo.
- `POST /consultas/:consultaId/testar` — roda a consulta de verdade contra o RM,
  descobre `colunas`, marca `testada = true`, grava `ConsultaResultado`.
- `POST /skills/:skillId/ferramentas` — anexa uma `ConsultaParametrizada` **já testada**
  como ferramenta da Skill.
- `DELETE /skills/:skillId/ferramentas/:consultaId` — remove a ferramenta da Skill.

Todos protegidos por `JwtAuthGuard` + `TenantGuard` (reaproveitados das fases anteriores,
sem alteração).

## 9. Frontend

Segue o brief de design fornecido:

- **Tela de Fonte de Dados** (nível empresa): seletor "Tipo de fonte" (revelação
  progressiva), campos de conexão (servidor, usuário, senha mascarada, código
  sistema/coligada), banner de segurança fixo ("Somente leitura · consultas
  parametrizadas · nenhum acesso livre ao banco"), card com badge de status (Não
  configurada / Salva-não-testada [cinza/amarelo, nunca verde] / Testando / Conectada
  [verde + timestamp] / Erro [vermelho + mensagem real do RM]).
- **Tela de Consulta Parametrizada** (nível módulo): nome, `codSentenca`, parâmetros de
  sincronização (lista chave/valor), construtor guiado de campos de filtro (mesmo
  padrão da Fase 3). Botão "Testar consulta" roda de verdade, popula `colunas`
  automaticamente (usuário não digita nomes de coluna) e mostra prévia dos dados.
  Dicionário de campos: nome técnico à esquerda, descrição editável à direita (manual);
  coluna sem descrição é alerta brando, não bloqueante. Toggle de sincronização ativa +
  intervalo, com timestamp/resultado da última sincronização automática.
- Consulta só pode ser anexada como ferramenta de uma Skill depois de `testada = true`.

## 10. Auditoria

Anexar/remover uma ferramenta numa Skill gera `AuditLog` (`acao: 'ferramenta_anexada'` /
`'ferramenta_removida'`) — ação humana, com ator, mesmo padrão já estabelecido. Execuções
automáticas de sincronização (cron) não passam por `AuditLog` — ficam registradas em
`ConsultaParametrizada.ultimoResultadoSincronizacao`, já que não têm um `atorUsuarioId`
(ator humano/agente) associado.

## 11. Variáveis de ambiente (novas)

Backend (`backend/.env.local`):
- `ERP_ENCRYPTION_KEY` — chave usada para criptografar/descriptografar a senha do TOTVS
  RM em repouso (AES-256-GCM). Nunca commitada, nunca exposta ao frontend.

## 12. Critério de aceite (caso de validação da Fase 4)

1. Cadastrar uma `FonteDeDados` TOTVS RM real (servidor, usuário, senha, código
   sistema/coligada) — senha nunca reaparece na tela após salvar.
2. Cadastrar uma `ConsultaParametrizada` num módulo, testar com sucesso contra o RM
   real — colunas descobertas automaticamente, dados de exemplo visíveis.
3. Ativar sincronização periódica — confirmar que o cron roda e atualiza
   `ConsultaResultado`/`ultimaSincronizacaoEm` sem intervenção manual.
4. Anexar a consulta como ferramenta de uma Skill existente (Fase 3) e executá-la com
   uma entrada que exija o dado do RM — a saída estruturada final reflete um valor real
   vindo dos dados sincronizados localmente (não uma chamada ao vivo ao RM durante a
   execução).
5. Isolamento entre empresas para `FonteDeDados`/`ConsultaParametrizada` (mesmo padrão
   e2e das fases anteriores).
6. Senha do RM nunca aparece em texto plano no banco nem é commitada no repositório.

## 13. Decisões em aberto (a resolver durante a implementação, não bloqueantes)

- Intervalo exato do `@Cron()` que verifica consultas devidas (proposto: a cada 5
  minutos) — ajustável sem impacto de design.
- Formato exato de erro quando o TOTVS RM está inacessível durante uma execução de
  Skill que dependeria de dados desatualizados/nunca sincronizados (a Skill deve falhar
  de forma clara, não silenciosamente retornar dados vazios como se fossem válidos) —
  detalhe de implementação, princípio já definido.
- Se `codFilial`/`codVen1`/`codVen2`/outros campos específicos de movimento mencionados
  na referência técnica (relevantes só para escrita, `wsDataServer`) precisam de algum
  lugar no schema desta fase — não deveriam, já que esta fase é só leitura; confirmar
  que nenhum campo de escrita vazou para `FonteDeDados.configuracao` durante a
  implementação.
