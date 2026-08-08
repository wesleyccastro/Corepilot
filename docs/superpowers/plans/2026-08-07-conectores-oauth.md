# Conectores OAuth por usuário (fase 1: infra + Google) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a infraestrutura genérica de conexão OAuth2 por usuário (assinatura/verificação
de `state`, armazenamento criptografado de tokens, endpoints de iniciar/callback/listar/desconectar)
e implementar o primeiro provider real — Google (Drive, Planilhas, Calendário, Gmail, todos
somente-leitura) — mais a UI de "Conectores" no frontend. O **uso** dessas conexões por
Agentes/Skills/Orquestrador fica fora de escopo desta fase.

**Architecture:** Novo módulo `backend/src/conector/` com um `ConectorProvider` interface
(implementada por `GoogleConectorProvider`, e futuramente por outros), um `ConectorService`
genérico que assina/verifica o `state` do fluxo OAuth2 (`authorization code`) via HMAC-SHA256, e um
`ConectorController` com dois endpoints assimétricos: `iniciar` (autenticado, atrás de
`JwtAuthGuard`+`TenantGuard`) e `callback` (público — o navegador do usuário chega ali direto do
Google, sem o header `Authorization` da API). Tokens ficam em `ConectorConexao`
(`usuarioId`+`empresaId`+`provider`), criptografados com o mesmo padrão AES-256-GCM já usado por
`FonteDeDados`/`IntegracaoWhatsApp`. Frontend ganha uma tela nova "Conectores" (acessível pelo menu
do usuário no Header) que lista providers disponíveis e permite conectar/desconectar.

**Tech Stack:** NestJS 11, Prisma, `fetch` nativo (sem cliente HTTP novo, mesmo padrão de
`EvolutionApiAdapterService`), Jest. Frontend: React 19 + TypeScript, sem framework de rotas (troca
de `view` por estado), sem test runner configurado.

## Global Constraints

- Toda tabela nova nasce com RLS habilitada e sem policies (regra permanente da Fase 1) — usar
  `prisma migrate dev --create-only`, editar as linhas de RLS, e só então aplicar.
- Testes ficam colocados junto do código (`*.spec.ts` ao lado do arquivo testado), `rootDir` do
  Jest é `src`.
- Prettier: aspas simples, vírgula final em tudo (`trailingComma: 'all'`).
- ESLint: `no-explicit-any` desabilitado; `no-floating-promises` e `no-unsafe-argument` são
  warnings, não erros.
- DTOs neste código-base são interfaces TS simples, sem `class-validator` — validação manual no
  controller quando necessário (padrão de `SalvarIntegracaoWhatsAppDto`/`CreateFonteDeDadosDto`).
- Identificadores de domínio em português (`conector`, `conexao`, `provider` é a exceção — é termo
  técnico já emprestado do inglês no domínio de OAuth).
- Frontend não tem test runner configurado — a verificação de tarefas de frontend é `npm run build`
  (type-check via `tsc -b` + build) e `npm run lint` (oxlint), não testes automatizados.
- Sem comentários novos além dos que a lógica exigir para decisões não-óbvias (ex.: por que o
  endpoint de callback não tem guard).

---

## Task 1: Migração Prisma — `ConectorConexao`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migração via `npm run prisma:migrate`

**Interfaces:**
- Produces: model `ConectorConexao` (campos: `id`, `usuarioId`, `empresaId`, `provider`,
  `contaExterna`, `accessTokenCriptografado`, `refreshTokenCriptografado`, `expiraEm`, `escopos`,
  `ultimoTesteEm`, `ultimoTesteSucesso`, `criadoEm`, `atualizadoEm`), com
  `@@unique([usuarioId, empresaId, provider])` — **usado pelas Tasks 3 e 4** (o nome do campo
  composto gerado pelo Prisma client é `usuarioId_empresaId_provider`).

- [ ] **Step 1: Adicionar o model ao schema**

Em `backend/prisma/schema.prisma`, adicionar depois do model `ConsultaResultado` (fim do arquivo):

```prisma
model ConectorConexao {
  id                        String    @id @default(uuid())
  usuarioId                 String
  empresaId                 String
  provider                  String
  contaExterna              String?
  accessTokenCriptografado  String
  refreshTokenCriptografado String?
  expiraEm                  DateTime?
  escopos                   String[]
  ultimoTesteEm             DateTime?
  ultimoTesteSucesso        Boolean?
  criadoEm                  DateTime  @default(now())
  atualizadoEm              DateTime  @updatedAt

  usuario Usuario @relation(fields: [usuarioId], references: [id])
  empresa Empresa @relation(fields: [empresaId], references: [id])

  @@unique([usuarioId, empresaId, provider])
}
```

Em `model Usuario` (`backend/prisma/schema.prisma:34-46`), adicionar a linha de relação inversa
junto das outras (depois de `execucoesDeEtapa ExecucaoDeEtapa[]`):

```prisma
  conectores       ConectorConexao[]
```

Em `model Empresa` (`backend/prisma/schema.prisma:10-32`), adicionar junto das outras (depois de
`instanciasDeProcesso InstanciaDeProcesso[]`):

```prisma
  conectores           ConectorConexao[]
```

- [ ] **Step 2: Criar a migração sem aplicar ainda**

Run: `cd backend && npm run prisma:migrate -- --create-only --name conector_conexao`

- [ ] **Step 3: Adicionar a linha de RLS ao final do arquivo de migração gerado**

```sql
-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "ConectorConexao" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Aplicar a migração e regenerar o client**

Run: `cd backend && npm run prisma:migrate`
Expected: aplica o DDL + RLS numa única execução, regenera `@prisma/client`.

- [ ] **Step 5: Verificar RLS (script temporário, apagar depois)**

Criar `backend/scratch-check-rls.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('ConectorConexao')
  `;
  console.log(rows);
}

main().finally(() => prisma.$disconnect());
```

