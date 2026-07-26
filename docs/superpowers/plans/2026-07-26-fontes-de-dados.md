# CorePilot — Fase 4 (Fontes de Dados — TOTVS RM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar o CorePilot ao TOTVS RM: uma conexão por empresa (`FonteDeDados`), consultas parametrizadas por módulo (`ConsultaParametrizada`, referenciando por nome uma consulta já cadastrada no RM), sincronizadas periodicamente para o Postgres local via job agendado no próprio backend, e expostas como `tools` reais nas execuções de Skill da Fase 3.

**Architecture:** Um `@Cron()` do NestJS chama o `TotvsRmAdapterService` (SOAP `wsConsultaSQL`/`RealizarConsultaSQL`, somente leitura) e grava o resultado em `ConsultaResultado` (Postgres local). O agente **nunca** fala com o RM ao vivo — a `SkillExecucaoController` roda um loop manual de tool-use (`client.messages.create`, API estável) onde cada tool lê `ConsultaResultado` localmente, e finaliza com uma chamada separada de Structured Outputs (`messages.parse`) para garantir a saída estruturada.

**Tech Stack:** NestJS 11, Prisma, `@anthropic-ai/sdk`, `zod`, `@nestjs/schedule` (novo), Node `crypto` (AES-256-GCM), React 19 + Vite.

## Global Constraints

- Lógica de backend só em `backend/` — nunca em Supabase Edge Functions (CLAUDE.md). O scheduling desta fase usa `@nestjs/schedule` dentro do próprio NestJS, não `pg_cron`/Edge Functions.
- Fontes de dados são **sempre somente leitura**: só `wsConsultaSQL`/`RealizarConsultaSQL` é implementado. `wsDataServer`/`SaveRecord` (escrita) está fora de escopo desta fase — não implementar.
- Nunca acesso livre a SQL: o agente só informa valores de parâmetros de filtro (`camposFiltro`), nunca SQL. `codSentenca` referencia uma consulta já cadastrada dentro do próprio RM.
- Credenciais do RM (usuário/senha) vivem só no backend. A senha é criptografada em repouso (AES-256-GCM, chave em `ERP_ENCRYPTION_KEY`) — nunca em texto plano no banco, nunca devolvida ao frontend em nenhuma resposta de API.
- O agente nunca chama o RM ao vivo durante a execução de uma Skill — só lê `ConsultaResultado` (dados já sincronizados localmente). Só o job de sincronização (cron) ou o endpoint manual "testar consulta" falam com o RM.
- Toda tabela nova nasce com RLS habilitada e sem policies (regra permanente da Fase 1). Desta vez, usar `prisma migrate dev --create-only`, editar as linhas de RLS, e só então aplicar — evita o drift de checksum já visto e documentado em memória (`project_prisma_migration_checksum_drift.md`).
- Anexar/remover uma ferramenta numa Skill gera `AuditLog` (ação humana, com ator). Sincronizações automáticas do cron não passam por `AuditLog` — ficam em `ConsultaParametrizada.ultimoResultadoSincronizacao`.
- `tools` e `output_config.format` (Structured Outputs) nunca são combinados na mesma chamada à Messages API — sempre sequenciados (loop de tools primeiro, chamada final separada de `parseStructured` depois).
- `ChatView`, `ModuloWorkspace`, `SkillExecutor` e os componentes de Agente/Skill da Fase 3 são reaproveitados **sem modificação**, exceto onde este plano explicitamente instrui uma mudança.
- Prettier do backend: aspas simples, trailing commas em tudo. Testes Jest colocados junto do código (`*.spec.ts`), e2e em `test/*.e2e-spec.ts`.
- Frontend não tem test runner configurado — verificação é manual (`npm run dev`, testar no navegador).

---

## Task 1: Prisma — schema de FonteDeDados/ConsultaParametrizada/ConsultaResultado e migração

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migração via `npm run prisma:migrate`

**Interfaces:**
- Produces: modelos `FonteDeDados`, `ConsultaParametrizada`, `ConsultaResultado`; back-relations `Empresa.fontesDeDados`, `Modulo.consultas`, `Skill.ferramentas` (many-to-many com `ConsultaParametrizada`); migração aplicada com RLS nas 3 tabelas novas.

- [ ] **Step 1: Editar `backend/prisma/schema.prisma`**

Adicionar `fontesDeDados FonteDeDados[]` ao model `Empresa` (ao lado de `agentes`):

```prisma
model Empresa {
  id       String   @id @default(uuid())
  nome     String
  criadoEm DateTime @default(now())

  usuarios      UsuarioEmpresa[]
  auditLogs     AuditLog[]
  modulos       Modulo[]
  conversas     Conversa[]
  agentes       Agente[]
  fontesDeDados FonteDeDados[]
}
```

Adicionar `consultas ConsultaParametrizada[]` ao model `Modulo`:

```prisma
model Modulo {
  id         String   @id @default(uuid())
  empresaId  String
  nome       String
  objetivo   String
  instrucoes String?
  modeloIA   String   @default("claude-sonnet-5")
  criadoEm   DateTime @default(now())

  empresa   Empresa                 @relation(fields: [empresaId], references: [id])
  conversas Conversa[]
  agentes   Agente[]
  consultas ConsultaParametrizada[]
}
```

Adicionar `ferramentas ConsultaParametrizada[]` ao model `Skill` (many-to-many implícito):

```prisma
model Skill {
  id          String   @id @default(uuid())
  agenteId    String
  nome        String
  objetivo    String
  camposSaida Json
  criadoEm    DateTime @default(now())

  agente      Agente                  @relation(fields: [agenteId], references: [id])
  execucoes   SkillExecucao[]
  ferramentas ConsultaParametrizada[]
}
```

Adicionar os três models novos ao final do arquivo:

```prisma
model FonteDeDados {
  id                 String    @id @default(uuid())
  empresaId          String
  tipo               String
  nome               String
  configuracao       Json
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
  parametrosSincronizacao      Json
  camposFiltro                 Json
  colunas                      Json?
  testada                      Boolean   @default(false)
  sincronizacaoAtiva           Boolean   @default(false)
  intervaloSincronizacaoMinutos Int?
  ultimaSincronizacaoEm        DateTime?
  ultimoResultadoSincronizacao Json?
  criadoEm                     DateTime  @default(now())

  modulo       Modulo              @relation(fields: [moduloId], references: [id])
  fonteDeDados FonteDeDados        @relation(fields: [fonteDeDadosId], references: [id])
  resultados   ConsultaResultado[]
  skills       Skill[]
}

model ConsultaResultado {
  id                      String   @id @default(uuid())
  consultaParametrizadaId String
  dados                   Json
  sincronizadoEm          DateTime @default(now())

  consulta ConsultaParametrizada @relation(fields: [consultaParametrizadaId], references: [id])
}
```

(Nota: `intervaloSincronizacaoMinutos: Int?` substitui o `intervaloCron: String?` da spec — um inteiro em minutos evita precisar de uma biblioteca de parsing de expressão cron para calcular "está devido"; a spec já marcou esse mecanismo como decisão não-bloqueante a resolver na implementação.)

- [ ] **Step 2: Criar a migração sem aplicar ainda**

Run: `npm run prisma:migrate -- --create-only --name fontes_de_dados`

- [ ] **Step 3: Adicionar as linhas de RLS ao final do arquivo de migração gerado**

```sql
-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "FonteDeDados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultaParametrizada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultaResultado" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Aplicar a migração e regenerar o client**

Run: `npm run prisma:migrate`
Expected: aplica o DDL + RLS numa única execução, regenera `@prisma/client`.

- [ ] **Step 5: Verificar RLS (script temporário, apagar depois)**

Criar `backend/scratch-check-rls.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('FonteDeDados', 'ConsultaParametrizada', 'ConsultaResultado')
  `;
  console.log(rows);
}

main().finally(() => prisma.$disconnect());
```

Run: `npx dotenv -e .env.local -- npx tsx scratch-check-rls.ts`
Expected: as 3 linhas com `relrowsecurity: true`. Depois, apagar `scratch-check-rls.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): schema Prisma de FonteDeDados/ConsultaParametrizada/ConsultaResultado com RLS"
```

---

## Task 2: Criptografia de credenciais (AES-256-GCM)

**Files:**
- Create: `backend/src/fonte-de-dados/crypto.ts`
- Create: `backend/src/fonte-de-dados/crypto.spec.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `criptografar(texto: string, chaveHex: string): string`, `descriptografar(cifrado: string, chaveHex: string): string` (**usado pela Task 3 e pela Task 6**).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `backend/src/fonte-de-dados/crypto.spec.ts`:

```typescript
import { criptografar, descriptografar } from './crypto';

