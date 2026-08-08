# Design — Conectores OAuth por usuário (fase 1: infra + Google)

> Spec derivado de uma conversa sobre replicar o padrão de "conectores" da G4 OS (Gmail,
> Google Calendar, Google Drive, Outlook, Slack, Notion — mais de 60 integrações nativas via
> OAuth/webhook). Escreve o desenho da primeira fatia: infraestrutura genérica de conexão OAuth
> por usuário + o primeiro conector real (Google). Slack fica para uma fase seguinte, reaproveitando
> a mesma infra. O **uso** dessas conexões por Agentes/Skills/Orquestrador fica fora de escopo —
> esta fase entrega só a conexão em si.

## Contexto

Hoje o Corepilot tem dois padrões de integração externa, nenhum dos dois OAuth:

- `FonteDeDados` (`backend/src/fonte-de-dados/`) — usuário/senha do TOTVS RM, por empresa,
  criptografado com `criptografar`/`descriptografar` (AES-256-GCM, `crypto.ts`).
- `IntegracaoWhatsApp` (`backend/src/integracao-whatsapp/`) — API key da Evolution API, por
  empresa (`empresaId @unique`), mesma criptografia, mesma env var `ERP_ENCRYPTION_KEY` (nome
  histórico, já reaproveitada de forma genérica pela integração de WhatsApp).

A tela de "Base de conhecimento" (`frontend/src/corepilot/components/KnowledgeManager.tsx`) já
tem botões de UI para "Link do Drive"/"Pasta do Drive", mas são inteiramente mock — leem e
escrevem em `state.knowledgeSources` local, sem nenhuma chamada de API real. Não existe hoje
nenhuma infraestrutura de OAuth2 no backend.

A decisão de produto, confirmada na conversa: os conectores são **por usuário** (a conta usada
pra conectar normalmente é o e-mail pessoal de cada um, não uma conta compartilhada da empresa),
ao contrário do padrão "por empresa" de `FonteDeDados`/`IntegracaoWhatsApp`. O primeiro conector a
implementar é o **Google** (Drive, Planilhas, Calendário, Gmail — todos num único fluxo de
consentimento, já que compartilham o mesmo app OAuth do Google), seguido de Slack.

## Modelo de dados

Novo model `ConectorConexao`, escopado por `usuarioId` **e** `empresaId` — mantém o mesmo
isolamento por tenant usado em todo o resto do banco, mesmo sendo uma conexão "pessoal" (evita
vazamento entre empresas caso o mesmo usuário pertença a mais de uma `Empresa` via
`UsuarioEmpresa`, e mantém consistência com o padrão de escopo já usado em toda a aplicação).

```prisma
model ConectorConexao {
  id                        String    @id @default(uuid())
  usuarioId                 String
  empresaId                 String
  provider                  String    // "google" | "slack" (futuro)
  contaExterna              String?   // ex.: "fulano@gmail.com" — exibido na UI
  accessTokenCriptografado  String
  refreshTokenCriptografado String?
  expiraEm                  DateTime?
  escopos                   String[]
  ultimoTesteEm             DateTime?
  ultimoTesteSucesso        Boolean?
  criadoEm                  DateTime  @default(now())
  atualizadoEm              DateTime  @updatedAt

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([usuarioId, empresaId, provider])
}
```

Tokens criptografados com `criptografar`/`descriptografar` (`fonte-de-dados/crypto.ts`,
reaproveitado — mesmo padrão AES-256-GCM, mesma `ERP_ENCRYPTION_KEY`).

## Fluxo OAuth (backend, `backend/src/conector/`)

O callback do Google chega como um `GET` direto do navegador do usuário — sem o header
`Authorization` que o `JwtAuthGuard` exige — então não pode ficar atrás da autenticação normal da
API. Segue o fluxo padrão OAuth2 "authorization code" com dois endpoints assimétricos:

- **`GET /conectores/:provider/iniciar`** (autenticado, `JwtAuthGuard` + `TenantGuard`): monta a
  URL de consentimento do provider com um `state` assinado (HMAC-SHA256 com uma chave de servidor)
  contendo `usuarioId` + `empresaId` + nonce + timestamp de expiração curta (ex.: 10 min). Devolve
  `{ url }` — o frontend abre essa URL numa nova aba/janela (mesmo padrão do mockup da G4 OS:
  "A autenticação abre no navegador padrão. Você pode voltar aqui depois de concluir.").
