# Sidebar de conversas para módulos custom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a módulos custom (Agronomia hoje, qualquer módulo criado depois) a mesma sidebar visual de Compras/Financeiro (histórico, nova conversa, busca, tags, fixar, arquivar, excluir, bases conectadas), com dados reais no backend, sem alterar o comportamento de Compras/Financeiro.

**Architecture:** Backend estende `Conversa` (arquivada/fixada/tagId) e adiciona `ConversaTag`, com endpoints PATCH/DELETE em `/modulos/:id/conversas/:id` e CRUD em `/modulos/:id/tags`. Frontend extrai a parte visual de `ModuleChatSidebar.tsx` para um `ChatSidebarShell.tsx` reutilizável, e cria `CustomModuleChatSidebar.tsx` ligado ao estado/ações reais, plugado em `CustomModuleView.tsx`.

**Tech Stack:** NestJS 11 + Prisma (Postgres/Supabase) no backend; React 19 + Vite (TypeScript, sem framework de estado externo — hook `useCorePilotState`) no frontend.

**Spec:** `docs/superpowers/specs/2026-08-03-modulo-chat-sidebar-design.md`

## Global Constraints

- Backend logic stays local — nada disso vai para Supabase Edge Functions (CLAUDE.md).
- Toda tabela nova nasce com RLS habilitada e sem policies (`ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` no fim da migration) — regra permanente do projeto, ver `prisma/migrations/20260726073505_lock_down_data_api/migration.sql`.
- Todo endpoint novo fica atrás de `JwtAuthGuard` + `TenantGuard`, escopado por `empresaId`/`usuarioId` via `TenantContext` — nunca confiar em IDs vindos do cliente sem checagem de posse.
- Prettier: aspas simples, trailing commas em tudo (`.prettierrc`). ESLint com `no-explicit-any` desabilitado.
- Testes de backend ficam colocados junto do código (`*.spec.ts`), rodam com `npx jest path/to/file.spec.ts` a partir de `backend/`.
- Frontend não tem test runner configurado — validação é manual, no navegador (`npm run dev`).
- Não existe ação "renomear conversa" no padrão atual — não implementar.
- Comportamento de `ComprasView`/`FinanceiroView` não pode mudar (mesmo visual, mesmos dados mock).

---

## Task 1: Schema Prisma — `Conversa` (arquivada/fixada/tagId) + `ConversaTag`

**Files:**
- Modify: `backend/prisma/schema.prisma:10-21` (model `Empresa`), `:65-83` (model `Modulo`), `:85-98` (model `Conversa`)
- Create (via `prisma migrate dev`): `backend/prisma/migrations/<timestamp>_conversa_organizacao/migration.sql`

**Interfaces:**
- Produces: colunas `Conversa.arquivada: boolean`, `Conversa.fixada: boolean`, `Conversa.tagId: string | null`; model `ConversaTag { id, empresaId, moduloId, nome, criadoEm }`. Tasks 2–5 dependem desses nomes exatos.

- [ ] **Step 1: Editar `backend/prisma/schema.prisma`**

Em `model Empresa` (linha 10-21), adicionar a back-relation depois de `fontesDeDados`:

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
  conversaTags  ConversaTag[]
}
```

Em `model Modulo` (linha 65-83), adicionar a back-relation depois de `consultas`:

```prisma
model Modulo {
  id          String   @id @default(uuid())
  empresaId   String
  nome        String
  objetivo    String
  instrucoes  String?
  descricao   String?
  responsavel String?
  areas       String?
  icone       String?
  cor         String?
  modeloIA    String   @default("claude-sonnet-5")
  criadoEm    DateTime @default(now())

  empresa      Empresa                 @relation(fields: [empresaId], references: [id])
  conversas    Conversa[]
  agentes      Agente[]
  consultas    ConsultaParametrizada[]
  conversaTags ConversaTag[]
}
```

Substituir `model Conversa` (linha 85-98) por:

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

  empresa   Empresa      @relation(fields: [empresaId], references: [id])
  modulo    Modulo       @relation(fields: [moduloId], references: [id])
  usuario   Usuario      @relation(fields: [usuarioId], references: [id])
  tag       ConversaTag? @relation(fields: [tagId], references: [id], onDelete: SetNull)
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

- [ ] **Step 2: Gerar e aplicar a migration**

A partir de `backend/`, com `.env.local` configurado (ver seção "Local setup" do `CLAUDE.md`):

Run: `npm run prisma:migrate -- --name conversa_organizacao`
Expected: cria `prisma/migrations/<timestamp>_conversa_organizacao/migration.sql` e aplica no banco (Supabase compartilhado do projeto), sem erros. O prompt interativo do Prisma não deve aparecer (schema é aditivo, sem perda de dados); se aparecer pedindo confirmação de algo destrutivo, pare e revise o diff do schema antes de confirmar.

- [ ] **Step 3: Adicionar a linha de RLS na migration gerada**

Abrir o arquivo `migration.sql` recém-criado e adicionar ao final (a tabela `Conversa` já tem RLS habilitada desde `20260726073505_lock_down_data_api` — só a tabela nova precisa da linha):

```sql
-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "ConversaTag" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Regenerar o client e conferir o build**

Run: `npm run prisma:generate`
Expected: regenera `@prisma/client` sem erros.

Run: `npm run build`
Expected: compila sem erros de tipo (o client do Prisma agora expõe `prisma.conversaTag` e os novos campos de `prisma.conversa`).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): adiciona arquivada/fixada/tag a Conversa e model ConversaTag"
```

---

## Task 2: `ConversaService` — `update` e `remove`

**Files:**
- Modify: `backend/src/conversa/conversa.service.ts`
- Test: `backend/src/conversa/conversa.service.spec.ts`

**Interfaces:**
- Consumes: `ConversaService.findOwned(conversaId, usuarioId)` (já existe, linhas 27-38 do arquivo atual — lança `NotFoundException` se a conversa não existir ou não for do usuário).
- Produces: `ConversaService.update(conversaId: string, usuarioId: string, dto: { titulo?: string; arquivada?: boolean; fixada?: boolean; tagId?: string | null }): Promise<Conversa>` e `ConversaService.remove(conversaId: string, usuarioId: string): Promise<void>` — Task 3 (controller) consome os dois.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/conversa/conversa.service.spec.ts` (dentro do `describe('ConversaService', ...)`, depois do teste `'findOwned retorna a conversa com o módulo incluído'`), e estender `buildDeps()` para incluir `update`/`delete`/`deleteMany` nos mocks:

```ts
  // dentro de buildDeps(), no objeto `prisma.conversa`, adicionar:
  //   update: jest.fn(),
  //   delete: jest.fn(),
  // e adicionar ao objeto `prisma`:
  //   mensagem: { deleteMany: jest.fn() },

  it('update atualiza a conversa depois de confirmar posse', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue({ id: 'conversa-1', usuarioId: 'usuario-1' });
    (prisma.conversa.update as jest.Mock).mockResolvedValue({ id: 'conversa-1', arquivada: true });
    const service = new ConversaService(prisma, moduloService);

    const resultado = await service.update('conversa-1', 'usuario-1', { arquivada: true });

    expect(prisma.conversa.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversa-1', usuarioId: 'usuario-1' },
      include: { modulo: true },
    });
    expect(prisma.conversa.update).toHaveBeenCalledWith({
      where: { id: 'conversa-1' },
      data: { titulo: undefined, arquivada: true, fixada: undefined, tagId: undefined },
    });
    expect(resultado).toEqual({ id: 'conversa-1', arquivada: true });
  });

  it('update lança NotFoundException se a conversa não for do usuário', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaService(prisma, moduloService);

    await expect(service.update('conversa-x', 'usuario-1', { arquivada: true })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.conversa.update).not.toHaveBeenCalled();
  });

  it('remove apaga as mensagens e depois a conversa, após confirmar posse', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue({ id: 'conversa-1', usuarioId: 'usuario-1' });
    const service = new ConversaService(prisma, moduloService);

    await service.remove('conversa-1', 'usuario-1');

    expect(prisma.mensagem.deleteMany).toHaveBeenCalledWith({ where: { conversaId: 'conversa-1' } });
    expect(prisma.conversa.delete).toHaveBeenCalledWith({ where: { id: 'conversa-1' } });
  });

  it('remove lança NotFoundException se a conversa não for do usuário (não apaga nada)', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaService(prisma, moduloService);

    await expect(service.remove('conversa-x', 'usuario-1')).rejects.toThrow(NotFoundException);
    expect(prisma.mensagem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.conversa.delete).not.toHaveBeenCalled();
  });
```