describe('crypto (AES-256-GCM)', () => {
  const chave = 'a'.repeat(64); // 32 bytes em hex

  it('criptografa e descriptografa de volta para o texto original', () => {
    const cifrado = criptografar('minhaSenhaSecreta123', chave);
    expect(cifrado).not.toBe('minhaSenhaSecreta123');

    const resultado = descriptografar(cifrado, chave);
    expect(resultado).toBe('minhaSenhaSecreta123');
  });

  it('gera cifrados diferentes para o mesmo texto (IV aleatório)', () => {
    const cifrado1 = criptografar('senha', chave);
    const cifrado2 = criptografar('senha', chave);
    expect(cifrado1).not.toBe(cifrado2);
  });

  it('lança erro ao descriptografar com a chave errada', () => {
    const cifrado = criptografar('senha', chave);
    const chaveErrada = 'b'.repeat(64);
    expect(() => descriptografar(cifrado, chaveErrada)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- crypto.spec.ts`
Expected: FAIL com "Cannot find module './crypto'"

- [ ] **Step 3: Implementar**

Criar `backend/src/fonte-de-dados/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITMO = 'aes-256-gcm';

export function criptografar(texto: string, chaveHex: string): string {
  const chave = Buffer.from(chaveHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, chave, iv);

  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
}

export function descriptografar(textoCriptografado: string, chaveHex: string): string {
  const [ivHex, authTagHex, cifradoHex] = textoCriptografado.split(':');
  const chave = Buffer.from(chaveHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const cifrado = Buffer.from(cifradoHex, 'hex');

  const decipher = createDecipheriv(ALGORITMO, chave, iv);
  decipher.setAuthTag(authTag);

  const decifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  return decifrado.toString('utf8');
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- crypto.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Adicionar `ERP_ENCRYPTION_KEY` a `backend/.env.example`**

```
# Chave usada para criptografar/descriptografar credenciais de fontes de dados
# externas (ex: senha do TOTVS RM) em repouso. Deve ser uma string hex de 64
# caracteres (32 bytes) — gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ERP_ENCRYPTION_KEY=your-64-char-hex-key
```

Adicione também o valor real em `backend/.env.local` (gitignorado) — gere um valor
novo com o comando do comentário acima, não reaproveite a chave de exemplo dos
testes. Não reexiba o valor no relatório.

- [ ] **Step 6: Commit**

```bash
git add backend/src/fonte-de-dados/crypto.ts backend/src/fonte-de-dados/crypto.spec.ts backend/.env.example
git commit -m "feat(backend): criptografia AES-256-GCM para credenciais de fontes de dados"
```

---

## Task 3: FonteDeDadosModule (criar/listar fontes de dados por empresa)

**Files:**
- Create: `backend/src/fonte-de-dados/dto/create-fonte-de-dados.dto.ts`
- Create: `backend/src/fonte-de-dados/fonte-de-dados.service.ts`
- Create: `backend/src/fonte-de-dados/fonte-de-dados.service.spec.ts`
- Create: `backend/src/fonte-de-dados/fonte-de-dados.controller.ts`
- Create: `backend/src/fonte-de-dados/fonte-de-dados.controller.spec.ts`
- Create: `backend/src/fonte-de-dados/fonte-de-dados.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `criptografar` (Task 2), `PrismaService`, `TenantContext`/guards (Fase 1).
- Produces: `FonteDeDadosService.create(empresaId, dto): Promise<FonteDeDados>`,
  `findAllByEmpresa(empresaId): Promise<FonteDeDados[]>`,
  `findByIdInEmpresa(fonteDeDadosId, empresaId): Promise<FonteDeDados>` (retorna a
  configuração **completa**, incluindo `senhaCriptografada` — **usado internamente pela
  Task 6**; nunca exposto por um controller sem sanitizar antes). Rotas
  `POST /fontes-de-dados`, `GET /fontes-de-dados` (sempre sanitizadas — sem
  `senhaCriptografada`).

- [ ] **Step 1: Criar o DTO**

Criar `backend/src/fonte-de-dados/dto/create-fonte-de-dados.dto.ts`:

```typescript
export interface CreateFonteDeDadosDto {
  tipo: string;
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}
```

- [ ] **Step 2: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/fonte-de-dados/fonte-de-dados.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FonteDeDadosService } from './fonte-de-dados.service';
import { descriptografar } from './crypto';
import type { PrismaService } from '../prisma/prisma.service';

describe('FonteDeDadosService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      fonteDeDados: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(CHAVE),
    } as unknown as ConfigService;
    return { prisma, config };
  }

  const dto = {
    tipo: 'totvs_rm',
    nome: 'RM Produção',
    serverUrl: 'http://177.129.242.252:8051',
    username: 'admin',
    senha: 'segredo123',
    codSistema: 'T',
    codColigada: '1',
  };

  it('cria uma fonte de dados com a senha criptografada, nunca em texto plano', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'fonte-1', ...data }),
    );
    const service = new FonteDeDadosService(prisma, config);

    const resultado = await service.create('empresa-1', dto);

    const configuracaoSalva = resultado.configuracao as { senhaCriptografada: string };
    expect(configuracaoSalva.senhaCriptografada).not.toBe('segredo123');
    expect(descriptografar(configuracaoSalva.senhaCriptografada, CHAVE)).toBe('segredo123');
  });

  it('lista fontes de dados só da empresa informada', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.findMany as jest.Mock).mockResolvedValue([]);
    const service = new FonteDeDadosService(prisma, config);

    await service.findAllByEmpresa('empresa-1');

    expect(prisma.fonteDeDados.findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se não encontrar', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new FonteDeDadosService(prisma, config);

    await expect(service.findByIdInEmpresa('fonte-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- fonte-de-dados.service.spec.ts`
Expected: FAIL com "Cannot find module './fonte-de-dados.service'"

- [ ] **Step 4: Implementar `FonteDeDadosService`**

Criar `backend/src/fonte-de-dados/fonte-de-dados.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar } from './crypto';
import type { CreateFonteDeDadosDto } from './dto/create-fonte-de-dados.dto';

export interface ConfiguracaoFonteDeDados {
  serverUrl: string;
  username: string;
  senhaCriptografada: string;
  codSistema: string;
  codColigada: string;
}

@Injectable()
export class FonteDeDadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(empresaId: string, dto: CreateFonteDeDadosDto) {
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const configuracao: ConfiguracaoFonteDeDados = {
      serverUrl: dto.serverUrl,
      username: dto.username,
      senhaCriptografada: criptografar(dto.senha, chave),
      codSistema: dto.codSistema,
      codColigada: dto.codColigada,
    };

    return this.prisma.fonteDeDados.create({
      data: {
        empresaId,
        tipo: dto.tipo,
        nome: dto.nome,
        configuracao: configuracao as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByEmpresa(empresaId: string) {
    return this.prisma.fonteDeDados.findMany({
      where: { empresaId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(fonteDeDadosId: string, empresaId: string) {
    const fonte = await this.prisma.fonteDeDados.findFirst({
      where: { id: fonteDeDadosId, empresaId },
    });

    if (!fonte) {
      throw new NotFoundException('Fonte de dados não encontrada');
    }

    return fonte;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- fonte-de-dados.service.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/fonte-de-dados/fonte-de-dados.controller.spec.ts`:

```typescript
import { FonteDeDadosController } from './fonte-de-dados.controller';
import type { FonteDeDadosService } from './fonte-de-dados.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FonteDeDadosController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const dtoValido = {
    tipo: 'totvs_rm',
    nome: 'RM Produção',
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  it('cria uma fonte de dados e nunca devolve a senha criptografada na resposta', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({
        id: 'fonte-1',
        configuracao: {
          serverUrl: 'http://servidor:8051',
          username: 'admin',
          senhaCriptografada: 'xxx',
          codSistema: 'T',
          codColigada: '1',
        },
      }),
    } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(service, buildTenantContext());

    const resultado = await controller.criar(dtoValido);

    expect(service.create).toHaveBeenCalledWith('empresa-1', dtoValido);
    expect(resultado.configuracao).not.toHaveProperty('senhaCriptografada');
  });

  it('rejeita quando falta um campo obrigatório', async () => {
    const service = { create: jest.fn() } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(service, buildTenantContext());

    await expect(controller.criar({ ...dtoValido, senha: '' })).rejects.toThrow(
      'tipo, nome, serverUrl, username, senha, codSistema e codColigada são obrigatórios',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista fontes de dados sem expor a senha criptografada', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([
        {
          id: 'fonte-1',
          configuracao: {
            serverUrl: 'x',
            username: 'y',
            senhaCriptografada: 'zzz',
            codSistema: 'T',
            codColigada: '1',
          },
        },
      ]),
    } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(service, buildTenantContext());

    const resultado = await controller.listar();

    expect(resultado[0].configuracao).not.toHaveProperty('senhaCriptografada');
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- fonte-de-dados.controller.spec.ts`
Expected: FAIL com "Cannot find module './fonte-de-dados.controller'"

- [ ] **Step 8: Implementar `FonteDeDadosController`**

Criar `backend/src/fonte-de-dados/fonte-de-dados.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { FonteDeDadosService, type ConfiguracaoFonteDeDados } from './fonte-de-dados.service';
import type { CreateFonteDeDadosDto } from './dto/create-fonte-de-dados.dto';

function sanitizar<T extends { configuracao: unknown }>(fonte: T) {
  const configuracao = fonte.configuracao as ConfiguracaoFonteDeDados;
  return {
    ...fonte,
    configuracao: {
      serverUrl: configuracao.serverUrl,
      username: configuracao.username,
      codSistema: configuracao.codSistema,
      codColigada: configuracao.codColigada,
    },
  };
}

@Controller('fontes-de-dados')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FonteDeDadosController {
  constructor(
    private readonly fonteDeDadosService: FonteDeDadosService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Body() body: CreateFonteDeDadosDto) {
    if (
      !body.tipo?.trim() ||
      !body.nome?.trim() ||
      !body.serverUrl?.trim() ||
      !body.username?.trim() ||
      !body.senha?.trim() ||
      !body.codSistema?.trim() ||
      !body.codColigada?.trim()
    ) {
      throw new BadRequestException(
        'tipo, nome, serverUrl, username, senha, codSistema e codColigada são obrigatórios',
      );
    }

    const { empresaId } = this.tenantContext.get();
    const fonte = await this.fonteDeDadosService.create(empresaId, body);
    return sanitizar(fonte);
  }

  @Get()
  async listar() {
    const { empresaId } = this.tenantContext.get();
    const fontes = await this.fonteDeDadosService.findAllByEmpresa(empresaId);
    return fontes.map(sanitizar);
  }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- fonte-de-dados.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 10: Criar `FonteDeDadosModule` e importar no `AppModule`**

Criar `backend/src/fonte-de-dados/fonte-de-dados.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FonteDeDadosController } from './fonte-de-dados.controller';
import { FonteDeDadosService } from './fonte-de-dados.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FonteDeDadosController],
  providers: [FonteDeDadosService],
  exports: [FonteDeDadosService],
})
export class FonteDeDadosModule {}
```

Editar `backend/src/app.module.ts` para importar `FonteDeDadosModule`.

- [ ] **Step 11: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 12: Commit**

```bash
git add backend/src/fonte-de-dados backend/src/app.module.ts
git commit -m "feat(backend): FonteDeDadosService/Controller — criar e listar fontes de dados por empresa"
```

---

## Task 4: TotvsRmAdapterService (protocolo SOAP, somente leitura)

**Files:**
- Create: `backend/src/totvs-rm/totvs-rm-envelope.ts`
- Create: `backend/src/totvs-rm/totvs-rm-envelope.spec.ts`
- Create: `backend/src/totvs-rm/totvs-rm-parser.ts`
- Create: `backend/src/totvs-rm/totvs-rm-parser.spec.ts`
- Create: `backend/src/totvs-rm/totvs-rm-adapter.service.ts`
- Create: `backend/src/totvs-rm/totvs-rm-adapter.service.spec.ts`
- Create: `backend/src/totvs-rm/totvs-rm.module.ts`

**Interfaces:**
- Produces: `TotvsRmConexao { serverUrl, username, senha, codSistema, codColigada }`,
  `TotvsRmAdapterService.realizarConsultaSQL(conexao, codSentenca, parametros:
  Record<string,string>): Promise<Record<string,string>[]>` (**usado pela Task 6**).

Baseado na referência técnica fornecida (protocolo SOAP 1.1, dois webservices
distintos — só `wsConsultaSQL`/`RealizarConsultaSQL` é implementado, nunca
`wsDataServer`/`SaveRecord`).

- [ ] **Step 1: Escrever o teste do envelope SOAP (falha primeiro)**

Criar `backend/src/totvs-rm/totvs-rm-envelope.spec.ts`:

```typescript
import { formatarParametros, montarAuthHeader, montarEnvelopeConsultaSQL } from './totvs-rm-envelope';

describe('totvs-rm-envelope', () => {
  const conexao = {
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  it('formata parâmetros como CHAVE=valor;CHAVE2=valor2', () => {
    expect(formatarParametros({ CODFILIAL: '001', DATASINC: '20260726' })).toBe(
      'CODFILIAL=001;DATASINC=20260726',
    );
  });

  it('formata string vazia quando não há parâmetros', () => {
    expect(formatarParametros({})).toBe('');
  });

  it('monta o envelope SOAP com AutenticacaoHeader e RealizarConsultaSQL', () => {
    const envelope = montarEnvelopeConsultaSQL(conexao, 'SALDOESTOQUEINSU', { CODFILIAL: '001' });

    expect(envelope).toContain('<tot:Chave>admin|segredo|T|1</tot:Chave>');
    expect(envelope).toContain('<tot:codSentenca>SALDOESTOQUEINSU</tot:codSentenca>');
    expect(envelope).toContain('<tot:codColigada>1</tot:codColigada>');
    expect(envelope).toContain('<tot:parameters>CODFILIAL=001</tot:parameters>');
  });

  it('monta o header de HTTP Basic Auth', () => {
    const header = montarAuthHeader(conexao);
    expect(header).toBe('Basic ' + Buffer.from('admin:segredo').toString('base64'));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- totvs-rm-envelope.spec.ts`
Expected: FAIL com "Cannot find module './totvs-rm-envelope'"

- [ ] **Step 3: Implementar o envelope**

Criar `backend/src/totvs-rm/totvs-rm-envelope.ts`:

```typescript
export interface TotvsRmConexao {
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export function formatarParametros(parametros: Record<string, string>): string {
  return Object.entries(parametros)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(';');
}

export function montarEnvelopeConsultaSQL(
  conexao: TotvsRmConexao,
  codSentenca: string,
  parametros: Record<string, string>,
): string {
  const chave = `${conexao.username}|${conexao.senha}|${conexao.codSistema}|${conexao.codColigada}`;
  const parametrosString = formatarParametros(parametros);

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tot="http://www.totvs.com/">
  <soap:Header>
    <tot:AutenticacaoHeader>
      <tot:Chave>${chave}</tot:Chave>
    </tot:AutenticacaoHeader>
  </soap:Header>
  <soap:Body>
    <tot:RealizarConsultaSQL>
      <tot:codSentenca>${codSentenca}</tot:codSentenca>
      <tot:codColigada>${conexao.codColigada}</tot:codColigada>
      <tot:codSistema>${conexao.codSistema}</tot:codSistema>
      <tot:parameters>${parametrosString}</tot:parameters>
    </tot:RealizarConsultaSQL>
  </soap:Body>
</soap:Envelope>`;
}

export function montarAuthHeader(conexao: TotvsRmConexao): string {
  const credenciais = `${conexao.username}:${conexao.senha}`;
  return 'Basic ' + Buffer.from(credenciais, 'utf8').toString('base64');
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- totvs-rm-envelope.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Escrever o teste do parser (falha primeiro)**

Criar `backend/src/totvs-rm/totvs-rm-parser.spec.ts`:

```typescript
import { decodificarXml, extrairMensagemErro, extrairResultados } from './totvs-rm-parser';

describe('totvs-rm-parser', () => {
  it('decodifica entidades XML escapadas', () => {
    expect(decodificarXml('&lt;tag&gt; A &amp; B &quot;C&quot;')).toBe('<tag> A & B "C"');
  });

  it('extrai múltiplas linhas de <Resultado>', () => {
    const xml =
      '<Resultados>' +
      '<Resultado><CODPRODUTO>1</CODPRODUTO><QUANTIDADE>10</QUANTIDADE></Resultado>' +
      '<Resultado><CODPRODUTO>2</CODPRODUTO><QUANTIDADE>20</QUANTIDADE></Resultado>' +
      '</Resultados>';

    expect(extrairResultados(xml)).toEqual([
      { CODPRODUTO: '1', QUANTIDADE: '10' },
      { CODPRODUTO: '2', QUANTIDADE: '20' },
    ]);
  });

  it('retorna array vazio quando não há <Resultado>', () => {
    expect(extrairResultados('<Resultados></Resultados>')).toEqual([]);
  });

  it('extrai mensagem de erro de faultstring', () => {
    const xml = '<soap:Fault><faultstring>Coligada inválida</faultstring></soap:Fault>';
    expect(extrairMensagemErro(xml)).toBe('Coligada inválida');
  });

  it('retorna null quando não há mensagem de erro', () => {
    expect(extrairMensagemErro('<Resultado></Resultado>')).toBeNull();
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npm test -- totvs-rm-parser.spec.ts`
Expected: FAIL com "Cannot find module './totvs-rm-parser'"

- [ ] **Step 7: Implementar o parser**

Criar `backend/src/totvs-rm/totvs-rm-parser.ts`:

```typescript
export function decodificarXml(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extrairResultados(xmlDecodificado: string): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  const padraoLinha = /<Resultado>([\s\S]*?)<\/Resultado>/g;

  for (const match of xmlDecodificado.matchAll(padraoLinha)) {
    const conteudoLinha = match[1];
    const linha: Record<string, string> = {};
    const padraoCampo = /<([A-Za-z0-9_]+)>(.*?)<\/\1>/g;

    for (const campoMatch of conteudoLinha.matchAll(padraoCampo)) {
      linha[campoMatch[1]] = campoMatch[2].trim();
    }

    linhas.push(linha);
  }

  return linhas;
}

export function extrairMensagemErro(xml: string): string | null {
  const padroes = [
    /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i,
    /<Message[^>]*>([\s\S]*?)<\/Message>/i,
    /<Mensagem[^>]*>([\s\S]*?)<\/Mensagem>/i,
  ];

  for (const padrao of padroes) {
    const match = xml.match(padrao);
    if (match) return match[1].trim();
  }

  return null;
}
```

Nota: nomes de tag com espaço (`Id Produto` → `IdProduto` ou `Id_x0020_Produto`
dependendo da versão do RM) já são cobertos pelo charset `[A-Za-z0-9_]+` do
`padraoCampo` sem tratamento especial — o espaço nunca chega a fazer parte do nome da
tag em nenhuma das duas variações. Quem **consome** o objeto resultante (Task 6, ao
descobrir `colunas`) é responsável por lidar com variação de maiúsculas/minúsculas
entre execuções, não o parser.

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npm test -- totvs-rm-parser.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 9: Escrever o teste do adapter (falha primeiro)**

Criar `backend/src/totvs-rm/totvs-rm-adapter.service.spec.ts`:

```typescript
import { TotvsRmAdapterService } from './totvs-rm-adapter.service';

describe('TotvsRmAdapterService', () => {
  const conexao = {
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama o endpoint wsConsultaSQL com o envelope e headers corretos', async () => {
    const respostaXml = '<Resultado><CODPRODUTO>123</CODPRODUTO></Resultado>';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () => Promise.resolve(respostaXml),
    } as Response);
    const service = new TotvsRmAdapterService();

    const resultado = await service.realizarConsultaSQL(conexao, 'SALDOESTOQUEINSU', {
      CODFILIAL: '001',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://servidor:8051/wsConsultaSQL/IwsConsultaSQL',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://www.totvs.com/IwsConsultaSQL/RealizarConsultaSQL"',
        }),
      }),
    );
    expect(resultado).toEqual([{ CODPRODUTO: '123' }]);
  });

  it('lança erro com a mensagem de negócio do RM quando a resposta contém um faultstring', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () => Promise.resolve('<soap:Fault><faultstring>Coligada inválida</faultstring></soap:Fault>'),
    } as Response);
    const service = new TotvsRmAdapterService();

    await expect(service.realizarConsultaSQL(conexao, 'X', {})).rejects.toThrow(
      'Coligada inválida',
    );
  });

  it('lança erro de rede quando o fetch falha', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new TotvsRmAdapterService();

    await expect(service.realizarConsultaSQL(conexao, 'X', {})).rejects.toThrow('inacessível');
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `npm test -- totvs-rm-adapter.service.spec.ts`
Expected: FAIL com "Cannot find module './totvs-rm-adapter.service'"

- [ ] **Step 11: Implementar o adapter**

Criar `backend/src/totvs-rm/totvs-rm-adapter.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { montarAuthHeader, montarEnvelopeConsultaSQL, type TotvsRmConexao } from './totvs-rm-envelope';
import { decodificarXml, extrairMensagemErro, extrairResultados } from './totvs-rm-parser';

@Injectable()
export class TotvsRmAdapterService {
  async realizarConsultaSQL(
    conexao: TotvsRmConexao,
    codSentenca: string,
    parametros: Record<string, string>,
  ): Promise<Record<string, string>[]> {
    const envelope = montarEnvelopeConsultaSQL(conexao, codSentenca, parametros);

    let resposta: Response;
    try {
      resposta = await fetch(`${conexao.serverUrl}/wsConsultaSQL/IwsConsultaSQL`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://www.totvs.com/IwsConsultaSQL/RealizarConsultaSQL"',
          Authorization: montarAuthHeader(conexao),
        },
        body: envelope,
      });
    } catch (erro) {
      throw new Error(`Servidor TOTVS RM inacessível — confira URL/porta: ${String(erro)}`);
    }

    const textoXml = await resposta.text();
    const decodificado = decodificarXml(textoXml);

    const mensagemErro = extrairMensagemErro(decodificado);
    if (mensagemErro) {
      throw new Error(mensagemErro);
    }

    return extrairResultados(decodificado);
  }
}
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `npm test -- totvs-rm-adapter.service.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 13: Criar `TotvsRmModule`**

Criar `backend/src/totvs-rm/totvs-rm.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TotvsRmAdapterService } from './totvs-rm-adapter.service';

@Module({
  providers: [TotvsRmAdapterService],
  exports: [TotvsRmAdapterService],
})
export class TotvsRmModule {}
```

Este módulo não é importado no `AppModule` diretamente (não tem controller) — é
importado pelo módulo da Task 6, que efetivamente usa o adapter.

- [ ] **Step 14: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 15: Commit**

```bash
git add backend/src/totvs-rm
git commit -m "feat(backend): TotvsRmAdapterService — protocolo SOAP wsConsultaSQL (somente leitura)"
```

---

## Task 5: ConsultaModule (criar/listar consultas por módulo + construtor de tool schema)

**Files:**
- Create: `backend/src/consulta/tool-schema-builder.ts`
- Create: `backend/src/consulta/tool-schema-builder.spec.ts`
- Create: `backend/src/consulta/dto/create-consulta.dto.ts`
- Create: `backend/src/consulta/consulta.service.ts`
- Create: `backend/src/consulta/consulta.service.spec.ts`
- Create: `backend/src/consulta/consulta.controller.ts`
- Create: `backend/src/consulta/consulta.controller.spec.ts`
- Create: `backend/src/consulta/consulta.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `CampoSaida` (Fase 3, `../skill/schema-builder`), `ModuloService.findByIdInEmpresa`
  (Fase 2), `FonteDeDadosService.findByIdInEmpresa` (Task 3).
- Produces: `construirInputSchemaFerramenta(campos: CampoSaida[]): { type: 'object';
  properties; required }` (**usado pela Task 9**), `ConsultaService.create(moduloId,
  empresaId, dto)`, `findAllByModulo(moduloId, empresaId)`, `findByIdInEmpresa(consultaId,
  empresaId): Promise<Consulta & { fonteDeDados: FonteDeDados }>` (**usado pelas Tasks 6
  e 9**), `atualizarSincronizacao(consultaId, empresaId, ativa, intervaloMinutos)`. Rotas
  `POST /modulos/:moduloId/consultas`, `GET /modulos/:moduloId/consultas`,
  `PATCH /consultas/:consultaId/sincronizacao`.

- [ ] **Step 1: Escrever o teste do construtor de tool schema (falha primeiro)**

Criar `backend/src/consulta/tool-schema-builder.spec.ts`:

```typescript
import { construirInputSchemaFerramenta } from './tool-schema-builder';

describe('construirInputSchemaFerramenta', () => {
  it('constrói um JSON Schema com properties e required a partir dos campos', () => {
    const schema = construirInputSchemaFerramenta([
      { nome: 'codProduto', tipo: 'string', descricao: 'Código do produto', obrigatorio: true },
      { nome: 'quantidadeMinima', tipo: 'number', obrigatorio: false },
    ]);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        codProduto: { type: 'string', description: 'Código do produto' },
        quantidadeMinima: { type: 'number' },
      },
      required: ['codProduto'],
    });
  });

  it('retorna required vazio quando nenhum campo é obrigatório', () => {
    const schema = construirInputSchemaFerramenta([
      { nome: 'filtro', tipo: 'string', obrigatorio: false },
    ]);

    expect(schema.required).toEqual([]);
  });

  it('lida com lista vazia de campos', () => {
    const schema = construirInputSchemaFerramenta([]);
    expect(schema).toEqual({ type: 'object', properties: {}, required: [] });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- tool-schema-builder.spec.ts`
Expected: FAIL com "Cannot find module './tool-schema-builder'"

- [ ] **Step 3: Implementar**

Criar `backend/src/consulta/tool-schema-builder.ts`:

```typescript
import type { CampoSaida } from '../skill/schema-builder';

function tipoJsonSchema(tipo: CampoSaida['tipo']) {
  switch (tipo) {
    case 'string':
      return { type: 'string' as const };
    case 'number':
      return { type: 'number' as const };
    case 'boolean':
      return { type: 'boolean' as const };
    case 'string[]':
      return { type: 'array' as const, items: { type: 'string' as const } };
  }
}

export function construirInputSchemaFerramenta(campos: CampoSaida[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const campo of campos) {
    const propriedade = tipoJsonSchema(campo.tipo);
    properties[campo.nome] = campo.descricao
      ? { ...propriedade, description: campo.descricao }
      : propriedade;
    if (campo.obrigatorio) required.push(campo.nome);
  }

  return { type: 'object' as const, properties, required };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tool-schema-builder.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Criar o DTO**

Criar `backend/src/consulta/dto/create-consulta.dto.ts`:

```typescript
import type { CampoSaida } from '../../skill/schema-builder';

export interface CreateConsultaDto {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
}
```

- [ ] **Step 6: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/consulta/consulta.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { ConsultaService } from './consulta.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';
import type { FonteDeDadosService } from '../fonte-de-dados/fonte-de-dados.service';

describe('ConsultaService', () => {
  function buildDeps() {
    const prisma = {
      consultaParametrizada: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = { findByIdInEmpresa: jest.fn() } as unknown as ModuloService;
    const fonteDeDadosService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as FonteDeDadosService;
    return { prisma, moduloService, fonteDeDadosService };
  }

  const dto = {
    fonteDeDadosId: 'fonte-1',
    nome: 'Saldo de estoque',
    codSentenca: 'SALDOESTOQUEINSU',
    parametrosSincronizacao: { CODFILIAL: '001' },
    camposFiltro: [{ nome: 'codProduto', tipo: 'string' as const, obrigatorio: true }],
  };

  it('cria uma consulta depois de validar módulo e fonte de dados na empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (fonteDeDadosService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'fonte-1' });
    (prisma.consultaParametrizada.create as jest.Mock).mockResolvedValue({ id: 'consulta-1' });
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    const resultado = await service.create('modulo-1', 'empresa-1', dto);

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(fonteDeDadosService.findByIdInEmpresa).toHaveBeenCalledWith('fonte-1', 'empresa-1');
    expect(prisma.consultaParametrizada.create).toHaveBeenCalledWith({
      data: {
        moduloId: 'modulo-1',
        fonteDeDadosId: 'fonte-1',
        nome: 'Saldo de estoque',
        codSentenca: 'SALDOESTOQUEINSU',
        parametrosSincronizacao: { CODFILIAL: '001' },
        camposFiltro: dto.camposFiltro,
      },
    });
    expect(resultado).toEqual({ id: 'consulta-1' });
  });

  it('propaga NotFoundException se o módulo não for da empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    await expect(service.create('modulo-x', 'empresa-1', dto)).rejects.toThrow(NotFoundException);
    expect(prisma.consultaParametrizada.create).not.toHaveBeenCalled();
  });

  it('propaga NotFoundException se a fonte de dados não for da empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (fonteDeDadosService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    await expect(service.create('modulo-1', 'empresa-1', dto)).rejects.toThrow(NotFoundException);
    expect(prisma.consultaParametrizada.create).not.toHaveBeenCalled();
  });

  it('lista consultas só do módulo informado', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(prisma.consultaParametrizada.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se não encontrar', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (prisma.consultaParametrizada.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    await expect(service.findByIdInEmpresa('consulta-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.consultaParametrizada.findFirst).toHaveBeenCalledWith({
      where: { id: 'consulta-x', modulo: { empresaId: 'empresa-1' } },
      include: { fonteDeDados: true },
    });
  });

  it('atualizarSincronizacao valida posse antes de atualizar', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (prisma.consultaParametrizada.findFirst as jest.Mock).mockResolvedValue({ id: 'consulta-1' });
    (prisma.consultaParametrizada.update as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      sincronizacaoAtiva: true,
    });
    const service = new ConsultaService(prisma, moduloService, fonteDeDadosService);

    await service.atualizarSincronizacao('consulta-1', 'empresa-1', true, 60);

    expect(prisma.consultaParametrizada.update).toHaveBeenCalledWith({
      where: { id: 'consulta-1' },
      data: { sincronizacaoAtiva: true, intervaloSincronizacaoMinutos: 60 },
    });
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- consulta.service.spec.ts`
Expected: FAIL com "Cannot find module './consulta.service'"

- [ ] **Step 8: Implementar `ConsultaService`**

Criar `backend/src/consulta/consulta.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import { FonteDeDadosService } from '../fonte-de-dados/fonte-de-dados.service';
import type { CreateConsultaDto } from './dto/create-consulta.dto';

@Injectable()
export class ConsultaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
    private readonly fonteDeDadosService: FonteDeDadosService,
  ) {}

  async create(moduloId: string, empresaId: string, dto: CreateConsultaDto) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);
    await this.fonteDeDadosService.findByIdInEmpresa(dto.fonteDeDadosId, empresaId);

    return this.prisma.consultaParametrizada.create({
      data: {
        moduloId,
        fonteDeDadosId: dto.fonteDeDadosId,
        nome: dto.nome,
        codSentenca: dto.codSentenca,
        parametrosSincronizacao: dto.parametrosSincronizacao as unknown as Prisma.InputJsonValue,
        camposFiltro: dto.camposFiltro as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.consultaParametrizada.findMany({
      where: { moduloId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(consultaId: string, empresaId: string) {
    const consulta = await this.prisma.consultaParametrizada.findFirst({
      where: { id: consultaId, modulo: { empresaId } },
      include: { fonteDeDados: true },
    });

    if (!consulta) {
      throw new NotFoundException('Consulta não encontrada');
    }

    return consulta;
  }

  async atualizarSincronizacao(
    consultaId: string,
    empresaId: string,
    ativa: boolean,
    intervaloMinutos: number | undefined,
  ) {
    await this.findByIdInEmpresa(consultaId, empresaId);

    return this.prisma.consultaParametrizada.update({
      where: { id: consultaId },
      data: { sincronizacaoAtiva: ativa, intervaloSincronizacaoMinutos: intervaloMinutos },
    });
  }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- consulta.service.spec.ts`
Expected: PASS (6 testes)

- [ ] **Step 10: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/consulta/consulta.controller.spec.ts`:

```typescript
import { ConsultaController } from './consulta.controller';
import type { ConsultaService } from './consulta.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConsultaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const dto = {
    fonteDeDadosId: 'fonte-1',
    nome: 'Saldo de estoque',
    codSentenca: 'SALDOESTOQUEINSU',
    parametrosSincronizacao: { CODFILIAL: '001' },
    camposFiltro: [{ nome: 'codProduto', tipo: 'string' as const, obrigatorio: true }],
  };

  it('cria uma consulta no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'consulta-1' }),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1', dto);

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'empresa-1', dto);
    expect(resultado).toEqual({ id: 'consulta-1' });
  });

  it('rejeita quando falta nome, codSentenca ou fonteDeDadosId', async () => {
    const service = { create: jest.fn() } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    await expect(controller.criar('modulo-1', { ...dto, codSentenca: '' })).rejects.toThrow(
      'nome, codSentenca e fonteDeDadosId são obrigatórios',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista consultas do módulo informado', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'consulta-1' }]),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'consulta-1' }]);
  });

  it('atualiza a configuração de sincronização', async () => {
    const service = {
      atualizarSincronizacao: jest
        .fn()
        .mockResolvedValue({ id: 'consulta-1', sincronizacaoAtiva: true }),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.atualizarSincronizacao('consulta-1', {
      ativa: true,
      intervaloMinutos: 60,
    });

    expect(service.atualizarSincronizacao).toHaveBeenCalledWith('consulta-1', 'empresa-1', true, 60);
    expect(resultado).toEqual({ id: 'consulta-1', sincronizacaoAtiva: true });
  });
});
```

- [ ] **Step 11: Rodar e confirmar que falha**

Run: `npm test -- consulta.controller.spec.ts`
Expected: FAIL com "Cannot find module './consulta.controller'"

- [ ] **Step 12: Implementar `ConsultaController`**

Criar `backend/src/consulta/consulta.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConsultaService } from './consulta.service';
import type { CreateConsultaDto } from './dto/create-consulta.dto';

interface AtualizarSincronizacaoDto {
  ativa: boolean;
  intervaloMinutos?: number;
}

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConsultaController {
  constructor(
    private readonly consultaService: ConsultaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('modulos/:moduloId/consultas')
  async criar(@Param('moduloId') moduloId: string, @Body() body: CreateConsultaDto) {
    if (!body.nome?.trim() || !body.codSentenca?.trim() || !body.fonteDeDadosId?.trim()) {
      throw new BadRequestException('nome, codSentenca e fonteDeDadosId são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.consultaService.create(moduloId, empresaId, {
      ...body,
      parametrosSincronizacao: body.parametrosSincronizacao ?? {},
      camposFiltro: body.camposFiltro ?? [],
    });
  }

  @Get('modulos/:moduloId/consultas')
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.consultaService.findAllByModulo(moduloId, empresaId);
  }

  @Patch('consultas/:consultaId/sincronizacao')
  async atualizarSincronizacao(
    @Param('consultaId') consultaId: string,
    @Body() body: AtualizarSincronizacaoDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.consultaService.atualizarSincronizacao(
      consultaId,
      empresaId,
      body.ativa,
      body.intervaloMinutos,
    );
  }
}
```

- [ ] **Step 13: Rodar e confirmar que passa**

Run: `npm test -- consulta.controller.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 14: Criar `ConsultaModule` e importar no `AppModule`**

Criar `backend/src/consulta/consulta.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConsultaController } from './consulta.controller';
import { ConsultaService } from './consulta.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';
import { FonteDeDadosModule } from '../fonte-de-dados/fonte-de-dados.module';

@Module({
  imports: [AuthModule, ModuloModule, FonteDeDadosModule],
  controllers: [ConsultaController],
  providers: [ConsultaService],
  exports: [ConsultaService],
})
export class ConsultaModule {}
```

Editar `backend/src/app.module.ts` para importar `ConsultaModule`.

- [ ] **Step 15: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 16: Commit**

```bash
git add backend/src/consulta backend/src/app.module.ts
git commit -m "feat(backend): ConsultaService/Controller — criar e listar consultas parametrizadas por módulo"
```

---

## Task 6: ConsultaSincronizacaoService + "Testar consulta"

**Files:**
- Create: `backend/src/consulta/colunas.ts`
- Create: `backend/src/consulta/colunas.spec.ts`
- Create: `backend/src/consulta/consulta-sincronizacao.service.ts`
- Create: `backend/src/consulta/consulta-sincronizacao.service.spec.ts`
- Create: `backend/src/consulta/consulta-teste.controller.ts`
- Create: `backend/src/consulta/consulta-teste.controller.spec.ts`
- Create: `backend/src/consulta/consulta-teste.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `TotvsRmAdapterService.realizarConsultaSQL` (Task 4), `descriptografar` (Task
  2), `ConsultaService.findByIdInEmpresa` (Task 5).
- Produces: `mesclarColunas(existentes, nomesTecnicos): ColunaDescrita[]`,
  `ConsultaSincronizacaoService.executarSincronizacao(consulta):
  Promise<ResultadoSincronizacao>` (**usado pela Task 7**, o cron), nunca lança — sempre
  devolve `{ sucesso: true, ... } | { sucesso: false, erro }`. Rota
  `POST /consultas/:consultaId/testar` — roda o mesmo caminho de código do cron, dobra
  como descoberta de schema e sincronização manual.

- [ ] **Step 1: Escrever o teste de `mesclarColunas` (falha primeiro)**

Criar `backend/src/consulta/colunas.spec.ts`:

```typescript
import { mesclarColunas } from './colunas';

describe('mesclarColunas', () => {
  it('cria colunas novas sem descrição quando não há colunas existentes', () => {
    expect(mesclarColunas(null, ['CODPRODUTO', 'QUANTIDADE'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: null },
      { nomeTecnico: 'QUANTIDADE', descricao: null },
    ]);
  });

  it('preserva a descrição de colunas já descritas anteriormente', () => {
    const existentes = [{ nomeTecnico: 'CODPRODUTO', descricao: 'Código do produto' }];
    expect(mesclarColunas(existentes, ['CODPRODUTO', 'QUANTIDADE'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: 'Código do produto' },
      { nomeTecnico: 'QUANTIDADE', descricao: null },
    ]);
  });

  it('descarta colunas que não aparecem mais no resultado atual', () => {
    const existentes = [{ nomeTecnico: 'COLUNA_ANTIGA', descricao: 'Não existe mais' }];
    expect(mesclarColunas(existentes, ['CODPRODUTO'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: null },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- colunas.spec.ts`
Expected: FAIL com "Cannot find module './colunas'"

- [ ] **Step 3: Implementar**

Criar `backend/src/consulta/colunas.ts`:

```typescript
export interface ColunaDescrita {
  nomeTecnico: string;
  descricao: string | null;
}

export function mesclarColunas(
  existentes: ColunaDescrita[] | null,
  nomesTecnicos: string[],
): ColunaDescrita[] {
  const descricoesPorNome = new Map((existentes ?? []).map((c) => [c.nomeTecnico, c.descricao]));

  return nomesTecnicos.map((nomeTecnico) => ({
    nomeTecnico,
    descricao: descricoesPorNome.get(nomeTecnico) ?? null,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- colunas.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Escrever o teste do `ConsultaSincronizacaoService` (falha primeiro)**

Criar `backend/src/consulta/consulta-sincronizacao.service.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { criptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { TotvsRmAdapterService } from '../totvs-rm/totvs-rm-adapter.service';

describe('ConsultaSincronizacaoService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      consultaParametrizada: { update: jest.fn() },
      consultaResultado: { deleteMany: jest.fn(), createMany: jest.fn() },
      fonteDeDados: { update: jest.fn() },
    } as unknown as PrismaService;
    const config = { getOrThrow: jest.fn().mockReturnValue(CHAVE) } as unknown as ConfigService;
    const totvsRmAdapter = { realizarConsultaSQL: jest.fn() } as unknown as TotvsRmAdapterService;
    return { prisma, config, totvsRmAdapter };
  }

  function buildConsulta() {
    return {
      id: 'consulta-1',
      fonteDeDadosId: 'fonte-1',
      codSentenca: 'SALDOESTOQUEINSU',
      parametrosSincronizacao: { CODFILIAL: '001' },
      colunas: null,
      fonteDeDados: {
        configuracao: {
          serverUrl: 'http://servidor:8051',
          username: 'admin',
          senhaCriptografada: criptografar('segredo', CHAVE),
          codSistema: 'T',
          codColigada: '1',
        },
      },
    };
  }

  it('sincroniza com sucesso: descobre colunas, substitui resultados, atualiza status', async () => {
    const { prisma, config, totvsRmAdapter } = buildDeps();
    const consulta = buildConsulta();
    (totvsRmAdapter.realizarConsultaSQL as jest.Mock).mockResolvedValue([
      { CODPRODUTO: '1', QUANTIDADE: '10' },
    ]);
    const service = new ConsultaSincronizacaoService(prisma, config, totvsRmAdapter);

    const resultado = await service.executarSincronizacao(consulta);

    expect(totvsRmAdapter.realizarConsultaSQL).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'http://servidor:8051', senha: 'segredo' }),
      'SALDOESTOQUEINSU',
      { CODFILIAL: '001' },
    );
    expect(prisma.consultaResultado.deleteMany).toHaveBeenCalledWith({
      where: { consultaParametrizadaId: 'consulta-1' },
    });
    expect(prisma.consultaResultado.createMany).toHaveBeenCalledWith({
      data: [{ consultaParametrizadaId: 'consulta-1', dados: { CODPRODUTO: '1', QUANTIDADE: '10' } }],
    });
    expect(prisma.consultaParametrizada.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'consulta-1' },
        data: expect.objectContaining({ testada: true }),
      }),
    );
    expect(resultado).toEqual({
      sucesso: true,
      linhasLidas: 1,
      colunas: [
        { nomeTecnico: 'CODPRODUTO', descricao: null },
        { nomeTecnico: 'QUANTIDADE', descricao: null },
      ],
      amostra: [{ CODPRODUTO: '1', QUANTIDADE: '10' }],
    });
  });

  it('registra falha sem tocar em ConsultaResultado quando o RM retorna erro', async () => {
    const { prisma, config, totvsRmAdapter } = buildDeps();
    const consulta = buildConsulta();
    (totvsRmAdapter.realizarConsultaSQL as jest.Mock).mockRejectedValue(
      new Error('Coligada inválida'),
    );
    const service = new ConsultaSincronizacaoService(prisma, config, totvsRmAdapter);

    const resultado = await service.executarSincronizacao(consulta);

    expect(prisma.consultaResultado.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fonteDeDados.update).toHaveBeenCalledWith({
      where: { id: 'fonte-1' },
      data: {
        ultimoTesteEm: expect.any(Date),
        ultimoTesteSucesso: false,
        ultimaMensagemErro: 'Coligada inválida',
      },
    });
    expect(resultado).toEqual({ sucesso: false, erro: 'Coligada inválida' });
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npm test -- consulta-sincronizacao.service.spec.ts`
Expected: FAIL com "Cannot find module './consulta-sincronizacao.service'"

- [ ] **Step 7: Implementar `ConsultaSincronizacaoService`**

Criar `backend/src/consulta/consulta-sincronizacao.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TotvsRmAdapterService } from '../totvs-rm/totvs-rm-adapter.service';
import { descriptografar } from '../fonte-de-dados/crypto';
import type { ConfiguracaoFonteDeDados } from '../fonte-de-dados/fonte-de-dados.service';
import { mesclarColunas, type ColunaDescrita } from './colunas';

export interface ConsultaComFonte {
  id: string;
  fonteDeDadosId: string;
  codSentenca: string;
  parametrosSincronizacao: unknown;
  colunas: unknown;
  fonteDeDados: { configuracao: unknown };
}

export type ResultadoSincronizacao =
  | { sucesso: true; linhasLidas: number; colunas: ColunaDescrita[]; amostra: Record<string, string>[] }
  | { sucesso: false; erro: string };

@Injectable()
export class ConsultaSincronizacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly totvsRmAdapter: TotvsRmAdapterService,
  ) {}

  async executarSincronizacao(consulta: ConsultaComFonte): Promise<ResultadoSincronizacao> {
    const configuracao = consulta.fonteDeDados.configuracao as ConfiguracaoFonteDeDados;
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');

    const conexao = {
      serverUrl: configuracao.serverUrl,
      username: configuracao.username,
      senha: descriptografar(configuracao.senhaCriptografada, chave),
      codSistema: configuracao.codSistema,
      codColigada: configuracao.codColigada,
    };

    let linhas: Record<string, string>[];
    try {
      linhas = await this.totvsRmAdapter.realizarConsultaSQL(
        conexao,
        consulta.codSentenca,
        consulta.parametrosSincronizacao as Record<string, string>,
      );
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.consultaParametrizada.update({
        where: { id: consulta.id },
        data: {
          ultimoResultadoSincronizacao: {
            sucesso: false,
            erro: mensagem,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.fonteDeDados.update({
        where: { id: consulta.fonteDeDadosId },
        data: { ultimoTesteEm: new Date(), ultimoTesteSucesso: false, ultimaMensagemErro: mensagem },
      });
      return { sucesso: false, erro: mensagem };
    }

    const colunasMescladas = mesclarColunas(
      consulta.colunas as ColunaDescrita[] | null,
      linhas.length > 0 ? Object.keys(linhas[0]) : [],
    );

    await this.prisma.consultaResultado.deleteMany({
      where: { consultaParametrizadaId: consulta.id },
    });
    if (linhas.length > 0) {
      await this.prisma.consultaResultado.createMany({
        data: linhas.map((linha) => ({
          consultaParametrizadaId: consulta.id,
          dados: linha as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await this.prisma.consultaParametrizada.update({
      where: { id: consulta.id },
      data: {
        testada: true,
        colunas: colunasMescladas as unknown as Prisma.InputJsonValue,
        ultimaSincronizacaoEm: new Date(),
        ultimoResultadoSincronizacao: {
          sucesso: true,
          linhasLidas: linhas.length,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.fonteDeDados.update({
      where: { id: consulta.fonteDeDadosId },
      data: { ultimoTesteEm: new Date(), ultimoTesteSucesso: true, ultimaMensagemErro: null },
    });

    return {
      sucesso: true,
      linhasLidas: linhas.length,
      colunas: colunasMescladas,
      amostra: linhas.slice(0, 5),
    };
  }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npm test -- consulta-sincronizacao.service.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 9: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/consulta/consulta-teste.controller.spec.ts`:

```typescript
import { ConsultaTesteController } from './consulta-teste.controller';
import type { ConsultaService } from './consulta.service';
import type { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConsultaTesteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  it('valida a posse da consulta e roda a sincronização', async () => {
    const consultaService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'consulta-1' }),
    } as unknown as ConsultaService;
    const consultaSincronizacaoService = {
      executarSincronizacao: jest
        .fn()
        .mockResolvedValue({ sucesso: true, linhasLidas: 3, colunas: [], amostra: [] }),
    } as unknown as ConsultaSincronizacaoService;
    const controller = new ConsultaTesteController(
      consultaService,
      consultaSincronizacaoService,
      buildTenantContext(),
    );

    const resultado = await controller.testar('consulta-1');

    expect(consultaService.findByIdInEmpresa).toHaveBeenCalledWith('consulta-1', 'empresa-1');
    expect(consultaSincronizacaoService.executarSincronizacao).toHaveBeenCalledWith({
      id: 'consulta-1',
    });
    expect(resultado).toEqual({ sucesso: true, linhasLidas: 3, colunas: [], amostra: [] });
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `npm test -- consulta-teste.controller.spec.ts`
Expected: FAIL com "Cannot find module './consulta-teste.controller'"

- [ ] **Step 11: Implementar `ConsultaTesteController`**

Criar `backend/src/consulta/consulta-teste.controller.ts`:

```typescript
import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConsultaService } from './consulta.service';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';

@Controller('consultas/:consultaId/testar')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConsultaTesteController {
  constructor(
    private readonly consultaService: ConsultaService,
    private readonly consultaSincronizacaoService: ConsultaSincronizacaoService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async testar(@Param('consultaId') consultaId: string) {
    const { empresaId } = this.tenantContext.get();
    const consulta = await this.consultaService.findByIdInEmpresa(consultaId, empresaId);
    return this.consultaSincronizacaoService.executarSincronizacao(consulta);
  }
}
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `npm test -- consulta-teste.controller.spec.ts`
Expected: PASS (1 teste)

- [ ] **Step 13: Confirmar que o build compila**

Run: `npm run build`
Expected: sem erros de tipo. Se a forma de `consulta` retornada por
`ConsultaService.findByIdInEmpresa` não bater exatamente com `ConsultaComFonte`, ajuste
conforme o erro do compilador.

- [ ] **Step 14: Criar `ConsultaTesteModule` e importar no `AppModule`**

Criar `backend/src/consulta/consulta-teste.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConsultaTesteController } from './consulta-teste.controller';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { AuthModule } from '../auth/auth.module';
import { ConsultaModule } from './consulta.module';
import { TotvsRmModule } from '../totvs-rm/totvs-rm.module';

@Module({
  imports: [AuthModule, ConsultaModule, TotvsRmModule],
  controllers: [ConsultaTesteController],
  providers: [ConsultaSincronizacaoService],
  exports: [ConsultaSincronizacaoService],
})
export class ConsultaTesteModule {}
```

Editar `backend/src/app.module.ts` para importar `ConsultaTesteModule`.

- [ ] **Step 15: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 16: Commit**

```bash
git add backend/src/consulta backend/src/app.module.ts
git commit -m "feat(backend): ConsultaSincronizacaoService — testar consulta contra o RM real, descobrir colunas"
```

---

## Task 7: Sincronização periódica (cron)

**Files:**
- Create: `backend/src/consulta/sync-devida.ts`
- Create: `backend/src/consulta/sync-devida.spec.ts`
- Create: `backend/src/consulta/sync-cron.service.ts`
- Create: `backend/src/consulta/sync-cron.service.spec.ts`
- Create: `backend/src/consulta/sync-cron.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json` (nova dependência `@nestjs/schedule`)

**Interfaces:**
- Consumes: `ConsultaSincronizacaoService.executarSincronizacao` (Task 6).
- Produces: `estaDevida(ultimaSincronizacaoEm: Date | null, intervaloMinutos: number |
  null): boolean`; `SyncCronService.verificarConsultasDevidas()` — roda a cada 5 minutos,
  sem endpoint HTTP.

- [ ] **Step 1: Instalar `@nestjs/schedule`**

```bash
cd backend
npm install @nestjs/schedule
```

- [ ] **Step 2: Escrever o teste de `estaDevida` (falha primeiro)**

Criar `backend/src/consulta/sync-devida.spec.ts`:

```typescript
import { estaDevida } from './sync-devida';

describe('estaDevida', () => {
  it('está devida quando nunca sincronizou', () => {
    expect(estaDevida(null, 60)).toBe(true);
  });

  it('não está devida quando não há intervalo configurado', () => {
    expect(estaDevida(new Date(), null)).toBe(false);
  });

  it('não está devida quando o intervalo ainda não passou', () => {
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60_000);
    expect(estaDevida(cincoMinutosAtras, 60)).toBe(false);
  });

  it('está devida quando o intervalo já passou', () => {
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60_000);
    expect(estaDevida(duasHorasAtras, 60)).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- sync-devida.spec.ts`
Expected: FAIL com "Cannot find module './sync-devida'"

- [ ] **Step 4: Implementar**

Criar `backend/src/consulta/sync-devida.ts`:

```typescript
export function estaDevida(
  ultimaSincronizacaoEm: Date | null,
  intervaloMinutos: number | null,
): boolean {
  if (!ultimaSincronizacaoEm) return true;
  if (!intervaloMinutos) return false;

  const proximaExecucao = new Date(ultimaSincronizacaoEm.getTime() + intervaloMinutos * 60_000);
  return new Date() >= proximaExecucao;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- sync-devida.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Escrever o teste do `SyncCronService` (falha primeiro)**

Criar `backend/src/consulta/sync-cron.service.spec.ts`:

```typescript
import { SyncCronService } from './sync-cron.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';

describe('SyncCronService', () => {
  function buildDeps() {
    const prisma = {
      consultaParametrizada: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const consultaSincronizacaoService = {
      executarSincronizacao: jest
        .fn()
        .mockResolvedValue({ sucesso: true, linhasLidas: 0, colunas: [], amostra: [] }),
    } as unknown as ConsultaSincronizacaoService;
    return { prisma, consultaSincronizacaoService };
  }

  it('sincroniza só as consultas ativas e devidas', async () => {
    const { prisma, consultaSincronizacaoService } = buildDeps();
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([
      { id: 'devida', ultimaSincronizacaoEm: null, intervaloSincronizacaoMinutos: 60 },
      { id: 'nao-devida', ultimaSincronizacaoEm: new Date(), intervaloSincronizacaoMinutos: 60 },
    ]);
    const service = new SyncCronService(prisma, consultaSincronizacaoService);

    await service.verificarConsultasDevidas();

    expect(prisma.consultaParametrizada.findMany).toHaveBeenCalledWith({
      where: { sincronizacaoAtiva: true },
      include: { fonteDeDados: true },
    });
    expect(consultaSincronizacaoService.executarSincronizacao).toHaveBeenCalledTimes(1);
    expect(consultaSincronizacaoService.executarSincronizacao).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'devida' }),
    );
  });

  it('continua para as próximas consultas mesmo se uma falhar inesperadamente', async () => {
    const { prisma, consultaSincronizacaoService } = buildDeps();
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([
      { id: 'quebra', ultimaSincronizacaoEm: null, intervaloSincronizacaoMinutos: 60 },
      { id: 'ok', ultimaSincronizacaoEm: null, intervaloSincronizacaoMinutos: 60 },
    ]);
    (consultaSincronizacaoService.executarSincronizacao as jest.Mock)
      .mockRejectedValueOnce(new Error('erro inesperado'))
      .mockResolvedValueOnce({ sucesso: true, linhasLidas: 0, colunas: [], amostra: [] });
    const service = new SyncCronService(prisma, consultaSincronizacaoService);

    await service.verificarConsultasDevidas();

    expect(consultaSincronizacaoService.executarSincronizacao).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- sync-cron.service.spec.ts`
Expected: FAIL com "Cannot find module './sync-cron.service'"

- [ ] **Step 8: Implementar `SyncCronService`**

Criar `backend/src/consulta/sync-cron.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { estaDevida } from './sync-devida';

@Injectable()
export class SyncCronService {
  private readonly logger = new Logger(SyncCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consultaSincronizacaoService: ConsultaSincronizacaoService,
  ) {}

  @Cron('*/5 * * * *')
  async verificarConsultasDevidas() {
    const consultasAtivas = await this.prisma.consultaParametrizada.findMany({
      where: { sincronizacaoAtiva: true },
      include: { fonteDeDados: true },
    });

    const devidas = consultasAtivas.filter((consulta) =>
      estaDevida(consulta.ultimaSincronizacaoEm, consulta.intervaloSincronizacaoMinutos),
    );

    for (const consulta of devidas) {
      try {
        await this.consultaSincronizacaoService.executarSincronizacao(consulta);
      } catch (erro) {
        this.logger.error(`Falha inesperada ao sincronizar consulta ${consulta.id}`, erro);
      }
    }
  }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- sync-cron.service.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 10: Confirmar que o build compila**

Run: `npm run build`

- [ ] **Step 11: Criar `SyncCronModule` e importar no `AppModule`**

Criar `backend/src/consulta/sync-cron.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncCronService } from './sync-cron.service';
import { ConsultaTesteModule } from './consulta-teste.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConsultaTesteModule],
  providers: [SyncCronService],
})
export class SyncCronModule {}
```

Editar `backend/src/app.module.ts` para importar `SyncCronModule`.

- [ ] **Step 12: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 13: Commit**

```bash
git add backend/src/consulta backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): sincronização periódica de consultas via @nestjs/schedule"
```

---

## Task 8: Anexar/remover Consulta como ferramenta de uma Skill

**Files:**
- Create: `backend/src/skill/ferramenta.controller.ts`
- Create: `backend/src/skill/ferramenta.controller.spec.ts`
- Create: `backend/src/skill/ferramenta.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SkillService.findByIdInEmpresa` (Fase 3), `ConsultaService.findByIdInEmpresa`
  (Task 5), `PrismaService` (`@Global()`, sem precisar importar `PrismaModule`),
  `AuditService` (Fase 1).
- Produces: rotas `POST /skills/:skillId/ferramentas/:consultaId`,
  `DELETE /skills/:skillId/ferramentas/:consultaId`.

- [ ] **Step 1: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/skill/ferramenta.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { FerramentaController } from './ferramenta.controller';
import type { SkillService } from './skill.service';
import type { ConsultaService } from '../consulta/consulta.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FerramentaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  function buildDeps() {
    const skillService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'skill-1' }),
    } as unknown as SkillService;
    const consultaService = { findByIdInEmpresa: jest.fn() } as unknown as ConsultaService;
    const prisma = { skill: { update: jest.fn() } } as unknown as PrismaService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, consultaService, prisma, audit };
  }

  it('anexa uma consulta testada como ferramenta e audita', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: true,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.anexar('skill-1', 'consulta-1');

    expect(prisma.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { ferramentas: { connect: { id: 'consulta-1' } } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'ferramenta_anexada',
      }),
    );
    expect(resultado).toEqual({ skillId: 'skill-1', consultaId: 'consulta-1' });
  });

  it('rejeita anexar uma consulta ainda não testada', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: false,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    await expect(controller.anexar('skill-1', 'consulta-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('remove uma ferramenta e audita', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: true,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.remover('skill-1', 'consulta-1');

    expect(prisma.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { ferramentas: { disconnect: { id: 'consulta-1' } } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'ferramenta_removida' }),
    );
    expect(resultado).toEqual({ skillId: 'skill-1', consultaId: 'consulta-1' });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- ferramenta.controller.spec.ts`
Expected: FAIL com "Cannot find module './ferramenta.controller'"

- [ ] **Step 3: Implementar `FerramentaController`**

Criar `backend/src/skill/ferramenta.controller.ts`:

```typescript
import { BadRequestException, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { ConsultaService } from '../consulta/consulta.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Controller('skills/:skillId/ferramentas')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FerramentaController {
  constructor(
    private readonly skillService: SkillService,
    private readonly consultaService: ConsultaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post(':consultaId')
  async anexar(@Param('skillId') skillId: string, @Param('consultaId') consultaId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    const consulta = await this.consultaService.findByIdInEmpresa(consultaId, empresaId);

    if (!consulta.testada) {
      throw new BadRequestException(
        'A consulta precisa ser testada com sucesso antes de virar ferramenta',
      );
    }

    await this.prisma.skill.update({
      where: { id: skillId },
      data: { ferramentas: { connect: { id: consultaId } } },
    });

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'ferramenta_anexada',
      dadosDepois: { skillId, consultaId },
    });

    return { skillId, consultaId };
  }

  @Delete(':consultaId')
  async remover(@Param('skillId') skillId: string, @Param('consultaId') consultaId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    await this.consultaService.findByIdInEmpresa(consultaId, empresaId);

    await this.prisma.skill.update({
      where: { id: skillId },
      data: { ferramentas: { disconnect: { id: consultaId } } },
    });

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'ferramenta_removida',
      dadosDepois: { skillId, consultaId },
    });

    return { skillId, consultaId };
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- ferramenta.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Criar `FerramentaModule` e importar no `AppModule`**

Criar `backend/src/skill/ferramenta.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FerramentaController } from './ferramenta.controller';
import { AuthModule } from '../auth/auth.module';
import { SkillModule } from './skill.module';
import { ConsultaModule } from '../consulta/consulta.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, SkillModule, ConsultaModule, AuditModule],
  controllers: [FerramentaController],
})
export class FerramentaModule {}
```

Editar `backend/src/app.module.ts` para importar `FerramentaModule`.

- [ ] **Step 6: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 7: Commit**

```bash
git add backend/src/skill/ferramenta.controller.ts backend/src/skill/ferramenta.controller.spec.ts backend/src/skill/ferramenta.module.ts backend/src/app.module.ts
git commit -m "feat(backend): anexar/remover Consulta como ferramenta de uma Skill (auditado)"
```

---

## Task 9: Tool-use loop no `SkillExecucaoController`

**Files:**
- Modify: `backend/src/skill/skill.service.ts`
- Modify: `backend/src/skill/skill.service.spec.ts`
- Modify: `backend/src/chat/anthropic.service.ts`
- Modify: `backend/src/chat/anthropic.service.spec.ts`
- Modify: `backend/src/skill/skill-execucao.controller.ts`
- Modify: `backend/src/skill/skill-execucao.controller.spec.ts`

**Interfaces:**
- Consumes: `construirInputSchemaFerramenta` (Task 5), `ConsultaResultado` via
  `PrismaService` (Task 1).
- Produces: `AnthropicService.createWithTools(params)` (loop de tool-use, API estável
  `client.messages.create`), `AnthropicService.parseStructuredFromHistory(params)`
  (Structured Outputs a partir de um histórico já existente, sem `tools`).

Esta é a task mais arriscada tecnicamente do plano — combina duas chamadas sequenciais à
Messages API (loop de tools, depois saída estruturada) e depende de exatamente como o
SDK tipa `content` blocks de `tool_use`/`tool_result`. Leia a spec completa
(`docs/superpowers/specs/2026-07-26-fontes-de-dados-design.md` §7) antes de implementar.

- [ ] **Step 1: Estender `SkillService.findByIdInEmpresa` para incluir `ferramentas`**

Editar `backend/src/skill/skill.service.ts` — trocar a única linha
`include: { agente: true },` por `include: { agente: true, ferramentas: true },` dentro
de `findByIdInEmpresa`. O arquivo completo deve ficar:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgenteService } from '../agente/agente.service';
import type { CreateSkillDto } from './dto/create-skill.dto';

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenteService: AgenteService,
  ) {}

  async create(agenteId: string, empresaId: string, dto: CreateSkillDto) {
    await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.skill.create({
      data: {
        agenteId,
        nome: dto.nome,
        objetivo: dto.objetivo,
        camposSaida: dto.camposSaida as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByAgente(agenteId: string, empresaId: string) {
    await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.skill.findMany({
      where: { agenteId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(skillId: string, empresaId: string) {
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, agente: { empresaId } },
      include: { agente: true, ferramentas: true },
    });

    if (!skill) {
      throw new NotFoundException('Skill não encontrada');
    }

    return skill;
  }
}
```

- [ ] **Step 2: Atualizar o teste existente da Fase 3 que verifica a forma exata do `include`**

Editar `backend/src/skill/skill.service.spec.ts`: no teste
`'findByIdInEmpresa lança NotFoundException se a skill não existir ou o agente não for
da empresa'`, o `include` esperado passa de `{ agente: true }` para
`{ agente: true, ferramentas: true }`:

```typescript
    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: { id: 'skill-x', agente: { empresaId: 'empresa-1' } },
      include: { agente: true, ferramentas: true },
    });
```

- [ ] **Step 3: Rodar e confirmar que passa**

Run: `npm test -- skill.service.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 4: Adicionar `createWithTools` e `parseStructuredFromHistory` ao `AnthropicService`**

Editar `backend/src/chat/anthropic.service.ts` — mantém `streamReply` e `parseStructured`
intactos, acrescenta os dois métodos novos e os tipos de suporte. Arquivo completo:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';

export interface StreamReplyParams {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model: string;
  maxTokens: number;
}

export interface ParseStructuredParams {
  system: string;
  mensagem: string;
  model: string;
  maxTokens: number;
  schema: z.ZodTypeAny;
}

export interface MensagemConversa {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface FerramentaTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface CreateWithToolsParams {
  system: string;
  messages: MensagemConversa[];
  model: string;
  maxTokens: number;
  tools: FerramentaTool[];
}

export interface ParseStructuredFromHistoryParams {
  system: string;
  messages: MensagemConversa[];
  model: string;
  maxTokens: number;
  schema: z.ZodTypeAny;
}

@Injectable()
export class AnthropicService {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic) {}

  streamReply(params: StreamReplyParams) {
    return this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    });
  }

  async parseStructured(params: ParseStructuredParams) {
    return this.client.messages.parse({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.mensagem }],
      output_config: { format: zodOutputFormat(params.schema) },
    });
  }

  async createWithTools(params: CreateWithToolsParams) {
    return this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
    } as Parameters<typeof this.client.messages.create>[0]);
  }

  async parseStructuredFromHistory(params: ParseStructuredFromHistoryParams) {
    return this.client.messages.parse({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      output_config: { format: zodOutputFormat(params.schema) },
    } as Parameters<typeof this.client.messages.parse>[0]);
  }
}
```

O cast `as Parameters<typeof this.client.messages.create>[0]` (e o equivalente para
`.parse`) evita depender do nome exato do tipo de parâmetro exportado pelo SDK — deixa o
TypeScript validar contra a assinatura real do método sem precisar adivinhar/importar um
tipo específico. Se `messages`/`tools`/o retorno não baterem estruturalmente mesmo com o
cast, ajuste conforme o erro do compilador no Step 13 (build completo).

- [ ] **Step 5: Escrever os testes dos dois métodos novos (falha primeiro)**

Editar `backend/src/chat/anthropic.service.spec.ts` — mantém os dois testes existentes
(`streamReply`, `parseStructured`), acrescenta dois novos no mesmo `describe`. Arquivo
completo:

```typescript
import { z } from 'zod';
import { AnthropicService } from './anthropic.service';
import type Anthropic from '@anthropic-ai/sdk';

describe('AnthropicService', () => {
  it('chama client.messages.stream com os parâmetros corretos', () => {
    const streamFalso = { fake: 'stream' };
    const client = {
      messages: { stream: jest.fn().mockReturnValue(streamFalso) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);

    const resultado = service.streamReply({
      system: 'Você é um assistente de compras.',
      messages: [{ role: 'user', content: 'Oi' }],
      model: 'claude-sonnet-5',
      maxTokens: 4096,
    });

    expect(client.messages.stream).toHaveBeenCalledWith({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: 'Você é um assistente de compras.',
      messages: [{ role: 'user', content: 'Oi' }],
    });
    expect(resultado).toBe(streamFalso);
  });

  it('chama client.messages.parse com os parâmetros corretos', async () => {
    const respostaFalsa = { parsed_output: { titulo: 'ok' }, usage: { input_tokens: 10, output_tokens: 5 } };
    const client = {
      messages: { parse: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const schema = z.object({ titulo: z.string() });

    const resultado = await service.parseStructured({
      system: 'Você é um agente de triagem.',
      mensagem: 'Pedido: 10 parafusos',
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      schema,
    });

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: 'Você é um agente de triagem.',
        messages: [{ role: 'user', content: 'Pedido: 10 parafusos' }],
      }),
    );
    expect(resultado).toBe(respostaFalsa);
  });

  it('createWithTools chama client.messages.create com tools', async () => {
    const respostaFalsa = { stop_reason: 'end_turn', content: [] };
    const client = {
      messages: { create: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const tools = [
      { name: 'consulta_1', description: 'x', input_schema: { type: 'object' as const, properties: {}, required: [] } },
    ];

    const resultado = await service.createWithTools({
      system: 'sys',
      messages: [{ role: 'user', content: 'oi' }],
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      tools,
    });

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: 'sys',
        tools,
      }),
    );
    expect(resultado).toBe(respostaFalsa);
  });

  it('parseStructuredFromHistory chama client.messages.parse com o histórico completo', async () => {
    const respostaFalsa = { parsed_output: { titulo: 'ok' }, usage: { input_tokens: 20, output_tokens: 8 } };
    const client = {
      messages: { parse: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const schema = z.object({ titulo: z.string() });
    const historico = [
      { role: 'user' as const, content: 'oi' },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'ok' }] },
    ];

    const resultado = await service.parseStructuredFromHistory({
      system: 'sys',
      messages: historico,
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      schema,
    });

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'sys', messages: historico }),
    );
    expect(resultado).toBe(respostaFalsa);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha, depois passa**

Run: `npm test -- anthropic.service.spec.ts`
Expected: FAIL primeiro ("createWithTools is not a function"), depois PASS (4 testes)
após o Step 4.

- [ ] **Step 7-8: Substituir todo o conteúdo do teste do controller (falha primeiro)**

O `skill.ferramentas` agora sempre existe (array, possivelmente vazio) na skill
retornada por `findByIdInEmpresa`, e o construtor de `SkillExecucaoController` ganha um
novo parâmetro `prisma`. Substituir **todo o conteúdo** de
`backend/src/skill/skill-execucao.controller.spec.ts` (os três testes da Fase 3
continuam, só ganham `ferramentas: []` na fixture e o novo argumento `prisma`; um quarto
teste novo cobre o caminho com ferramentas):

```typescript
import { UnprocessableEntityException } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import type { SkillService } from './skill.service';
import type { SkillExecucaoService } from './skill-execucao.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillExecucaoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const skillComAgente = {
    id: 'skill-1',
    agenteId: 'agente-1',
    objetivo: 'Triar solicitações',
    camposSaida: [{ nome: 'titulo', tipo: 'string', obrigatorio: true }],
    ferramentas: [] as { id: string; nome: string; camposFiltro: unknown }[],
    agente: {
      id: 'agente-1',
      moduloId: 'modulo-1',
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
      modeloIA: 'claude-sonnet-5',
    },
  };

  const skillComFerramenta = {
    ...skillComAgente,
    ferramentas: [
      {
        id: 'consulta-1',
        nome: 'Saldo de estoque',
        camposFiltro: [{ nome: 'codProduto', tipo: 'string', obrigatorio: true }],
      },
    ],
  };

  function buildPrismaVazio(): PrismaService {
    return {
      consultaResultado: { findMany: jest.fn() },
    } as unknown as PrismaService;
  }

  function buildDeps() {
    const skillService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue(skillComAgente),
    } as unknown as SkillService;
    const skillExecucaoService = {
      appendExecucao: jest.fn().mockResolvedValue({
        id: 'execucao-1',
        saida: { titulo: 'ok' },
        tokensEntrada: 10,
        tokensSaida: 5,
      }),
      listBySkill: jest.fn().mockResolvedValue([]),
    } as unknown as SkillExecucaoService;
    const anthropicService = {
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: { titulo: 'ok' },
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      createWithTools: jest.fn(),
      parseStructuredFromHistory: jest.fn(),
    } as unknown as AnthropicService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, skillExecucaoService, anthropicService, audit };
  }

  it('executa a skill, persiste a execução e audita', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', { entrada: 'Pedido: 10 parafusos' });

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith('skill-1', 'empresa-1');
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: 'Pedido: 10 parafusos', model: 'claude-sonnet-5' }),
    );
    expect(skillExecucaoService.appendExecucao).toHaveBeenCalledWith(
      'skill-1',
      'usuario-1',
      'Pedido: 10 parafusos',
      { titulo: 'ok' },
      10,
      5,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresa-1', atorUsuarioId: 'usuario-1', acao: 'skill_execucao' }),
    );
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });

  it('lança erro e não persiste quando a saída não bate com o schema (parsed_output nulo)', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    await expect(controller.executar('skill-1', { entrada: 'Pedido' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(skillExecucaoService.appendExecucao).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lista execuções da skill, validando que ela pertence à empresa do tenant', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (skillExecucaoService.listBySkill as jest.Mock).mockResolvedValue([{ id: 'execucao-1' }]);
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    const resultado = await controller.listar('skill-1');

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith('skill-1', 'empresa-1');
    expect(skillExecucaoService.listBySkill).toHaveBeenCalledWith('skill-1');
    expect(resultado).toEqual([{ id: 'execucao-1' }]);
  });

  it('roda o loop de tool-use e usa dados locais (nunca chama o RM) quando a skill tem ferramentas', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (skillService.findByIdInEmpresa as jest.Mock).mockResolvedValue(skillComFerramenta);
    (anthropicService.createWithTools as jest.Mock)
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'consulta_consulta-1', input: { codProduto: 'X1' } },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    (anthropicService.parseStructuredFromHistory as jest.Mock).mockResolvedValue({
      parsed_output: { titulo: 'ok' },
      usage: { input_tokens: 30, output_tokens: 10 },
    });
    const prisma = {
      consultaResultado: {
        findMany: jest.fn().mockResolvedValue([{ dados: { codProduto: 'X1', saldo: 42 } }]),
      },
    } as unknown as PrismaService;
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      prisma,
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', { entrada: 'Qual o saldo do produto X1?' });

    expect(anthropicService.createWithTools).toHaveBeenCalledTimes(2);
    expect(prisma.consultaResultado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ consultaParametrizadaId: 'consulta-1' }),
      }),
    );
    expect(anthropicService.parseStructuredFromHistory).toHaveBeenCalled();
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });
});
```

Nota: o `resultado` esperado no quarto teste reaproveita o mock padrão de
`skillExecucaoService.appendExecucao` definido em `buildDeps()` (que devolve sempre
`{ id: 'execucao-1', saida: { titulo: 'ok' }, tokensEntrada: 10, tokensSaida: 5 }`
independente do que `parseStructuredFromHistory` retornou) — é intencional, não precisa
bater com os valores de `usage` do mock de `parseStructuredFromHistory`.

- [ ] **Step 9: Rodar e confirmar que falha**

Run: `npm test -- skill-execucao.controller.spec.ts`
Expected: FAIL (assinatura do construtor ainda não aceita `prisma`, `createWithTools`
não existe no controller)

- [ ] **Step 10: Reescrever `SkillExecucaoController` com o loop de tool-use**

Substituir todo o conteúdo de `backend/src/skill/skill-execucao.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { AnthropicService, type MensagemConversa } from '../chat/anthropic.service';
import { AuditService } from '../audit/audit.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
import { construirInputSchemaFerramenta } from '../consulta/tool-schema-builder';
import type { ExecutarSkillDto } from './dto/executar-skill.dto';

function montarSystemPrompt(
  agente: { nome: string; funcao: string; objetivo: string },
  skill: { objetivo: string },
): string {
  return [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a skill com o seguinte objetivo: ${skill.objetivo}`,
  ].join('\n\n');
}

function nomeFerramenta(consultaId: string): string {
  return `consulta_${consultaId}`;
}

function consultaIdDaFerramenta(nome: string): string {
  return nome.replace('consulta_', '');
}

const MAX_ITERACOES_TOOL_USE = 5;

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async listar(@Param('skillId') skillId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    return this.skillExecucaoService.listBySkill(skillId);
  }

  @Post()
  async executar(@Param('skillId') skillId: string, @Body() body: ExecutarSkillDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const skill = await this.skillService.findByIdInEmpresa(skillId, empresaId);

    const schema = construirSchemaSaida(skill.camposSaida as unknown as CampoSaida[]);
    const system = montarSystemPrompt(skill.agente, skill);

    const response =
      skill.ferramentas.length === 0
        ? await this.anthropicService.parseStructured({
            system,
            mensagem: body.entrada,
            model: skill.agente.modeloIA,
            maxTokens: 4096,
            schema,
          })
        : await this.executarComFerramentas(skill, system, body.entrada, schema);

    if (!response.parsed_output) {
      throw new UnprocessableEntityException(
        'A resposta do agente não pôde ser validada contra o schema da skill',
      );
    }

    const execucao = await this.skillExecucaoService.appendExecucao(
      skillId,
      usuarioId,
      body.entrada,
      response.parsed_output,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_execucao',
      dadosDepois: {
        skillId,
        agenteId: skill.agenteId,
        moduloId: skill.agente.moduloId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
        modelo: skill.agente.modeloIA,
      },
    });

    return {
      execucaoId: execucao.id,
      saida: execucao.saida,
      tokensEntrada: execucao.tokensEntrada,
      tokensSaida: execucao.tokensSaida,
    };
  }

  private async executarComFerramentas(
    skill: {
      ferramentas: { id: string; nome: string; camposFiltro: unknown }[];
      agente: { modeloIA: string };
    },
    system: string,
    entrada: string,
    schema: ReturnType<typeof construirSchemaSaida>,
  ) {
    const tools = skill.ferramentas.map((ferramenta) => ({
      name: nomeFerramenta(ferramenta.id),
      description: `Consulta "${ferramenta.nome}" com dados sincronizados do TOTVS RM.`,
      input_schema: construirInputSchemaFerramenta(ferramenta.camposFiltro as unknown as CampoSaida[]),
    }));

    let mensagens: MensagemConversa[] = [{ role: 'user', content: entrada }];

    for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_USE; iteracao++) {
      const resposta = await this.anthropicService.createWithTools({
        system,
        messages: mensagens,
        model: skill.agente.modeloIA,
        maxTokens: 4096,
        tools,
      });

      mensagens = [...mensagens, { role: 'assistant', content: resposta.content }];

      if (resposta.stop_reason !== 'tool_use') {
        break;
      }

      const blocosDeTool = (resposta.content as Array<Record<string, unknown>>).filter(
        (bloco) => bloco.type === 'tool_use',
      );

      const resultadosDeTool = await Promise.all(
        blocosDeTool.map(async (bloco) => {
          const consultaId = consultaIdDaFerramenta(bloco.name as string);
          const linhas = await this.buscarDadosLocais(consultaId, bloco.input as Record<string, unknown>);
          return {
            type: 'tool_result',
            tool_use_id: bloco.id as string,
            content: JSON.stringify(linhas),
          };
        }),
      );

      mensagens = [...mensagens, { role: 'user', content: resultadosDeTool }];
    }

    return this.anthropicService.parseStructuredFromHistory({
      system,
      messages: mensagens,
      model: skill.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });
  }

  private async buscarDadosLocais(
    consultaId: string,
    filtro: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const filtros = Object.entries(filtro).map(([chave, valor]) => ({
      dados: { path: [chave], equals: valor },
    }));

    const linhas = await this.prisma.consultaResultado.findMany({
      where: { consultaParametrizadaId: consultaId, AND: filtros },
      take: 20,
    });

    return linhas.map((linha) => linha.dados as Record<string, unknown>);
  }
}
```

Se a forma real de `resposta.content` (blocos `tool_use`) ou do parâmetro `tools`/
`messages` de `client.messages.create` divergir do uso acima, ou se o filtro
`{ dados: { path: [...], equals: ... } }` do Prisma não bater com a versão instalada,
ajuste conforme o erro do compilador no Step 13 — não adivinhe, deixe o TypeScript e o
teste manual (Step 14) apontarem a diferença exata.

- [ ] **Step 11: Rodar e confirmar que passa**

Run: `npm test -- skill-execucao.controller.spec.ts`
Expected: PASS (4 testes: 3 já existentes da Fase 3 + o novo de tool-use)

- [ ] **Step 12: Rodar a suíte completa**

Run: `npm test`

- [ ] **Step 13: Confirmar que o build compila**

Run: `npm run build`
Expected: sem erros de tipo. Este é o ponto mais provável de precisar ajuste manual
guiado pelo compilador nesta fase inteira — reserve tempo para isso.

- [ ] **Step 14: Verificação manual real**

Com o backend rodando (`PORT=3001 npm run start:dev`) e usando o fluxo já testado
manualmente nas Tasks 3, 5 e 6 (módulo, agente, skill, fonte de dados, consulta
testada), anexe a consulta como ferramenta da skill
(`POST /skills/<skillId>/ferramentas/<consultaId>`) e execute a skill com uma entrada
que exija o dado sincronizado. Confirme que a resposta final reflete um valor real
vindo de `ConsultaResultado` (não uma alucinação nem uma chamada ao RM durante a
execução — o RM só é chamado pelo cron/teste, nunca aqui).

- [ ] **Step 15: Commit**

```bash
git add backend/src/skill backend/src/chat/anthropic.service.ts backend/src/chat/anthropic.service.spec.ts
git commit -m "feat(backend): loop de tool-use no SkillExecucaoController — Skills usam Consultas como ferramentas reais"
```

---

## Task 10: E2E — fluxo de Fontes de Dados, isolamento, e (se disponível) RM real

**Files:**
- Create: `backend/test/fonte-de-dados.e2e-spec.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `AppModule` completo (Tasks 1-9).
- Produces: prova automatizada de isolamento entre tenants (sempre roda) e, quando
  credenciais reais de TOTVS RM de teste estiverem configuradas, prova real de ponta a
  ponta (sincroniza, executa a skill via tool-use, confirma dado real).

**Diferente das Tasks 6 da Fase 2 e da Fase 3**, este e2e não pode assumir que uma
instância real do TOTVS RM está sempre acessível — ao contrário da Anthropic (já
configurada desde a Fase 2) e do Supabase (Fase 1), não há garantia de que exista um RM
de teste disponível neste ambiente. Siga o mesmo padrão já usado por
`src/prisma/prisma.smoke.spec.ts` (documentado no `CLAUDE.md`): a parte que depende do
RM real **pula automaticamente** (via `it.skip` condicional) quando as variáveis de
ambiente de teste não estão configuradas — nunca fabrique um "sucesso" nem falhe
silenciosamente. A parte de isolamento entre tenants não depende do RM e sempre roda.

- [ ] **Step 1: Adicionar variáveis de ambiente opcionais de teste a `backend/.env.example`**

```
# Opcional — só necessário para rodar a parte do e2e da Fase 4 que depende de um TOTVS
# RM real (backend/test/fonte-de-dados.e2e-spec.ts). Sem essas variáveis, esse bloco do
# teste pula automaticamente (mesmo padrão do smoke test do Prisma).
# TOTVS_RM_TEST_SERVER_URL=http://servidor-de-teste:8051
# TOTVS_RM_TEST_USERNAME=usuario-de-teste
# TOTVS_RM_TEST_PASSWORD=senha-de-teste
# TOTVS_RM_TEST_COD_SISTEMA=T
# TOTVS_RM_TEST_COD_COLIGADA=1
# TOTVS_RM_TEST_COD_SENTENCA=NOME_DA_SENTENCA_JA_CADASTRADA_NO_RM
```

Se você tiver acesso a um TOTVS RM de teste real, adicione os valores reais em
`backend/.env.local` (gitignorado) antes deste passo — sem reexibir os valores. Se não
tiver, prossiga sem eles: o teste vai pular essa parte automaticamente, e isso é
esperado, não um erro a corrigir.

- [ ] **Step 2: Escrever o teste**

Criar `backend/test/fonte-de-dados.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestUser, deleteTestUser, signInTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(30000);

const TEM_CREDENCIAIS_RM_DE_TESTE = Boolean(
  process.env.TOTVS_RM_TEST_SERVER_URL &&
    process.env.TOTVS_RM_TEST_USERNAME &&
    process.env.TOTVS_RM_TEST_PASSWORD &&
    process.env.TOTVS_RM_TEST_COD_SISTEMA &&
    process.env.TOTVS_RM_TEST_COD_COLIGADA &&
    process.env.TOTVS_RM_TEST_COD_SENTENCA,
);

describe('Fontes de Dados (isolamento entre tenants + fluxo real quando o RM de teste está configurado)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const authUserIdsParaLimpar: string[] = [];
  const empresaIdsParaLimpar: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma.consultaResultado.deleteMany({
        where: { consulta: { fonteDeDados: { empresaId: { in: empresaIdsParaLimpar } } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar resultados de teste', erro);
    }
    try {
      await prisma.consultaParametrizada.deleteMany({
        where: { fonteDeDados: { empresaId: { in: empresaIdsParaLimpar } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar consultas de teste', erro);
    }
    try {
      await prisma.fonteDeDados.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar fontes de dados de teste', erro);
    }
    try {
      await prisma.modulo.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar módulos de teste', erro);
    }
    try {
      await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar vínculos usuário-empresa de teste', erro);
    }
    try {
      await prisma.usuario.deleteMany({ where: { supabaseUserId: { in: authUserIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar usuários de teste', erro);
    }
    try {
      await prisma.empresa.deleteMany({ where: { id: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar empresas de teste', erro);
    }

    await Promise.allSettled(authUserIdsParaLimpar.map((userId) => deleteTestUser(userId)));
    await app.close();
  });

  async function criarEmpresaComUsuarioLogado(nomeEmpresa: string, email: string) {
    const empresa = await prisma.empresa.create({ data: { nome: nomeEmpresa } });
    empresaIdsParaLimpar.push(empresa.id);

    const password = 'TesteFase4!23';
    const authUser = await createTestUser(email, password);
    authUserIdsParaLimpar.push(authUser.id);

    await provisionUsuarioParaEmpresa(prisma, {
      supabaseUserId: authUser.id,
      nome: email.split('@')[0],
      email,
      empresaId: empresa.id,
      perfil: 'admin',
    });

    const accessToken = await signInTestUser(email, password);
    return { empresa, accessToken };
  }

  it('cria fonte de dados/consulta reais, nunca expõe a senha, e isola entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado(
      'E2E FonteDeDados Empresa A',
      `e2e-fonte-a-${sufixo}@corepilot.dev`,
    );
    const empresaB = await criarEmpresaComUsuarioLogado(
      'E2E FonteDeDados Empresa B',
      `e2e-fonte-b-${sufixo}@corepilot.dev`,
    );

    const fonteResposta = await request(app.getHttpServer())
      .post('/fontes-de-dados')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        tipo: 'totvs_rm',
        nome: 'RM Teste',
        serverUrl: 'http://servidor-fake:8051',
        username: 'admin',
        senha: 'segredo-e2e',
        codSistema: 'T',
        codColigada: '1',
      })
      .expect(201);
    const fonteDeDadosId = fonteResposta.body.id as string;

    expect(fonteResposta.body.configuracao).not.toHaveProperty('senhaCriptografada');
    expect(fonteResposta.body.configuracao).not.toHaveProperty('senha');

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Estoque', objetivo: 'Consultas de estoque' })
      .expect(201);
    const moduloId = moduloResposta.body.id as string;

    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/consultas`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        fonteDeDadosId,
        nome: 'Saldo de estoque',
        codSentenca: 'SALDOESTOQUEINSU',
        parametrosSincronizacao: { CODFILIAL: '001' },
        camposFiltro: [{ nome: 'codProduto', tipo: 'string', obrigatorio: true }],
      })
      .expect(201);

    // Isolamento: empresa B não consegue criar consulta usando a fonte de dados da empresa A
    const moduloRespostaB = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ nome: 'Estoque B', objetivo: 'Estoque da empresa B' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/modulos/${moduloRespostaB.body.id}/consultas`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({
        fonteDeDadosId,
        nome: 'X',
        codSentenca: 'Y',
        parametrosSincronizacao: {},
        camposFiltro: [],
      })
      .expect(404);

    // Isolamento: empresa B não vê a fonte de dados da empresa A na listagem
    const listaFontesB = await request(app.getHttpServer())
      .get('/fontes-de-dados')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect((listaFontesB.body as Array<{ id: string }>).some((f) => f.id === fonteDeDadosId)).toBe(
      false,
    );
  });

  (TEM_CREDENCIAIS_RM_DE_TESTE ? it : it.skip)(
    'testa a consulta contra o TOTVS RM real, sincroniza, e a skill usa os dados locais via tool-use',
    async () => {
      const sufixo = Date.now();
      const empresa = await criarEmpresaComUsuarioLogado(
        'E2E FonteDeDados RM Real',
        `e2e-fonte-rm-${sufixo}@corepilot.dev`,
      );

      const fonteResposta = await request(app.getHttpServer())
        .post('/fontes-de-dados')
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({
          tipo: 'totvs_rm',
          nome: 'RM Real de Teste',
          serverUrl: process.env.TOTVS_RM_TEST_SERVER_URL,
          username: process.env.TOTVS_RM_TEST_USERNAME,
          senha: process.env.TOTVS_RM_TEST_PASSWORD,
          codSistema: process.env.TOTVS_RM_TEST_COD_SISTEMA,
          codColigada: process.env.TOTVS_RM_TEST_COD_COLIGADA,
        })
        .expect(201);

      const moduloResposta = await request(app.getHttpServer())
        .post('/modulos')
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({ nome: 'Estoque RM', objetivo: 'Consultas reais de estoque' })
        .expect(201);

      const consultaResposta = await request(app.getHttpServer())
        .post(`/modulos/${moduloResposta.body.id}/consultas`)
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({
          fonteDeDadosId: fonteResposta.body.id,
          nome: 'Consulta de teste real',
          codSentenca: process.env.TOTVS_RM_TEST_COD_SENTENCA,
          parametrosSincronizacao: {},
          camposFiltro: [],
        })
        .expect(201);
      const consultaId = consultaResposta.body.id as string;

      const testeResposta = await request(app.getHttpServer())
        .post(`/consultas/${consultaId}/testar`)
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .expect(201);

      expect(testeResposta.body.sucesso).toBe(true);

      const resultadosSalvos = await prisma.consultaResultado.findMany({
        where: { consultaParametrizadaId: consultaId },
      });
      expect(resultadosSalvos.length).toBeGreaterThan(0);
    },
  );
});
```

- [ ] **Step 3: Rodar e confirmar o comportamento**

Run: `npm run test:e2e -- fonte-de-dados.e2e-spec.ts`
Expected: o primeiro teste (isolamento) sempre PASS. O segundo teste (RM real) mostra
`skipped` se as variáveis `TOTVS_RM_TEST_*` não estiverem em `.env.local` — isso é
esperado, não uma falha a investigar. Se as variáveis estiverem configuradas, o segundo
teste também deve PASS; se falhar, o erro deve vir do RM real (mensagem de negócio ou
rede), não de um bug óbvio de implementação — nesse caso, pare e reporte antes de seguir.

- [ ] **Step 4: Rodar a suíte e2e completa**

Run: `npm run test:e2e`
Expected: PASS (inclui `app.e2e-spec.ts`, `me.e2e-spec.ts`, `chat.e2e-spec.ts`,
`skill.e2e-spec.ts` das fases anteriores, e este novo).

- [ ] **Step 5: Commit**

```bash
git add backend/test/fonte-de-dados.e2e-spec.ts backend/.env.example
git commit -m "test(backend): e2e cobre isolamento de Fontes de Dados e fluxo real quando RM de teste está configurado"
```

---

## Task 11: Frontend — Fontes de Dados (empresa) e Consultas Parametrizadas (módulo)

**Files:**
- Create: `frontend/src/corepilot/fontes-de-dados/types.ts`
- Create: `frontend/src/corepilot/fontes-de-dados/api.ts`
- Create: `frontend/src/corepilot/fontes-de-dados/FontesDeDadosList.tsx`
- Create: `frontend/src/corepilot/fontes-de-dados/CriarFonteDeDadosForm.tsx`
- Create: `frontend/src/corepilot/consultas/types.ts`
- Create: `frontend/src/corepilot/consultas/api.ts`
- Create: `frontend/src/corepilot/consultas/ConsultasList.tsx`
- Create: `frontend/src/corepilot/consultas/CriarConsultaForm.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Fase 1), `CampoSaida`/`TipoCampoSaida` (Fase 3,
  `../agentes/types`, reaproveitados para `camposFiltro`).
- Produces: `<FontesDeDadosList accessToken />`, `<ConsultasList accessToken moduloId
  />` — consumidos pela Task 12.

- [ ] **Step 1: Tipos e API de Fontes de Dados**

Criar `frontend/src/corepilot/fontes-de-dados/types.ts`:

```typescript
export interface FonteDeDados {
  id: string;
  tipo: string;
  nome: string;
  configuracao: {
    serverUrl: string;
    username: string;
    codSistema: string;
    codColigada: string;
  };
  ultimoTesteEm: string | null;
  ultimoTesteSucesso: boolean | null;
  ultimaMensagemErro: string | null;
  criadoEm: string;
}
```

Criar `frontend/src/corepilot/fontes-de-dados/api.ts`:

```typescript
import { apiFetch } from '../api/apiFetch';
import type { FonteDeDados } from './types';

export interface CriarFonteDeDadosDto {
  tipo: string;
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export async function listarFontesDeDados(accessToken: string): Promise<FonteDeDados[]> {
  const response = await apiFetch('/fontes-de-dados', accessToken);
  if (!response.ok) throw new Error(`Falha ao listar fontes de dados (status ${response.status})`);
  return (await response.json()) as FonteDeDados[];
}

export async function criarFonteDeDados(
  accessToken: string,
  dto: CriarFonteDeDadosDto,
): Promise<FonteDeDados> {
  const response = await apiFetch('/fontes-de-dados', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar fonte de dados (status ${response.status})`);
  return (await response.json()) as FonteDeDados;
}
```

- [ ] **Step 2: Formulário de criação (revelação progressiva + banner de segurança)**

Criar `frontend/src/corepilot/fontes-de-dados/CriarFonteDeDadosForm.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { criarFonteDeDados } from './api';
import type { FonteDeDados } from './types';

interface CriarFonteDeDadosFormProps {
  accessToken: string;
  onCriada: (fonte: FonteDeDados) => void;
  onCancelar: () => void;
}

export function CriarFonteDeDadosForm({ accessToken, onCriada, onCancelar }: CriarFonteDeDadosFormProps) {
  const [tipo, setTipo] = useState('');
  const [nome, setNome] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [codSistema, setCodSistema] = useState('');
  const [codColigada, setCodColigada] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const fonte = await criarFonteDeDados(accessToken, {
        tipo,
        nome,
        serverUrl,
        username,
        senha,
        codSistema,
        codColigada,
      });
      onCriada(fonte);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar fonte de dados');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <div
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d060',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12,
        }}
      >
        Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco
      </div>
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} required>
        <option value="">Selecione o tipo de fonte</option>
        <option value="totvs_rm">TOTVS RM</option>
      </select>

      {tipo && (
        <>
          <input
            type="text"
            placeholder="Nome da conexão"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Servidor (ex: http://servidor:8051)"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Código do sistema"
            value={codSistema}
            onChange={(e) => setCodSistema(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Código da coligada"
            value={codColigada}
            onChange={(e) => setCodColigada(e.target.value)}
            required
          />
        </>
      )}

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando || !tipo}>
          {enviando ? 'Salvando...' : 'Conectar'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Lista de Fontes de Dados com badge de status**

Criar `frontend/src/corepilot/fontes-de-dados/FontesDeDadosList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { listarFontesDeDados } from './api';
import { CriarFonteDeDadosForm } from './CriarFonteDeDadosForm';
import type { FonteDeDados } from './types';

interface FontesDeDadosListProps {
  accessToken: string;
}

function badge(fonte: FonteDeDados): { texto: string; cor: string } {
  if (fonte.ultimoTesteSucesso === true) {
    return { texto: `Conectada · ${fonte.ultimoTesteEm}`, cor: 'green' };
  }
  if (fonte.ultimoTesteSucesso === false) {
    return { texto: `Erro: ${fonte.ultimaMensagemErro}`, cor: 'crimson' };
  }
  return { texto: 'Salva, não testada', cor: '#b8860b' };
}

export function FontesDeDadosList({ accessToken }: FontesDeDadosListProps) {
  const [fontes, setFontes] = useState<FonteDeDados[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarFontesDeDados(accessToken)
      .then(setFontes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!fontes) return <div>Carregando fontes de dados…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3>Fontes de dados</h3>
      {fontes.length === 0 && <div>Nenhuma fonte de dados ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fontes.map((fonte) => {
          const { texto, cor } = badge(fonte);
          return (
            <li key={fonte.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <strong>{fonte.nome}</strong> ({fonte.tipo})
              <div style={{ fontSize: 12, color: cor }}>{texto}</div>
            </li>
          );
        })}
      </ul>
      {mostrandoForm ? (
        <CriarFonteDeDadosForm
          accessToken={accessToken}
          onCriada={(fonte) => {
            setMostrandoForm(false);
            setFontes((atual) => [fonte, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Conectar fonte de dados</button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Tipos e API de Consultas Parametrizadas**

Criar `frontend/src/corepilot/consultas/types.ts`:

```typescript
import type { CampoSaida } from '../agentes/types';

export interface ColunaDescrita {
  nomeTecnico: string;
  descricao: string | null;
}

export interface Consulta {
  id: string;
  moduloId: string;
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
  colunas: ColunaDescrita[] | null;
  testada: boolean;
  sincronizacaoAtiva: boolean;
  intervaloSincronizacaoMinutos: number | null;
  ultimaSincronizacaoEm: string | null;
  ultimoResultadoSincronizacao: { sucesso: boolean; linhasLidas?: number; erro?: string } | null;
  criadoEm: string;
}

export interface ResultadoTeste {
  sucesso: boolean;
  linhasLidas?: number;
  colunas?: ColunaDescrita[];
  amostra?: Record<string, unknown>[];
  erro?: string;
}
```

Criar `frontend/src/corepilot/consultas/api.ts`:

```typescript
import { apiFetch } from '../api/apiFetch';
import type { CampoSaida } from '../agentes/types';
import type { Consulta, ResultadoTeste } from './types';

export interface CriarConsultaDto {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
}

export async function listarConsultas(accessToken: string, moduloId: string): Promise<Consulta[]> {
  const response = await apiFetch(`/modulos/${moduloId}/consultas`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar consultas (status ${response.status})`);
  return (await response.json()) as Consulta[];
}

export async function criarConsulta(
  accessToken: string,
  moduloId: string,
  dto: CriarConsultaDto,
): Promise<Consulta> {
  const response = await apiFetch(`/modulos/${moduloId}/consultas`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar consulta (status ${response.status})`);
  return (await response.json()) as Consulta;
}

export async function testarConsulta(accessToken: string, consultaId: string): Promise<ResultadoTeste> {
  const response = await apiFetch(`/consultas/${consultaId}/testar`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao testar consulta (status ${response.status})`);
  return (await response.json()) as ResultadoTeste;
}

export async function atualizarSincronizacao(
  accessToken: string,
  consultaId: string,
  ativa: boolean,
  intervaloMinutos?: number,
): Promise<Consulta> {
  const response = await apiFetch(`/consultas/${consultaId}/sincronizacao`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativa, intervaloMinutos }),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar sincronização (status ${response.status})`);
  return (await response.json()) as Consulta;
}
```

- [ ] **Step 5: Formulário de criação de Consulta (parâmetros fixos + campos de filtro)**

Criar `frontend/src/corepilot/consultas/CriarConsultaForm.tsx`:

```typescript
import { useEffect, useState, type FormEvent } from 'react';
import { criarConsulta } from './api';
import { listarFontesDeDados } from '../fontes-de-dados/api';
import type { FonteDeDados } from '../fontes-de-dados/types';
import type { CampoSaida, TipoCampoSaida } from '../agentes/types';
import type { Consulta } from './types';

interface CriarConsultaFormProps {
  accessToken: string;
  moduloId: string;
  onCriada: (consulta: Consulta) => void;
  onCancelar: () => void;
}

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

function novoCampo(): CampoSaida {
  return { nome: '', tipo: 'string', descricao: '', obrigatorio: true };
}

function novoParametro() {
  return { chave: '', valor: '' };
}

export function CriarConsultaForm({ accessToken, moduloId, onCriada, onCancelar }: CriarConsultaFormProps) {
  const [fontes, setFontes] = useState<FonteDeDados[]>([]);
  const [fonteDeDadosId, setFonteDeDadosId] = useState('');
  const [nome, setNome] = useState('');
  const [codSentenca, setCodSentenca] = useState('');
  const [parametros, setParametros] = useState([novoParametro()]);
  const [campos, setCampos] = useState<CampoSaida[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarFontesDeDados(accessToken)
      .then(setFontes)
      .catch(() => setFontes([]));
  }, [accessToken]);

  function atualizarParametro(indice: number, parcial: Partial<{ chave: string; valor: string }>) {
    setParametros((atual) => atual.map((p, i) => (i === indice ? { ...p, ...parcial } : p)));
  }

  function atualizarCampo(indice: number, parcial: Partial<CampoSaida>) {
    setCampos((atual) => atual.map((c, i) => (i === indice ? { ...c, ...parcial } : c)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const parametrosSincronizacao = Object.fromEntries(
        parametros.filter((p) => p.chave.trim()).map((p) => [p.chave, p.valor]),
      );

      const consulta = await criarConsulta(accessToken, moduloId, {
        fonteDeDadosId,
        nome,
        codSentenca,
        parametrosSincronizacao,
        camposFiltro: campos,
      });
      onCriada(consulta);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar consulta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <select value={fonteDeDadosId} onChange={(e) => setFonteDeDadosId(e.target.value)} required>
        <option value="">Selecione a fonte de dados</option>
        {fontes.map((fonte) => (
          <option key={fonte.id} value={fonte.id}>
            {fonte.nome}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Nome de exibição"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Nome da consulta cadastrada no RM (codSentenca)"
        value={codSentenca}
        onChange={(e) => setCodSentenca(e.target.value)}
        required
      />

      <div style={{ fontWeight: 600, marginTop: 8 }}>Parâmetros de sincronização (fixos)</div>
      {parametros.map((parametro, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="chave (ex: CODFILIAL)"
            value={parametro.chave}
            onChange={(e) => atualizarParametro(indice, { chave: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            placeholder="valor"
            value={parametro.valor}
            onChange={(e) => atualizarParametro(indice, { valor: e.target.value })}
            style={{ flex: 1 }}
          />
        </div>
      ))}
      <button type="button" onClick={() => setParametros((atual) => [...atual, novoParametro()])}>
        + Adicionar parâmetro
      </button>

      <div style={{ fontWeight: 600, marginTop: 8 }}>Campos de filtro (o que o agente pode informar)</div>
      {campos.map((campo, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="nome do campo"
            value={campo.nome}
            onChange={(e) => atualizarCampo(indice, { nome: e.target.value })}
            style={{ flex: 1 }}
          />
          <select
            value={campo.tipo}
            onChange={(e) => atualizarCampo(indice, { tipo: e.target.value as TipoCampoSaida })}
          >
            {TIPOS_CAMPO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={campo.obrigatorio}
              onChange={(e) => atualizarCampo(indice, { obrigatorio: e.target.checked })}
            />
            obrigatório
          </label>
          <button
            type="button"
            onClick={() => setCampos((atual) => atual.filter((_, i) => i !== indice))}
          >
            remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setCampos((atual) => [...atual, novoCampo()])}>
        + Adicionar campo de filtro
      </button>

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando || !fonteDeDadosId}>
          {enviando ? 'Criando...' : 'Criar consulta'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Lista de Consultas (testar, dicionário de campos, toggle de sincronização)**

Criar `frontend/src/corepilot/consultas/ConsultasList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { atualizarSincronizacao, listarConsultas, testarConsulta } from './api';
import { CriarConsultaForm } from './CriarConsultaForm';
import type { Consulta, ResultadoTeste } from './types';

interface ConsultasListProps {
  accessToken: string;
  moduloId: string;
}

export function ConsultasList({ accessToken, moduloId }: ConsultasListProps) {
  const [consultas, setConsultas] = useState<Consulta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [resultadosTeste, setResultadosTeste] = useState<Record<string, ResultadoTeste>>({});
  const [testando, setTestando] = useState<string | null>(null);

  useEffect(() => {
    listarConsultas(accessToken, moduloId)
      .then(setConsultas)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, moduloId]);

  async function handleTestar(consultaId: string) {
    setTestando(consultaId);
    try {
      const resultado = await testarConsulta(accessToken, consultaId);
      setResultadosTeste((atual) => ({ ...atual, [consultaId]: resultado }));
      const atualizadas = await listarConsultas(accessToken, moduloId);
      setConsultas(atualizadas);
    } catch (err) {
      setResultadosTeste((atual) => ({
        ...atual,
        [consultaId]: { sucesso: false, erro: err instanceof Error ? err.message : 'Erro ao testar' },
      }));
    } finally {
      setTestando(null);
    }
  }

  async function handleToggleSync(consulta: Consulta) {
    const atualizada = await atualizarSincronizacao(
      accessToken,
      consulta.id,
      !consulta.sincronizacaoAtiva,
      consulta.intervaloSincronizacaoMinutos ?? 60,
    );
    setConsultas((atual) => (atual ?? []).map((c) => (c.id === atualizada.id ? atualizada : c)));
  }

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!consultas) return <div>Carregando consultas…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h4>Consultas parametrizadas</h4>
      {consultas.length === 0 && <div>Nenhuma consulta ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {consultas.map((consulta) => {
          const resultado = resultadosTeste[consulta.id];
          return (
            <li key={consulta.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{consulta.nome}</strong>
                <button onClick={() => void handleTestar(consulta.id)} disabled={testando === consulta.id}>
                  {testando === consulta.id ? 'Testando...' : 'Testar consulta'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: consulta.testada ? 'green' : '#b8860b' }}>
                {consulta.testada ? 'Testada' : 'Ainda não testada'}
              </div>
              {resultado && (
                <div style={{ fontSize: 12, color: resultado.sucesso ? 'green' : 'crimson' }}>
                  {resultado.sucesso ? `${resultado.linhasLidas} linhas lidas` : resultado.erro}
                </div>
              )}
              {consulta.colunas && consulta.colunas.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>Dicionário de campos</div>
                  {consulta.colunas.map((coluna) => (
                    <div key={coluna.nomeTecnico} style={{ fontSize: 12 }}>
                      <code>{coluna.nomeTecnico}</code> — {coluna.descricao ?? <em>sem descrição</em>}
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={consulta.sincronizacaoAtiva}
                  disabled={!consulta.testada}
                  onChange={() => void handleToggleSync(consulta)}
                />
                Sincronização ativa
                {consulta.ultimaSincronizacaoEm && ` (última: ${consulta.ultimaSincronizacaoEm})`}
              </label>
            </li>
          );
        })}
      </ul>
      {mostrandoForm ? (
        <CriarConsultaForm
          accessToken={accessToken}
          moduloId={moduloId}
          onCriada={(consulta) => {
            setMostrandoForm(false);
            setConsultas((atual) => [consulta, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar consulta</button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Rodar o build e o lint do frontend**

Run: `npm run build && npm run lint` (dentro de `frontend/`)
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/corepilot/fontes-de-dados frontend/src/corepilot/consultas
git commit -m "feat(frontend): telas de Fontes de Dados e Consultas Parametrizadas"
```

---

## Task 12: Frontend — anexar Consulta como ferramenta + aba "Dados" no módulo

**Files:**
- Modify: `frontend/src/corepilot/agentes/api.ts`
- Modify: `frontend/src/corepilot/agentes/SkillExecutor.tsx`
- Modify: `frontend/src/corepilot/modulos/ModuloWorkspace.tsx`

**Interfaces:**
- Consumes: `listarConsultas` (Task 11), `anexarFerramenta`/`removerFerramenta` (novo,
  este task), `FontesDeDadosList`/`ConsultasList` (Task 11).
- Produces: `<SkillExecutor accessToken moduloId skill onVoltar />` (ganha `moduloId`),
  aba "Dados" em `ModuloWorkspace`.

Simplificação assumida nesta task: como `SkillsList`/`GET /agentes/:id/skills` não
devolve quais ferramentas já estão anexadas a cada Skill (só `GET /skills/:id/execucoes`
faz isso indiretamente, dentro de `findByIdInEmpresa`, que o frontend não chama
diretamente), a UI de anexar/remover ferramenta não pré-marca o estado atual — mostra
sempre os botões "Anexar"/"Remover" para cada consulta testada do módulo, e o backend já
trata `connect`/`disconnect` como idempotente. Se isso incomodar na prática, uma fase
futura pode adicionar um endpoint de leitura dedicado.

- [ ] **Step 1: Adicionar `anexarFerramenta`/`removerFerramenta` a `frontend/src/corepilot/agentes/api.ts`**

Acrescentar ao final do arquivo já existente (não remover nada do que já está lá):

```typescript
export async function anexarFerramenta(
  accessToken: string,
  skillId: string,
  consultaId: string,
): Promise<void> {
  const response = await apiFetch(`/skills/${skillId}/ferramentas/${consultaId}`, accessToken, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Falha ao anexar ferramenta (status ${response.status})`);
}

export async function removerFerramenta(
  accessToken: string,
  skillId: string,
  consultaId: string,
): Promise<void> {
  const response = await apiFetch(`/skills/${skillId}/ferramentas/${consultaId}`, accessToken, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Falha ao remover ferramenta (status ${response.status})`);
}
```

- [ ] **Step 2: Estender `SkillExecutor` com a seção de ferramentas**

Substituir todo o conteúdo de `frontend/src/corepilot/agentes/SkillExecutor.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { anexarFerramenta, executarSkill, listarExecucoes, removerFerramenta } from './api';
import type { Skill, SkillExecucao } from './types';
import { listarConsultas } from '../consultas/api';
import type { Consulta } from '../consultas/types';

interface SkillExecutorProps {
  accessToken: string;
  moduloId: string;
  skill: Skill;
  onVoltar: () => void;
}

export function SkillExecutor({ accessToken, moduloId, skill, onVoltar }: SkillExecutorProps) {
  const [entrada, setEntrada] = useState('');
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<SkillExecucao[]>([]);
  const [consultasTestadas, setConsultasTestadas] = useState<Consulta[]>([]);

  useEffect(() => {
    listarExecucoes(accessToken, skill.id)
      .then(setExecucoes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, skill.id]);

  useEffect(() => {
    listarConsultas(accessToken, moduloId)
      .then((consultas) => setConsultasTestadas(consultas.filter((c) => c.testada)))
      .catch(() => setConsultasTestadas([]));
  }, [accessToken, moduloId]);

  async function handleExecutar() {
    if (!entrada.trim() || executando) return;
    setExecutando(true);
    setErro(null);

    try {
      const resultado = await executarSkill(accessToken, skill.id, entrada);
      setEntrada('');
      const execucoesAtualizadas = await listarExecucoes(accessToken, skill.id);
      setExecucoes(execucoesAtualizadas);
      void resultado;
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao executar skill');
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h4>{skill.nome}</h4>
        <button onClick={onVoltar}>Voltar</button>
      </div>

      {consultasTestadas.length > 0 && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Ferramentas (consultas de dados)</div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {consultasTestadas.map((consulta) => (
              <li key={consulta.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{consulta.nome}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void anexarFerramenta(accessToken, skill.id, consulta.id)}>
                    Anexar
                  </button>
                  <button onClick={() => void removerFerramenta(accessToken, skill.id, consulta.id)}>
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        placeholder="Entrada para esta skill (texto livre)"
        value={entrada}
        onChange={(e) => setEntrada(e.target.value)}
        rows={4}
      />
      <button onClick={() => void handleExecutar()} disabled={executando || !entrada.trim()}>
        {executando ? 'Executando...' : 'Executar'}
      </button>
      {erro && <div style={{ color: 'crimson' }}>{erro}</div>}

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Execuções anteriores</div>
        {execucoes.length === 0 && <div>Nenhuma execução ainda.</div>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {execucoes.map((execucao) => (
            <li key={execucao.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{execucao.entrada}</div>
              {skill.camposSaida.map((campo) => (
                <div key={campo.nome} style={{ fontSize: 13 }}>
                  <strong>{campo.nome}:</strong> {JSON.stringify(execucao.saida[campo.nome])}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Passar `moduloId` no `ModuloWorkspace` e adicionar a aba "Dados"**

Editar `frontend/src/corepilot/modulos/ModuloWorkspace.tsx`. Trocar a chamada de
`<SkillExecutor accessToken skill={skillSelecionada} onVoltar={...} />` para incluir
`moduloId={modulo.id}`, e adicionar uma terceira aba "Dados". Arquivo completo:

```typescript
import { useState } from 'react';
import { ChatView } from './ChatView';
import { AgentesList } from '../agentes/AgentesList';
import { SkillsList } from '../agentes/SkillsList';
import { SkillExecutor } from '../agentes/SkillExecutor';
import { FontesDeDadosList } from '../fontes-de-dados/FontesDeDadosList';
import { ConsultasList } from '../consultas/ConsultasList';
import type { Modulo } from './types';
import type { Agente, Skill } from '../agentes/types';

interface ModuloWorkspaceProps {
  accessToken: string;
  modulo: Modulo;
  onVoltar: () => void;
}

type Aba = 'chat' | 'agentes' | 'dados';

export function ModuloWorkspace({ accessToken, modulo, onVoltar }: ModuloWorkspaceProps) {
  const [aba, setAba] = useState<Aba>('chat');
  const [agenteSelecionado, setAgenteSelecionado] = useState<Agente | null>(null);
  const [skillSelecionada, setSkillSelecionada] = useState<Skill | null>(null);

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>{modulo.nome}</h2>
        <button onClick={onVoltar}>Voltar aos módulos</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setAba('chat')} style={{ fontWeight: aba === 'chat' ? 700 : 400 }}>
          Chat
        </button>
        <button onClick={() => setAba('agentes')} style={{ fontWeight: aba === 'agentes' ? 700 : 400 }}>
          Agentes
        </button>
        <button onClick={() => setAba('dados')} style={{ fontWeight: aba === 'dados' ? 700 : 400 }}>
          Dados
        </button>
      </div>

      {aba === 'chat' && (
        <ChatView accessToken={accessToken} modulo={modulo} onVoltar={onVoltar} />
      )}

      {aba === 'agentes' && !agenteSelecionado && (
        <AgentesList accessToken={accessToken} moduloId={modulo.id} onAbrirAgente={setAgenteSelecionado} />
      )}

      {aba === 'agentes' && agenteSelecionado && !skillSelecionada && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setAgenteSelecionado(null)}>← Agentes</button>
          <SkillsList
            accessToken={accessToken}
            agenteId={agenteSelecionado.id}
            onAbrirSkill={setSkillSelecionada}
          />
        </div>
      )}

      {aba === 'agentes' && agenteSelecionado && skillSelecionada && (
        <SkillExecutor
          accessToken={accessToken}
          moduloId={modulo.id}
          skill={skillSelecionada}
          onVoltar={() => setSkillSelecionada(null)}
        />
      )}

      {aba === 'dados' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <FontesDeDadosList accessToken={accessToken} />
          <ConsultasList accessToken={accessToken} moduloId={modulo.id} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificação manual completa**

Com o backend rodando e `npm run dev` no frontend:
1. Aba "Dados": conectar uma fonte TOTVS RM (real, se disponível — ou apenas confirmar
   que o formulário salva e nunca reexibe a senha).
2. Criar uma consulta parametrizada, testar (se o RM estiver acessível, confirmar
   colunas descobertas e prévia de dados).
3. Ativar sincronização periódica, confirmar que o toggle habilita corretamente.
4. Na aba "Agentes", abrir uma Skill, anexar a consulta testada como ferramenta.
5. Executar a Skill com uma entrada que dependa do dado sincronizado, confirmar que a
   saída estruturada reflete o dado real (não uma alucinação).

- [ ] **Step 5: Rodar o build e o lint do frontend**

Run: `npm run build && npm run lint` (dentro de `frontend/`)
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/corepilot/agentes/api.ts frontend/src/corepilot/agentes/SkillExecutor.tsx frontend/src/corepilot/modulos/ModuloWorkspace.tsx
git commit -m "feat(frontend): anexar Consulta como ferramenta de Skill + aba Dados no módulo"
```

---

## Task 13: Verificação final do caso de validação (spec §12)

**Files:** nenhum arquivo novo — checklist de verificação.

- [ ] **Step 1: Rodar toda a suíte do backend**

```bash
cd backend
npm test
npm run test:e2e
```

Expected: todos os testes PASS, incluindo `fonte-de-dados.e2e-spec.ts` (Task 10) e os
testes já existentes das Fases 1, 2 e 3. O bloco do RM real pode aparecer como `skipped`
se as credenciais de teste não estiverem configuradas — isso é esperado.

- [ ] **Step 2: Checklist final contra a spec (§12)**

- [ ] Cadastrar uma `FonteDeDados` TOTVS RM real (servidor, usuário, senha, código
  sistema/coligada) — senha nunca reaparece na tela após salvar.
- [ ] Cadastrar uma `ConsultaParametrizada` num módulo, testar com sucesso contra o RM
  real — colunas descobertas automaticamente, dados de exemplo visíveis.
- [ ] Ativar sincronização periódica — confirmar que o cron roda e atualiza
  `ConsultaResultado`/`ultimaSincronizacaoEm` sem intervenção manual.
- [ ] Anexar a consulta como ferramenta de uma Skill existente e executá-la com uma
  entrada que exija o dado do RM — a saída estruturada final reflete um valor real vindo
  dos dados sincronizados localmente (não uma chamada ao vivo ao RM durante a execução).
- [ ] Isolamento entre empresas para `FonteDeDados`/`ConsultaParametrizada` (Task 10
  automatizado).
- [ ] Senha do RM nunca aparece em texto plano no banco nem é commitada no repositório.

Se todos os itens acima passarem (os que dependem de RM real, quando credenciais de
teste estiverem disponíveis), a Fase 4 (Fontes de Dados) está validada e a Fase 5
(Orquestrador BPM) pode começar como um novo ciclo brainstorm → spec → plano — o guia
observa que essa é a fase mais arriscada tecnicamente de todo o roteiro, então não
avançar sem o caso de validação desta fase funcionando de ponta a ponta.
