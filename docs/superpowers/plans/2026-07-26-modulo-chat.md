# CorePilot — Fase 2 (Módulo + Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter um `Modulo` real (multi-tenant, múltiplos por empresa) e um chat livre real — conectado à Messages API da Anthropic via streaming, com histórico persistido e cada troca de mensagem auditada.

**Architecture:** Frontend nunca fala com a Anthropic; todo fluxo passa pelo NestJS, que monta o `system` prompt a partir da identidade do `Modulo`, chama `client.messages.stream(...)` (Sonnet 5, sem tools/thinking explícito) e repassa os deltas de texto ao frontend via HTTP chunked (NDJSON), usando `fetch`+`ReadableStream` no lugar de `EventSource` (que não permite `Authorization: Bearer`). `TenantGuard`/`JwtAuthGuard`/`AuditService`/`PrismaService` da Fase 1 são reaproveitados sem alteração.

**Tech Stack:** NestJS 11, Prisma, `@anthropic-ai/sdk` (Messages API, streaming), React 19 + Vite (frontend, sem test runner ainda).

## Global Constraints

- Lógica de backend só em `backend/` — nunca em Supabase Edge Functions (CLAUDE.md).
- Frontend nunca chama a Anthropic diretamente e nunca recebe `ANTHROPIC_API_KEY` — só fala com a API do NestJS (spec §5).
- Toda troca de mensagem (pergunta do usuário + resposta do agente) gera exatamente uma linha em `AuditLog` com `acao: 'chat_mensagem'` (spec §8) — reaproveitando o `AuditService` já existente, sem alterá-lo.
- Escopo de tenant é explícito no código: toda query por `moduloId`/`conversaId` vindo do cliente precisa ser validada contra `TenantContext` antes de qualquer leitura/escrita — nunca confiar em um ID só porque veio autenticado.
- `Conversa` é privada por usuário (`usuarioId`); `Modulo` é da empresa, não do usuário (spec §4).
- **Toda tabela nova nasce com RLS habilitada e sem policies** (regra permanente estabelecida na revisão final da Fase 1, `docs/superpowers/specs/2026-07-24-fundacao-design.md` §3.1) — `Modulo`, `Conversa`, `Mensagem` precisam de `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;` na própria migração que as cria.
- `ChatComposer` e `MessageBubble` (`frontend/src/corepilot/components/chat/`) são reaproveitados **sem nenhuma modificação**. `ModuleChatSidebar`, `ComprasView`, `FinanceiroView` e `CorePilotApp` (protótipo mock) **não são tocados** em nenhuma task deste plano.
- Segredos (`ANTHROPIC_API_KEY`) só em `backend/.env.local`, nunca commitados.
- Prettier do backend: aspas simples, trailing commas em tudo.
- Backend: testes Jest colocados junto do código (`*.spec.ts` em `src/`), e2e em `test/*.e2e-spec.ts`.
- Frontend não tem test runner configurado — verificação é manual (rodar `npm run dev`, testar no navegador).

---

## Task 1: Prisma — schema de Módulo/Conversa/Mensagem e migração

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migração via `npm run prisma:migrate`

**Interfaces:**
- Produces: modelos Prisma `Modulo`, `Conversa`, `Mensagem`, `enum PapelMensagem { usuario, agente }`; back-relations `Empresa.modulos`/`Empresa.conversas` e `Usuario.conversas`; migração aplicada com RLS habilitada nas 3 tabelas novas (sem policies).

- [ ] **Step 1: Editar `backend/prisma/schema.prisma`**

Adicionar `modulos Modulo[]` e `conversas Conversa[]` ao model `Empresa` existente:

```prisma
model Empresa {
  id       String   @id @default(uuid())
  nome     String
  criadoEm DateTime @default(now())

  usuarios  UsuarioEmpresa[]
  auditLogs AuditLog[]
  modulos   Modulo[]
  conversas Conversa[]
}
```

Adicionar `conversas Conversa[]` ao model `Usuario` existente:

```prisma
model Usuario {
  id             String   @id @default(uuid())
  supabaseUserId String   @unique
  nome           String
  email          String   @unique
  criadoEm       DateTime @default(now())

  empresas  UsuarioEmpresa[]
  auditLogs AuditLog[]
  conversas Conversa[]
}
```

Adicionar ao final do arquivo (depois do model `AuditLog` existente):

```prisma
model Modulo {
  id         String   @id @default(uuid())
  empresaId  String
  nome       String
  objetivo   String
  instrucoes String?
  modeloIA   String   @default("claude-sonnet-5")
  criadoEm   DateTime @default(now())

  empresa   Empresa    @relation(fields: [empresaId], references: [id])
  conversas Conversa[]
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

- [ ] **Step 2: Rodar a migração**

```bash
cd backend
npm run prisma:migrate -- --name modulo_chat
```

Espera-se que crie as tabelas `Modulo`, `Conversa`, `Mensagem` (+ enum `PapelMensagem`) e atualize o Prisma Client.

- [ ] **Step 3: Habilitar RLS nas 3 tabelas novas, sem policies**

Abrir o arquivo de migração recém-gerado em
`backend/prisma/migrations/<timestamp>_modulo_chat/migration.sql` e adicionar ao
final (depois do SQL gerado pelo Prisma):

```sql
ALTER TABLE "Modulo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mensagem" ENABLE ROW LEVEL SECURITY;
```

Como o Prisma já rodou a migração no Step 2 antes de você editar o arquivo,
aplique esse trecho manualmente contra o mesmo banco (via
`npx dotenv -e .env.local -- prisma db execute --file <caminho-de-um-arquivo-sql-temporario> --schema prisma/schema.prisma`,
ou copie as 3 linhas acima para um arquivo `.sql` temporário e use esse
comando) — o importante é que o arquivo de migração versionado contenha essas
3 linhas (para quem rodar `prisma migrate deploy` do zero) **e** que o banco
atual já esteja com RLS habilitado nas 3 tabelas (para não depender de
alguém rodar a migração de novo). Confirme rodando uma query
`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('Modulo', 'Conversa', 'Mensagem');`
e conferindo que `relrowsecurity` é `true` nas 3.

- [ ] **Step 4: Rodar o teste de fumaça do Prisma (já existente) para confirmar que o schema recompilou sem erros**

```bash
npm test -- prisma.smoke.spec.ts
```

Expected: PASS (esse teste não usa os modelos novos, só confirma que o client gerado continua válido).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): schema Prisma de Modulo/Conversa/Mensagem com RLS"
```

---