Também atualizar `buildDeps()` no topo do arquivo para:

```ts
  function buildDeps() {
    const prisma = {
      conversa: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      mensagem: {
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (a partir de `backend/`): `npx jest src/conversa/conversa.service.spec.ts -v`
Expected: FAIL — `service.update is not a function` / `service.remove is not a function`.

- [ ] **Step 3: Implementar `update` e `remove` em `ConversaService`**

Substituir o conteúdo de `backend/src/conversa/conversa.service.ts` por:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

export interface AtualizarConversaDto {
  titulo?: string;
  arquivada?: boolean;
  fixada?: boolean;
  tagId?: string | null;
}

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

  async update(conversaId: string, usuarioId: string, dto: AtualizarConversaDto) {
    await this.findOwned(conversaId, usuarioId);

    return this.prisma.conversa.update({
      where: { id: conversaId },
      data: {
        titulo: dto.titulo,
        arquivada: dto.arquivada,
        fixada: dto.fixada,
        tagId: dto.tagId,
      },
    });
  }

  async remove(conversaId: string, usuarioId: string) {
    await this.findOwned(conversaId, usuarioId);

    await this.prisma.mensagem.deleteMany({ where: { conversaId } });
    await this.prisma.conversa.delete({ where: { id: conversaId } });
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/conversa/conversa.service.spec.ts -v`
Expected: PASS (todos os testes, incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversa/conversa.service.ts backend/src/conversa/conversa.service.spec.ts
git commit -m "feat(backend): ConversaService.update/remove escopados por dono"
```

---

## Task 3: `ConversaController` — `PATCH` e `DELETE`

**Files:**
- Modify: `backend/src/conversa/conversa.controller.ts`
- Test: `backend/src/conversa/conversa.controller.spec.ts`

**Interfaces:**
- Consumes: `ConversaService.update`/`ConversaService.remove` (Task 2).
- Produces: `PATCH /modulos/:moduloId/conversas/:id` e `DELETE /modulos/:moduloId/conversas/:id` — consumidos pelo frontend (Task 6: `atualizarConversa`/`excluirConversa`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/conversa/conversa.controller.spec.ts` (dentro do `describe`):

```ts
  it('atualiza uma conversa do usuário do tenant atual', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'conversa-1', arquivada: true }),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.atualizar('conversa-1', { arquivada: true });

    expect(service.update).toHaveBeenCalledWith('conversa-1', 'usuario-1', { arquivada: true });
    expect(resultado).toEqual({ id: 'conversa-1', arquivada: true });
  });

  it('remove uma conversa do usuário do tenant atual', async () => {
    const service = {
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.remover('conversa-1');

    expect(service.remove).toHaveBeenCalledWith('conversa-1', 'usuario-1');
    expect(resultado).toEqual({ ok: true });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/conversa/conversa.controller.spec.ts -v`
Expected: FAIL — `controller.atualizar is not a function` / `controller.remover is not a function`.

- [ ] **Step 3: Implementar os endpoints**

Substituir o conteúdo de `backend/src/conversa/conversa.controller.ts` por:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService, type AtualizarConversaDto } from './conversa.service';

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

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: AtualizarConversaDto) {
    const { usuarioId } = this.tenantContext.get();
    return this.conversaService.update(id, usuarioId, body);
  }

  @Delete(':id')
  async remover(@Param('id') id: string) {
    const { usuarioId } = this.tenantContext.get();
    await this.conversaService.remove(id, usuarioId);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/conversa/conversa.controller.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversa/conversa.controller.ts backend/src/conversa/conversa.controller.spec.ts
git commit -m "feat(backend): PATCH/DELETE /modulos/:moduloId/conversas/:id"
```

---

## Task 4: `ConversaTagService`

**Files:**
- Create: `backend/src/conversa/conversa-tag.service.ts`
- Test: `backend/src/conversa/conversa-tag.service.spec.ts`

**Interfaces:**
- Consumes: `ModuloService.findByIdInEmpresa(moduloId, empresaId)` (já existe em `backend/src/modulo/modulo.service.ts:33-43`).
- Produces: `ConversaTagService.create(moduloId, empresaId, nome): Promise<ConversaTag>`, `.findAllByModulo(moduloId, empresaId): Promise<ConversaTag[]>`, `.remove(tagId, empresaId): Promise<void>` — Task 5 (controller) consome os três.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/conversa/conversa-tag.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ConversaTagService } from './conversa-tag.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('ConversaTagService', () => {
  function buildDeps() {
    const prisma = {
      conversaTag: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria uma tag depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.conversaTag.create as jest.Mock).mockResolvedValue({ id: 'tag-1', nome: 'Cotações' });
    const service = new ConversaTagService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'empresa-1', 'Cotações');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.conversaTag.create).toHaveBeenCalledWith({
      data: { moduloId: 'modulo-1', empresaId: 'empresa-1', nome: 'Cotações' },
    });
    expect(resultado).toEqual({ id: 'tag-1', nome: 'Cotações' });
  });

  it('lista tags só do módulo e empresa informados', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConversaTagService(prisma, moduloService);

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(prisma.conversaTag.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1', empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'asc' },
    });
  });

  it('remove uma tag depois de confirmar que é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findFirst as jest.Mock).mockResolvedValue({ id: 'tag-1', empresaId: 'empresa-1' });
    const service = new ConversaTagService(prisma, moduloService);

    await service.remove('tag-1', 'empresa-1');

    expect(prisma.conversaTag.findFirst).toHaveBeenCalledWith({ where: { id: 'tag-1', empresaId: 'empresa-1' } });
    expect(prisma.conversaTag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
  });

  it('remove lança NotFoundException se a tag não for da empresa (não apaga nada)', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaTagService(prisma, moduloService);

    await expect(service.remove('tag-x', 'empresa-1')).rejects.toThrow(NotFoundException);
    expect(prisma.conversaTag.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/conversa/conversa-tag.service.spec.ts -v`
Expected: FAIL — `Cannot find module './conversa-tag.service'`.

- [ ] **Step 3: Implementar `ConversaTagService`**

Criar `backend/src/conversa/conversa-tag.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

@Injectable()
export class ConversaTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, empresaId: string, nome: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.conversaTag.create({
      data: { moduloId, empresaId, nome },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    return this.prisma.conversaTag.findMany({
      where: { moduloId, empresaId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async remove(tagId: string, empresaId: string) {
    const tag = await this.prisma.conversaTag.findFirst({ where: { id: tagId, empresaId } });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    await this.prisma.conversaTag.delete({ where: { id: tagId } });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/conversa/conversa-tag.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversa/conversa-tag.service.ts backend/src/conversa/conversa-tag.service.spec.ts
git commit -m "feat(backend): ConversaTagService (criar/listar/remover, escopado por empresa)"
```

---

## Task 5: `ConversaTagController` + wiring no `ConversaModule`

**Files:**
- Create: `backend/src/conversa/conversa-tag.controller.ts`
- Test: `backend/src/conversa/conversa-tag.controller.spec.ts`
- Modify: `backend/src/conversa/conversa.module.ts`

**Interfaces:**
- Consumes: `ConversaTagService` (Task 4).
- Produces: `POST/GET /modulos/:moduloId/tags`, `DELETE /modulos/:moduloId/tags/:tagId` — consumidos pelo frontend (Task 6: `listarTags`/`criarTag`/`removerTag`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/src/conversa/conversa-tag.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ConversaTagController } from './conversa-tag.controller';
import type { ConversaTagService } from './conversa-tag.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConversaTagController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  it('cria uma tag no módulo informado, para a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'tag-1', nome: 'Cotações' }),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1', { nome: 'Cotações' });

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'empresa-1', 'Cotações');
    expect(resultado).toEqual({ id: 'tag-1', nome: 'Cotações' });
  });

  it('rejeita criar tag sem nome', async () => {
    const service = { create: jest.fn() } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    await expect(controller.criar('modulo-1', { nome: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista tags do módulo informado, para a empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'tag-1' }]),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'tag-1' }]);
  });

  it('remove uma tag, para a empresa do tenant atual', async () => {
    const service = {
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.remover('tag-1');

    expect(service.remove).toHaveBeenCalledWith('tag-1', 'empresa-1');
    expect(resultado).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/conversa/conversa-tag.controller.spec.ts -v`
Expected: FAIL — `Cannot find module './conversa-tag.controller'`.

- [ ] **Step 3: Implementar o controller e ligar no módulo**

Criar `backend/src/conversa/conversa-tag.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaTagService } from './conversa-tag.service';

interface CriarConversaTagDto {
  nome: string;
}

@Controller('modulos/:moduloId/tags')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversaTagController {
  constructor(
    private readonly conversaTagService: ConversaTagService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string, @Body() body: CriarConversaTagDto) {
    if (!body.nome?.trim()) {
      throw new BadRequestException('nome é obrigatório');
    }

    const { empresaId } = this.tenantContext.get();
    return this.conversaTagService.create(moduloId, empresaId, body.nome.trim());
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.conversaTagService.findAllByModulo(moduloId, empresaId);
  }

  @Delete(':tagId')
  async remover(@Param('tagId') tagId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.conversaTagService.remove(tagId, empresaId);
    return { ok: true };
  }
}
```

Substituir `backend/src/conversa/conversa.module.ts` por:

```ts
import { Module } from '@nestjs/common';
import { ConversaController } from './conversa.controller';
import { ConversaService } from './conversa.service';
import { ConversaTagController } from './conversa-tag.controller';
import { ConversaTagService } from './conversa-tag.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';

@Module({
  imports: [AuthModule, ModuloModule],
  controllers: [ConversaController, ConversaTagController],
  providers: [ConversaService, ConversaTagService],
  exports: [ConversaService, ConversaTagService],
})
export class ConversaModule {}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/conversa -v`
Expected: PASS — todos os specs de `src/conversa/` (service, controller, tag service, tag controller).

Run (a partir de `backend/`): `npm run build`
Expected: compila sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversa/conversa-tag.controller.ts backend/src/conversa/conversa-tag.controller.spec.ts backend/src/conversa/conversa.module.ts
git commit -m "feat(backend): ConversaTagController (CRUD de tags por módulo)"
```

---

## Task 6: Frontend — tipos e chamadas de API

**Files:**
- Modify: `frontend/src/corepilot/modulos/types.ts`
- Modify: `frontend/src/corepilot/modulos/chatStream.ts`
- Create: `frontend/src/corepilot/modulos/tags-api.ts`

**Interfaces:**
- Produces: `Conversa { id, moduloId, titulo, arquivada, fixada, tagId, criadoEm, atualizadoEm }`, `ConversaTag { id, moduloId, nome, criadoEm }`, `atualizarConversa(accessToken, moduloId, conversaId, dto): Promise<Conversa>`, `excluirConversa(accessToken, moduloId, conversaId): Promise<void>`, `listarTags`/`criarTag`/`removerTag(accessToken, moduloId, ...)`. Task 8 consome tudo isso.

- [ ] **Step 1: Estender `frontend/src/corepilot/modulos/types.ts`**

Substituir a interface `Conversa` (linhas 15-21) por:

```ts
export interface Conversa {
  id: string;
  moduloId: string;
  titulo: string | null;
  arquivada: boolean;
  fixada: boolean;
  tagId: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ConversaTag {
  id: string;
  moduloId: string;
  nome: string;
  criadoEm: string;
}
```

- [ ] **Step 2: Estender `frontend/src/corepilot/modulos/chatStream.ts`**

Adicionar ao final do arquivo (depois de `criarConversa`, mantendo o resto do arquivo intacto):

```ts
export interface AtualizarConversaDto {
  titulo?: string;
  arquivada?: boolean;
  fixada?: boolean;
  tagId?: string | null;
}

export async function atualizarConversa(
  accessToken: string,
  moduloId: string,
  conversaId: string,
  dto: AtualizarConversaDto,
): Promise<Conversa> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas/${conversaId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar conversa (status ${response.status})`);
  return (await response.json()) as Conversa;
}