Run: `cd backend && npx dotenv -e .env.local -- npx tsx scratch-check-rls.ts`
Expected: uma linha com `relrowsecurity: true`. Depois, apagar `scratch-check-rls.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): schema Prisma de ConectorConexao com RLS"
```

---

## Task 2: `GoogleConectorProvider`

**Files:**
- Create: `backend/src/conector/conector-provider.interface.ts`
- Create: `backend/src/conector/providers/google-conector.provider.ts`
- Create: `backend/src/conector/providers/google-conector.provider.spec.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: interface `ConectorProvider` (`montarUrlAutorizacao(state): string`,
  `trocarCodigoPorToken(code): Promise<DadosToken>`,
  `renovarToken(refreshToken): Promise<Pick<DadosToken, 'accessToken' | 'expiraEm'>>`) e
  `DadosToken` (`{ accessToken: string; refreshToken?: string; expiraEm?: Date; escopos: string[];
  contaExterna?: string }`) — **usados pela Task 3**. Classe `GoogleConectorProvider` implementando
  a interface, injetável via Nest (`@Injectable()`) — **injetada na Task 3**.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `backend/src/conector/conector-provider.interface.ts`:

```typescript
export interface DadosToken {
  accessToken: string;
  refreshToken?: string;
  expiraEm?: Date;
  escopos: string[];
  contaExterna?: string;
}

export interface ConectorProvider {
  montarUrlAutorizacao(state: string): string;
  trocarCodigoPorToken(code: string): Promise<DadosToken>;
  renovarToken(
    refreshToken: string,
  ): Promise<Pick<DadosToken, 'accessToken' | 'expiraEm'>>;
}
```

Criar `backend/src/conector/providers/google-conector.provider.spec.ts`:

```typescript
import type { ConfigService } from '@nestjs/config';
import { GoogleConectorProvider } from './google-conector.provider';

describe('GoogleConectorProvider', () => {
  const VALORES: Record<string, string> = {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id-teste',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-teste',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/conectores/google/callback',
  };

  function buildConfig(): ConfigService {
    return {
      getOrThrow: jest.fn((chave: string) => VALORES[chave]),
    } as unknown as ConfigService;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('montarUrlAutorizacao monta a URL de consentimento com os escopos somente-leitura e o state repassado', () => {
    const provider = new GoogleConectorProvider(buildConfig());

    const url = new URL(provider.montarUrlAutorizacao('state-de-teste'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('client-id-teste');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/conectores/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-de-teste');
    const escopos = url.searchParams.get('scope') ?? '';
    expect(escopos).toContain('drive.readonly');
    expect(escopos).toContain('spreadsheets.readonly');
    expect(escopos).toContain('calendar.readonly');
    expect(escopos).toContain('gmail.readonly');
  });

  it('trocarCodigoPorToken troca o código por tokens e busca o e-mail da conta', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-123',
            refresh_token: 'refresh-123',
            expires_in: 3600,
            scope: 'openid email https://www.googleapis.com/auth/drive.readonly',
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ email: 'fulano@gmail.com' }),
      } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    const resultado = await provider.trocarCodigoPorToken('codigo-de-autorizacao');

    expect(resultado.accessToken).toBe('access-123');
    expect(resultado.refreshToken).toBe('refresh-123');
    expect(resultado.contaExterna).toBe('fulano@gmail.com');
    expect(resultado.escopos).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/drive.readonly',
    ]);
    expect(resultado.expiraEm).toBeInstanceOf(Date);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/oauth2/v2/userinfo',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-123' },
      }),
    );
  });

  it('trocarCodigoPorToken lança erro descritivo quando o Google rejeita o código', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    await expect(
      provider.trocarCodigoPorToken('codigo-invalido'),
    ).rejects.toThrow('Google rejeitou a troca do código de autorização');
  });

  it('renovarToken troca o refresh token por um access token novo', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ access_token: 'access-renovado', expires_in: 3600 }),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    const resultado = await provider.renovarToken('refresh-123');

    expect(resultado.accessToken).toBe('access-renovado');
    expect(resultado.expiraEm).toBeInstanceOf(Date);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renovarToken lança erro descritivo quando o Google rejeita o refresh token', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    await expect(provider.renovarToken('refresh-invalido')).rejects.toThrow(
      'Google rejeitou a renovação do token',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest google-conector.provider.spec.ts`
Expected: FAIL — `Cannot find module './google-conector.provider'`.

- [ ] **Step 3: Implementar `GoogleConectorProvider`**

Criar `backend/src/conector/providers/google-conector.provider.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConectorProvider, DadosToken } from '../conector-provider.interface';

const ESCOPOS_GOOGLE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

interface RespostaTokenGoogle {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

@Injectable()
export class GoogleConectorProvider implements ConectorProvider {
  constructor(private readonly config: ConfigService) {}