## Task 2: ModuloModule (criar e listar módulos)

**Files:**
- Create: `backend/src/modulo/modulo.service.ts`
- Create: `backend/src/modulo/modulo.service.spec.ts`
- Create: `backend/src/modulo/modulo.controller.ts`
- Create: `backend/src/modulo/modulo.controller.spec.ts`
- Create: `backend/src/modulo/dto/create-modulo.dto.ts`
- Create: `backend/src/modulo/modulo.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1's models), `TenantContext`/`JwtAuthGuard`/`TenantGuard` (Fase 1, `backend/src/auth/`).
- Produces: `ModuloService.create(empresaId, dto): Promise<Modulo>`, `ModuloService.findAllByEmpresa(empresaId): Promise<Modulo[]>`, `ModuloService.findByIdInEmpresa(moduloId, empresaId): Promise<Modulo>` (lança `NotFoundException` se não existir ou for de outra empresa) — usado por Task 3. Rotas `POST /modulos`, `GET /modulos`.

- [ ] **Step 1: Criar o DTO**

Criar `backend/src/modulo/dto/create-modulo.dto.ts`:

```typescript
export interface CreateModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
}
```

- [ ] **Step 2: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/modulo/modulo.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { ModuloService } from './modulo.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ModuloService', () => {
  function buildPrismaMock() {
    return {
      modulo: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('cria um módulo escopado à empresa informada', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.create as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
      empresaId: 'empresa-1',
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      instrucoes: null,
      modeloIA: 'claude-sonnet-5',
    });
    const service = new ModuloService(prisma);

    const resultado = await service.create('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });

    expect(prisma.modulo.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        nome: 'Compras',
        objetivo: 'Ajudar com compras',
        instrucoes: undefined,
      },
    });
    expect(resultado.id).toBe('modulo-1');
  });

  it('lista só os módulos da empresa informada', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ModuloService(prisma);

    await service.findAllByEmpresa('empresa-1');

    expect(prisma.modulo.findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se o módulo não existir na empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ModuloService(prisma);

    await expect(service.findByIdInEmpresa('modulo-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.modulo.findFirst).toHaveBeenCalledWith({
      where: { id: 'modulo-x', empresaId: 'empresa-1' },
    });
  });

  it('findByIdInEmpresa retorna o módulo se ele existir na empresa', async () => {
    const prisma = buildPrismaMock();
    const modulo = { id: 'modulo-1', empresaId: 'empresa-1' };
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(modulo);
    const service = new ModuloService(prisma);

    const resultado = await service.findByIdInEmpresa('modulo-1', 'empresa-1');

    expect(resultado).toBe(modulo);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- modulo.service.spec.ts`
Expected: FAIL com "Cannot find module './modulo.service'"

- [ ] **Step 4: Implementar `ModuloService`**

Criar `backend/src/modulo/modulo.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';

@Injectable()
export class ModuloService {
  constructor(private readonly prisma: PrismaService) {}

  async create(empresaId: string, dto: CreateModuloDto) {
    return this.prisma.modulo.create({
      data: {
        empresaId,
        nome: dto.nome,
        objetivo: dto.objetivo,
        instrucoes: dto.instrucoes,
      },
    });
  }

  async findAllByEmpresa(empresaId: string) {
    return this.prisma.modulo.findMany({
      where: { empresaId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(moduloId: string, empresaId: string) {
    const modulo = await this.prisma.modulo.findFirst({
      where: { id: moduloId, empresaId },
    });

    if (!modulo) {
      throw new NotFoundException('Módulo não encontrado');
    }

    return modulo;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- modulo.service.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/modulo/modulo.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import type { ModuloService } from './modulo.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ModuloController', () => {
  function buildTenantContext(empresaId: string): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId, perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('cria um módulo usando a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    const resultado = await controller.criar({ nome: 'Compras', objetivo: 'Ajudar com compras' });

    expect(service.create).toHaveBeenCalledWith('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });
    expect(resultado).toEqual({ id: 'modulo-1' });
  });

  it('rejeita criação sem nome ou objetivo', async () => {
    const service = { create: jest.fn() } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    await expect(controller.criar({ nome: '', objetivo: 'x' })).rejects.toThrow(BadRequestException);
    await expect(controller.criar({ nome: 'x', objetivo: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista módulos da empresa do tenant atual', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }]),
    } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    const resultado = await controller.listar();

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1');
    expect(resultado).toEqual([{ id: 'modulo-1' }]);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- modulo.controller.spec.ts`
Expected: FAIL com "Cannot find module './modulo.controller'"

- [ ] **Step 8: Implementar `ModuloController`**