export async function excluirConversa(accessToken: string, moduloId: string, conversaId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas/${conversaId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao excluir conversa (status ${response.status})`);
}
```

(essa função usa o `Conversa` já importado no topo do arquivo, via `import type { Conversa, Mensagem } from './types';`)

- [ ] **Step 3: Criar `frontend/src/corepilot/modulos/tags-api.ts`**

```ts
import { apiFetch } from '../api/apiFetch';
import type { ConversaTag } from './types';

export async function listarTags(accessToken: string, moduloId: string): Promise<ConversaTag[]> {
  const response = await apiFetch(`/modulos/${moduloId}/tags`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar tags (status ${response.status})`);
  return (await response.json()) as ConversaTag[];
}

export async function criarTag(accessToken: string, moduloId: string, nome: string): Promise<ConversaTag> {
  const response = await apiFetch(`/modulos/${moduloId}/tags`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao criar tag (status ${response.status})`);
  return (await response.json()) as ConversaTag;
}

export async function removerTag(accessToken: string, moduloId: string, tagId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/tags/${tagId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao remover tag (status ${response.status})`);
}
```

- [ ] **Step 4: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: falha nesse ponto é aceitável só se for por causa do Task 8 ainda não existir (nada deveria quebrar por causa deste task isoladamente, já que nada consome essas funções ainda) — deve compilar limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/corepilot/modulos/types.ts frontend/src/corepilot/modulos/chatStream.ts frontend/src/corepilot/modulos/tags-api.ts
git commit -m "feat(frontend): tipos e API de organização/tags de conversas de módulo"
```

---

## Task 7: Frontend — estado (`initialState.ts`)

**Files:**
- Modify: `frontend/src/corepilot/initialState.ts`

**Interfaces:**
- Consumes: `Conversa`, `ConversaTag` (Task 6).
- Produces: campos `moduloConversas`, `moduloConversasLoading`, `moduloConversasSearch`, `moduloTags`, `moduloActiveTagId`, `moduloTagsExpanded`, `moduloShowNewTagForm`, `moduloNewTagName`, `moduloArchiveView`, `moduloBasesOpen`, `moduloBasesConectadas` em `CorePilotState`. Task 8 (ações) e Tasks 10-12 (componentes) consomem esses nomes exatos.

- [ ] **Step 1: Atualizar o import de tipos**

Em `frontend/src/corepilot/initialState.ts:31`, trocar:

```ts
import type { Mensagem, Modulo } from './modulos/types';
```

por:

```ts
import type { Conversa, ConversaTag, Mensagem, Modulo } from './modulos/types';
```

- [ ] **Step 2: Estender a interface `CorePilotState`**

Em `frontend/src/corepilot/initialState.ts:195-200`, substituir:

```ts
  moduloConversaId: string | null;
  moduloMensagens: Mensagem[];
  moduloChatDraft: string;
  moduloChatEnviando: boolean;
  moduloChatErro: string | null;
  moduloChatStatus: string | null;
}
```

por:

```ts
  moduloConversaId: string | null;
  moduloMensagens: Mensagem[];
  moduloChatDraft: string;
  moduloChatEnviando: boolean;
  moduloChatErro: string | null;
  moduloChatStatus: string | null;

  moduloConversas: Conversa[];
  moduloConversasLoading: boolean;
  moduloConversasSearch: string;
  moduloTags: ConversaTag[];
  moduloActiveTagId: string;
  moduloTagsExpanded: boolean;
  moduloShowNewTagForm: boolean;
  moduloNewTagName: string;
  moduloArchiveView: boolean;
  moduloBasesOpen: boolean;
  moduloBasesConectadas: string[];
}
```

- [ ] **Step 3: Estender os valores iniciais**