- **`GET /conectores/:provider/callback`** (**público**, sem guard nenhum): recebe `code` e
  `state` do provider. Valida a assinatura e a expiração do `state` (rejeita se inválido/expirado
  — essa validação é a única coisa que impede um callback forjado de gravar tokens na conta errada,
  já que não há sessão/JWT nesta chamada). Troca `code` por tokens via o endpoint de token do
  provider, criptografa e faz `upsert` em `ConectorConexao` (chave `usuarioId+empresaId+provider`
  extraída do `state`), redireciona o navegador de volta pro frontend
  (`${FRONTEND_ORIGIN}/.../conectores?status=sucesso|erro`).
- **`GET /conectores`** (autenticado): lista as conexões do usuário atual na empresa do
  `TenantContext` — `provider`, `contaExterna`, `escopos`, `ultimoTesteSucesso`. Nunca devolve os
  tokens criptografados.
- **`DELETE /conectores/:provider`** (autenticado): desconecta — revoga no provider quando a API
  suportar revogação, depois apaga a linha de `ConectorConexao`.

### Abstração por provider

```ts
interface ConectorProvider {
  montarUrlAutorizacao(state: string): string;
  trocarCodigoPorToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiraEm?: Date;
    escopos: string[];
    contaExterna?: string;
  }>;
  renovarToken(refreshToken: string): Promise<{
    accessToken: string;
    expiraEm?: Date;
  }>;
}
```

`GoogleConectorProvider` implementa a interface agora (escopos: Drive, Sheets, Calendar, Gmail —
todos **somente-leitura** nesta fase, ver Riscos). `SlackConectorProvider` implementa depois, sem
tocar em mais nada — o `ConectorController`/`ConectorService` são genéricos e resolvem o provider
certo por um registro (`Map<string, ConectorProvider>` injetado via Nest, chave = string do
`provider`).

`ConectorService` cuida de: persistência (`ConectorConexao`), assinatura/validação do `state`, e
um helper `obterTokenValido(conexaoId)` que verifica `expiraEm` e chama `renovarToken` automaticamente
quando necessário — usado por quem for consumir a conexão em fases futuras (não tem consumidor
ainda nesta fase, mas a peça precisa existir para não deixar tokens expirados inutilizáveis).

## Frontend

Nova seção "Conectores", numa tela de perfil/configurações do usuário (hoje não existe uma página
de perfil pessoal separada do admin de empresa — será uma tela nova). Lista os providers
disponíveis (por ora só "Google") com botão **Conectar**/**Desconectar** e status, no mesmo
espírito do mockup da G4 OS: cada linha com ícone, nome, descrição curta do que o escopo cobre, e
o botão de ação.

## Riscos e decisões que precisam de acordo antes de implementar

- **Verificação de app do Google:** escopos "sensíveis" (leitura ampla de Gmail/Drive) ou
  "restritos" (envio de e-mail, escrita ampla em Drive) exigem processo de verificação de
  segurança do Google antes de sair do modo de teste — pode levar semanas. Esta fase usa só
  escopos **somente-leitura**, que têm barra de verificação bem mais baixa. Escopos de escrita
  ficam para quando houver um caso de uso real que justifique (fase de "uso pelos agentes").
- **Configuração externa:** o app OAuth no Google Cloud Console (client ID/secret, URIs de
  redirect autorizadas) precisa existir antes do código funcionar de ponta a ponta — é
  configuração fora do código, não coberta por este spec.
- **Escopo desta fase termina na conexão.** Nenhum Agente, Skill ou etapa do Orquestrador consome
  `ConectorConexao` ainda — isso é decisão de produto em aberto para uma fase seguinte (que
  mecanismo consome: Base de Conhecimento? Ferramenta de Skill, como `ConsultaParametrizada` já
  faz com o TOTVS RM? Etapa do Orquestrador, como a integração de WhatsApp já faz?).

## Fora de escopo

- Conector Slack (fase seguinte, reaproveitando a interface `ConectorProvider`).
- Conector Notion e qualquer outro provider.
- Qualquer consumo das conexões por Agentes/Skills/Orquestrador.
- Escopos de escrita do Google (Gmail send, Drive write, etc.).