Criar `backend/src/modulo/modulo.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';

@Controller('modulos')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModuloController {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Body() body: CreateModuloDto) {
    if (!body.nome?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.moduloService.create(empresaId, body);
  }

  @Get()
  async listar() {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId);
  }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- modulo.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 10: Criar `ModuloModule` e importar no `AppModule`**

Criar `backend/src/modulo/modulo.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import { ModuloService } from './modulo.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ModuloController],
  providers: [ModuloService],
  exports: [ModuloService],
})
export class ModuloModule {}
```

Editar `backend/src/app.module.ts` para importar `ModuloModule` (adicionar ao array `imports`, junto de `MeModule`).

- [ ] **Step 11: Rodar a suíte completa e confirmar que passa**

Run: `npm test`
Expected: todos os testes passam, incluindo os novos.

- [ ] **Step 12: Commit**

```bash
git add backend/src/modulo backend/src/app.module.ts
git commit -m "feat(backend): ModuloService/Controller — criar e listar módulos por empresa"
```

---

## Task 3: ConversaModule (criar e listar conversas por módulo)

**Files:**
- Create: `backend/src/conversa/conversa.service.ts`
- Create: `backend/src/conversa/conversa.service.spec.ts`
- Create: `backend/src/conversa/conversa.controller.ts`
- Create: `backend/src/conversa/conversa.controller.spec.ts`
- Create: `backend/src/conversa/conversa.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ModuloService.findByIdInEmpresa` (Task 2), `PrismaService`, `TenantContext`/guards (Fase 1).
- Produces: `ConversaService.create(moduloId, usuarioId, empresaId): Promise<Conversa>` (lança `NotFoundException` se o módulo não pertencer à empresa), `ConversaService.findAllByModuloAndUsuario(moduloId, usuarioId): Promise<Conversa[]>`, `ConversaService.findOwned(conversaId, usuarioId): Promise<Conversa & { modulo: Modulo }>` (lança `NotFoundException` se a conversa não existir ou não pertencer ao usuário — **este método é usado pela Task 5**, já retornando o `modulo` relacionado via `include`, para o `ChatModule` não precisar depender do `ModuloModule`). Rotas `POST /modulos/:moduloId/conversas`, `GET /modulos/:moduloId/conversas`.

- [ ] **Step 1: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/conversa/conversa.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { ConversaService } from './conversa.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('ConversaService', () => {
  function buildDeps() {
    const prisma = {
      conversa: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria uma conversa depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.conversa.create as jest.Mock).mockResolvedValue({ id: 'conversa-1' });
    const service = new ConversaService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'usuario-1', 'empresa-1');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.conversa.create).toHaveBeenCalledWith({
      data: { moduloId: 'modulo-1', usuarioId: 'usuario-1', empresaId: 'empresa-1' },
    });
    expect(resultado).toEqual({ id: 'conversa-1' });
  });

  it('propaga o NotFoundException se o módulo não for da empresa (não cria a conversa)', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new ConversaService(prisma, moduloService);

    await expect(service.create('modulo-x', 'usuario-1', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.conversa.create).not.toHaveBeenCalled();
  });

  it('lista conversas só do módulo e usuário informados', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConversaService(prisma, moduloService);

    await service.findAllByModuloAndUsuario('modulo-1', 'usuario-1');

    expect(prisma.conversa.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1', usuarioId: 'usuario-1' },
      orderBy: { atualizadoEm: 'desc' },
    });
  });

  it('findOwned lança NotFoundException se a conversa não existir ou não for do usuário', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaService(prisma, moduloService);

    await expect(service.findOwned('conversa-x', 'usuario-1')).rejects.toThrow(NotFoundException);
    expect(prisma.conversa.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversa-x', usuarioId: 'usuario-1' },
      include: { modulo: true },
    });
  });

  it('findOwned retorna a conversa com o módulo incluído', async () => {
    const { prisma, moduloService } = buildDeps();
    const conversaComModulo = { id: 'conversa-1', usuarioId: 'usuario-1', modulo: { id: 'modulo-1' } };
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(conversaComModulo);
    const service = new ConversaService(prisma, moduloService);

    const resultado = await service.findOwned('conversa-1', 'usuario-1');

    expect(resultado).toBe(conversaComModulo);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- conversa.service.spec.ts`
Expected: FAIL com "Cannot find module './conversa.service'"

- [ ] **Step 3: Implementar `ConversaService`**

Criar `backend/src/conversa/conversa.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

@Injectable()
export class ConversaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, usuarioId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.conversa.create({
      data: { moduloId, usuarioId, empresaId },
    });
  }

  async findAllByModuloAndUsuario(moduloId: string, usuarioId: string) {
    return this.prisma.conversa.findMany({
      where: { moduloId, usuarioId },
      orderBy: { atualizadoEm: 'desc' },
    });
  }

  async findOwned(conversaId: string, usuarioId: string) {
    const conversa = await this.prisma.conversa.findFirst({
      where: { id: conversaId, usuarioId },
      include: { modulo: true },
    });

    if (!conversa) {
      throw new NotFoundException('Conversa não encontrada');
    }

    return conversa;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- conversa.service.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/conversa/conversa.controller.spec.ts`:

```typescript
import { ConversaController } from './conversa.controller';
import type { ConversaService } from './conversa.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConversaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  it('cria uma conversa no módulo informado, para o usuário do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'conversa-1' }),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1');

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'usuario-1', 'empresa-1');
    expect(resultado).toEqual({ id: 'conversa-1' });
  });

  it('lista conversas do módulo informado, para o usuário do tenant atual', async () => {
    const service = {
      findAllByModuloAndUsuario: jest.fn().mockResolvedValue([{ id: 'conversa-1' }]),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModuloAndUsuario).toHaveBeenCalledWith('modulo-1', 'usuario-1');
    expect(resultado).toEqual([{ id: 'conversa-1' }]);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npm test -- conversa.controller.spec.ts`
Expected: FAIL com "Cannot find module './conversa.controller'"

- [ ] **Step 7: Implementar `ConversaController`**

Criar `backend/src/conversa/conversa.controller.ts`:

```typescript
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService } from './conversa.service';

@Controller('modulos/:moduloId/conversas')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversaController {
  constructor(
    private readonly conversaService: ConversaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return this.conversaService.create(moduloId, usuarioId, empresaId);
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { usuarioId } = this.tenantContext.get();
    return this.conversaService.findAllByModuloAndUsuario(moduloId, usuarioId);
  }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npm test -- conversa.controller.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 9: Criar `ConversaModule` e importar no `AppModule`**

Criar `backend/src/conversa/conversa.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConversaController } from './conversa.controller';
import { ConversaService } from './conversa.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';

@Module({
  imports: [AuthModule, ModuloModule],
  controllers: [ConversaController],
  providers: [ConversaService],
  exports: [ConversaService],
})
export class ConversaModule {}
```

Editar `backend/src/app.module.ts` para importar `ConversaModule`.

- [ ] **Step 10: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 11: Commit**

```bash
git add backend/src/conversa backend/src/app.module.ts
git commit -m "feat(backend): ConversaService/Controller — criar e listar conversas por módulo"
```

---

## Task 4: AnthropicService (wrapper do SDK, injetável e testável)

**Files:**
- Create: `backend/src/chat/anthropic-client.provider.ts`
- Create: `backend/src/chat/anthropic.service.ts`
- Create: `backend/src/chat/anthropic.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (lê `ANTHROPIC_API_KEY`).
- Produces: token de injeção `ANTHROPIC_CLIENT`; `AnthropicService.streamReply(params: { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; model: string; maxTokens: number })` retornando o objeto de stream do SDK (`client.messages.stream(...)`) — consumido pela Task 5 via `for await (const event of stream)` + `await stream.finalMessage()`.

- [ ] **Step 1: Instalar o SDK**