Em `frontend/src/corepilot/initialState.ts:445-450`, substituir:

```ts
    moduloConversaId: null,
    moduloMensagens: [],
    moduloChatDraft: '',
    moduloChatEnviando: false,
    moduloChatErro: null,
    moduloChatStatus: null,
  };
}
```

por:

```ts
    moduloConversaId: null,
    moduloMensagens: [],
    moduloChatDraft: '',
    moduloChatEnviando: false,
    moduloChatErro: null,
    moduloChatStatus: null,

    moduloConversas: [],
    moduloConversasLoading: false,
    moduloConversasSearch: '',
    moduloTags: [],
    moduloActiveTagId: 'all',
    moduloTagsExpanded: false,
    moduloShowNewTagForm: false,
    moduloNewTagName: '',
    moduloArchiveView: false,
    moduloBasesOpen: false,
    moduloBasesConectadas: [],
  };
}
```

- [ ] **Step 4: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros (os campos novos têm default, `CorePilotState` continua satisfeito por `createInitialState()`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/corepilot/initialState.ts
git commit -m "feat(frontend): estado de organização de conversas para módulos custom"
```

---

## Task 8: Frontend — ações (`useCorePilotState.ts`)

**Files:**
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Consumes: `atualizarConversa`, `excluirConversa` (Task 6, `modulos/chatStream.ts`); `listarTags`, `criarTag`, `removerTag` (Task 6, `modulos/tags-api.ts`); `listarConsultas` (já existe, `consultas/api.ts`); `listarFontesDeDados` (já existe, `fontes-de-dados/api.ts`); campos de estado (Task 7).
- Produces: ações `criarConversaModulo(moduloId)`, `selecionarConversaModulo(conversaId)`, `arquivarConversaModulo(moduloId, conversaId)`, `desarquivarConversaModulo(moduloId, conversaId)`, `fixarConversaModulo(moduloId, conversaId)`, `excluirConversaModulo(moduloId, conversaId)`, `atualizarBuscaConversasModulo(e)`, `abrirArquivadasModulo()`, `fecharArquivadasModulo()`, `toggleTagsExpandedModulo()`, `definirTagAtivaModulo(tagId)`, `toggleNewTagFormModulo()`, `updateNewTagNameModulo(e)`, `criarTagModulo(moduloId)`, `removerTagModulo(moduloId, tagId)`, `atribuirTagConversaModulo(moduloId, conversaId, tagId)`, `toggleBasesModulo()` — Tasks 10-12 consomem esses nomes exatos.

- [ ] **Step 1: Atualizar os imports**

Em `frontend/src/corepilot/useCorePilotState.ts:38`, trocar:

```ts
import { criarConversa, enviarMensagemStreaming, listarConversas, listarMensagens } from './modulos/chatStream';
```

por:

```ts
import {
  atualizarConversa,
  criarConversa,
  enviarMensagemStreaming,
  excluirConversa,
  listarConversas,
  listarMensagens,
} from './modulos/chatStream';
import { criarTag, listarTags, removerTag } from './modulos/tags-api';
```

- [ ] **Step 2: Reescrever `carregarConversaDoModulo` e adicionar as novas ações**

Em `frontend/src/corepilot/useCorePilotState.ts:977-987`, substituir:

```ts
  // --- Chat real do módulo ---
  const carregarConversaDoModulo = async (moduloId: string) => {
    try {
      const conversas = await listarConversas(accessToken, moduloId);
      const conversa = conversas[0] ?? (await criarConversa(accessToken, moduloId));
      const mensagens = await listarMensagens(accessToken, conversa.id);
      update({ moduloConversaId: conversa.id, moduloMensagens: mensagens });
    } catch (err) {
      update({ moduloChatErro: err instanceof Error ? err.message : 'Erro ao carregar conversa' });
    }
  };
```

por:

```ts
  // --- Chat real do módulo (histórico, organização, bases conectadas) ---
  const carregarConversaDoModulo = async (moduloId: string) => {
    update({ moduloConversasLoading: true, moduloChatErro: null });
    try {
      const [conversas, tags, consultas] = await Promise.all([
        listarConversas(accessToken, moduloId),
        listarTags(accessToken, moduloId),
        listarConsultas(accessToken, moduloId),
      ]);

      let fontes = state.moduloFontesDeDados;
      if (fontes.length === 0) {
        fontes = await listarFontesDeDados(accessToken);
        update({ moduloFontesDeDados: fontes });
      }
      const idsFontesUsadas = new Set(consultas.map((c) => c.fonteDeDadosId));
      const basesConectadas = fontes.filter((f) => idsFontesUsadas.has(f.id)).map((f) => f.nome);

      const primeiraVisivel = conversas.find((c) => !c.arquivada);
      const mensagens = primeiraVisivel ? await listarMensagens(accessToken, primeiraVisivel.id) : [];

      update({
        moduloConversasLoading: false,
        moduloConversas: conversas,
        moduloTags: tags,
        moduloBasesConectadas: basesConectadas,
        moduloConversaId: primeiraVisivel?.id ?? null,
        moduloMensagens: mensagens,
        moduloActiveTagId: 'all',
        moduloArchiveView: false,
      });
    } catch (err) {
      update({ moduloConversasLoading: false, moduloChatErro: err instanceof Error ? err.message : 'Erro ao carregar conversas' });
    }
  };

  const criarConversaModulo = async (moduloId: string) => {
    try {
      const conversa = await criarConversa(accessToken, moduloId);
      update((s) => ({
        moduloConversas: [conversa, ...s.moduloConversas],
        moduloConversaId: conversa.id,
        moduloMensagens: [],
        moduloArchiveView: false,
      }));
    } catch (err) {
      update({ moduloChatErro: err instanceof Error ? err.message : 'Erro ao criar conversa' });
    }
  };

  const selecionarConversaModulo = async (conversaId: string) => {
    if (conversaId === state.moduloConversaId) return;
    update({ moduloConversaId: conversaId, moduloMensagens: [], moduloChatErro: null });
    try {
      const mensagens = await listarMensagens(accessToken, conversaId);
      update({ moduloMensagens: mensagens });
    } catch (err) {
      update({ moduloChatErro: err instanceof Error ? err.message : 'Erro ao carregar mensagens' });
    }
  };

  const trocarParaProximaConversaVisivel = (conversaIdRemovida: string) => {
    const proximaVisivel = state.moduloConversas.find((c) => c.id !== conversaIdRemovida && !c.arquivada);
    if (proximaVisivel) void selecionarConversaModulo(proximaVisivel.id);
    else update({ moduloConversaId: null, moduloMensagens: [] });
  };

  const arquivarConversaModulo = async (moduloId: string, conversaId: string) => {
    const eraAtiva = state.moduloConversaId === conversaId;
    update((s) => ({
      moduloConversas: s.moduloConversas.map((c) => (c.id === conversaId ? { ...c, arquivada: true } : c)),
      chatMenuOpenId: null,
    }));
    if (eraAtiva) trocarParaProximaConversaVisivel(conversaId);
    try {
      await atualizarConversa(accessToken, moduloId, conversaId, { arquivada: true });
      showToast('Conversa arquivada.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao arquivar conversa');
    }
  };

  const desarquivarConversaModulo = async (moduloId: string, conversaId: string) => {
    update((s) => ({
      moduloConversas: s.moduloConversas.map((c) => (c.id === conversaId ? { ...c, arquivada: false } : c)),
    }));
    try {
      await atualizarConversa(accessToken, moduloId, conversaId, { arquivada: false });
      showToast('Conversa desarquivada.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao desarquivar conversa');
    }
  };

  const fixarConversaModulo = async (moduloId: string, conversaId: string) => {
    const conversa = state.moduloConversas.find((c) => c.id === conversaId);
    if (!conversa) return;
    const novaFixada = !conversa.fixada;
    update((s) => ({
      moduloConversas: s.moduloConversas.map((c) => (c.id === conversaId ? { ...c, fixada: novaFixada } : c)),
      chatMenuOpenId: null,
    }));
    try {
      await atualizarConversa(accessToken, moduloId, conversaId, { fixada: novaFixada });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao fixar conversa');
    }
  };

  const excluirConversaModulo = async (moduloId: string, conversaId: string) => {
    const eraAtiva = state.moduloConversaId === conversaId;
    update((s) => ({
      moduloConversas: s.moduloConversas.filter((c) => c.id !== conversaId),
      chatMenuOpenId: null,
    }));
    if (eraAtiva) trocarParaProximaConversaVisivel(conversaId);
    try {
      await excluirConversa(accessToken, moduloId, conversaId);
      showToast('Conversa excluída.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir conversa');
    }
  };

  const atualizarBuscaConversasModulo = (e: ChangeEvent<HTMLInputElement>) => update({ moduloConversasSearch: e.target.value });
  const abrirArquivadasModulo = () => update({ moduloArchiveView: true });
  const fecharArquivadasModulo = () => update({ moduloArchiveView: false });
  const toggleTagsExpandedModulo = () => update((s) => ({ moduloTagsExpanded: !s.moduloTagsExpanded }));
  const definirTagAtivaModulo = (tagId: string) => update({ moduloActiveTagId: tagId });
  const toggleNewTagFormModulo = () => update((s) => ({ moduloShowNewTagForm: !s.moduloShowNewTagForm, moduloNewTagName: '' }));
  const updateNewTagNameModulo = (e: ChangeEvent<HTMLInputElement>) => update({ moduloNewTagName: e.target.value });
  const toggleBasesModulo = () => update((s) => ({ moduloBasesOpen: !s.moduloBasesOpen }));

  const criarTagModulo = async (moduloId: string) => {
    const nome = state.moduloNewTagName.trim();
    if (!nome) return;
    try {
      const tag = await criarTag(accessToken, moduloId, nome);
      update((s) => ({ moduloTags: [...s.moduloTags, tag], moduloShowNewTagForm: false, moduloNewTagName: '' }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao criar tag');
    }
  };

  const removerTagModulo = async (moduloId: string, tagId: string) => {
    try {
      await removerTag(accessToken, moduloId, tagId);
      update((s) => ({
        moduloTags: s.moduloTags.filter((t) => t.id !== tagId),
        moduloActiveTagId: s.moduloActiveTagId === tagId ? 'all' : s.moduloActiveTagId,
        moduloConversas: s.moduloConversas.map((c) => (c.tagId === tagId ? { ...c, tagId: null } : c)),
      }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao remover tag');
    }
  };

  const atribuirTagConversaModulo = (moduloId: string, conversaId: string, tagId: string) => async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    update((s) => ({
      moduloConversas: s.moduloConversas.map((c) => (c.id === conversaId ? { ...c, tagId } : c)),
      chatMenuOpenId: null,
    }));
    try {
      await atualizarConversa(accessToken, moduloId, conversaId, { tagId });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao atribuir tag');
    }
  };
```

Note: essa reescrita usa `listarConsultas`, `listarFontesDeDados`, `showToast`, `update`, `state` — todos já importados/definidos mais acima no mesmo arquivo (`listarConsultas` vem de `./consultas/api`, `listarFontesDeDados` de `./fontes-de-dados/api`, ambos já importados nas linhas 30 e 34-37 do arquivo atual).

- [ ] **Step 3: Registrar as novas ações no objeto `actions`**

Em `frontend/src/corepilot/useCorePilotState.ts:1056` (linha `carregarConversaDoModulo, updateModuloChatDraft, enviarMensagemModuloReal,`), substituir por:

```ts
    carregarConversaDoModulo, updateModuloChatDraft, enviarMensagemModuloReal,
    criarConversaModulo, selecionarConversaModulo, arquivarConversaModulo, desarquivarConversaModulo,
    fixarConversaModulo, excluirConversaModulo, atualizarBuscaConversasModulo,
    abrirArquivadasModulo, fecharArquivadasModulo, toggleTagsExpandedModulo, definirTagAtivaModulo,
    toggleNewTagFormModulo, updateNewTagNameModulo, toggleBasesModulo,
    criarTagModulo, removerTagModulo, atribuirTagConversaModulo,
```

- [ ] **Step 4: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): acoes reais de historico/organizacao de conversas do modulo"
```

---

## Task 9: `ChatSidebarShell.tsx` — extração visual

**Files:**
- Create: `frontend/src/corepilot/components/chat/ChatSidebarShell.tsx`

**Interfaces:**
- Produces: componente `ChatSidebarShell` + tipos exportados `ChatSidebarItem { id, title, subtitle, pinned, tagId }`, `ChatSidebarTag { id, nome }` — Tasks 10 e 11 consomem os dois.

- [ ] **Step 1: Criar o componente**

Criar `frontend/src/corepilot/components/chat/ChatSidebarShell.tsx`:

```tsx
import type { ChangeEvent } from 'react';
import { ArchiveIcon, DatabaseIcon, DotsIcon, GearIcon, PinIcon, SearchIcon, TagIcon } from '../../icons';
import { colors, overlayFixed } from '../../styles';

export interface ChatSidebarItem {
  id: string;
  title: string;
  subtitle: string;
  pinned: boolean;
  tagId: string | null;
}

export interface ChatSidebarTag {
  id: string;
  nome: string;
}

export interface ChatSidebarShellProps {
  newButtonLabel: string;
  onNewChat: () => void;
  basesLabel?: string;
  basesItems?: string[];
  basesOpen?: boolean;
  onToggleBases?: () => void;
  onCloseBases?: () => void;
  onConfigure?: () => void;
  search: string;
  onSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  activeTagId: string;
  onSetTag: (tagId: string) => void;
  tags: ChatSidebarTag[];
  tagsExpanded: boolean;
  onToggleTagsExpanded: () => void;
  showNewTagForm: boolean;
  newTagName: string;
  onToggleNewTagForm: () => void;
  onNewTagNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAddTag: () => void;
  onRemoveTag: (tagId: string) => (e: { stopPropagation: () => void }) => void;
  archiveView: boolean;
  onOpenArchive: () => void;
  onCloseArchive: () => void;
  visibleItems: ChatSidebarItem[];
  archivedItems: ChatSidebarItem[];
  activeItemId: string | undefined;
  onSelectItem: (id: string) => void;
  menuOpenId: string | null;
  onToggleItemMenu: (id: string) => void;
  onCloseItemMenu: () => void;
  onTogglePin: (id: string) => void;
  onAssignTag: (id: string, tagId: string) => (e: { stopPropagation: () => void }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}

export function ChatSidebarShell(props: ChatSidebarShellProps) {
  const {
    newButtonLabel, onNewChat, basesLabel, basesItems, basesOpen, onToggleBases, onCloseBases, onConfigure,
    search, onSearchChange, activeTagId, onSetTag, tags, tagsExpanded, onToggleTagsExpanded,
    showNewTagForm, newTagName, onToggleNewTagForm, onNewTagNameChange, onAddTag, onRemoveTag,
    archiveView, onOpenArchive, onCloseArchive, visibleItems, archivedItems, activeItemId, onSelectItem,
    menuOpenId, onToggleItemMenu, onCloseItemMenu, onTogglePin, onAssignTag, onArchive, onDelete, onRestore,
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onNewChat} style={{ flex: 1, background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          {newButtonLabel}
        </button>
        {onToggleBases && (
          <div style={{ position: 'relative' }}>
            <span onClick={onToggleBases} title="Bases conectadas" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseIcon />
            </span>
            {basesOpen && (
              <>
                <div style={overlayFixed} onClick={onCloseBases} />
                <div style={{ position: 'absolute', top: 44, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 200, zIndex: 30, padding: '8px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>{basesLabel ?? 'Bases conectadas'}</div>
                  {(basesItems ?? []).map((b) => (
                    <div key={b} style={{ fontSize: 12.5, color: colors.text, padding: '6px 14px' }}>{b}</div>
                  ))}
                  {(basesItems ?? []).length === 0 && (
                    <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '6px 14px' }}>Nenhuma base conectada.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {onConfigure && (
          <span onClick={onConfigure} title="Configurar módulo" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GearIcon />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
        <SearchIcon size={14} color={colors.textFaint} strokeWidth={2} />
        <input type="text" placeholder="Pesquisar conversas…" value={search} onChange={onSearchChange} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0, position: 'relative' }}>
        {(() => {
          const active = activeTagId === 'all';
          return (
            <span onClick={() => onSetTag('all')} style={{ cursor: 'pointer', borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, border: `1px solid ${active ? colors.navy : colors.border}`, background: active ? colors.navy : '#fff', color: active ? '#fff' : colors.textMuted, whiteSpace: 'nowrap' }}>
              Tudo
            </span>
          );
        })()}
        <span onClick={onToggleTagsExpanded} style={{ cursor: 'pointer', borderRadius: 10, width: 44, height: 44, flexShrink: 0, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TagIcon />
        </span>
        {tagsExpanded && (
          <>
            <div style={overlayFixed} onClick={onToggleTagsExpanded} />
            <div style={{ position: 'absolute', top: 44, left: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 210, zIndex: 30, padding: '8px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>Tags</div>
              {[{ id: 'all', nome: 'Tudo' }, ...tags].map((t) => {
                const active = activeTagId === t.id;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 14px', background: active ? '#EAF6F5' : 'transparent' }}>
                    <span onClick={() => { onSetTag(t.id); onToggleTagsExpanded(); }} style={{ cursor: 'pointer', fontSize: 13, fontWeight: active ? 800 : 600, color: active ? colors.navy : colors.text, flex: 1 }}>
                      {t.nome}
                    </span>
                    {t.id !== 'all' && (
                      <span onClick={onRemoveTag(t.id)} style={{ cursor: 'pointer', color: colors.textFaint, fontWeight: 800 }}>×</span>
                    )}
                  </div>
                );
              })}
              {showNewTagForm ? (
                <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>
                  <input type="text" placeholder="Nome da tag" value={newTagName} onChange={onNewTagNameChange} style={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                  <button onClick={onAddTag} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Criar</button>
                </div>
              ) : (
                <div onClick={onToggleNewTagForm} style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: colors.teal, padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>+ Nova tag</div>
              )}
            </div>
          </>
        )}
      </div>

      {!archiveView ? (
        <>
          <div onClick={onOpenArchive} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 8 }}>
            <ArchiveIcon />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: colors.textMuted }}>Arquivadas</span>
            <span style={{ fontSize: 12, color: colors.textFaint }}>{archivedItems.length}</span>
          </div>
          {visibleItems.map((item) => (
            <ChatSidebarRow
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              tags={tags}
              menuOpen={menuOpenId === item.id}
              onSelect={() => onSelectItem(item.id)}
              onToggleMenu={() => onToggleItemMenu(item.id)}
              onCloseMenu={onCloseItemMenu}
              onTogglePin={() => onTogglePin(item.id)}
              onAssignTag={(tagId) => onAssignTag(item.id, tagId)}
              onArchive={() => onArchive(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
          {visibleItems.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '10px 0' }}>Nenhuma conversa ainda.</div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span onClick={onCloseArchive} style={{ cursor: 'pointer', color: colors.textMuted, fontSize: 15, lineHeight: 1 }}>←</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Arquivadas</span>
          </div>
          {archivedItems.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: colors.textFaint }}>{item.subtitle}</div>
              </div>
              <span onClick={() => onRestore(item.id)} style={{ fontSize: 12, fontWeight: 700, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Desarquivar</span>
            </div>
          ))}
          {archivedItems.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '10px 0' }}>Nenhuma conversa arquivada.</div>}
        </>
      )}
    </div>
  );
}

function ChatSidebarRow({
  item, active, tags, menuOpen, onSelect, onToggleMenu, onCloseMenu, onTogglePin, onAssignTag, onArchive, onDelete,
}: {
  item: ChatSidebarItem;
  active: boolean;
  tags: ChatSidebarTag[];
  menuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onTogglePin: () => void;
  onAssignTag: (tagId: string) => (e: { stopPropagation: () => void }) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const highlighted = item.pinned || active;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '10px 12px', marginBottom: 4,
        background: highlighted ? (active ? '#EAF6F5' : '#fff') : 'transparent',
        border: highlighted ? `1px solid ${active ? colors.teal : colors.border}` : undefined,
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {item.pinned && <PinIcon />}
          <div style={{ fontSize: 13, fontWeight: highlighted ? 700 : 600, color: highlighted ? colors.navy : colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaint }}>{item.subtitle}</div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}>
          <DotsIcon />
        </span>
        {menuOpen && (
          <>
            <div style={overlayFixed} onClick={onCloseMenu} />
            <div style={{ position: 'absolute', top: 22, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 150, zIndex: 30, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Tag</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {tags.map((t) => {
                    const isActiveTag = item.tagId === t.id;
                    return (
                      <span key={t.id} onClick={onAssignTag(t.id)} style={{ cursor: 'pointer', borderRadius: 14, padding: '3px 9px', fontSize: 11, fontWeight: 700, background: isActiveTag ? colors.navy : colors.chipBg, color: isActiveTag ? '#fff' : colors.textMuted }}>
                        {t.nome}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div onClick={(e) => { e.stopPropagation(); onTogglePin(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                {item.pinned ? 'Desafixar' : 'Fixar'}
              </div>
              <div onClick={(e) => { e.stopPropagation(); onArchive(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Arquivar
              </div>
              <div onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.danger, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Excluir
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros (o arquivo ainda não é importado por ninguém, mas precisa ser válido isoladamente).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/components/chat/ChatSidebarShell.tsx
git commit -m "feat(frontend): ChatSidebarShell — visual compartilhado da sidebar de conversas"
```

---

## Task 10: Refatorar `ModuleChatSidebar.tsx` para usar o shell

**Files:**
- Modify: `frontend/src/corepilot/components/chat/ModuleChatSidebar.tsx`

**Interfaces:**
- Consumes: `ChatSidebarShell`, `ChatSidebarItem`, `ChatSidebarTag` (Task 9).
- Produces: mesma API pública (`ModuleChatSidebar({ module, state, actions, onConfigure })`) — nenhum consumidor (`ComprasView.tsx`, `FinanceiroView.tsx`) muda.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substituir `frontend/src/corepilot/components/chat/ModuleChatSidebar.tsx` inteiro por:

```tsx
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { ModuleChat, ModuleKey } from '../../types';
import { ChatSidebarShell, type ChatSidebarItem, type ChatSidebarTag } from './ChatSidebarShell';

interface ModuleChatSidebarProps {
  module: ModuleKey;
  state: CorePilotState;
  actions: CorePilotActions;
  onConfigure?: () => void;
}

const basesByModule: Record<ModuleKey, string[]> = {
  compras: ['Cadastro de fornecedores', 'Histórico de compras', 'Catálogo de peças'],
  financeiro: ['Orçamento 2026', 'ERP Financeiro', 'Plano de contas'],
};

const newButtonLabel: Record<ModuleKey, string> = { compras: '+ Nova consulta', financeiro: '+ Nova análise' };

function toItem(chat: ModuleChat): ChatSidebarItem {
  return { id: chat.id, title: chat.title, subtitle: chat.tag || 'Sem tag', pinned: chat.pinned, tagId: chat.tag || null };
}

export function ModuleChatSidebar({ module, state, actions, onConfigure }: ModuleChatSidebarProps) {
  const isCompras = module === 'compras';
  const chats = isCompras ? state.comprasChats : state.financeiroChats;
  const search = isCompras ? state.comprasSearch : state.financeiroSearch;
  const activeTag = isCompras ? state.comprasActiveTag : state.financeiroActiveTag;
  const tagsList = isCompras ? state.comprasTagsList : state.financeiroTagsList;
  const tagsExpanded = isCompras ? state.comprasTagsExpanded : state.financeiroTagsExpanded;
  const showNewTag = isCompras ? state.comprasShowNewTag : state.financeiroShowNewTag;
  const newTagName = isCompras ? state.comprasNewTagName : state.financeiroNewTagName;
  const archiveView = isCompras ? state.comprasArchiveView : state.financeiroArchiveView;
  const basesOpen = isCompras ? state.comprasBasesOpen : state.financeiroBasesOpen;
  const activeChatId = isCompras ? state.activeComprasChatId : state.activeFinanceiroChatId;
  const listKey = actions.chatListKeyFor(module);

  const toggleBases = isCompras ? actions.toggleComprasBases : actions.toggleFinanceiroBases;
  const updateSearch = isCompras ? actions.updateComprasSearch : actions.updateFinanceiroSearch;
  const setTag = isCompras ? actions.setComprasTag : actions.setFinanceiroTag;
  const toggleTagsExpanded = isCompras ? actions.toggleComprasTagsExpanded : actions.toggleFinanceiroTagsExpanded;
  const selectChat = isCompras ? actions.selectComprasChat : actions.selectFinanceiroChat;
  const openArchive = isCompras ? actions.openComprasArchive : actions.openFinanceiroArchive;
  const closeArchive = isCompras ? actions.closeComprasArchive : actions.closeFinanceiroArchive;

  const q = search.trim().toLowerCase();
  const visibleChats = chats
    .filter((c) => !c.hidden && (activeTag === 'all' || c.tag === activeTag) && (!q || c.title.toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.order - a.order);
  const hiddenChats = chats.filter((c) => c.hidden);
  const tags: ChatSidebarTag[] = tagsList.map((name) => ({ id: name, nome: name }));

  return (
    <ChatSidebarShell
      newButtonLabel={newButtonLabel[module]}
      onNewChat={() => {}}
      basesLabel="Bases conectadas"
      basesItems={basesByModule[module]}
      basesOpen={basesOpen}
      onToggleBases={toggleBases}
      onCloseBases={actions.closeBasesMenus}
      onConfigure={onConfigure}
      search={search}
      onSearchChange={updateSearch}
      activeTagId={activeTag}
      onSetTag={setTag}
      tags={tags}
      tagsExpanded={tagsExpanded}
      onToggleTagsExpanded={toggleTagsExpanded}
      showNewTagForm={showNewTag}
      newTagName={newTagName}
      onToggleNewTagForm={() => actions.toggleNewTagForm(module)}
      onNewTagNameChange={actions.updateNewTagName(module)}
      onAddTag={actions.addTag(module)}
      onRemoveTag={(tagId) => actions.removeTag(module, tagId)}
      archiveView={archiveView}
      onOpenArchive={openArchive}
      onCloseArchive={closeArchive}
      visibleItems={visibleChats.map(toItem)}
      archivedItems={hiddenChats.map(toItem)}
      activeItemId={activeChatId}
      onSelectItem={selectChat}
      menuOpenId={state.chatMenuOpenId}
      onToggleItemMenu={actions.toggleChatMenu}
      onCloseItemMenu={actions.closeChatMenu}
      onTogglePin={(id) => actions.togglePinChat(listKey, id)}
      onAssignTag={(id, tagId) => actions.assignChatTag(listKey, id, tagId)}
      onArchive={(id) => actions.hideChat(listKey, id)}
      onDelete={(id) => actions.deleteChat(listKey, id)}
      onRestore={(id) => actions.restoreChat(listKey, id)}
    />
  );
}
```

Nota: o botão "+ Nova consulta"/"+ Nova análise" já não tinha `onClick` no componente original (era puramente visual) — `onNewChat={() => {}}` preserva esse comportamento exatamente, sem regressão.

- [ ] **Step 2: Validação manual — Compras e Financeiro inalterados**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros.

Run: `npm run dev`, abrir a aba Compras e a aba Financeiro no navegador.
Expected: sidebar com a mesma aparência e comportamento de antes — buscar, trocar de "Tudo" para uma tag e voltar, expandir/recolher o menu de tags, fixar e desafixar uma conversa (respeitando o limite de 4), arquivar e desarquivar, atribuir tag pelo menu "...", excluir uma conversa. Nenhuma diferença visual ou funcional em relação ao comportamento antes deste task.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/components/chat/ModuleChatSidebar.tsx
git commit -m "refactor(frontend): ModuleChatSidebar usa ChatSidebarShell (sem mudanca de comportamento)"
```

---

## Task 11: `CustomModuleChatSidebar.tsx`

**Files:**
- Create: `frontend/src/corepilot/components/chat/CustomModuleChatSidebar.tsx`

**Interfaces:**
- Consumes: `ChatSidebarShell`, `ChatSidebarItem`, `ChatSidebarTag` (Task 9); ações e campos de estado `modulo*` (Tasks 7-8).
- Produces: `CustomModuleChatSidebar({ moduloId, state, actions, onConfigure })` — Task 12 consome.

- [ ] **Step 1: Criar o componente**

Criar `frontend/src/corepilot/components/chat/CustomModuleChatSidebar.tsx`:

```tsx
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { Conversa } from '../../modulos/types';
import { ChatSidebarShell, type ChatSidebarItem, type ChatSidebarTag } from './ChatSidebarShell';

interface CustomModuleChatSidebarProps {
  moduloId: string;
  state: CorePilotState;
  actions: CorePilotActions;
  onConfigure?: () => void;
}

function toItem(conversa: Conversa, tags: ChatSidebarTag[]): ChatSidebarItem {
  const tagNome = tags.find((t) => t.id === conversa.tagId)?.nome;
  return {
    id: conversa.id,
    title: conversa.titulo || 'Nova conversa',
    subtitle: tagNome || 'Sem tag',
    pinned: conversa.fixada,
    tagId: conversa.tagId,
  };
}

export function CustomModuleChatSidebar({ moduloId, state, actions, onConfigure }: CustomModuleChatSidebarProps) {
  const tags: ChatSidebarTag[] = state.moduloTags.map((t) => ({ id: t.id, nome: t.nome }));
  const q = state.moduloConversasSearch.trim().toLowerCase();
  const visibleConversas = state.moduloConversas
    .filter((c) => !c.arquivada && (state.moduloActiveTagId === 'all' || c.tagId === state.moduloActiveTagId) && (!q || (c.titulo ?? '').toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => Number(b.fixada) - Number(a.fixada) || new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
  const archivedConversas = state.moduloConversas.filter((c) => c.arquivada);

  return (
    <ChatSidebarShell
      newButtonLabel="+ Nova conversa"
      onNewChat={() => void actions.criarConversaModulo(moduloId)}
      basesLabel="Bases conectadas"
      basesItems={state.moduloBasesConectadas}
      basesOpen={state.moduloBasesOpen}
      onToggleBases={actions.toggleBasesModulo}
      onCloseBases={actions.toggleBasesModulo}
      onConfigure={onConfigure}
      search={state.moduloConversasSearch}
      onSearchChange={actions.atualizarBuscaConversasModulo}
      activeTagId={state.moduloActiveTagId}
      onSetTag={actions.definirTagAtivaModulo}
      tags={tags}
      tagsExpanded={state.moduloTagsExpanded}
      onToggleTagsExpanded={actions.toggleTagsExpandedModulo}
      showNewTagForm={state.moduloShowNewTagForm}
      newTagName={state.moduloNewTagName}
      onToggleNewTagForm={actions.toggleNewTagFormModulo}
      onNewTagNameChange={actions.updateNewTagNameModulo}
      onAddTag={() => void actions.criarTagModulo(moduloId)}
      onRemoveTag={(tagId) => (e) => { e.stopPropagation(); void actions.removerTagModulo(moduloId, tagId); }}
      archiveView={state.moduloArchiveView}
      onOpenArchive={actions.abrirArquivadasModulo}
      onCloseArchive={actions.fecharArquivadasModulo}
      visibleItems={visibleConversas.map((c) => toItem(c, tags))}
      archivedItems={archivedConversas.map((c) => toItem(c, tags))}
      activeItemId={state.moduloConversaId ?? undefined}
      onSelectItem={(id) => void actions.selecionarConversaModulo(id)}
      menuOpenId={state.chatMenuOpenId}
      onToggleItemMenu={actions.toggleChatMenu}
      onCloseItemMenu={actions.closeChatMenu}
      onTogglePin={(id) => void actions.fixarConversaModulo(moduloId, id)}
      onAssignTag={(id, tagId) => actions.atribuirTagConversaModulo(moduloId, id, tagId)}
      onArchive={(id) => void actions.arquivarConversaModulo(moduloId, id)}
      onDelete={(id) => void actions.excluirConversaModulo(moduloId, id)}
      onRestore={(id) => void actions.desarquivarConversaModulo(moduloId, id)}
    />
  );
}
```

- [ ] **Step 2: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros (ainda não é usado por ninguém — Task 12 conecta).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/components/chat/CustomModuleChatSidebar.tsx
git commit -m "feat(frontend): CustomModuleChatSidebar — sidebar real para modulos custom"
```

---

## Task 12: `CustomModuleView.tsx` — layout em grid + sidebar + estado vazio

**Files:**
- Modify: `frontend/src/corepilot/views/CustomModuleView.tsx`

**Interfaces:**
- Consumes: `CustomModuleChatSidebar` (Task 11); `state.moduloConversaId`, `state.moduloConversasLoading`, `actions.criarConversaModulo` (Tasks 7-8).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substituir `frontend/src/corepilot/views/CustomModuleView.tsx` inteiro por:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { LayersIcon } from '../icons';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../components/chat/MessageBubble';
import { CustomModuleChatSidebar } from '../components/chat/CustomModuleChatSidebar';

export function CustomModuleView({ module, state, actions }: { module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void actions.carregarConversaDoModulo(module.id);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

  const ultimaMensagem = state.moduloMensagens[state.moduloMensagens.length - 1];
  const aguardandoPrimeiroToken =
    state.moduloChatEnviando && ultimaMensagem?.papel === 'agente' && ultimaMensagem.conteudo === '';
  const mensagensVisiveis = aguardandoPrimeiroToken ? state.moduloMensagens.slice(0, -1) : state.moduloMensagens;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.moduloMensagens, aguardandoPrimeiroToken]);

  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  useEffect(() => {
    if (!aguardandoPrimeiroToken) {
      setSegundosDecorridos(0);
      return;
    }
    const inicio = Date.now();
    const intervalo = window.setInterval(() => setSegundosDecorridos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => window.clearInterval(intervalo);
  }, [aguardandoPrimeiroToken]);

  const rotuloEspera = state.moduloChatStatus ?? `${module.nome} está pensando…`;
  const rotuloComTempo = segundosDecorridos >= 8 ? `${rotuloEspera} (${segundosDecorridos}s)` : rotuloEspera;

  return (
    <div style={{ margin: 0, padding: '24px 16px 16px 24px', height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <CustomModuleChatSidebar moduloId={module.id} state={state} actions={actions} onConfigure={actions.editActiveModule} />
      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 24, flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: module.cor ?? colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <LayersIcon />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{module.nome}</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>{module.objetivo}</p>
        </div>

        {state.moduloChatErro && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12, flexShrink: 0 }}>{state.moduloChatErro}</div>}

        {!state.moduloConversaId && !state.moduloConversasLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>Nenhuma conversa ainda.</p>
            <button
              onClick={() => void actions.criarConversaModulo(module.id)}
              style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '11px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              + Nova conversa
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              {mensagensVisiveis.map((mensagem) => (
                <MessageBubble
                  key={mensagem.id}
                  msg={{ id: 0, isUser: mensagem.papel === 'usuario', isAi: mensagem.papel === 'agente', text: mensagem.conteudo }}
                  agentLabel={module.nome}
                />
              ))}
              {aguardandoPrimeiroToken && (
                <>
                  <ThinkingBubble label={rotuloComTempo} />
                  {segundosDecorridos >= 20 && (
                    <div style={{ fontSize: 11.5, color: colors.textFaint, margin: '6px 0 0 38px' }}>
                      Perguntas que cruzam muitos dados podem levar até 1 minuto.
                    </div>
                  )}
                </>
              )}
              <div ref={scrollRef} />
            </div>

            <div style={{ flexShrink: 0 }}>
              <ChatComposer
                variant="module"
                placeholder={`Pergunte algo sobre ${module.nome.toLowerCase()}…`}
                value={state.moduloChatDraft}
                onChange={actions.updateModuloChatDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void actions.enviarMensagemModuloReal();
                  }
                }}
                onSend={() => void actions.enviarMensagemModuloReal()}
                attachments={[]}
                onAttach={() => {}}
                disabled={state.moduloChatEnviando}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Nota: o ícone de engrenagem flutuante que existia no canto superior direito saiu daqui — agora é o mesmo botão de engrenagem renderizado dentro da sidebar (via `onConfigure` do `ChatSidebarShell`), no mesmo lugar onde Compras/Financeiro o mostram. `GearIcon` deixou de ser usado neste arquivo, por isso sai do import.

- [ ] **Step 2: Conferir que o frontend compila**

Run (a partir de `frontend/`): `npm run build`
Expected: compila sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/views/CustomModuleView.tsx
git commit -m "feat(frontend): CustomModuleView com sidebar real (padrao Compras/Financeiro)"
```

---

## Task 13: Validação manual end-to-end

**Files:** nenhum (só validação).

- [ ] **Step 1: Rodar backend e frontend localmente**

A partir de `backend/`: `npm run start:dev`
A partir de `frontend/`: `npm run dev`
Expected: ambos sobem sem erro, com `.env.local` configurado em cada um (ver "Local setup" do `CLAUDE.md`).

- [ ] **Step 2: Validar o módulo Agronomia (ou outro módulo custom já publicado)**

No navegador, logar, abrir a aba do módulo custom (ex.: Agronomia) e verificar, um a um, os itens do critério de aceite da spec (`docs/superpowers/specs/2026-08-03-modulo-chat-sidebar-design.md`, seção 9):

1. A sidebar aparece com o mesmo visual de Compras/Financeiro, com "+ Nova conversa" real.
2. Criar uma conversa nova, enviar uma mensagem, recarregar a página — a conversa e as mensagens continuam lá.
3. Criar uma segunda conversa, trocar entre as duas pela sidebar — o histórico de mensagens muda corretamente.
4. Fixar uma conversa — ela sobe para o topo da lista; recarregar a página — continua fixada.
5. Criar uma tag, atribuir a uma conversa, filtrar pela tag na pill "Tudo"/dropdown — só a conversa com a tag aparece; remover a tag — a conversa some do filtro mas não é apagada.
6. Arquivar a conversa ativa — a sidebar troca automaticamente para a próxima conversa visível (ou mostra o estado vazio "Nenhuma conversa ainda" se não sobrar nenhuma); abrir "Arquivadas" e desarquivar — ela volta pra lista normal.
7. Excluir uma conversa — some da lista e (se estava ativa) troca para a próxima; recarregar — continua excluída.
8. Buscar por parte do título de uma conversa — a lista filtra corretamente.
9. Clicar no ícone de banco de dados ("bases conectadas") — mostra as fontes de dados reais associadas ao módulo (ou "Nenhuma base conectada" se o módulo não tiver nenhuma consulta configurada ainda).
10. Clicar na engrenagem da sidebar — abre a edição do módulo (mesmo fluxo de antes).

- [ ] **Step 3: Confirmar que a sidebar é genérica, não específica do Agronomia**

Publicar (ou usar, se já existir) um segundo módulo custom diferente de Agronomia e abrir sua aba de chat.
Expected: a mesma sidebar completa (histórico, nova conversa, busca, tags, arquivar) aparece automaticamente, sem nenhuma alteração de código por módulo — confirma o critério de aceite #7 da spec.

- [ ] **Step 4: Confirmar zero regressão em Compras e Financeiro**

Repetir buscar / trocar tag / fixar (respeitando o limite de 4) / arquivar / desarquivar / atribuir tag / excluir nas abas Compras e Financeiro — tudo deve se comportar exatamente como antes deste plano (dados mock, sem chamadas de rede).

- [ ] **Step 5: Rodar a suíte de testes do backend inteira**

A partir de `backend/`: `npm run test`
Expected: PASS (a suíte inteira, não só os arquivos deste plano — `src/prisma/prisma.smoke.spec.ts` só roda se `DATABASE_URL` estiver setado).

Nenhum commit neste task — é só validação do que já foi commitado nos tasks 1-12.