  montarUrlAutorizacao(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: ESCOPOS_GOOGLE.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async trocarCodigoPorToken(code: string): Promise<DadosToken> {
    const dados = await this.chamarEndpointDeToken({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI'),
    });
    const contaExterna = await this.buscarEmailDaConta(dados.access_token);

    return {
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token,
      expiraEm: this.calcularExpiracao(dados.expires_in),
      escopos: dados.scope ? dados.scope.split(' ') : ESCOPOS_GOOGLE,
      contaExterna,
    };
  }

  async renovarToken(
    refreshToken: string,
  ): Promise<Pick<DadosToken, 'accessToken' | 'expiraEm'>> {
    const dados = await this.chamarEndpointDeToken({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return {
      accessToken: dados.access_token,
      expiraEm: this.calcularExpiracao(dados.expires_in),
    };
  }

  private async chamarEndpointDeToken(
    parametros: Record<string, string>,
  ): Promise<RespostaTokenGoogle> {
    const resposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>(
          'GOOGLE_OAUTH_CLIENT_SECRET',
        ),
        ...parametros,
      }),
    });
    if (!resposta.ok) {
      const acao =
        parametros.grant_type === 'refresh_token'
          ? 'renovação do token'
          : 'troca do código de autorização';
      throw new Error(
        `Google rejeitou a ${acao} (status ${resposta.status}): ${await resposta.text()}`,
      );
    }
    return (await resposta.json()) as RespostaTokenGoogle;
  }

  private calcularExpiracao(expiresIn?: number): Date | undefined {
    return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  }

  private async buscarEmailDaConta(
    accessToken: string,
  ): Promise<string | undefined> {
    const resposta = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resposta.ok) return undefined;
    const dados = (await resposta.json()) as { email?: string };
    return dados.email;
  }
}
```

Note: a mensagem de erro no teste "Google rejeitou a renovação do token" precisa bater com a
string montada por `chamarEndpointDeToken` — confirme que o `acao` fica `'renovação do token'`
quando `grant_type === 'refresh_token'`.

- [ ] **Step 4: Adicionar as env vars ao `.env.example`**

Em `backend/.env.example`, adicionar ao final:

```bash
# App OAuth do Google (Google Cloud Console → APIs & Services → Credentials).
# GOOGLE_OAUTH_REDIRECT_URI precisa estar cadastrada como "Authorized redirect URI"
# no console do Google e apontar para o endpoint público de callback desta API
# (ex.: http://localhost:3000/conectores/google/callback em dev).
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/conectores/google/callback

# Chave usada para assinar (HMAC-SHA256) o parâmetro "state" do fluxo OAuth2 dos
# conectores — impede que um callback forjado grave tokens na conta errada.
# Qualquer string longa e aleatória serve (não precisa ser hex). Gere com:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CONECTOR_STATE_SECRET=your-random-state-signing-secret
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest google-conector.provider.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/conector/conector-provider.interface.ts backend/src/conector/providers/google-conector.provider.ts backend/src/conector/providers/google-conector.provider.spec.ts backend/.env.example
git commit -m "feat(backend): GoogleConectorProvider (troca de código, refresh, escopos somente-leitura)"
```

---

## Task 3: `ConectorService` (assinatura de state + persistência)

**Files:**
- Create: `backend/src/conector/estado-oauth.ts`
- Create: `backend/src/conector/estado-oauth.spec.ts`
- Create: `backend/src/conector/conector.service.ts`
- Create: `backend/src/conector/conector.service.spec.ts`

**Interfaces:**
- Consumes: `ConectorProvider`/`DadosToken` (Task 2), `GoogleConectorProvider` (Task 2),
  `criptografar` (`backend/src/fonte-de-dados/crypto.ts`, já existe), `PrismaService.conectorConexao`
  (Task 1).
- Produces: `assinarEstado(payload, segredo): string` / `verificarEstado(estado, segredo):
  EstadoOAuth` (usados só dentro deste módulo). `ConectorService.iniciar(provider, usuarioId,
  empresaId): string`, `ConectorService.processarCallback(provider, code, state): Promise<{
  usuarioId: string; empresaId: string }>`, `ConectorService.listar(usuarioId, empresaId):
  Promise<...>`, `ConectorService.desconectar(provider, usuarioId, empresaId): Promise<void>` —
  **usados pela Task 4**.

### Parte A — `estado-oauth.ts` (assinatura/verificação do `state`)

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `backend/src/conector/estado-oauth.spec.ts`:

```typescript
import { assinarEstado, verificarEstado } from './estado-oauth';