```bash
cd backend
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Criar o provider do cliente Anthropic (injetável, para poder ser trocado por um fake nos testes)**

Criar `backend/src/chat/anthropic-client.provider.ts`:

```typescript
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (config: ConfigService) =>
    new Anthropic({ apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY') }),
  inject: [ConfigService],
};
```

- [ ] **Step 3: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/chat/anthropic.service.spec.ts`:

```typescript
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
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm test -- anthropic.service.spec.ts`
Expected: FAIL com "Cannot find module './anthropic.service'"

- [ ] **Step 5: Implementar `AnthropicService`**

Criar `backend/src/chat/anthropic.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';

export interface StreamReplyParams {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model: string;
  maxTokens: number;
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
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test -- anthropic.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Confirmar que o build TypeScript compila (o tipo real do SDK precisa bater com o uso feito aqui)**

Run: `npm run build`
Expected: sem erros de tipo. Se `client.messages.stream(...)` exigir um formato de `messages`/`system` diferente do usado acima, ajuste conforme o erro do compilador — não adivinhe a API, deixe o TypeScript apontar a diferença exata.

- [ ] **Step 8: Commit**

```bash
git add backend/src/chat/anthropic-client.provider.ts backend/src/chat/anthropic.service.ts backend/src/chat/anthropic.service.spec.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): AnthropicService — wrapper injetável do @anthropic-ai/sdk"
```

---

## Task 5: MensagemController — histórico + envio com streaming

**Files:**
- Create: `backend/src/chat/mensagem.service.ts`
- Create: `backend/src/chat/mensagem.service.spec.ts`
- Create: `backend/src/chat/mensagem.controller.ts`
- Create: `backend/src/chat/chat.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `ConversaService.findOwned` (Task 3, já retorna `conversa.modulo`), `AnthropicService.streamReply` (Task 4), `AuditService.record` (Fase 1), `TenantContext`/guards (Fase 1).
- Produces: `MensagemService.listByConversa(conversaId): Promise<Mensagem[]>`, `MensagemService.appendUserMessage(conversaId, conteudo): Promise<Mensagem>`, `MensagemService.appendAgentMessage(conversaId, conteudo, tokensEntrada, tokensSaida): Promise<Mensagem>`. Rotas `GET /conversas/:conversaId/mensagens` (histórico) e `POST /conversas/:conversaId/mensagens` (envia mensagem, resposta é um stream NDJSON — ver spec §5/§6).

Esta é a task mais complexa do plano — ela orquestra tudo que as tasks anteriores construíram. Leia a spec completa
(`docs/superpowers/specs/2026-07-26-modulo-chat-design.md`, seções 5 e 6) antes de implementar, além do brief.

- [ ] **Step 1: Adicionar `ANTHROPIC_API_KEY` a `backend/.env.example`**

```
# Chave da API da Anthropic (Messages API). Nunca exposta ao frontend.
ANTHROPIC_API_KEY=your-anthropic-api-key
```

Adicione também o valor real em `backend/.env.local` (gitignorado) — sem
reexibir o valor no seu relatório.

- [ ] **Step 2: Escrever o teste do `MensagemService` (falha primeiro)**

Criar `backend/src/chat/mensagem.service.spec.ts`:

```typescript
import { MensagemService } from './mensagem.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('MensagemService', () => {
  function buildPrismaMock() {
    return {
      mensagem: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('lista mensagens de uma conversa em ordem cronológica', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.findMany as jest.Mock).mockResolvedValue([]);
    const service = new MensagemService(prisma);

    await service.listByConversa('conversa-1');

    expect(prisma.mensagem.findMany).toHaveBeenCalledWith({
      where: { conversaId: 'conversa-1' },
      orderBy: { criadoEm: 'asc' },
    });
  });

  it('appendUserMessage grava com papel usuario', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.create as jest.Mock).mockResolvedValue({ id: 'mensagem-1' });
    const service = new MensagemService(prisma);

    await service.appendUserMessage('conversa-1', 'Olá');

    expect(prisma.mensagem.create).toHaveBeenCalledWith({
      data: { conversaId: 'conversa-1', papel: 'usuario', conteudo: 'Olá' },
    });
  });

  it('appendAgentMessage grava com papel agente e os tokens informados', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.create as jest.Mock).mockResolvedValue({ id: 'mensagem-2' });
    const service = new MensagemService(prisma);

    await service.appendAgentMessage('conversa-1', 'Oi, tudo bem?', 10, 20);

    expect(prisma.mensagem.create).toHaveBeenCalledWith({
      data: {
        conversaId: 'conversa-1',
        papel: 'agente',
        conteudo: 'Oi, tudo bem?',
        tokensEntrada: 10,
        tokensSaida: 20,
      },
    });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- mensagem.service.spec.ts`
Expected: FAIL com "Cannot find module './mensagem.service'"

- [ ] **Step 4: Implementar `MensagemService`**

Criar `backend/src/chat/mensagem.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MensagemService {
  constructor(private readonly prisma: PrismaService) {}

  async listByConversa(conversaId: string) {
    return this.prisma.mensagem.findMany({
      where: { conversaId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async appendUserMessage(conversaId: string, conteudo: string) {
    return this.prisma.mensagem.create({
      data: { conversaId, papel: 'usuario', conteudo },
    });
  }

  async appendAgentMessage(
    conversaId: string,
    conteudo: string,
    tokensEntrada: number,
    tokensSaida: number,
  ) {
    return this.prisma.mensagem.create({
      data: { conversaId, papel: 'agente', conteudo, tokensEntrada, tokensSaida },
    });
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- mensagem.service.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Implementar `MensagemController`**

Este controller usa `@Res()` para escrever a resposta manualmente (streaming
NDJSON) — não há um jeito limpo de testar isso com um teste unitário simples
de request/response do Nest; a cobertura real desse fluxo fica para o teste
e2e da Task 6. Ainda assim, implemente com cuidado e teste manualmente
(Step 8) antes de seguir.

Criar `backend/src/chat/mensagem.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService } from '../conversa/conversa.service';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from './anthropic.service';
import { MensagemService } from './mensagem.service';

interface EnviarMensagemBody {
  conteudo: string;
}

function montarSystemPrompt(modulo: { nome: string; objetivo: string; instrucoes: string | null }): string {
  const partes = [
    `Você é o assistente de IA do módulo "${modulo.nome}" desta empresa.`,
    `Objetivo do módulo: ${modulo.objetivo}`,
  ];

  if (modulo.instrucoes?.trim()) {
    partes.push(`Instruções adicionais: ${modulo.instrucoes}`);
  }

  return partes.join('\n\n');
}