describe('estado-oauth (assinatura HMAC do state do OAuth2)', () => {
  const segredo = 'segredo-de-teste';

  it('assina e verifica de volta o mesmo payload', () => {
    const payload = {
      usuarioId: 'usuario-1',
      empresaId: 'empresa-1',
      provider: 'google',
      exp: Date.now() + 60_000,
    };

    const estado = assinarEstado(payload, segredo);
    const verificado = verificarEstado(estado, segredo);

    expect(verificado).toEqual(payload);
  });

  it('rejeita um state com assinatura adulterada', () => {
    const estado = assinarEstado(
      { usuarioId: 'u1', empresaId: 'e1', provider: 'google', exp: Date.now() + 60_000 },
      segredo,
    );
    const [base64] = estado.split('.');
    const adulterado = `${base64}.0000000000000000000000000000000000000000000000000000000000000000`;

    expect(() => verificarEstado(adulterado, segredo)).toThrow();
  });

  it('rejeita um state assinado com outro segredo', () => {
    const estado = assinarEstado(
      { usuarioId: 'u1', empresaId: 'e1', provider: 'google', exp: Date.now() + 60_000 },
      segredo,
    );

    expect(() => verificarEstado(estado, 'outro-segredo')).toThrow();
  });

  it('rejeita um state malformado (sem separador)', () => {
    expect(() => verificarEstado('nao-e-um-state-valido', segredo)).toThrow();
  });

  it('rejeita um state expirado', () => {
    const estado = assinarEstado(
      { usuarioId: 'u1', empresaId: 'e1', provider: 'google', exp: Date.now() - 1000 },
      segredo,
    );

    expect(() => verificarEstado(estado, segredo)).toThrow('expirado');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest estado-oauth.spec.ts`
Expected: FAIL — `Cannot find module './estado-oauth'`.

- [ ] **Step 3: Implementar `estado-oauth.ts`**

Criar `backend/src/conector/estado-oauth.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export interface EstadoOAuth {
  usuarioId: string;
  empresaId: string;
  provider: string;
  exp: number;
}

export function assinarEstado(payload: EstadoOAuth, segredo: string): string {
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const assinatura = createHmac('sha256', segredo).update(base64).digest('hex');
  return `${base64}.${assinatura}`;
}

export function verificarEstado(estado: string, segredo: string): EstadoOAuth {
  const [base64, assinatura] = estado.split('.');
  if (!base64 || !assinatura) {
    throw new Error('state malformado');
  }

  const esperada = createHmac('sha256', segredo).update(base64).digest('hex');
  const assinaturaBuffer = Buffer.from(assinatura, 'hex');
  const esperadaBuffer = Buffer.from(esperada, 'hex');
  if (
    assinaturaBuffer.length !== esperadaBuffer.length ||
    !timingSafeEqual(assinaturaBuffer, esperadaBuffer)
  ) {
    throw new Error('state com assinatura inválida');
  }

  const payload = JSON.parse(
    Buffer.from(base64, 'base64url').toString('utf8'),
  ) as EstadoOAuth;
  if (payload.exp < Date.now()) {
    throw new Error('state expirado');
  }
  return payload;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest estado-oauth.spec.ts`
Expected: PASS (5 testes).

### Parte B — `ConectorService`

- [ ] **Step 5: Escrever o teste (falha primeiro)**

Criar `backend/src/conector/conector.service.spec.ts`:

```typescript
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ConectorService } from './conector.service';
import { descriptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { GoogleConectorProvider } from './providers/google-conector.provider';

describe('ConectorService', () => {
  const CHAVE_CRIPTO = 'a'.repeat(64);
  const SEGREDO_STATE = 'segredo-de-teste';

  function buildDeps() {
    const prisma = {
      conectorConexao: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn((chave: string) =>
        chave === 'CONECTOR_STATE_SECRET' ? SEGREDO_STATE : CHAVE_CRIPTO,
      ),
    } as unknown as ConfigService;
    const googleProvider = {
      montarUrlAutorizacao: jest.fn(
        (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
      ),
      trocarCodigoPorToken: jest.fn(),
      renovarToken: jest.fn(),
    } as unknown as GoogleConectorProvider;
    return { prisma, config, googleProvider };
  }

  function extrairStateDaUrl(url: string): string {
    return new URL(url).searchParams.get('state') ?? '';
  }

  describe('iniciar', () => {
    it('lança NotFoundException para um provider não suportado', () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);

      expect(() =>
        service.iniciar('provider-inexistente', 'usuario-1', 'empresa-1'),
      ).toThrow(NotFoundException);
    });

    it('devolve a URL de autorização do provider com um state assinado', () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);

      const url = service.iniciar('google', 'usuario-1', 'empresa-1');

      expect(googleProvider.montarUrlAutorizacao).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });
  });

  describe('processarCallback', () => {
    it('rejeita um state cujo provider não bate com o provider da rota', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await expect(
        service.processarCallback('outro-provider', 'codigo', state),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita um state adulterado', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await expect(
        service.processarCallback('google', 'codigo', `${state}adulterado`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('troca o código por token, criptografa e faz upsert da conexão', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (googleProvider.trocarCodigoPorToken as jest.Mock).mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiraEm: new Date('2026-01-01T00:00:00Z'),
        escopos: ['drive.readonly'],
        contaExterna: 'fulano@gmail.com',
      });
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      const resultado = await service.processarCallback(
        'google',
        'codigo-de-autorizacao',
        state,
      );

      expect(resultado).toEqual({ usuarioId: 'usuario-1', empresaId: 'empresa-1' });
      expect(googleProvider.trocarCodigoPorToken).toHaveBeenCalledWith(
        'codigo-de-autorizacao',
      );
      expect(prisma.conectorConexao.upsert).toHaveBeenCalledTimes(1);
      const chamada = (prisma.conectorConexao.upsert as jest.Mock).mock
        .calls[0][0] as {
        where: { usuarioId_empresaId_provider: Record<string, string> };
        create: Record<string, unknown>;
      };
      expect(chamada.where.usuarioId_empresaId_provider).toEqual({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        provider: 'google',
      });
      expect(chamada.create.contaExterna).toBe('fulano@gmail.com');
      expect(
        descriptografar(chamada.create.accessTokenCriptografado as string, CHAVE_CRIPTO),
      ).toBe('access-123');
      expect(
        descriptografar(
          chamada.create.refreshTokenCriptografado as string,
          CHAVE_CRIPTO,
        ),
      ).toBe('refresh-123');
    });

    it('mantém o refresh token antigo quando o provider não devolve um novo na atualização', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (googleProvider.trocarCodigoPorToken as jest.Mock).mockResolvedValue({
        accessToken: 'access-novo',
        refreshToken: undefined,
        escopos: ['drive.readonly'],
      });
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await service.processarCallback('google', 'codigo', state);

      const chamada = (prisma.conectorConexao.upsert as jest.Mock).mock
        .calls[0][0] as { update: Record<string, unknown> };
      expect(chamada.update.refreshTokenCriptografado).toBeUndefined();
    });
  });

  describe('listar', () => {
    it('lista as conexões do usuário na empresa, sem devolver os tokens', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'conexao-1',
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
          contaExterna: 'fulano@gmail.com',
          accessTokenCriptografado: 'iv:tag:cifrado',
          refreshTokenCriptografado: 'iv:tag:cifrado',
          escopos: ['drive.readonly'],
        },
      ]);
      const service = new ConectorService(prisma, config, googleProvider);

      const resultado = await service.listar('usuario-1', 'empresa-1');

      expect(prisma.conectorConexao.findMany).toHaveBeenCalledWith({
        where: { usuarioId: 'usuario-1', empresaId: 'empresa-1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado[0]).not.toHaveProperty('accessTokenCriptografado');
      expect(resultado[0]).not.toHaveProperty('refreshTokenCriptografado');
      expect(resultado[0]).toMatchObject({
        id: 'conexao-1',
        provider: 'google',
        contaExterna: 'fulano@gmail.com',
      });
    });
  });

  describe('desconectar', () => {
    it('apaga a conexão escopada por usuário, empresa e provider', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);

      await service.desconectar('google', 'usuario-1', 'empresa-1');

      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledWith({
        where: { usuarioId: 'usuario-1', empresaId: 'empresa-1', provider: 'google' },
      });
    });
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest conector.service.spec.ts`
Expected: FAIL — `Cannot find module './conector.service'`.

- [ ] **Step 7: Implementar `ConectorService`**

Criar `backend/src/conector/conector.service.ts`:

```typescript
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar } from '../fonte-de-dados/crypto';
import { assinarEstado, verificarEstado } from './estado-oauth';
import { GoogleConectorProvider } from './providers/google-conector.provider';
import type { ConectorProvider } from './conector-provider.interface';

const DURACAO_STATE_MS = 10 * 60 * 1000;

@Injectable()
export class ConectorService {
  private readonly providers: Map<string, ConectorProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    googleProvider: GoogleConectorProvider,
  ) {
    this.providers = new Map<string, ConectorProvider>([
      ['google', googleProvider],
    ]);
  }

  iniciar(provider: string, usuarioId: string, empresaId: string): string {
    const instancia = this.obterProvider(provider);
    const state = assinarEstado(
      { usuarioId, empresaId, provider, exp: Date.now() + DURACAO_STATE_MS },
      this.chaveState(),
    );
    return instancia.montarUrlAutorizacao(state);
  }

  async processarCallback(
    provider: string,
    code: string,
    state: string,
  ): Promise<{ usuarioId: string; empresaId: string }> {
    let payload;
    try {
      payload = verificarEstado(state, this.chaveState());
    } catch (erro) {
      throw new UnauthorizedException(
        erro instanceof Error ? erro.message : 'state inválido',
      );
    }
    if (payload.provider !== provider) {
      throw new UnauthorizedException(
        'state não corresponde ao provider da rota',
      );
    }

    const instancia = this.obterProvider(provider);
    const dados = await instancia.trocarCodigoPorToken(code);
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');

    await this.prisma.conectorConexao.upsert({
      where: {
        usuarioId_empresaId_provider: {
          usuarioId: payload.usuarioId,
          empresaId: payload.empresaId,
          provider,
        },
      },
      create: {
        usuarioId: payload.usuarioId,
        empresaId: payload.empresaId,
        provider,
        contaExterna: dados.contaExterna,
        accessTokenCriptografado: criptografar(dados.accessToken, chave),
        refreshTokenCriptografado: dados.refreshToken
          ? criptografar(dados.refreshToken, chave)
          : null,
        expiraEm: dados.expiraEm,
        escopos: dados.escopos,
      },
      update: {
        contaExterna: dados.contaExterna,
        accessTokenCriptografado: criptografar(dados.accessToken, chave),
        refreshTokenCriptografado: dados.refreshToken
          ? criptografar(dados.refreshToken, chave)
          : undefined,
        expiraEm: dados.expiraEm,
        escopos: dados.escopos,
      },
    });

    return { usuarioId: payload.usuarioId, empresaId: payload.empresaId };
  }

  async listar(usuarioId: string, empresaId: string) {
    const conexoes = await this.prisma.conectorConexao.findMany({
      where: { usuarioId, empresaId },
      orderBy: { criadoEm: 'desc' },
    });
    return conexoes.map((conexao) => {
      const { accessTokenCriptografado, refreshTokenCriptografado, ...resto } =
        conexao;
      void accessTokenCriptografado;
      void refreshTokenCriptografado;
      return resto;
    });
  }

  async desconectar(
    provider: string,
    usuarioId: string,
    empresaId: string,
  ): Promise<void> {
    await this.prisma.conectorConexao.deleteMany({
      where: { usuarioId, empresaId, provider },
    });
  }

  private obterProvider(provider: string): ConectorProvider {
    const instancia = this.providers.get(provider);
    if (!instancia) {
      throw new NotFoundException(`Provider "${provider}" não suportado`);
    }
    return instancia;
  }

  private chaveState(): string {
    return this.config.getOrThrow<string>('CONECTOR_STATE_SECRET');
  }
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest conector.service.spec.ts`
Expected: PASS (8 testes).

- [ ] **Step 9: Rodar os dois arquivos de teste da task juntos**

Run: `cd backend && npx jest estado-oauth.spec.ts conector.service.spec.ts`
Expected: PASS (13 testes no total).

- [ ] **Step 10: Commit**

```bash
git add backend/src/conector/estado-oauth.ts backend/src/conector/estado-oauth.spec.ts backend/src/conector/conector.service.ts backend/src/conector/conector.service.spec.ts
git commit -m "feat(backend): ConectorService — state OAuth2 assinado (HMAC) e persistência de ConectorConexao"
```

---

## Task 4: `ConectorController` + `ConectorModule`

**Files:**
- Create: `backend/src/conector/conector.controller.ts`
- Create: `backend/src/conector/conector.controller.spec.ts`
- Create: `backend/src/conector/conector.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ConectorService` (Task 3), `AuditService.record` (`backend/src/audit/audit.service.ts`,
  já existe), `TenantContext.get()` (já existe), `JwtAuthGuard`/`TenantGuard` (já existem).
- Produces: rotas HTTP `GET /conectores`, `GET /conectores/:provider/iniciar`,
  `GET /conectores/:provider/callback`, `DELETE /conectores/:provider` — **usadas pela Task 5**
  (frontend).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `backend/src/conector/conector.controller.spec.ts`:

```typescript
import { ConectorController } from './conector.controller';
import type { ConectorService } from './conector.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

describe('ConectorController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildResponse(): Response {
    return { redirect: jest.fn() } as unknown as Response;
  }

  function buildDeps() {
    const conectorService = {
      iniciar: jest.fn(),
      processarCallback: jest.fn(),
      listar: jest.fn(),
      desconectar: jest.fn(),
    } as unknown as ConectorService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const config = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;
    return { conectorService, audit, config };
  }

  it('listar devolve as conexões escopadas pelo tenant atual', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.listar as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = await controller.listar();

    expect(conectorService.listar).toHaveBeenCalledWith('usuario-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'c1' }]);
  });

  it('iniciar devolve a URL de autorização do provider', () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.iniciar as jest.Mock).mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
    );
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = controller.iniciar('google');

    expect(conectorService.iniciar).toHaveBeenCalledWith(
      'google',
      'usuario-1',
      'empresa-1',
    );
    expect(resultado).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
    });
  });

  it('callback processa com sucesso, audita e redireciona pro frontend com status de sucesso', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.processarCallback as jest.Mock).mockResolvedValue({
      usuarioId: 'usuario-1',
      empresaId: 'empresa-1',
    });
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );
    const res = buildResponse();

    await controller.callback('google', 'codigo', 'state', res);

    expect(conectorService.processarCallback).toHaveBeenCalledWith(
      'google',
      'codigo',
      'state',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'conector_conectado',
        dadosDepois: { provider: 'google' },
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/?conectores=sucesso',
    );
  });

  it('callback nunca deixa o erro escapar — redireciona pro frontend com status de erro', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.processarCallback as jest.Mock).mockRejectedValue(
      new Error('state inválido'),
    );
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );
    const res = buildResponse();

    await controller.callback('google', 'codigo', 'state-ruim', res);

    expect(audit.record).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/?conectores=erro',
    );
  });

  it('desconectar remove a conexão e audita', async () => {
    const { conectorService, audit, config } = buildDeps();
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = await controller.desconectar('google');

    expect(conectorService.desconectar).toHaveBeenCalledWith(
      'google',
      'usuario-1',
      'empresa-1',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'conector_desconectado',
        dadosDepois: { provider: 'google' },
      }),
    );
    expect(resultado).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest conector.controller.spec.ts`
Expected: FAIL — `Cannot find module './conector.controller'`.

- [ ] **Step 3: Implementar `ConectorController`**

Criar `backend/src/conector/conector.controller.ts`:

```typescript
import { Controller, Delete, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ConectorService } from './conector.service';

@Controller('conectores')
export class ConectorController {
  constructor(
    private readonly conectorService: ConectorService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  async listar() {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return this.conectorService.listar(usuarioId, empresaId);
  }

  @Get(':provider/iniciar')
  @UseGuards(JwtAuthGuard, TenantGuard)
  iniciar(@Param('provider') provider: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return { url: this.conectorService.iniciar(provider, usuarioId, empresaId) };
  }

  // Sem guard de propósito: o navegador do usuário chega aqui direto do
  // redirect do provider OAuth, sem o header Authorization da API. A
  // verificação de identidade acontece via o "state" assinado (ver
  // ConectorService.processarCallback / estado-oauth.ts).
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
    try {
      const { usuarioId, empresaId } = await this.conectorService.processarCallback(
        provider,
        code,
        state,
      );
      await this.audit.record({
        empresaId,
        atorUsuarioId: usuarioId,
        acao: 'conector_conectado',
        dadosDepois: { provider },
      });
      res.redirect(`${frontendOrigin}/?conectores=sucesso`);
    } catch {
      res.redirect(`${frontendOrigin}/?conectores=erro`);
    }
  }

  @Delete(':provider')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async desconectar(@Param('provider') provider: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.conectorService.desconectar(provider, usuarioId, empresaId);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'conector_desconectado',
      dadosDepois: { provider },
    });
    return { ok: true };
  }
}
```

- [ ] **Step 4: Criar o módulo e ligar no `AppModule`**

Criar `backend/src/conector/conector.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConectorController } from './conector.controller';
import { ConectorService } from './conector.service';
import { GoogleConectorProvider } from './providers/google-conector.provider';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ConectorController],
  providers: [ConectorService, GoogleConectorProvider],
})
export class ConectorModule {}
```

Em `backend/src/app.module.ts`, trocar:

```typescript
import { IntegracaoWhatsAppModule } from './integracao-whatsapp/integracao-whatsapp.module';
import { CadastroEmpresaModule } from './cadastro-empresa/cadastro-empresa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    MeModule,
    EmpresaModule,
    ModuloModule,
    ConversaModule,
    ChatModule,
    AgenteModule,
    SkillModule,
    SkillExecucaoModule,
    FonteDeDadosModule,
    ConsultaModule,
    ConsultaTesteModule,
    SyncCronModule,
    FerramentaModule,
    OrquestradorModule,
    IntegracaoWhatsAppModule,
    CadastroEmpresaModule,
  ],