@Controller('conversas/:conversaId/mensagens')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MensagemController {
  constructor(
    private readonly conversaService: ConversaService,
    private readonly mensagemService: MensagemService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async listar(@Param('conversaId') conversaId: string) {
    const { usuarioId } = this.tenantContext.get();
    await this.conversaService.findOwned(conversaId, usuarioId);
    return this.mensagemService.listByConversa(conversaId);
  }

  @Post()
  async enviar(
    @Param('conversaId') conversaId: string,
    @Body() body: EnviarMensagemBody,
    @Res() res: Response,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const conversa = await this.conversaService.findOwned(conversaId, usuarioId);

    await this.mensagemService.appendUserMessage(conversaId, body.conteudo);
    const historico = await this.mensagemService.listByConversa(conversaId);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const system = montarSystemPrompt(conversa.modulo);
    const messages = historico.map((mensagem) => ({
      role: mensagem.papel === 'usuario' ? ('user' as const) : ('assistant' as const),
      content: mensagem.conteudo,
    }));

    try {
      const stream = this.anthropicService.streamReply({
        system,
        messages,
        model: conversa.modulo.modeloIA,
        maxTokens: 4096,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(JSON.stringify({ type: 'delta', text: event.delta.text }) + '\n');
        }
      }

      const final = await stream.finalMessage();
      const textoCompleto = final.content
        .filter((bloco): bloco is Extract<(typeof final.content)[number], { type: 'text' }> => bloco.type === 'text')
        .map((bloco) => bloco.text)
        .join('');

      const mensagemAgente = await this.mensagemService.appendAgentMessage(
        conversaId,
        textoCompleto,
        final.usage.input_tokens,
        final.usage.output_tokens,
      );

      await this.audit.record({
        empresaId,
        atorUsuarioId: usuarioId,
        acao: 'chat_mensagem',
        dadosDepois: {
          moduloId: conversa.moduloId,
          tokensEntrada: final.usage.input_tokens,
          tokensSaida: final.usage.output_tokens,
          modelo: conversa.modulo.modeloIA,
        },
      });

      res.write(
        JSON.stringify({
          type: 'done',
          mensagemId: mensagemAgente.id,
          tokensEntrada: final.usage.input_tokens,
          tokensSaida: final.usage.output_tokens,
        }) + '\n',
      );
    } catch {
      res.write(JSON.stringify({ type: 'erro', mensagem: 'Falha ao gerar resposta' }) + '\n');
    } finally {
      res.end();
    }
  }
}
```

Se o tipo de `final.content` não bater com o cast usado acima (a forma exata
dos content blocks do SDK), ajuste conforme o erro do compilador no Step 7 —
não adivinhe, deixe o TypeScript apontar a diferença exata.

- [ ] **Step 7: Confirmar que o build compila**

Run: `npm run build`
Expected: sem erros de tipo.

- [ ] **Step 8: Criar `ChatModule` e importar no `AppModule`**

Criar `backend/src/chat/chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MensagemController } from './mensagem.controller';
import { MensagemService } from './mensagem.service';
import { AnthropicService } from './anthropic.service';
import { anthropicClientProvider } from './anthropic-client.provider';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConversaModule } from '../conversa/conversa.module';

@Module({
  imports: [AuthModule, AuditModule, ConversaModule],
  controllers: [MensagemController],
  providers: [MensagemService, AnthropicService, anthropicClientProvider],
})
export class ChatModule {}
```

Editar `backend/src/app.module.ts` para importar `ChatModule`.

- [ ] **Step 9: Verificação manual real (o teste e2e automatizado vem na Task 6, mas confirme manualmente primeiro)**

Suba o backend (`PORT=3001 npm run start:dev`, já que a porta 3000 pode estar
ocupada por outro processo — ver notas da Fase 1) e, usando um token de
acesso real (do seed da Fase 1, `seed-a@corepilot.dev`), faça manualmente
(via `curl` ou similar):

1. `POST /modulos` com `{"nome": "Compras", "objetivo": "Ajudar com compras"}` — confirme que retorna um módulo com `id`.
2. `POST /modulos/<id>/conversas` — confirme que retorna uma conversa com `id`.
3. `POST /conversas/<id>/mensagens` com `{"conteudo": "Diga apenas OK."}` — confirme que a resposta chega em streaming (linhas NDJSON `delta` seguidas de uma linha `done`) e que o texto faz sentido como resposta da Claude.
4. `GET /conversas/<id>/mensagens` — confirme que retorna as 2 mensagens (usuário + agente) salvas.

Pare o servidor depois.

- [ ] **Step 10: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 11: Commit**

```bash
git add backend/src/chat backend/src/app.module.ts backend/.env.example
git commit -m "feat(backend): MensagemController — histórico e envio de mensagem com streaming real da Anthropic"
```

Nota: `backend/.env.local` não entra no commit (gitignorado).

---

## Task 6: E2E — fluxo completo de chat real, com isolamento entre tenants

**Files:**
- Create: `backend/test/chat.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` completo (Tasks 2-5), helpers de teste da Fase 1 (`backend/src/testing/supabase-admin.helper.ts`, `backend/src/testing/provision-usuario.helper.ts`).
- Produces: prova automatizada do caso de validação da Fase 2 (spec §10) — módulo real, conversa real, mensagem real (chamada de verdade à Anthropic), persistência, auditoria, e isolamento entre empresas.

Este teste faz uma chamada real e paga à API da Anthropic (uma por empresa de
teste) — mantenha a mensagem e o `max_tokens` pequenos para o custo ficar
desprezível (a mesma filosofia da Fase 1 de preferir uma prova real a um
mock, aplicada aqui à chamada de IA em vez de à Supabase Admin API).

- [ ] **Step 1: Escrever o teste**

Criar `backend/test/chat.e2e-spec.ts`:

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

describe('Fluxo de chat (módulo real + Anthropic real + isolamento entre tenants)', () => {
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
      await prisma.mensagem.deleteMany({ where: { conversa: { empresaId: { in: empresaIdsParaLimpar } } } });
    } catch (erro) {
      console.warn('Falha ao limpar mensagens de teste', erro);
    }
    try {
      await prisma.conversa.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar conversas de teste', erro);
    }
    try {
      await prisma.modulo.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar módulos de teste', erro);
    }
    try {
      await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar audit logs de teste', erro);
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

    const password = 'TesteFase2!23';
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

  function parseNdjson(texto: string): Array<Record<string, unknown>> {
    return texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0)
      .map((linha) => JSON.parse(linha) as Record<string, unknown>);
  }

  it('cria módulo/conversa reais, envia mensagem real à Anthropic, persiste e audita — e nunca vaza entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado('E2E Chat Empresa A', `e2e-chat-a-${sufixo}@corepilot.dev`);
    const empresaB = await criarEmpresaComUsuarioLogado('E2E Chat Empresa B', `e2e-chat-b-${sufixo}@corepilot.dev`);

    const moduloRespostaA = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Compras', objetivo: 'Ajudar o time de compras' })
      .expect(201);
    const moduloId = moduloRespostaA.body.id as string;

    const conversaResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/conversas`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .expect(201);
    const conversaId = conversaResposta.body.id as string;

    const envioResposta = await request(app.getHttpServer())
      .post(`/conversas/${conversaId}/mensagens`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ conteudo: 'Responda apenas com a palavra OK, nada mais.' })
      .expect(200);

    const eventos = parseNdjson(envioResposta.text);
    expect(eventos.some((evento) => evento.type === 'delta')).toBe(true);
    const eventoFinal = eventos.find((evento) => evento.type === 'done');
    expect(eventoFinal).toBeDefined();
    expect(typeof eventoFinal?.mensagemId).toBe('string');

    const mensagensSalvas = await prisma.mensagem.findMany({ where: { conversaId } });
    expect(mensagensSalvas).toHaveLength(2);
    expect(mensagensSalvas.some((m) => m.papel === 'usuario')).toBe(true);
    expect(mensagensSalvas.some((m) => m.papel === 'agente')).toBe(true);

    const auditLogs = await prisma.auditLog.findMany({ where: { empresaId: empresaA.empresa.id } });
    expect(auditLogs.filter((log) => log.acao === 'chat_mensagem')).toHaveLength(1);

    // Isolamento: o usuário da empresa B não consegue acessar o módulo/conversa da empresa A
    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/conversas`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversas/${conversaId}/mensagens`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(404);

    // A lista de módulos da empresa B nunca inclui o módulo da empresa A
    const listaModulosB = await request(app.getHttpServer())
      .get('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect((listaModulosB.body as Array<{ id: string }>).some((m) => m.id === moduloId)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npm run test:e2e -- chat.e2e-spec.ts`
Expected: PASS (1 teste). Se der timeout, o `jest.setTimeout(30000)` já está
no arquivo — se ainda não for suficiente, aumente um pouco (chamadas reais à
Anthropic + Supabase podem variar).

- [ ] **Step 3: Rodar a suíte e2e completa**

Run: `npm run test:e2e`
Expected: PASS (inclui `app.e2e-spec.ts`, `me.e2e-spec.ts` da Fase 1, e este novo).

- [ ] **Step 4: Commit**

```bash
git add backend/test/chat.e2e-spec.ts
git commit -m "test(backend): e2e cobre fluxo real de chat (Anthropic real) e isolamento entre tenants"
```

---

## Task 7: Frontend — lista de módulos reais e formulário de criação

**Files:**
- Create: `frontend/src/corepilot/modulos/types.ts`
- Create: `frontend/src/corepilot/modulos/api.ts`
- Create: `frontend/src/corepilot/modulos/CriarModuloForm.tsx`
- Create: `frontend/src/corepilot/modulos/ModulosList.tsx`
- Modify: `frontend/src/corepilot/auth/FundacaoStatus.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Fase 1, `frontend/src/corepilot/api/apiFetch.ts`).
- Produces: `listarModulos(accessToken): Promise<Modulo[]>`, `criarModulo(accessToken, dto): Promise<Modulo>` — consumidos por `ModulosList`; `<ModulosList accessToken onAbrirModulo={(moduloId) => void} />` — consumido pela Task 8 (via `FundacaoStatus`).

- [ ] **Step 1: Criar os tipos compartilhados**

Criar `frontend/src/corepilot/modulos/types.ts`:

```typescript
export interface Modulo {
  id: string;
  nome: string;
  objetivo: string;
  instrucoes: string | null;
  modeloIA: string;
  criadoEm: string;
}

export interface Conversa {
  id: string;
  moduloId: string;
  titulo: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type PapelMensagem = 'usuario' | 'agente';

export interface Mensagem {
  id: string;
  conversaId: string;
  papel: PapelMensagem;
  conteudo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  criadoEm: string;
}
```

- [ ] **Step 2: Criar o cliente de API para módulos**

Criar `frontend/src/corepilot/modulos/api.ts`:

```typescript
import { apiFetch } from '../api/apiFetch';
import type { Modulo } from './types';

export interface CriarModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
}

export async function listarModulos(accessToken: string): Promise<Modulo[]> {
  const response = await apiFetch('/modulos', accessToken);
  if (!response.ok) {
    throw new Error(`Falha ao listar módulos (status ${response.status})`);
  }
  return (await response.json()) as Modulo[];
}

export async function criarModulo(accessToken: string, dto: CriarModuloDto): Promise<Modulo> {
  const response = await apiFetch('/modulos', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar módulo (status ${response.status})`);
  }
  return (await response.json()) as Modulo;
}
```

- [ ] **Step 3: Criar o formulário de criação**

Criar `frontend/src/corepilot/modulos/CriarModuloForm.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { criarModulo } from './api';
import type { Modulo } from './types';

interface CriarModuloFormProps {
  accessToken: string;
  onCriado: (modulo: Modulo) => void;
  onCancelar: () => void;
}

export function CriarModuloForm({ accessToken, onCriado, onCancelar }: CriarModuloFormProps) {
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const modulo = await criarModulo(accessToken, {
        nome,
        objetivo,
        instrucoes: instrucoes.trim() ? instrucoes : undefined,
      });
      onCriado(modulo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar módulo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <input
        type="text"
        placeholder="Nome do módulo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo do módulo"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />
      <textarea
        placeholder="Instruções adicionais (opcional)"
        value={instrucoes}
        onChange={(e) => setInstrucoes(e.target.value)}
        rows={3}
      />
      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar módulo'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Criar a lista de módulos**

Criar `frontend/src/corepilot/modulos/ModulosList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { listarModulos } from './api';
import { CriarModuloForm } from './CriarModuloForm';
import type { Modulo } from './types';

interface ModulosListProps {
  accessToken: string;
  onAbrirModulo: (modulo: Modulo) => void;
}

export function ModulosList({ accessToken, onAbrirModulo }: ModulosListProps) {
  const [modulos, setModulos] = useState<Modulo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarModulos(accessToken)
      .then(setModulos)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!modulos) return <div>Carregando módulos…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>Módulos</h2>
      {modulos.length === 0 && <div>Nenhum módulo ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modulos.map((modulo) => (
          <li key={modulo.id}>
            <button onClick={() => onAbrirModulo(modulo)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{modulo.nome}</strong> — {modulo.objetivo}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarModuloForm
          accessToken={accessToken}
          onCriado={(modulo) => {
            setMostrandoForm(false);
            setModulos((atual) => [modulo, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar módulo</button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verificação manual (sem test runner no frontend)**

Com o backend rodando (Task 5 já testada manualmente), rode `npm run dev` no
frontend e confirme visualmente (ainda sem estar ligado em `FundacaoStatus`
— isso é o Step 6) que os componentes compilam sem erro de tipo
(`npm run build`).

- [ ] **Step 6: Ligar `ModulosList` em `FundacaoStatus`**

Editar `frontend/src/corepilot/auth/FundacaoStatus.tsx` para renderizar
`<ModulosList accessToken={session.access_token} onAbrirModulo={...} />`
abaixo do painel de usuário/empresa/perfil já existente (não remova nada do
que já está lá — só adicione a seção de módulos). Por enquanto,
`onAbrirModulo` pode só guardar o módulo selecionado em um `useState` local
(`moduloSelecionado: Modulo | null`) — a tela de chat real que consome esse
estado é a Task 8; deixe um `console.log`/placeholder por ora se a Task 8
ainda não existir neste ponto do plano (ela é a próxima task, então isso é
temporário só até lá).

- [ ] **Step 7: Rodar o build do frontend**

Run: `npm run build` (dentro de `frontend/`)
Expected: sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/corepilot/modulos frontend/src/corepilot/auth/FundacaoStatus.tsx
git commit -m "feat(frontend): lista e criação de módulos reais em FundacaoStatus"
```

---

## Task 8: Frontend — chat real (streaming) reaproveitando ChatComposer/MessageBubble

**Files:**
- Create: `frontend/src/corepilot/modulos/chatStream.ts`
- Create: `frontend/src/corepilot/modulos/ChatSidebarReal.tsx`
- Create: `frontend/src/corepilot/modulos/ChatView.tsx`
- Modify: `frontend/src/corepilot/auth/FundacaoStatus.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Fase 1), `ChatComposer`/`MessageBubble` (protótipo existente, **sem modificação**), tipos de `./types` (Task 7).
- Produces: `<ChatView accessToken modulo onVoltar />` — consumido por `FundacaoStatus` (substitui o placeholder da Task 7 Step 6).

- [ ] **Step 1: Criar o cliente de conversas e o parser do stream NDJSON**

Criar `frontend/src/corepilot/modulos/chatStream.ts`:

```typescript
import { apiFetch } from '../api/apiFetch';
import type { Conversa, Mensagem } from './types';

export async function listarConversas(accessToken: string, moduloId: string): Promise<Conversa[]> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar conversas (status ${response.status})`);
  return (await response.json()) as Conversa[];
}

export async function criarConversa(accessToken: string, moduloId: string): Promise<Conversa> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao criar conversa (status ${response.status})`);
  return (await response.json()) as Conversa;
}

export async function listarMensagens(accessToken: string, conversaId: string): Promise<Mensagem[]> {
  const response = await apiFetch(`/conversas/${conversaId}/mensagens`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar mensagens (status ${response.status})`);
  return (await response.json()) as Mensagem[];
}

export interface EnviarMensagemHandlers {
  onDelta: (texto: string) => void;
  onDone: (info: { mensagemId: string; tokensEntrada: number; tokensSaida: number }) => void;
  onErro: (mensagem: string) => void;
}

export async function enviarMensagemStreaming(
  accessToken: string,
  conversaId: string,
  conteudo: string,
  handlers: EnviarMensagemHandlers,
): Promise<void> {
  const response = await apiFetch(`/conversas/${conversaId}/mensagens`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conteudo }),
  });

  if (!response.ok || !response.body) {
    handlers.onErro(`Falha ao enviar mensagem (status ${response.status})`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let indiceQuebra: number;
    while ((indiceQuebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, indiceQuebra).trim();
      buffer = buffer.slice(indiceQuebra + 1);
      if (!linha) continue;

      const evento = JSON.parse(linha) as
        | { type: 'delta'; text: string }
        | { type: 'done'; mensagemId: string; tokensEntrada: number; tokensSaida: number }
        | { type: 'erro'; mensagem: string };

      if (evento.type === 'delta') handlers.onDelta(evento.text);
      else if (evento.type === 'done') handlers.onDone(evento);
      else handlers.onErro(evento.mensagem);
    }
  }
}
```

- [ ] **Step 2: Criar o sidebar de conversas reais (versão paralela ao `ModuleChatSidebar` mock — não reaproveita nem modifica o existente)**

Criar `frontend/src/corepilot/modulos/ChatSidebarReal.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { criarConversa, listarConversas } from './chatStream';
import type { Conversa } from './types';

interface ChatSidebarRealProps {
  accessToken: string;
  moduloId: string;
  conversaAtualId: string | null;
  onSelecionarConversa: (conversa: Conversa) => void;
}

export function ChatSidebarReal({
  accessToken,
  moduloId,
  conversaAtualId,
  onSelecionarConversa,
}: ChatSidebarRealProps) {
  const [conversas, setConversas] = useState<Conversa[]>([]);

  useEffect(() => {
    listarConversas(accessToken, moduloId).then(setConversas).catch(() => setConversas([]));
  }, [accessToken, moduloId]);

  async function handleNovaConversa() {
    const conversa = await criarConversa(accessToken, moduloId);
    setConversas((atual) => [conversa, ...atual]);
    onSelecionarConversa(conversa);
  }

  return (
    <div style={{ width: 220, borderRight: '1px solid #ddd', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={handleNovaConversa}>+ Nova conversa</button>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conversas.map((conversa) => (
          <li key={conversa.id}>
            <button
              onClick={() => onSelecionarConversa(conversa)}
              style={{
                width: '100%',
                textAlign: 'left',
                fontWeight: conversa.id === conversaAtualId ? 700 : 400,
              }}
            >
              {conversa.titulo ?? 'Nova conversa'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Criar a tela de chat, reaproveitando `ChatComposer`/`MessageBubble` sem modificá-los**

Antes de escrever este arquivo, leia (não modifique)
`frontend/src/corepilot/components/chat/ChatComposer.tsx` e
`frontend/src/corepilot/components/chat/MessageBubble.tsx` para confirmar as
props exatas que eles esperam — o brief assume as props descritas na spec
(`value`/`onChange`/`onKeyDown`/`onSend`/`attachments` para o `ChatComposer`;
uma `ChatMessage { id; isUser; isAi; text }` para o `MessageBubble`), mas
confirme contra o código real antes de usar.

Criar `frontend/src/corepilot/modulos/ChatView.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatSidebarReal } from './ChatSidebarReal';
import { criarConversa, enviarMensagemStreaming, listarMensagens } from './chatStream';
import type { Conversa, Mensagem, Modulo } from './types';

interface ChatViewProps {
  accessToken: string;
  modulo: Modulo;
  onVoltar: () => void;
}

let proximoIdLocal = 1;

export function ChatView({ accessToken, modulo, onVoltar }: ChatViewProps) {
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [draft, setDraft] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const respostaEmAndamentoRef = useRef<string>('');

  useEffect(() => {
    // Depende só de modulo.id, não de accessToken: o token do Supabase é
    // renovado periodicamente, e reagir a ele aqui criaria uma conversa nova
    // a cada renovação — o efeito deve rodar só quando o módulo muda.
    criarConversa(accessToken, modulo.id).then(setConversa).catch((err: Error) => setErro(err.message));
  }, [modulo.id]);

  function carregarMensagens(conversaId: string) {
    listarMensagens(accessToken, conversaId)
      .then(setMensagens)
      .catch((err: Error) => setErro(err.message));
  }

  function handleSelecionarConversa(novaConversa: Conversa) {
    setConversa(novaConversa);
    carregarMensagens(novaConversa.id);
  }

  async function handleEnviar() {
    if (!conversa || !draft.trim() || enviando) return;

    const texto = draft;
    setDraft('');
    setEnviando(true);
    setErro(null);
    respostaEmAndamentoRef.current = '';

    const idUsuario = `local-${proximoIdLocal++}`;
    const idAgente = `local-${proximoIdLocal++}`;

    setMensagens((atual) => [
      ...atual,
      { id: idUsuario, conversaId: conversa.id, papel: 'usuario', conteudo: texto, tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
      { id: idAgente, conversaId: conversa.id, papel: 'agente', conteudo: '', tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
    ]);

    await enviarMensagemStreaming(accessToken, conversa.id, texto, {
      onDelta: (delta) => {
        respostaEmAndamentoRef.current += delta;
        setMensagens((atual) =>
          atual.map((m) => (m.id === idAgente ? { ...m, conteudo: respostaEmAndamentoRef.current } : m)),
        );
      },
      onDone: () => {
        setEnviando(false);
      },
      onErro: (mensagemErro) => {
        setErro(mensagemErro);
        setEnviando(false);
      },
    });
  }

  return (
    <div style={{ display: 'flex', height: '70vh' }}>
      <ChatSidebarReal
        accessToken={accessToken}
        moduloId={modulo.id}
        conversaAtualId={conversa?.id ?? null}
        onSelecionarConversa={handleSelecionarConversa}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2>{modulo.nome}</h2>
          <button onClick={onVoltar}>Voltar</button>
        </div>
        {erro && <div style={{ color: 'crimson' }}>{erro}</div>}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mensagens.map((mensagem, indice) => (
            <MessageBubble
              key={mensagem.id}
              message={{
                id: indice,
                isUser: mensagem.papel === 'usuario',
                isAi: mensagem.papel === 'agente',
                text: mensagem.conteudo,
              }}
            />
          ))}
        </div>
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleEnviar();
            }
          }}
          onSend={() => void handleEnviar()}
          attachments={[]}
          onAttach={() => {}}
        />
      </div>
    </div>
  );
}
```

Se as props reais de `ChatComposer`/`MessageBubble` (lidas no início deste
step) divergirem do que está acima, ajuste `ChatView.tsx` para bater
exatamente com a interface real — não altere `ChatComposer.tsx` nem
`MessageBubble.tsx` para se adaptar ao `ChatView`, é o contrário.

- [ ] **Step 4: Ligar `ChatView` em `FundacaoStatus`, substituindo o placeholder da Task 7**

Editar `frontend/src/corepilot/auth/FundacaoStatus.tsx`: quando
`moduloSelecionado` não for `null`, renderizar
`<ChatView accessToken={session.access_token} modulo={moduloSelecionado} onVoltar={() => setModuloSelecionado(null)} />`
em vez do placeholder temporário.

- [ ] **Step 5: Verificação manual completa**

Com o backend rodando (porta não-conflitante, como nas fases/tasks
anteriores) e `npm run dev` no frontend:
1. Logar com um usuário seed (Fase 1).
2. Criar um módulo nomeado, por exemplo, "Compras".
3. Abrir o módulo, mandar uma mensagem simples ("Diga oi").
4. Confirmar que a resposta aparece incrementalmente na tela (efeito de
   streaming visível, não tudo de uma vez).
5. Recarregar a página, reabrir o módulo, confirmar que o histórico da
   conversa (pergunta + resposta) ainda aparece.
6. Criar uma segunda conversa no mesmo módulo, confirmar que aparece
   separada da primeira no sidebar.

- [ ] **Step 6: Rodar o build e o lint do frontend**

Run: `npm run build && npm run lint` (dentro de `frontend/`)
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/corepilot/modulos frontend/src/corepilot/auth/FundacaoStatus.tsx
git commit -m "feat(frontend): chat real com streaming, reaproveitando ChatComposer/MessageBubble"
```

---

## Task 9: Verificação final do caso de validação (spec §10)

**Files:** nenhum arquivo novo — checklist de verificação.

- [ ] **Step 1: Rodar toda a suíte do backend**

```bash
cd backend
npm test
npm run test:e2e
```

Expected: todos os testes PASS, incluindo `chat.e2e-spec.ts` (Task 6) e os
testes já existentes da Fase 1.

- [ ] **Step 2: Checklist final contra a spec (§10)**

- [ ] Criar um Módulo real pela UI, persistido no Postgres (sobrevive a reload).
- [ ] Múltiplos módulos coexistem na mesma empresa.
- [ ] Enviar uma mensagem e ver a resposta chegando em streaming.
- [ ] Recarregar a página preserva o histórico da conversa.
- [ ] Cada troca de mensagem gera uma linha em `AuditLog` com `acao: 'chat_mensagem'`.
- [ ] Isolamento entre empresas vale para módulos e conversas (Task 6 automatizado + checagem manual, se quiser, com um segundo usuário seed).
- [ ] `ANTHROPIC_API_KEY` nunca aparece no frontend nem é commitada
  (`git log --stat -- backend/.env.local` não deve retornar nada).

Se todos os itens acima passarem, a Fase 2 (Módulo + Chat) está validada e a
Fase 3 (Agentes + Skills) pode começar como um novo ciclo brainstorm → spec →
plano.