```

por:

```typescript
import { IntegracaoWhatsAppModule } from './integracao-whatsapp/integracao-whatsapp.module';
import { CadastroEmpresaModule } from './cadastro-empresa/cadastro-empresa.module';
import { ConectorModule } from './conector/conector.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    MeModule,
    EmpresaModule,
    ModuloModule,
    ConversaModule,
    ChatModule,
    AgenteModule,
    SkillModule,
    SkillExecucaoModule,
    FonteDeDadosModule,
    ConsultaModule,
    ConsultaTesteModule,
    SyncCronModule,
    FerramentaModule,
    OrquestradorModule,
    IntegracaoWhatsAppModule,
    CadastroEmpresaModule,
    ConectorModule,
  ],
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest conector.controller.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Rodar o build do backend**

Run: `cd backend && npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 7: Rodar a suíte inteira do backend**

Run: `cd backend && npm run test`
Expected: PASS em todos os arquivos (a suíte `prisma.smoke.spec.ts` pode pular se `DATABASE_URL`
não estiver setado — comportamento normal).

- [ ] **Step 8: Commit**

```bash
git add backend/src/conector/conector.controller.ts backend/src/conector/conector.controller.spec.ts backend/src/conector/conector.module.ts backend/src/app.module.ts
git commit -m "feat(backend): endpoints de conectores (iniciar/callback/listar/desconectar)"
```

---

## Task 5: Frontend — tela "Conectores"

**Files:**
- Modify: `frontend/src/corepilot/types.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`
- Modify: `frontend/src/corepilot/components/Header.tsx`
- Modify: `frontend/src/corepilot/CorePilotApp.tsx`
- Create: `frontend/src/corepilot/views/Conectores.tsx`

**Interfaces:**
- Consumes: `GET /conectores`, `GET /conectores/:provider/iniciar`, `DELETE /conectores/:provider`
  (Task 4), `apiFetch` (`frontend/src/corepilot/api/apiFetch.ts`, já existe), `actions.showToast`
  (já existe).

Não há test runner de frontend configurado — a verificação desta task é `npm run build` (type-check)
e `npm run lint`, mais uma checagem manual descrita no Step 6.

- [ ] **Step 1: Adicionar `'conectores'` ao `ViewId`**

Em `frontend/src/corepilot/types.ts:1-10`, trocar:

```typescript
export type ViewId =
  | 'overview'
  | 'compras'
  | 'financeiro'
  | 'wizard'
  | 'admin-users'
  | 'admin-settings'
  | 'admin-company'
  | 'admin-modulos'
  | `module:${string}`;
```

por:

```typescript
export type ViewId =
  | 'overview'
  | 'compras'
  | 'financeiro'
  | 'wizard'
  | 'admin-users'
  | 'admin-settings'
  | 'admin-company'
  | 'admin-modulos'
  | 'conectores'
  | `module:${string}`;
```

- [ ] **Step 2: Adicionar a action `openConectores`**

Em `frontend/src/corepilot/useCorePilotState.ts:534-535`, trocar:

```typescript
  const openGeneralSettings = () => goAdminSettings();
  const openCompanySettings = () => update((s) => ({ view: 'admin-company', previousView: s.view, userMenuOpen: false }));
```

por:

```typescript
  const openGeneralSettings = () => goAdminSettings();
  const openCompanySettings = () => update((s) => ({ view: 'admin-company', previousView: s.view, userMenuOpen: false }));
  const openConectores = () => update((s) => ({ view: 'conectores', previousView: s.view, userMenuOpen: false }));
```

Em `frontend/src/corepilot/useCorePilotState.ts:1616`, trocar:

```typescript
    goAdminUsers, goAdminSettings, openGeneralSettings, openCompanySettings, backFromAdmin, setAdminTab,
```

por:

```typescript
    goAdminUsers, goAdminSettings, openGeneralSettings, openCompanySettings, openConectores, backFromAdmin, setAdminTab,
```

- [ ] **Step 3: Adicionar a entrada "Conectores" no menu do usuário (Header)**

Em `frontend/src/corepilot/components/Header.tsx:5`, trocar:

```typescript
import { BellIcon, BuildingIcon, ChevronDownIcon, GearIcon, LayersIcon, LogoutIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons';
```

por:

```typescript
import { BellIcon, BuildingIcon, ChevronDownIcon, GearIcon, LayersIcon, LinkIcon, LogoutIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons';
```

Em `frontend/src/corepilot/components/Header.tsx:90-93`, trocar:

```typescript
                  <div onClick={actions.openCompanySettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <BuildingIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações da empresa</span>
                  </div>
```

por:

```typescript
                  <div onClick={actions.openCompanySettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <BuildingIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações da empresa</span>
                  </div>
                  <div onClick={actions.openConectores} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <LinkIcon size={15} color={colors.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Conectores</span>
                  </div>
```

(`colors` já está importado no topo do arquivo — `colors.textMuted` já é usado mais abaixo no
próprio `Header.tsx`, na renderização das `navTabs`.)

- [ ] **Step 4: Criar a view `Conectores.tsx`**

Criar `frontend/src/corepilot/views/Conectores.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { apiFetch } from '../api/apiFetch';
import { colors } from '../styles';
import { LinkIcon } from '../icons';

interface ConectorConexao {
  id: string;
  provider: string;
  contaExterna: string | null;
  escopos: string[];
  ultimoTesteSucesso: boolean | null;
  criadoEm: string;
}

const PROVEDORES_DISPONIVEIS = [
  {
    id: 'google',
    nome: 'Google',
    descricao: 'Drive, Planilhas, Calendário e Gmail (somente leitura).',
  },
];

interface ConectoresProps {
  state: CorePilotState;
  actions: CorePilotActions;
  accessToken: string;
}

export function Conectores({ actions, accessToken }: ConectoresProps) {
  const [conexoes, setConexoes] = useState<ConectorConexao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState<string | null>(null);

  const carregar = () => {
    setCarregando(true);
    apiFetch('/conectores', accessToken)
      .then((r) => r.json() as Promise<ConectorConexao[]>)
      .then(setConexoes)
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = (provider: string) => {
    setConectando(provider);
    apiFetch(`/conectores/${provider}/iniciar`, accessToken)
      .then((r) => r.json() as Promise<{ url: string }>)
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch(() => setConectando(null));
  };

  const desconectar = (provider: string) => {
    apiFetch(`/conectores/${provider}`, accessToken, { method: 'DELETE' })
      .then(() => {
        actions.showToast('Conector desconectado.');
        carregar();
      })
      .catch(() => actions.showToast('Não foi possível desconectar. Tente de novo.'));
  };

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Conectores</h2>
      <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 20px' }}>
        Conecte suas contas pessoais para os agentes usarem como contexto.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PROVEDORES_DISPONIVEIS.map((p) => {
          const conexao = conexoes.find((c) => c.provider === p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <LinkIcon />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.nome}</div>
                <div style={{ fontSize: 12, color: colors.textFaint }}>
                  {conexao ? `Conectado como ${conexao.contaExterna ?? '—'}` : p.descricao}
                </div>
              </div>
              {conexao ? (
                <button onClick={() => desconectar(p.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: colors.danger, cursor: 'pointer' }}>
                  Desconectar
                </button>
              ) : (
                <button onClick={() => conectar(p.id)} disabled={conectando === p.id} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: conectando === p.id ? 'default' : 'pointer', opacity: conectando === p.id ? 0.7 : 1 }}>
                  {conectando === p.id ? 'Abrindo…' : 'Conectar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {carregando && conexoes.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 12 }}>Carregando…</div>}
    </div>
  );
}
```

- [ ] **Step 5: Renderizar a view e tratar o retorno do redirect do OAuth**

Em `frontend/src/corepilot/CorePilotApp.tsx:12`, adicionar o import (junto dos outros de
`views/admin`):

```typescript
import { Conectores } from './views/Conectores';
```

Em `frontend/src/corepilot/CorePilotApp.tsx:27-30`, trocar:

```typescript
  useEffect(() => {
    if (abrirWizardAoEntrar) actions.viewWizardNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

por:

```typescript
  useEffect(() => {
    if (abrirWizardAoEntrar) actions.viewWizardNew();
    if (window.location.search.includes('conectores=')) {
      actions.setView('conectores');
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Em `frontend/src/corepilot/CorePilotApp.tsx:44`, trocar:

```typescript
        {state.view === 'admin-modulos' && <AdminModulos state={state} actions={actions} me={me} />}
```

por:

```typescript
        {state.view === 'admin-modulos' && <AdminModulos state={state} actions={actions} me={me} />}
        {state.view === 'conectores' && <Conectores state={state} actions={actions} accessToken={accessToken} />}
```

- [ ] **Step 6: Verificar build, lint e checagem manual**

Run: `cd frontend && npm run build`
Expected: sucesso, sem erros de tipo.

Run: `cd frontend && npm run lint`
Expected: sem erros novos.

Checagem manual (sem credenciais reais do Google configuradas, só a UI): `cd frontend && npm run dev`,
logar, abrir o menu do usuário → "Conectores", confirmar que a tela renderiza a linha "Google" com o
botão "Conectar" (a chamada a `/conectores/google/iniciar` vai falhar com 500 sem
`GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI`/
`CONECTOR_STATE_SECRET` configurados em `backend/.env.local` — validar o fluxo completo de ponta a
ponta exige um app OAuth real cadastrado no Google Cloud Console, fora do escopo automatizável
deste plano).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/corepilot/types.ts frontend/src/corepilot/useCorePilotState.ts frontend/src/corepilot/components/Header.tsx frontend/src/corepilot/CorePilotApp.tsx frontend/src/corepilot/views/Conectores.tsx
git commit -m "feat(frontend): tela de Conectores (conectar/desconectar Google)"
```

---

## Task 6: Verificação final

**Files:** nenhum (só rodar comandos de verificação).

- [ ] **Step 1: Suíte completa do backend**

Run: `cd backend && npm run test`
Expected: PASS em todos os arquivos.

- [ ] **Step 2: Lint do backend**

Run: `cd backend && npm run lint`
Expected: sem erros novos introduzidos por este plano (ver nota abaixo sobre débito pré-existente).

> Nota: este repositório já tem débito de lint pré-existente e documentado (padrão
> `@typescript-eslint/unbound-method` em `(mock.fn as jest.Mock)`, usado em praticamente todo
> arquivo `*.spec.ts` do projeto — não é regra deste plano corrigir). Os arquivos novos desta
> feature devem seguir o mesmo padrão já usado nos specs vizinhos (`fonte-de-dados.service.spec.ts`,
> `evolution-api-adapter.service.spec.ts`), então herdam o mesmo tipo de aviso, não um tipo novo.

- [ ] **Step 3: Build do backend**

Run: `cd backend && npm run build`
Expected: sucesso.

- [ ] **Step 4: Build e lint do frontend**

Run: `cd frontend && npm run build && npm run lint`
Expected: sucesso, sem erros.

- [ ] **Step 5: Revisão manual — confirmar o escopo fechado**

Conferir:
- `ConectorConexao` existe com RLS habilitada, sem policies.
- `GET /conectores/:provider/callback` é o único endpoint do `ConectorController` sem
  `@UseGuards(JwtAuthGuard, TenantGuard)` — e isso é intencional (comentário no código explica por
  quê).
- Nenhum outro módulo (`skill`, `orquestrador`, etc.) importa `ConectorModule` ou `ConectorService`
  — consumo pelas Skills/Agentes/Orquestrador é explicitamente fora de escopo desta fase.
- `.env.example` documenta as 4 variáveis novas (`GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `CONECTOR_STATE_SECRET`).

Nenhum commit neste step — é só checagem.
