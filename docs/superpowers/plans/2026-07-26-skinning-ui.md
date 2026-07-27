# Skinning da UI — protótipo Claude Design vira o app real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a UI bare-bones das Fases 1-4 (`FundacaoStatus`/`ModulosList`/`ModuloWorkspace`/etc.) pelo protótipo visual completo (`CorePilotApp`), conectando-o ao backend real para Módulos, Chat, Agentes, Skills e Fontes de Dados/Consultas — mantendo mock apenas as partes sem fase implementada (Compras/Financeiro/Admin/Base de Conhecimento/Permissões).

**Architecture:** `AuthGate` passa a renderizar `CorePilotApp` (não mais `FundacaoStatus`). O hook monolítico `useCorePilotState` ganha novos campos de estado "reais" (módulos, agentes, skills, fontes de dados, consultas, chat) alimentados por `apiFetch`, lado a lado com os campos mock que continuam intactos para as telas fora de escopo. Três novas rotas `PATCH` (Modulo/Agente/Skill) e cinco novos campos em `Modulo` sustentam a edição real pelo Wizard.

**Tech Stack:** NestJS + Prisma (backend), React 19 + Vite + TypeScript, estilo inline via `styles.ts` (sem mudança de stack).

## Global Constraints

- Toda rota nova segue o padrão já estabelecido: `@UseGuards(JwtAuthGuard, TenantGuard)`, `TenantContext.get()` para `empresaId`/`usuarioId`, `findByIdInEmpresa` antes de mutar, auditoria via `AuditService.record` para toda ação de escrita (princípio nº4 do guia: "Toda ação é auditada").
- `Modulo`, `Agente`, `Skill` continuam RLS habilitada sem policies — nenhuma tabela nova é criada nesta fase, só colunas novas em `Modulo` (nullable, sem migração de dados).
- Nenhuma tela fora de escopo (Compras, Financeiro, Admin, Wizard Step2 Base de Conhecimento, Step5 Permissões) muda de comportamento ou aparência.
- Campos de Skill sem equivalente real (`trigger`, `autonomia`) são removidos da tela real, não apenas ocultados.
- Sem estado de rascunho: salvar é sempre a ação real (`POST` na primeira vez, `PATCH` depois).
- Prettier: aspas simples, vírgula final em tudo (`trailingComma: all`). ESLint backend: `no-explicit-any` desabilitado, `no-floating-promises`/`no-unsafe-argument` são warnings.

---

### Task 1: Backend — estender `Modulo` com campos de identidade visual

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Modulo`)
- Create: migration via `prisma migrate dev --create-only`
- Modify: `backend/src/modulo/dto/create-modulo.dto.ts`
- Modify: `backend/src/modulo/modulo.service.ts`
- Modify: `backend/src/modulo/modulo.service.spec.ts`

**Interfaces:**
- Produces: `Modulo` ganha `descricao: string | null`, `responsavel: string | null`, `areas: string | null`, `icone: string | null`, `cor: string | null`. `CreateModuloDto` aceita os mesmos campos, todos opcionais. `ModuloService.create(empresaId, dto)` grava todos.

- [ ] **Step 1: Editar o schema Prisma**

Em `backend/prisma/schema.prisma`, no model `Modulo`, adicione as linhas depois de `instrucoes`:

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

  empresa   Empresa                 @relation(fields: [empresaId], references: [id])
  conversas Conversa[]
  agentes   Agente[]
  consultas ConsultaParametrizada[]
}
```

- [ ] **Step 2: Criar a migração sem aplicar ainda**

Run: `cd backend && npx prisma migrate dev --create-only --name modulo_identidade_visual`

Isso gera `backend/prisma/migrations/<timestamp>_modulo_identidade_visual/migration.sql` vazio-ish
(só os `ALTER TABLE ... ADD COLUMN`, todos nullable — não precisa de RLS extra, `Modulo` já tem RLS
habilitada desde a Fase 1).

- [ ] **Step 3: Aplicar a migração**

Run: `cd backend && npx prisma migrate dev`
Expected: migração aplicada, `@prisma/client` regenerado.

- [ ] **Step 4: Atualizar o DTO**

Substitua o conteúdo de `backend/src/modulo/dto/create-modulo.dto.ts`:

```typescript
export interface CreateModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
}
```

- [ ] **Step 5: Escrever o teste (falhando) do service**

Em `backend/src/modulo/modulo.service.spec.ts`, substitua o primeiro `it(...)` (linhas 16-42) por:

```typescript
  it('cria um módulo escopado à empresa informada, com campos de identidade visual', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.create as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
      empresaId: 'empresa-1',
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      instrucoes: null,
      descricao: 'Módulo de compras',
      responsavel: 'Marcos Silva',
      areas: 'Matriz',
      icone: 'cart',
      cor: '#0EA5A0',
      modeloIA: 'claude-sonnet-5',
    });
    const service = new ModuloService(prisma);

    const resultado = await service.create('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      descricao: 'Módulo de compras',
      responsavel: 'Marcos Silva',
      areas: 'Matriz',
      icone: 'cart',
      cor: '#0EA5A0',
    });

    expect(prisma.modulo.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        nome: 'Compras',
        objetivo: 'Ajudar com compras',
        instrucoes: undefined,
        descricao: 'Módulo de compras',
        responsavel: 'Marcos Silva',
        areas: 'Matriz',
        icone: 'cart',
        cor: '#0EA5A0',
      },
    });
    expect(resultado.id).toBe('modulo-1');
  });
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd backend && npx jest modulo.service.spec.ts -v`
Expected: FAIL — `prisma.modulo.create` foi chamado sem os campos novos (o `service.create` atual não os repassa).

- [ ] **Step 3: Implementar**

Substitua `backend/src/modulo/modulo.service.ts`:

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
        descricao: dto.descricao,
        responsavel: dto.responsavel,
        areas: dto.areas,
        icone: dto.icone,
        cor: dto.cor,
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

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd backend && npx jest modulo.service.spec.ts -v`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modulo/dto/create-modulo.dto.ts backend/src/modulo/modulo.service.ts backend/src/modulo/modulo.service.spec.ts
git commit -m "feat(backend): campos de identidade visual em Modulo (descricao/responsavel/areas/icone/cor)"
```

---

### Task 2: Backend — `PATCH /modulos/:id`

**Files:**
- Create: `backend/src/modulo/dto/update-modulo.dto.ts`
- Modify: `backend/src/modulo/modulo.service.ts`
- Modify: `backend/src/modulo/modulo.controller.ts`
- Modify: `backend/src/modulo/modulo.module.ts`
- Modify: `backend/src/modulo/modulo.service.spec.ts`
- Modify: `backend/src/modulo/modulo.controller.spec.ts`

**Interfaces:**
- Consumes: `ModuloService.findByIdInEmpresa(moduloId, empresaId)` (Task 1).
- Produces: `ModuloService.update(moduloId, empresaId, dto)`. Rota `PATCH /modulos/:id`, body `UpdateModuloDto` (todos os campos de `CreateModuloDto`, todos opcionais).

- [ ] **Step 1: Criar o DTO de atualização**

Create `backend/src/modulo/dto/update-modulo.dto.ts`:

```typescript
export interface UpdateModuloDto {
  nome?: string;
  objetivo?: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
}
```

- [ ] **Step 2: Escrever o teste (falhando) do service**

Em `backend/src/modulo/modulo.service.spec.ts`, adicione ao final do `buildPrismaMock` a chave `update: jest.fn()` (dentro do objeto `modulo`), e adicione um novo `it` depois do teste de `findByIdInEmpresa`:

```typescript
  it('update atualiza só os campos informados, escopado à empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue({ id: 'modulo-1', empresaId: 'empresa-1' });
    (prisma.modulo.update as jest.Mock).mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' });
    const service = new ModuloService(prisma);

    const resultado = await service.update('modulo-1', 'empresa-1', { nome: 'Novo nome' });

    expect(prisma.modulo.findFirst).toHaveBeenCalledWith({ where: { id: 'modulo-1', empresaId: 'empresa-1' } });
    expect(prisma.modulo.update).toHaveBeenCalledWith({
      where: { id: 'modulo-1' },
      data: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'modulo-1', nome: 'Novo nome' });
  });

  it('update lança NotFoundException se o módulo não existir na empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ModuloService(prisma);

    await expect(service.update('modulo-x', 'empresa-1', { nome: 'X' })).rejects.toThrow(NotFoundException);
    expect(prisma.modulo.update).not.toHaveBeenCalled();
  });
```

Atualize `buildPrismaMock` (topo do arquivo) para incluir `update: jest.fn()`:

```typescript
  function buildPrismaMock() {
    return {
      modulo: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
  }
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd backend && npx jest modulo.service.spec.ts -v`
Expected: FAIL — `service.update` não existe ainda.

- [ ] **Step 3: Implementar `update` no service**

Em `backend/src/modulo/modulo.service.ts`, adicione o import de `UpdateModuloDto` e o método, logo depois de `findByIdInEmpresa`:

```typescript
import type { UpdateModuloDto } from './dto/update-modulo.dto';

// ...dentro da classe, depois de findByIdInEmpresa:
  async update(moduloId: string, empresaId: string, dto: UpdateModuloDto) {
    await this.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.modulo.update({
      where: { id: moduloId },
      data: dto,
    });
  }
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd backend && npx jest modulo.service.spec.ts -v`
Expected: PASS (6 testes).

- [ ] **Step 5: Escrever o teste (falhando) do controller**

Em `backend/src/modulo/modulo.controller.spec.ts`, adicione depois do teste "lista módulos...":

```typescript
  it('atualiza um módulo da empresa do tenant atual', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' }),
    } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    const resultado = await controller.atualizar('modulo-1', { nome: 'Novo nome' });

    expect(service.update).toHaveBeenCalledWith('modulo-1', 'empresa-1', { nome: 'Novo nome' });
    expect(resultado).toEqual({ id: 'modulo-1', nome: 'Novo nome' });
  });
```

- [ ] **Step 6: Rodar o teste para ver falhar**

Run: `cd backend && npx jest modulo.controller.spec.ts -v`
Expected: FAIL — `controller.atualizar` não existe.

- [ ] **Step 7: Implementar a rota**

Substitua `backend/src/modulo/modulo.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';
import type { UpdateModuloDto } from './dto/update-modulo.dto';

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

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.update(id, empresaId, body);
  }
}
```

Note: este endpoint não recebe `AuditService` porque `ModuloModule` ainda não importa `AuditModule` —
isso é adicionado no próprio Step 8 abaixo. Se preferir auditar, injete `AuditService` e `PrismaService`
não são necessários aqui (o `TenantContext` já basta); a chamada de auditoria fica:

```typescript
  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.moduloService.update(id, empresaId, body);
    await this.audit.record({ empresaId, atorUsuarioId: usuarioId, acao: 'modulo_atualizado', dadosDepois: body as Record<string, unknown> });
    return resultado;
  }
```

Use esta segunda versão (com auditoria) como implementação final — adicione `private readonly audit: AuditService,`
ao construtor.

- [ ] **Step 8: Importar `AuditModule` no `ModuloModule`**

Substitua `backend/src/modulo/modulo.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import { ModuloService } from './modulo.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ModuloController],
  providers: [ModuloService],
  exports: [ModuloService],
})
export class ModuloModule {}
```

- [ ] **Step 9: Ajustar o teste do controller para injetar `AuditService`**

Atualize o `buildTenantContext`/instanciação em `modulo.controller.spec.ts` para passar um audit mock em
todas as chamadas de `new ModuloController(...)`:

```typescript
  function buildAudit() {
    return { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
  }
```

E troque toda ocorrência de `new ModuloController(service, buildTenantContext('empresa-1'))` por
`new ModuloController(service, buildAudit(), buildTenantContext('empresa-1'))` — inclusive no teste
novo de `atualizar`, e ajuste a asserção para incluir a chamada de auditoria:

```typescript
  it('atualiza um módulo da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.atualizar('modulo-1', { nome: 'Novo nome' });

    expect(service.update).toHaveBeenCalledWith('modulo-1', 'empresa-1', { nome: 'Novo nome' });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'modulo_atualizado',
      dadosDepois: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'modulo-1', nome: 'Novo nome' });
  });
```

- [ ] **Step 10: Ajustar o construtor do controller para receber `audit` antes de `tenantContext`**

Confirme que `modulo.controller.ts` tem, na classe:

```typescript
  constructor(
    private readonly moduloService: ModuloService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}
```

- [ ] **Step 11: Rodar os testes para ver passar**

Run: `cd backend && npx jest modulo -v`
Expected: PASS (todos os testes de `modulo.controller.spec.ts` e `modulo.service.spec.ts`).

- [ ] **Step 12: Commit**

```bash
git add backend/src/modulo
git commit -m "feat(backend): PATCH /modulos/:id com auditoria"
```

---

### Task 3: Backend — `PATCH /modulos/:moduloId/agentes/:agenteId`

**Files:**
- Create: `backend/src/agente/dto/update-agente.dto.ts`
- Modify: `backend/src/agente/agente.service.ts`
- Modify: `backend/src/agente/agente.controller.ts`
- Modify: `backend/src/agente/agente.module.ts`
- Modify: `backend/src/agente/agente.service.spec.ts`
- Modify: `backend/src/agente/agente.controller.spec.ts`

**Interfaces:**
- Consumes: `AgenteService.findByIdInEmpresa(agenteId, empresaId)` (já existe).
- Produces: `AgenteService.update(agenteId, empresaId, dto)`. Rota `PATCH /modulos/:moduloId/agentes/:agenteId`.

- [ ] **Step 1: Criar o DTO**

Create `backend/src/agente/dto/update-agente.dto.ts`:

```typescript
export interface UpdateAgenteDto {
  nome?: string;
  funcao?: string;
  objetivo?: string;
}
```

- [ ] **Step 2: Escrever o teste (falhando) do service**

Abra `backend/src/agente/agente.service.spec.ts`, veja o `buildPrismaMock` existente e adicione
`update: jest.fn()` ao objeto `agente` dentro dele. Adicione o teste:

```typescript
  it('update atualiza só os campos informados, escopado à empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.agente.findFirst as jest.Mock).mockResolvedValue({ id: 'agente-1', empresaId: 'empresa-1' });
    (prisma.agente.update as jest.Mock).mockResolvedValue({ id: 'agente-1', nome: 'Novo nome' });
    const service = new AgenteService(prisma, moduloServiceMock());

    const resultado = await service.update('agente-1', 'empresa-1', { nome: 'Novo nome' });

    expect(prisma.agente.findFirst).toHaveBeenCalledWith({ where: { id: 'agente-1', empresaId: 'empresa-1' } });
    expect(prisma.agente.update).toHaveBeenCalledWith({ where: { id: 'agente-1' }, data: { nome: 'Novo nome' } });
    expect(resultado).toEqual({ id: 'agente-1', nome: 'Novo nome' });
  });
```

Se o arquivo não tiver um `moduloServiceMock()` helper, use o mesmo padrão do construtor já usado nos
demais testes do arquivo (`new AgenteService(prisma, moduloService)` — copie exatamente como os testes
vizinhos de `create`/`findAllByModulo` constroem o segundo argumento).

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd backend && npx jest agente.service.spec.ts -v`
Expected: FAIL — `service.update` não existe.

- [ ] **Step 3: Implementar**

Em `backend/src/agente/agente.service.ts`, adicione o import e o método:

```typescript
import type { UpdateAgenteDto } from './dto/update-agente.dto';

// depois de findByIdInEmpresa:
  async update(agenteId: string, empresaId: string, dto: UpdateAgenteDto) {
    await this.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.agente.update({
      where: { id: agenteId },
      data: dto,
    });
  }
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd backend && npx jest agente.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Escrever o teste (falhando) do controller**

Em `backend/src/agente/agente.controller.spec.ts`:

```typescript
  it('atualiza um agente da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'agente-1', nome: 'Novo nome' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
    const controller = new AgenteController(service, audit, buildTenantContext());

    const resultado = await controller.atualizar('modulo-1', 'agente-1', { nome: 'Novo nome' });

    expect(service.update).toHaveBeenCalledWith('agente-1', 'empresa-1', { nome: 'Novo nome' });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'agente_atualizado',
      dadosDepois: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'agente-1', nome: 'Novo nome' });
  });
```

Ajuste as demais instanciações de `new AgenteController(service, buildTenantContext())` no arquivo para
`new AgenteController(service, { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService, buildTenantContext())`.

- [ ] **Step 6: Rodar o teste para ver falhar**

Run: `cd backend && npx jest agente.controller.spec.ts -v`
Expected: FAIL — `controller.atualizar` não existe, construtor não aceita `audit`.

- [ ] **Step 7: Implementar a rota**

Substitua `backend/src/agente/agente.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';
import type { UpdateAgenteDto } from './dto/update-agente.dto';

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string, @Body() body: CreateAgenteDto) {
    if (!body.nome?.trim() || !body.funcao?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome, funcao e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.agenteService.create(moduloId, empresaId, body);
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.agenteService.findAllByModulo(moduloId, empresaId);
  }

  @Patch(':agenteId')
  async atualizar(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: UpdateAgenteDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.agenteService.update(agenteId, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'agente_atualizado',
      dadosDepois: body as Record<string, unknown>,
    });
    return resultado;
  }
}
```

- [ ] **Step 8: Importar `AuditModule` no `AgenteModule`**

Substitua `backend/src/agente/agente.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, ModuloModule, AuditModule],
  controllers: [AgenteController],
  providers: [AgenteService],
  exports: [AgenteService],
})
export class AgenteModule {}
```

- [ ] **Step 9: Rodar os testes para ver passar**

Run: `cd backend && npx jest agente -v`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/agente
git commit -m "feat(backend): PATCH /modulos/:moduloId/agentes/:agenteId com auditoria"
```

---

### Task 4: Backend — `PATCH /agentes/:agenteId/skills/:skillId`

**Files:**
- Create: `backend/src/skill/dto/update-skill.dto.ts`
- Modify: `backend/src/skill/skill.service.ts`
- Modify: `backend/src/skill/skill.controller.ts`
- Modify: `backend/src/skill/skill.module.ts`
- Modify: `backend/src/skill/skill.service.spec.ts`
- Modify: `backend/src/skill/skill.controller.spec.ts`

**Interfaces:**
- Consumes: `SkillService.findByIdInEmpresa` já existente usa `where: { id, agente: { empresaId } }` (empresa via relação, não campo direto).
- Produces: `SkillService.update(skillId, empresaId, dto)`. Rota `PATCH /agentes/:agenteId/skills/:skillId`.

- [ ] **Step 1: Criar o DTO**

Create `backend/src/skill/dto/update-skill.dto.ts`:

```typescript
import type { CampoSaida } from './dto/create-skill.dto';

export interface UpdateSkillDto {
  nome?: string;
  objetivo?: string;
  camposSaida?: CampoSaida[];
}
```

Se `CampoSaida` não estiver exportado de `create-skill.dto.ts`, abra esse arquivo primeiro e confirme o
nome exato do tipo usado por `camposSaida` — use o mesmo tipo, sem redefini-lo.

- [ ] **Step 2: Escrever o teste (falhando) do service**

Em `backend/src/skill/skill.service.spec.ts`, adicione `update: jest.fn()` ao objeto `skill` do
`buildPrismaMock`, e adicione:

```typescript
  it('update atualiza só os campos informados, escopado à empresa via agente', async () => {
    const prisma = buildPrismaMock();
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue({ id: 'skill-1' });
    (prisma.skill.update as jest.Mock).mockResolvedValue({ id: 'skill-1', nome: 'Novo nome' });
    const service = new SkillService(prisma, agenteServiceMock());

    const resultado = await service.update('skill-1', 'empresa-1', { nome: 'Novo nome' });

    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: { id: 'skill-1', agente: { empresaId: 'empresa-1' } },
      include: { agente: true, ferramentas: true },
    });
    expect(prisma.skill.update).toHaveBeenCalledWith({ where: { id: 'skill-1' }, data: { nome: 'Novo nome' } });
    expect(resultado).toEqual({ id: 'skill-1', nome: 'Novo nome' });
  });
```

Use o mesmo padrão de mock de `AgenteService` (`agenteServiceMock()`) já usado pelos testes vizinhos de
`create`/`findAllByAgente` neste arquivo — copie a construção exata.

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd backend && npx jest skill.service.spec.ts -v`
Expected: FAIL — `service.update` não existe.

- [ ] **Step 3: Implementar**

Em `backend/src/skill/skill.service.ts`, adicione o import e o método (repare no cast de
`Prisma.InputJsonValue` para `camposSaida`, igual ao `create`):

```typescript
import type { UpdateSkillDto } from './dto/update-skill.dto';

// depois de findByIdInEmpresa:
  async update(skillId: string, empresaId: string, dto: UpdateSkillDto) {
    await this.findByIdInEmpresa(skillId, empresaId);

    return this.prisma.skill.update({
      where: { id: skillId },
      data: {
        nome: dto.nome,
        objetivo: dto.objetivo,
        camposSaida: dto.camposSaida
          ? (dto.camposSaida as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd backend && npx jest skill.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Escrever o teste (falhando) do controller**

Em `backend/src/skill/skill.controller.spec.ts`, adicione (seguindo o padrão de audit mock igual ao
usado em `agente.controller.spec.ts`):

```typescript
  it('atualiza uma skill do agente informado e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'skill-1', nome: 'Novo nome' }),
    } as unknown as SkillService;
    const audit = { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
    const controller = new SkillController(service, audit, buildTenantContext());

    const resultado = await controller.atualizar('agente-1', 'skill-1', { nome: 'Novo nome' });

    expect(service.update).toHaveBeenCalledWith('skill-1', 'empresa-1', { nome: 'Novo nome' });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'skill_atualizada',
      dadosDepois: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'skill-1', nome: 'Novo nome' });
  });
```

Ajuste as demais instanciações de `SkillController` no arquivo para incluir o `audit` mock, na mesma
posição usada abaixo (Step 7).

- [ ] **Step 6: Rodar o teste para ver falhar**

Run: `cd backend && npx jest skill.controller.spec.ts -v`
Expected: FAIL.

- [ ] **Step 7: Implementar a rota**

Substitua `backend/src/skill/skill.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { SkillService } from './skill.service';
import type { CreateSkillDto } from './dto/create-skill.dto';
import type { UpdateSkillDto } from './dto/update-skill.dto';

@Controller('agentes/:agenteId/skills')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('agenteId') agenteId: string, @Body() body: CreateSkillDto) {
    if (!body.nome?.trim() || !body.objetivo?.trim() || !body.camposSaida?.length) {
      throw new BadRequestException(
        'nome, objetivo e ao menos um campo de saída são obrigatórios',
      );
    }

    const { empresaId } = this.tenantContext.get();
    return this.skillService.create(agenteId, empresaId, body);
  }

  @Get()
  async listar(@Param('agenteId') agenteId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.skillService.findAllByAgente(agenteId, empresaId);
  }

  @Patch(':skillId')
  async atualizar(
    @Param('agenteId') _agenteId: string,
    @Param('skillId') skillId: string,
    @Body() body: UpdateSkillDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.skillService.update(skillId, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_atualizada',
      dadosDepois: body as Record<string, unknown>,
    });
    return resultado;
  }
}
```

- [ ] **Step 8: Importar `AuditModule` no `SkillModule`**

Substitua `backend/src/skill/skill.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { AuthModule } from '../auth/auth.module';
import { AgenteModule } from '../agente/agente.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AgenteModule, AuditModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
```

- [ ] **Step 9: Rodar os testes para ver passar**

Run: `cd backend && npx jest skill.controller.spec.ts skill.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 10: Rodar a suíte completa do backend**

Run: `cd backend && npm run build && npm test`
Expected: build limpo, todos os testes unitários passando (a suíte de smoke do Prisma pode skipar se
`DATABASE_URL` não estiver setado no ambiente do executor — normal).

- [ ] **Step 11: Commit**

```bash
git add backend/src/skill
git commit -m "feat(backend): PATCH /agentes/:agenteId/skills/:skillId com auditoria"
```

---

### Task 5: Frontend — camada de estado real (tipos + hook + clientes de API)

Esta task só **adiciona** — nenhum campo, tipo ou ação mock existente é tocado ou removido. O app
continua se comportando exatamente como hoje ao final desta task; as novas peças ficam "penduradas"
sem uso até as tasks seguintes (6-13) as consumirem tela por tela. Isso mantém `npm run build` verde
o tempo todo.

Não há test runner configurado no frontend (`CLAUDE.md`), então a verificação de cada task frontend
deste plano é `npm run build` (checagem de tipos via `tsc -b` + build do Vite) — não há
"escreva o teste, veja falhar" no sentido do Jest aqui.

**Files:**
- Modify: `frontend/src/corepilot/modulos/api.ts`
- Modify: `frontend/src/corepilot/agentes/api.ts`
- Modify: `frontend/src/corepilot/types.ts`
- Modify: `frontend/src/corepilot/initialState.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Consumes: `Agente`/`Skill`/`CampoSaida` de `../agentes/types`; `FonteDeDados` de
  `../fontes-de-dados/types`; `Consulta`/`ResultadoTeste` de `../consultas/types`; `Mensagem` de
  `../modulos/types`; todas as funções de `agentes/api.ts`, `fontes-de-dados/api.ts`,
  `consultas/api.ts`, `modulos/chatStream.ts` (já existentes, Fases 2-4).
- Produces: os novos campos de `CorePilotState` e as novas `actions` listadas abaixo — usados pelas
  Tasks 7 a 13.

- [ ] **Step 1: Adicionar `atualizarModulo` ao cliente de API de módulos**

Em `frontend/src/corepilot/modulos/api.ts`, adicione ao final:

```typescript
export interface AtualizarModuloDto {
  nome?: string;
  objetivo?: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
}

export async function atualizarModulo(
  accessToken: string,
  moduloId: string,
  dto: AtualizarModuloDto,
): Promise<Modulo> {
  const response = await apiFetch(`/modulos/${moduloId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar módulo (status ${response.status})`);
  return (await response.json()) as Modulo;
}
```

Também estenda `CriarModuloDto` (topo do arquivo) com os mesmos campos novos:

```typescript
export interface CriarModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
}
```

E `Modulo` (em `frontend/src/corepilot/modulos/types.ts`) ganha os mesmos campos, todos
`string | null`:

```typescript
export interface Modulo {
  id: string;
  nome: string;
  objetivo: string;
  instrucoes: string | null;
  descricao: string | null;
  responsavel: string | null;
  areas: string | null;
  icone: string | null;
  cor: string | null;
  modeloIA: string;
  criadoEm: string;
}
```

- [ ] **Step 2: Adicionar `atualizarAgente` e `atualizarSkill` ao cliente de API de agentes**

Em `frontend/src/corepilot/agentes/api.ts`, adicione ao final:

```typescript
export interface AtualizarAgenteDto {
  nome?: string;
  funcao?: string;
  objetivo?: string;
}

export async function atualizarAgente(
  accessToken: string,
  moduloId: string,
  agenteId: string,
  dto: AtualizarAgenteDto,
): Promise<Agente> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes/${agenteId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar agente (status ${response.status})`);
  return (await response.json()) as Agente;
}

export interface AtualizarSkillDto {
  nome?: string;
  objetivo?: string;
  camposSaida?: CampoSaida[];
}

export async function atualizarSkill(
  accessToken: string,
  agenteId: string,
  skillId: string,
  dto: AtualizarSkillDto,
): Promise<Skill> {
  const response = await apiFetch(`/agentes/${agenteId}/skills/${skillId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar skill (status ${response.status})`);
  return (await response.json()) as Skill;
}
```

- [ ] **Step 3: Rodar o build para confirmar que nada quebrou**

Run: `cd frontend && npm run build`
Expected: build limpo (essas funções novas ainda não são chamadas por ninguém, mas tipam
corretamente).

- [ ] **Step 4: Adicionar os novos tipos de estado "real" em `types.ts`**

Em `frontend/src/corepilot/types.ts`, adicione ao final do arquivo (não remova nada existente):

```typescript
export interface NovoAgenteForm {
  nome: string;
  funcao: string;
  objetivo: string;
}

export const emptyNovoAgenteForm: NovoAgenteForm = { nome: '', funcao: '', objetivo: '' };

export interface NovaFonteForm {
  tipo: string;
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export const emptyNovaFonteForm: NovaFonteForm = {
  tipo: '',
  nome: '',
  serverUrl: '',
  username: '',
  senha: '',
  codSistema: '',
  codColigada: '',
};

export interface ParametroConsultaForm {
  chave: string;
  valor: string;
}

export interface NovaConsultaForm {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametros: ParametroConsultaForm[];
  camposFiltro: import('./agentes/types').CampoSaida[];
}

export function emptyNovaConsultaForm(): NovaConsultaForm {
  return { fonteDeDadosId: '', nome: '', codSentenca: '', parametros: [{ chave: '', valor: '' }], camposFiltro: [] };
}
```

Repare no `import('./agentes/types').CampoSaida` inline — evita criar um ciclo de import no topo do
arquivo (o resto do arquivo `types.ts` não importa de `agentes/`).

- [ ] **Step 5: Adicionar os novos campos ao `CorePilotState` e seus valores iniciais**

Em `frontend/src/corepilot/initialState.ts`, adicione os imports no topo:

```typescript
import type { Agente, CampoSaida, Skill } from './agentes/types';
import type { FonteDeDados } from './fontes-de-dados/types';
import type { Consulta, ResultadoTeste } from './consultas/types';
import type { Mensagem } from './modulos/types';
import {
  emptyNovaConsultaForm,
  emptyNovaFonteForm,
  emptyNovoAgenteForm,
  type NovaConsultaForm,
  type NovaFonteForm,
  type NovoAgenteForm,
} from './types';
```

Adicione estes campos à interface `CorePilotState` (em qualquer ponto do corpo da interface):

```typescript
  // --- Estado real (Wizard / módulo aberto) ---
  currentModuloId: string | null;
  wizardSaving: boolean;
  wizardError: string | null;

  moduloAgentes: Agente[];
  agentesLoading: boolean;
  selectedAgenteId: string | null;
  novoAgenteForm: NovoAgenteForm;
  showNovoAgenteForm: boolean;

  agenteSkills: Skill[];
  skillsLoading: boolean;
  editingSkillReal: Skill | null;
  skillFormNome: string;
  skillFormObjetivo: string;
  skillFormCampos: CampoSaida[];
  skillFerramentasSelecionadas: string[];

  moduloFontesDeDados: FonteDeDados[];
  fontesLoading: boolean;
  novaFonteForm: NovaFonteForm;
  showNovaFonteForm: boolean;

  moduloConsultas: Consulta[];
  consultasLoading: boolean;
  novaConsultaForm: NovaConsultaForm;
  showNovaConsultaForm: boolean;
  testandoConsultaId: string | null;
  resultadosTesteConsulta: Record<string, ResultadoTeste>;

  skillTestSelecionadaId: string | null;
  skillTestEntrada: string;
  skillTestando: boolean;
  skillTestResultado: { saida: Record<string, unknown>; tokensEntrada: number | null; tokensSaida: number | null } | null;
  skillTestErro: string | null;

  moduloConversaId: string | null;
  moduloMensagens: Mensagem[];
  moduloChatDraft: string;
  moduloChatEnviando: boolean;
  moduloChatErro: string | null;
```

E adicione os valores iniciais correspondentes dentro de `createInitialState()` (em qualquer ponto do
objeto retornado):

```typescript
    currentModuloId: null,
    wizardSaving: false,
    wizardError: null,

    moduloAgentes: [],
    agentesLoading: false,
    selectedAgenteId: null,
    novoAgenteForm: { ...emptyNovoAgenteForm },
    showNovoAgenteForm: false,

    agenteSkills: [],
    skillsLoading: false,
    editingSkillReal: null,
    skillFormNome: '',
    skillFormObjetivo: '',
    skillFormCampos: [],
    skillFerramentasSelecionadas: [],

    moduloFontesDeDados: [],
    fontesLoading: false,
    novaFonteForm: { ...emptyNovaFonteForm },
    showNovaFonteForm: false,

    moduloConsultas: [],
    consultasLoading: false,
    novaConsultaForm: emptyNovaConsultaForm(),
    showNovaConsultaForm: false,
    testandoConsultaId: null,
    resultadosTesteConsulta: {},

    skillTestSelecionadaId: null,
    skillTestEntrada: '',
    skillTestando: false,
    skillTestResultado: null,
    skillTestErro: null,

    moduloConversaId: null,
    moduloMensagens: [],
    moduloChatDraft: '',
    moduloChatEnviando: false,
    moduloChatErro: null,
```

- [ ] **Step 6: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo — campos novos existem mas nada os lê/escreve ainda.

- [ ] **Step 7: Adicionar as novas ações ao hook**

Em `frontend/src/corepilot/useCorePilotState.ts`, adicione os imports no topo (ao lado dos já
existentes):

```typescript
import {
  criarAgente,
  atualizarAgente,
  criarSkill,
  atualizarSkill,
  anexarFerramenta,
  removerFerramenta,
  listarAgentes,
  listarSkills,
  executarSkill,
} from './agentes/api';
import { criarFonteDeDados, listarFontesDeDados } from './fontes-de-dados/api';
import {
  atualizarSincronizacao,
  criarConsulta,
  listarConsultas,
  testarConsulta,
} from './consultas/api';
import { criarConversa, enviarMensagemStreaming, listarConversas, listarMensagens } from './modulos/chatStream';
import { emptyNovaConsultaForm, emptyNovaFonteForm, emptyNovoAgenteForm } from './types';
import type { CampoSaida } from './agentes/types';
```

Adicione as funções a seguir dentro de `useCorePilotState()`, em qualquer ponto antes do objeto
`actions` — todas fecham sobre `accessToken`, o novo parâmetro do hook (Step 8 muda a assinatura):

```typescript
  // --- Agentes reais ---
  const carregarAgentesDoModulo = async (moduloId: string) => {
    update({ agentesLoading: true });
    try {
      const agentes = await listarAgentes(accessToken, moduloId);
      update((s) => ({
        agentesLoading: false,
        moduloAgentes: agentes,
        selectedAgenteId: agentes[0]?.id ?? null,
      }));
      if (agentes[0]) await carregarSkillsDoAgente(agentes[0].id);
    } catch (err) {
      update({ agentesLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar agentes' });
    }
  };
  const selecionarAgente = (agenteId: string) => {
    update({ selectedAgenteId: agenteId });
    void carregarSkillsDoAgente(agenteId);
  };
  const toggleNovoAgenteForm = () => update((s) => ({ showNovoAgenteForm: !s.showNovoAgenteForm, novoAgenteForm: { ...emptyNovoAgenteForm } }));
  const updateNovoAgenteField = (field: keyof CorePilotState['novoAgenteForm']) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    update((s) => ({ novoAgenteForm: { ...s.novoAgenteForm, [field]: val } }));
  };
  const criarNovoAgenteReal = async () => {
    const moduloId = state.currentModuloId;
    if (!moduloId || !state.novoAgenteForm.nome.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const agente = await criarAgente(accessToken, moduloId, state.novoAgenteForm);
      update((s) => ({
        wizardSaving: false,
        moduloAgentes: [agente, ...s.moduloAgentes],
        selectedAgenteId: agente.id,
        showNovoAgenteForm: false,
        novoAgenteForm: { ...emptyNovoAgenteForm },
        agenteSkills: [],
      }));
      showToast('Agente criado.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao criar agente' });
    }
  };
  const atualizarAgenteReal = async (campo: 'nome' | 'funcao' | 'objetivo', valor: string) => {
    const moduloId = state.currentModuloId;
    const agenteId = state.selectedAgenteId;
    if (!moduloId || !agenteId) return;
    try {
      const agente = await atualizarAgente(accessToken, moduloId, agenteId, { [campo]: valor });
      update((s) => ({ moduloAgentes: s.moduloAgentes.map((a) => (a.id === agenteId ? agente : a)) }));
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao atualizar agente' });
    }
  };

  // --- Skills reais ---
  const carregarSkillsDoAgente = async (agenteId: string) => {
    update({ skillsLoading: true });
    try {
      const skills = await listarSkills(accessToken, agenteId);
      update({ skillsLoading: false, agenteSkills: skills });
    } catch (err) {
      update({ skillsLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar skills' });
    }
  };
  const abrirNovaSkill = () => update({
    editingSkillReal: null,
    skillFormNome: '',
    skillFormObjetivo: '',
    skillFormCampos: [{ nome: '', tipo: 'string', descricao: '', obrigatorio: true }],
    skillFerramentasSelecionadas: [],
    agentTab: 'skill-editor',
  });
  const abrirEdicaoSkill = (skill: Skill) => update({
    editingSkillReal: skill,
    skillFormNome: skill.nome,
    skillFormObjetivo: skill.objetivo,
    skillFormCampos: skill.camposSaida.length ? skill.camposSaida : [{ nome: '', tipo: 'string', descricao: '', obrigatorio: true }],
    skillFerramentasSelecionadas: [],
    agentTab: 'skill-editor',
  });
  const cancelarEdicaoSkill = () => update({ editingSkillReal: null, agentTab: 'skills' });
  const updateSkillFormNome = (e: ChangeEvent<HTMLInputElement>) => update({ skillFormNome: e.target.value });
  const updateSkillFormObjetivo = (e: ChangeEvent<HTMLTextAreaElement>) => update({ skillFormObjetivo: e.target.value });
  const adicionarCampoSaida = () => update((s) => ({ skillFormCampos: [...s.skillFormCampos, { nome: '', tipo: 'string', descricao: '', obrigatorio: true }] }));
  const atualizarCampoSaida = (indice: number, parcial: Partial<CampoSaida>) => update((s) => ({ skillFormCampos: s.skillFormCampos.map((c, i) => (i === indice ? { ...c, ...parcial } : c)) }));
  const removerCampoSaida = (indice: number) => update((s) => ({ skillFormCampos: s.skillFormCampos.filter((_, i) => i !== indice) }));
  const toggleFerramentaSkill = (consultaId: string) => update((s) => ({
    skillFerramentasSelecionadas: s.skillFerramentasSelecionadas.includes(consultaId)
      ? s.skillFerramentasSelecionadas.filter((id) => id !== consultaId)
      : [...s.skillFerramentasSelecionadas, consultaId],
  }));
  const salvarSkillReal = async () => {
    const agenteId = state.selectedAgenteId;
    if (!agenteId || !state.skillFormNome.trim() || !state.skillFormObjetivo.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const camposSaida = state.skillFormCampos.filter((c) => c.nome.trim());
      const existente = state.editingSkillReal;
      const skill = existente
        ? await atualizarSkill(accessToken, agenteId, existente.id, { nome: state.skillFormNome, objetivo: state.skillFormObjetivo, camposSaida })
        : await criarSkill(accessToken, agenteId, { nome: state.skillFormNome, objetivo: state.skillFormObjetivo, camposSaida });

      const ferramentasAntes = new Set((existente as { ferramentas?: { id: string }[] } | null)?.ferramentas?.map((f) => f.id) ?? []);
      const ferramentasDepois = new Set(state.skillFerramentasSelecionadas);
      for (const id of ferramentasDepois) if (!ferramentasAntes.has(id)) await anexarFerramenta(accessToken, skill.id, id);
      for (const id of ferramentasAntes) if (!ferramentasDepois.has(id)) await removerFerramenta(accessToken, skill.id, id);

      update((s) => ({
        wizardSaving: false,
        agenteSkills: existente ? s.agenteSkills.map((sk) => (sk.id === skill.id ? skill : sk)) : [skill, ...s.agenteSkills],
        editingSkillReal: null,
        agentTab: 'skills',
      }));
      showToast('Skill salva com sucesso.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao salvar skill' });
    }
  };

  // --- Fontes de dados reais ---
  const carregarFontesDeDados = async () => {
    update({ fontesLoading: true });
    try {
      const fontes = await listarFontesDeDados(accessToken);
      update({ fontesLoading: false, moduloFontesDeDados: fontes });
    } catch (err) {
      update({ fontesLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar fontes de dados' });
    }
  };
  const toggleNovaFonteForm = () => update((s) => ({ showNovaFonteForm: !s.showNovaFonteForm, novaFonteForm: { ...emptyNovaFonteForm } }));
  const updateNovaFonteField = (field: keyof CorePilotState['novaFonteForm']) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    update((s) => ({ novaFonteForm: { ...s.novaFonteForm, [field]: val } }));
  };
  const salvarNovaFonteReal = async () => {
    const f = state.novaFonteForm;
    if (!f.tipo || !f.nome.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const fonte = await criarFonteDeDados(accessToken, f);
      update((s) => ({
        wizardSaving: false,
        moduloFontesDeDados: [fonte, ...s.moduloFontesDeDados],
        showNovaFonteForm: false,
        novaFonteForm: { ...emptyNovaFonteForm },
      }));
      showToast('Fonte de dados conectada.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao conectar fonte de dados' });
    }
  };

  // --- Consultas reais ---
  const carregarConsultasDoModulo = async (moduloId: string) => {
    update({ consultasLoading: true });
    try {
      const consultas = await listarConsultas(accessToken, moduloId);
      update({ consultasLoading: false, moduloConsultas: consultas });
    } catch (err) {
      update({ consultasLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar consultas' });
    }
  };
  const toggleNovaConsultaForm = () => update((s) => ({ showNovaConsultaForm: !s.showNovaConsultaForm, novaConsultaForm: emptyNovaConsultaForm() }));
  const updateNovaConsultaField = (field: 'fonteDeDadosId' | 'nome' | 'codSentenca') => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, [field]: val } }));
  };
  const adicionarParametroConsulta = () => update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, parametros: [...s.novaConsultaForm.parametros, { chave: '', valor: '' }] } }));
  const atualizarParametroConsulta = (indice: number, parcial: Partial<{ chave: string; valor: string }>) => update((s) => ({
    novaConsultaForm: { ...s.novaConsultaForm, parametros: s.novaConsultaForm.parametros.map((p, i) => (i === indice ? { ...p, ...parcial } : p)) },
  }));
  const adicionarCampoFiltroConsulta = () => update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, camposFiltro: [...s.novaConsultaForm.camposFiltro, { nome: '', tipo: 'string', descricao: '', obrigatorio: true }] } }));
  const atualizarCampoFiltroConsulta = (indice: number, parcial: Partial<CampoSaida>) => update((s) => ({
    novaConsultaForm: { ...s.novaConsultaForm, camposFiltro: s.novaConsultaForm.camposFiltro.map((c, i) => (i === indice ? { ...c, ...parcial } : c)) },
  }));
  const salvarNovaConsultaReal = async () => {
    const moduloId = state.currentModuloId;
    const f = state.novaConsultaForm;
    if (!moduloId || !f.fonteDeDadosId || !f.nome.trim() || !f.codSentenca.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const parametrosSincronizacao = Object.fromEntries(f.parametros.filter((p) => p.chave.trim()).map((p) => [p.chave, p.valor]));
      const consulta = await criarConsulta(accessToken, moduloId, {
        fonteDeDadosId: f.fonteDeDadosId,
        nome: f.nome,
        codSentenca: f.codSentenca,
        parametrosSincronizacao,
        camposFiltro: f.camposFiltro.filter((c) => c.nome.trim()),
      });
      update((s) => ({
        wizardSaving: false,
        moduloConsultas: [consulta, ...s.moduloConsultas],
        showNovaConsultaForm: false,
        novaConsultaForm: emptyNovaConsultaForm(),
      }));
      showToast('Consulta criada.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao criar consulta' });
    }
  };
  const testarConsultaReal = async (consultaId: string) => {
    update({ testandoConsultaId: consultaId });
    try {
      const resultado = await testarConsulta(accessToken, consultaId);
      update((s) => ({ resultadosTesteConsulta: { ...s.resultadosTesteConsulta, [consultaId]: resultado } }));
      const moduloId = state.currentModuloId;
      if (moduloId) await carregarConsultasDoModulo(moduloId);
    } catch (err) {
      update((s) => ({
        resultadosTesteConsulta: { ...s.resultadosTesteConsulta, [consultaId]: { sucesso: false, erro: err instanceof Error ? err.message : 'Erro ao testar' } },
      }));
    } finally {
      update({ testandoConsultaId: null });
    }
  };
  const toggleSincronizacaoConsultaReal = async (consulta: Consulta) => {
    const atualizada = await atualizarSincronizacao(accessToken, consulta.id, !consulta.sincronizacaoAtiva, consulta.intervaloSincronizacaoMinutos ?? 60);
    update((s) => ({ moduloConsultas: s.moduloConsultas.map((c) => (c.id === atualizada.id ? atualizada : c)) }));
  };

  // --- Testar skill real ---
  const selecionarSkillParaTeste = (skillId: string) => update({ skillTestSelecionadaId: skillId, skillTestResultado: null, skillTestErro: null });
  const updateSkillTestEntrada = (e: ChangeEvent<HTMLTextAreaElement>) => update({ skillTestEntrada: e.target.value });
  const executarTesteSkillReal = async () => {
    const skillId = state.skillTestSelecionadaId;
    if (!skillId || !state.skillTestEntrada.trim()) return;
    update({ skillTestando: true, skillTestErro: null });
    try {
      const resultado = await executarSkill(accessToken, skillId, state.skillTestEntrada);
      update({ skillTestando: false, skillTestResultado: resultado });
    } catch (err) {
      update({ skillTestando: false, skillTestErro: err instanceof Error ? err.message : 'Erro ao executar skill' });
    }
  };

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
  const updateModuloChatDraft = (e: ChangeEvent<HTMLTextAreaElement>) => update({ moduloChatDraft: e.target.value });
  const enviarMensagemModuloReal = async () => {
    const conversaId = state.moduloConversaId;
    const texto = state.moduloChatDraft.trim();
    if (!conversaId || !texto || state.moduloChatEnviando) return;
    update({ moduloChatDraft: '', moduloChatEnviando: true, moduloChatErro: null });

    const idUsuario = 'local-' + Date.now();
    const idAgente = 'local-' + (Date.now() + 1);
    update((s) => ({
      moduloMensagens: [
        ...s.moduloMensagens,
        { id: idUsuario, conversaId, papel: 'usuario' as const, conteudo: texto, tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
        { id: idAgente, conversaId, papel: 'agente' as const, conteudo: '', tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
      ],
    }));

    let respostaAcumulada = '';
    await enviarMensagemStreaming(accessToken, conversaId, texto, {
      onDelta: (delta) => {
        respostaAcumulada += delta;
        update((s) => ({ moduloMensagens: s.moduloMensagens.map((m) => (m.id === idAgente ? { ...m, conteudo: respostaAcumulada } : m)) }));
      },
      onDone: () => update({ moduloChatEnviando: false }),
      onErro: (mensagem) => update({ moduloChatEnviando: false, moduloChatErro: mensagem }),
    });
  };
```

- [ ] **Step 8: Fazer o hook aceitar `accessToken` como parâmetro**

Troque a assinatura de `useCorePilotState` (topo da função) de:

```typescript
export function useCorePilotState() {
```

para:

```typescript
export function useCorePilotState(accessToken: string) {
```

- [ ] **Step 9: Registrar as novas ações no objeto `actions` retornado**

No objeto `actions` (perto do final do hook), adicione as novas chaves à lista existente (não remova
nenhuma das já listadas):

```typescript
    carregarAgentesDoModulo, selecionarAgente, toggleNovoAgenteForm, updateNovoAgenteField, criarNovoAgenteReal, atualizarAgenteReal,
    carregarSkillsDoAgente, abrirNovaSkill, abrirEdicaoSkill, cancelarEdicaoSkill, updateSkillFormNome, updateSkillFormObjetivo,
    adicionarCampoSaida, atualizarCampoSaida, removerCampoSaida, toggleFerramentaSkill, salvarSkillReal,
    carregarFontesDeDados, toggleNovaFonteForm, updateNovaFonteField, salvarNovaFonteReal,
    carregarConsultasDoModulo, toggleNovaConsultaForm, updateNovaConsultaField, adicionarParametroConsulta, atualizarParametroConsulta,
    adicionarCampoFiltroConsulta, atualizarCampoFiltroConsulta, salvarNovaConsultaReal, testarConsultaReal, toggleSincronizacaoConsultaReal,
    selecionarSkillParaTeste, updateSkillTestEntrada, executarTesteSkillReal,
    carregarConversaDoModulo, updateModuloChatDraft, enviarMensagemModuloReal,
```

- [ ] **Step 10: Rodar o build**

Run: `cd frontend && npm run build`
Expected: FALHA — `useCorePilotState()` agora exige `accessToken`, mas `CorePilotApp.tsx` ainda chama
sem argumento. Isso é esperado; a Task 6 corrige a chamada. Confirme que a única falha reportada é
essa (nenhum outro erro de tipo nas novas funções) antes de seguir para a Task 6.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/corepilot/modulos/api.ts frontend/src/corepilot/agentes/api.ts frontend/src/corepilot/modulos/types.ts frontend/src/corepilot/types.ts frontend/src/corepilot/initialState.ts frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): camada de estado real para módulos/agentes/skills/fontes de dados/consultas/chat"
```

Nota: o commit deste passo deixa o build vermelho de propósito (ponte para a Task 6, que é a próxima
a rodar na sequência — não pule a Task 6).

---

### Task 6: Frontend — `AuthGate`/`Header` reais (login vai direto para o app real)

**Files:**
- Create: `frontend/src/corepilot/useMe.ts`
- Modify: `frontend/src/corepilot/auth/AuthGate.tsx`
- Modify: `frontend/src/corepilot/CorePilotApp.tsx`
- Modify: `frontend/src/corepilot/components/Header.tsx`
- Modify: `frontend/src/corepilot/views/CustomModuleView.tsx`
- Modify: `frontend/src/corepilot/initialState.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Consumes: `useCorePilotState(accessToken)` (Task 5), `listarModulos` (`modulos/api.ts`, já existe).
- Produces: `useMe(accessToken): { me: MeResponse | null; erro: string | null }`. `CorePilotApp` passa a
  aceitar `{ accessToken: string }`.

- [ ] **Step 1: Criar o hook `useMe`**

Create `frontend/src/corepilot/useMe.ts`:

```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from './api/apiFetch';

export interface MeResponse {
  usuario: { id: string; nome: string; email: string };
  empresa: { id: string; nome: string };
  perfil: string;
}

export function useMe(accessToken: string) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    apiFetch('/me', accessToken)
      .then(async (response) => {
        if (!response.ok) throw new Error(`GET /me falhou com status ${response.status}`);
        const data = (await response.json()) as MeResponse;
        if (!cancelado) setMe(data);
      })
      .catch((err: Error) => {
        if (!cancelado) setErro(err.message);
      });

    return () => {
      cancelado = true;
    };
  }, [accessToken]);

  return { me, erro };
}
```

- [ ] **Step 2: `AuthGate` renderiza `CorePilotApp` direto**

Substitua `frontend/src/corepilot/auth/AuthGate.tsx`:

```typescript
import { useSession } from './useSession';
import { LoginForm } from './LoginForm';
import { CorePilotApp } from '../CorePilotApp';

export function AuthGate() {
  const { session, loading } = useSession();

  if (loading) return <div style={{ padding: 40 }}>Carregando…</div>;
  if (!session) return <LoginForm />;
  return <CorePilotApp accessToken={session.access_token} />;
}
```

- [ ] **Step 3: `CorePilotApp` aceita `accessToken` e carrega `me`**

Substitua `frontend/src/corepilot/CorePilotApp.tsx`:

```typescript
import { useCorePilotState } from './useCorePilotState';
import { useMe } from './useMe';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { Overview } from './views/Overview';
import { ComprasView } from './views/compras/ComprasView';
import { FinanceiroView } from './views/financeiro/FinanceiroView';
import { CustomModuleView } from './views/CustomModuleView';
import { Wizard } from './views/wizard/Wizard';
import { AdminUsers } from './views/admin/AdminUsers';
import { AdminSettings } from './views/admin/AdminSettings';
import { AdminCompany } from './views/admin/AdminCompany';

export function CorePilotApp({ accessToken }: { accessToken: string }) {
  const { state, actions, refs } = useCorePilotState(accessToken);
  const { me } = useMe(accessToken);
  const activeModule = state.publishedModules.find((m) => state.view === `module:${m.id}`);

  return (
    <div style={{ height: '100vh', background: '#F7F8F6', color: '#1F2A2E', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header state={state} actions={actions} me={me} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {state.view === 'overview' && <Overview state={state} actions={actions} scrollRef={refs.overviewScrollRef} />}
        {state.view === 'compras' && <ComprasView state={state} actions={actions} scrollRef={refs.comprasScrollRef} />}
        {state.view === 'financeiro' && <FinanceiroView state={state} actions={actions} scrollRef={refs.financeiroScrollRef} />}
        {state.view === 'wizard' && <Wizard state={state} actions={actions} />}
        {state.view === 'admin-users' && <AdminUsers state={state} actions={actions} />}
        {state.view === 'admin-settings' && <AdminSettings state={state} actions={actions} />}
        {state.view === 'admin-company' && <AdminCompany state={state} actions={actions} />}
        {activeModule && <CustomModuleView accessToken={accessToken} module={activeModule} state={state} actions={actions} />}
      </div>

      <Toast message={state.toast} />
    </div>
  );
}
```

- [ ] **Step 4: `publishedModules` vira lista real, carregada de `GET /modulos`**

Em `frontend/src/corepilot/initialState.ts`, adicione ao import já existente de `./modulos/types` (se
ainda não houver, adicione a linha):

```typescript
import type { Modulo } from './modulos/types';
```

Troque o campo `publishedModules: PublishedModule[];` da interface `CorePilotState` por:

```typescript
  publishedModules: Modulo[];
  modulesLoading: boolean;
  modulesError: string | null;
```

E em `createInitialState()`, troque `publishedModules: [],` por:

```typescript
    publishedModules: [],
    modulesLoading: true,
    modulesError: null,
```

- [ ] **Step 5: Carregar os módulos reais ao montar o hook**

Em `frontend/src/corepilot/useCorePilotState.ts`, adicione o import de `listarModulos`:

```typescript
import { listarModulos } from './modulos/api';
```

E, dentro de `useCorePilotState(accessToken)`, logo depois da declaração de `state`/`setState`,
adicione:

```typescript
  useEffect(() => {
    let cancelado = false;
    listarModulos(accessToken)
      .then((modulos) => {
        if (!cancelado) update({ publishedModules: modulos, modulesLoading: false });
      })
      .catch((err: Error) => {
        if (!cancelado) update({ modulesLoading: false, modulesError: err.message });
      });
    return () => {
      cancelado = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);
```

Isso vai logo abaixo de onde `update` é definido — mova a chamada para depois da declaração de `update`
(a função `update` precisa existir antes de ser referenciada aqui).

- [ ] **Step 6: Ajustar `publishModule` para não escrever mais um objeto mock incompatível**

Em `useCorePilotState.ts`, substitua o corpo de `publishModule` (o que hoje cria
`{ id: 'op-agricolas', name, color }`):

```typescript
  const publishModule = () => {
    if (state.editingModule) {
      const target = state.editingModule;
      if (!target.startsWith('module:')) {
        // compras/financeiro: fluxo mock inalterado.
        update({ view: target, editingModule: null });
        showToast('Alterações salvas.');
        return;
      }
      // Módulo real existente: a Task 12 substitui este bloco pela chamada real de salvar.
      update({ editingModule: null, view: target });
      showToast('Alterações salvas.');
      return;
    }
    // Módulo novo: a Task 7 (Step1) já cria o módulo real ao avançar do passo 1 — quando o
    // usuário chega aqui (Step6) o módulo já existe de verdade. A Task 12 substitui este bloco
    // por uma chamada real de finalização.
    showToast('Módulo publicado.');
  };
```

- [ ] **Step 7: Atualizar o `Header` para usar dados reais**

Substitua `frontend/src/corepilot/components/Header.tsx` por completo:

```typescript
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import type { MeResponse } from '../useMe';
import { BellIcon, BuildingIcon, ChevronDownIcon, CorePilotLogoIcon, GearIcon, LogoutIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons';
import { colors, overlayFixed } from '../styles';

interface HeaderProps {
  state: CorePilotState;
  actions: CorePilotActions;
  me: MeResponse | null;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

export function Header({ state, actions, me }: HeaderProps) {
  const navTabs = [
    { id: 'overview' as const, label: 'Visão Geral' },
    { id: 'compras' as const, label: 'Compras' },
    { id: 'financeiro' as const, label: 'Financeiro' },
    ...state.publishedModules.map((m) => ({ id: `module:${m.id}` as const, label: m.nome })),
  ];
  const activeAgentsCount = 2 + state.publishedModules.length;
  const nomeEmpresa = me?.empresa.nome ?? '…';
  const nomeUsuario = me?.usuario.nome ?? '…';

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ background: colors.navy, color: '#fff', display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CorePilotLogoIcon />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '.2px' }}>CorePilot</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '5px 12px 5px 5px' }}>
          <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 6, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{iniciais(nomeEmpresa)}</div>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '.1px' }}>{nomeEmpresa}</span>
        </div>
        <div style={{ flex: 1, maxWidth: 460, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', borderRadius: 8, padding: '8px 12px' }}>
          <SearchIcon color="rgba(255,255,255,.7)" />
          <input type="text" placeholder="Buscar dados, contextos ou pessoas" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none' }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,160,.16)', border: '1px solid rgba(14,165,160,.4)', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: colors.teal400 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.teal, display: 'inline-block' }} />
            {activeAgentsCount} agentes ativos
          </div>
          <BellIcon style={{ cursor: 'pointer' }} />
          <div style={{ position: 'relative' }}>
            <div onClick={actions.toggleUserMenu} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{iniciais(nomeUsuario)}</div>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{nomeUsuario}</span>
              <ChevronDownIcon />
            </div>
            {state.userMenuOpen && (
              <>
                <div style={overlayFixed} onClick={actions.closeUserMenu} />
                <div style={{ position: 'absolute', top: 38, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(7,54,74,.18)', minWidth: 210, zIndex: 50, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{nomeUsuario}</div>
                    <div style={{ fontSize: 11.5, color: colors.textFaint }}>{me?.usuario.email ?? ''}</div>
                  </div>
                  <div onClick={actions.openUsersFromMenu} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <UsersIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Usuários e perfis</span>
                  </div>
                  <div onClick={actions.openGeneralSettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <GearIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações Gerais</span>
                  </div>
                  <div onClick={actions.openCompanySettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <BuildingIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações da empresa</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>
                    <LogoutIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sair</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 24px' }}>
        {navTabs.map((tab) => {
          const active = tab.id === state.view;
          return (
            <div key={tab.id} onClick={() => actions.setView(tab.id)} style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative' }}>
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? colors.navy : colors.textMuted }}>{tab.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
        <div style={{ marginLeft: 'auto', padding: '10px 0' }}>
          <button onClick={actions.viewWizardNew} style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            <PlusIcon />
            Criar módulo
          </button>
        </div>
      </div>
    </div>
  );
}
```

Nota: `setView` é tipado para `ViewId` (que inclui `` `module:${string}` ``), então `tab.id` (que pode
ser `` `module:${m.id}` ``) já é compatível — nenhuma mudança de tipo necessária em `types.ts`.

- [ ] **Step 8: Corrigir o tipo do `module` em `CustomModuleView` (fix mínimo — o comportamento real vem na Task 13)**

Em `frontend/src/corepilot/views/CustomModuleView.tsx`, troque o import e a assinatura:

```typescript
import type { Modulo } from '../modulos/types';

export function CustomModuleView({ module, actions }: { module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
```

E troque as duas referências de `module.name`/`module.color` por `module.nome`/`(module.cor ?? colors.teal)`:

```typescript
      <div style={{ width: 52, height: 52, borderRadius: 14, background: module.cor ?? colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <LayersIcon />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{module.nome}</h1>
```

Remova o import de `PublishedModule` (linha `import type { PublishedModule } from '../types';`) já que
não é mais usado neste arquivo.

- [ ] **Step 9: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 10: Verificação manual**

Run: `cd frontend && npm run dev` (se não estiver rodando) e `cd backend && npm run start:dev` (se não
estiver rodando). Abra `http://localhost:5173`, faça login com `seed-a@corepilot.dev`. Confirme:
- Vai direto para a tela do protótipo (Header azul-marinho + "Visão Geral"), sem a tela
  "CorePilot — Fundação" antiga.
- O nome da empresa no canto superior esquerdo do Header é o nome real (`Empresa Seed A`), não "LFG Agro".
- O nome do usuário no canto superior direito é o nome real do usuário seed, não "Marcos".
- As abas "Compras"/"Financeiro" continuam mockadas e clicáveis normalmente.
- Não existem abas extras de módulos reais ainda além de "Compras"/"Financeiro" mostrando os módulos
  reais já criados nas fases anteriores (ex.: "Estoque F4") — confirme que aparecem como abas.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/corepilot/useMe.ts frontend/src/corepilot/auth/AuthGate.tsx frontend/src/corepilot/CorePilotApp.tsx frontend/src/corepilot/components/Header.tsx frontend/src/corepilot/views/CustomModuleView.tsx frontend/src/corepilot/initialState.ts frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): AuthGate e Header reais — login vai direto para o protótipo com dados reais"
```

---

### Task 7: Frontend — Wizard shell real (criar/editar módulo, Step1 Identidade)

**Files:**
- Modify: `frontend/src/corepilot/useCorePilotState.ts`
- Modify: `frontend/src/corepilot/views/wizard/Step1Identity.tsx`

**Interfaces:**
- Consumes: `criarModulo`/`atualizarModulo` (`modulos/api.ts`, Task 5), `carregarAgentesDoModulo`/
  `carregarConsultasDoModulo` (Task 5).
- Produces: `salvarModuloReal(): Promise<boolean>` — usada pela Task 12 (Step6 "Publicar").

- [ ] **Step 1: Importar `criarModulo`/`atualizarModulo` no hook**

Em `frontend/src/corepilot/useCorePilotState.ts`, adicione ao import já existente de
`./modulos/api`:

```typescript
import { atualizarModulo, criarModulo, listarModulos } from './modulos/api';
```

- [ ] **Step 2: Implementar `salvarModuloReal`**

Adicione esta função dentro de `useCorePilotState`, antes da definição de `nextStep`:

```typescript
  const salvarModuloReal = async (): Promise<boolean> => {
    const dto = {
      nome: state.moduleForm.name,
      objetivo: state.moduleForm.objective,
      instrucoes: state.instructions,
      descricao: state.moduleForm.description,
      responsavel: state.moduleForm.owner,
      areas: state.moduleForm.areas,
      icone: state.moduleForm.icon,
      cor: state.moduleForm.color,
    };
    if (!dto.nome.trim() || !dto.objetivo.trim()) {
      update({ wizardError: 'Nome e objetivo do módulo são obrigatórios.' });
      return false;
    }
    update({ wizardSaving: true, wizardError: null });
    try {
      if (state.currentModuloId) {
        const atualizado = await atualizarModulo(accessToken, state.currentModuloId, dto);
        update((s) => ({
          wizardSaving: false,
          publishedModules: s.publishedModules.map((m) => (m.id === atualizado.id ? atualizado : m)),
        }));
      } else {
        const criado = await criarModulo(accessToken, dto);
        update((s) => ({ wizardSaving: false, currentModuloId: criado.id, publishedModules: [criado, ...s.publishedModules] }));
      }
      return true;
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao salvar módulo' });
      return false;
    }
  };
```

- [ ] **Step 3: Substituir `nextStep`/`goStep` para travar/salvar de verdade**

Substitua as definições existentes de `goStep` e `nextStep` (a primeira está perto do topo do hook,
junto de `setView`; a segunda está perto de `publishModule`):

```typescript
  const goStep = (n: number) => {
    const bloqueado = n > 1 && !state.currentModuloId && state.editingModule !== 'compras' && state.editingModule !== 'financeiro';
    if (bloqueado) return;
    update({ wizardStep: n });
  };
```

```typescript
  const nextStep = async () => {
    const precisaSalvar = state.wizardStep === 1 && state.editingModule !== 'compras' && state.editingModule !== 'financeiro';
    if (precisaSalvar) {
      const ok = await salvarModuloReal();
      if (!ok) return;
    }
    update((s) => ({ wizardStep: Math.min(6, s.wizardStep + 1) }));
  };
```

- [ ] **Step 4: `viewWizardNew` reseta a sessão do wizard para um módulo novo**

Substitua a definição existente de `viewWizardNew`:

```typescript
  const viewWizardNew = () => update({
    view: 'wizard', wizardStep: 1, editingModule: null, wizardError: null,
    currentModuloId: null,
    moduleForm: { name: '', description: '', objective: '', owner: '', areas: '', icon: 'leaf', color: '#0EA5A0' },
    instructions: '',
    moduloAgentes: [], selectedAgenteId: null, agenteSkills: [],
    moduloConsultas: [],
    agentTab: 'identity' as const,
  });
```

- [ ] **Step 5: `editModule` carrega dados reais quando o alvo é um módulo real**

Substitua a definição existente de `editModule`:

```typescript
  const editModule = (viewName: ViewId) => {
    if (viewName === 'compras' || viewName === 'financeiro') {
      update({ view: 'wizard', wizardStep: 1, editingModule: viewName, previousView: viewName });
      return;
    }
    const moduloId = viewName.replace('module:', '');
    const modulo = state.publishedModules.find((m) => m.id === moduloId);
    if (!modulo) return;
    update({
      view: 'wizard', wizardStep: 1, editingModule: viewName, previousView: viewName, wizardError: null,
      currentModuloId: modulo.id,
      moduleForm: {
        name: modulo.nome,
        description: modulo.descricao ?? '',
        objective: modulo.objetivo,
        owner: modulo.responsavel ?? '',
        areas: modulo.areas ?? '',
        icon: modulo.icone ?? 'leaf',
        color: modulo.cor ?? '#0EA5A0',
      },
      instructions: modulo.instrucoes ?? '',
      selectedAgenteId: null,
      agenteSkills: [],
      agentTab: 'identity' as const,
    });
    void carregarAgentesDoModulo(modulo.id);
    void carregarConsultasDoModulo(modulo.id);
  };
```

- [ ] **Step 6: Mostrar erro de salvamento no Step1**

Em `frontend/src/corepilot/views/wizard/Step1Identity.tsx`, adicione logo depois da linha do `<p>`
descritivo (antes do `<div style={{ display: 'flex', flexDirection: 'column', gap: 16 ...`):

```typescript
      {state.wizardError && (
        <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>
          {state.wizardError}
        </div>
      )}
```

- [ ] **Step 7: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 8: Verificação manual**

Com backend e frontend rodando, logado como `seed-a@corepilot.dev`:
- Clique "+ Criar módulo". No Step1, deixe "Nome do módulo" vazio e clique "Continuar" — deve
  aparecer o erro "Nome e objetivo do módulo são obrigatórios." e permanecer no Step1.
- Preencha nome e objetivo, clique "Continuar" — deve avançar para o Step2 e o módulo deve
  aparecer imediatamente como uma nova aba no Header (confirme abrindo `GET /modulos` via
  `curl -H "Authorization: Bearer <token>" http://localhost:3000/modulos` ou navegando de volta à
  Visão Geral).
- Volte ao Step1 (botão "Voltar"), mude o nome, clique "Continuar" de novo — confirme (pelo nome
  atualizado na aba do Header) que foi um `PATCH`, não um segundo módulo criado.
- Abra "Compras" → engrenagem de edição (ou o fluxo equivalente hoje existente para editar o módulo
  mock) e confirme que o Step1 dele continua idêntico a antes (sem `wizardError`, sem travar
  navegação entre passos).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/corepilot/useCorePilotState.ts frontend/src/corepilot/views/wizard/Step1Identity.tsx
git commit -m "feat(frontend): Wizard cria/atualiza módulo real no Step1, com trava de navegação até o primeiro save"
```

---

### Task 8: Frontend — Step3 Fontes de Dados real

Esta task substitui todo o conteúdo mockado de `Step3DataSources.tsx` por dados reais (`FonteDeDados`/
`ConsultaParametrizada`, Fase 4). Campos sem equivalente real são removidos: porta separada (mescla em
`serverUrl`), filial/escopo de leitura (a `FonteDeDados` real não tem esses campos), a seção "O que a
IA entende destas consultas / Descrever com IA" (não há descrição por IA, decisão tomada na Fase 4), a
contagem "Usada por N skills" (exigiria um novo endpoint de agregação, fora do escopo desta fase), e o
card fixo "Clima e operações de campo" (conteúdo decorativo do protótipo, sem fonte real por trás).

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/Step3DataSources.tsx`

**Interfaces:**
- Consumes: todos os campos/ações de fontes de dados e consultas adicionados na Task 5
  (`moduloFontesDeDados`, `moduloConsultas`, `novaFonteForm`, `novaConsultaForm`,
  `carregarFontesDeDados`, `carregarConsultasDoModulo`, `salvarNovaFonteReal`,
  `salvarNovaConsultaReal`, `testarConsultaReal`, `toggleSincronizacaoConsultaReal`, etc.).

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua `frontend/src/corepilot/views/wizard/Step3DataSources.tsx`:

```typescript
import { useEffect } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { SpinnerIcon, UploadIcon } from '../../icons';
import { colors, inputSm, panel } from '../../styles';
import type { CampoSaida } from '../../agentes/types';

export function Step3DataSources({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    actions.carregarFontesDeDados();
    if (state.currentModuloId) actions.carregarConsultasDoModulo(state.currentModuloId);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...panel, borderRadius: 14, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: 0 }}>Fontes de dados</h2>
        <button onClick={actions.toggleNovaFonteForm} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Conectar nova fonte
        </button>
      </div>
      <div style={{ background: colors.warnBg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: colors.warnText, marginBottom: 6 }}>
        Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 18 }}>
        INSERT, UPDATE, DELETE e DROP são bloqueados nesta camada. Credenciais nunca trafegam nem ficam salvas no navegador.
      </div>

      {state.wizardError && (
        <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {state.wizardError}
        </div>
      )}

      {state.showNovaFonteForm && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          <select value={state.novaFonteForm.tipo} onChange={actions.updateNovaFonteField('tipo')} style={inputSm}>
            <option value="">Selecione o tipo de fonte</option>
            <option value="totvs_rm">TOTVS RM</option>
          </select>
          {state.novaFonteForm.tipo && (
            <>
              <input type="text" placeholder="Nome da conexão" value={state.novaFonteForm.nome} onChange={actions.updateNovaFonteField('nome')} style={inputSm} />
              <input type="text" placeholder="Servidor (ex: http://servidor:8051)" value={state.novaFonteForm.serverUrl} onChange={actions.updateNovaFonteField('serverUrl')} style={inputSm} />
              <input type="text" placeholder="Usuário" value={state.novaFonteForm.username} onChange={actions.updateNovaFonteField('username')} style={inputSm} />
              <input type="password" placeholder="Senha" value={state.novaFonteForm.senha} onChange={actions.updateNovaFonteField('senha')} style={inputSm} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="text" placeholder="Cód. sistema" value={state.novaFonteForm.codSistema} onChange={actions.updateNovaFonteField('codSistema')} style={inputSm} />
                <input type="text" placeholder="Cód. coligada" value={state.novaFonteForm.codColigada} onChange={actions.updateNovaFonteField('codColigada')} style={inputSm} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void actions.salvarNovaFonteReal()} disabled={state.wizardSaving || !state.novaFonteForm.tipo} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {state.wizardSaving ? 'Salvando…' : 'Conectar'}
            </button>
            <button onClick={actions.toggleNovaFonteForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {state.fontesLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando fontes de dados…</div>}
      {!state.fontesLoading && state.moduloFontesDeDados.length === 0 && (
        <div style={{ fontSize: 13, color: colors.textFaint, marginBottom: 14 }}>Nenhuma fonte de dados conectada ainda.</div>
      )}

      {state.moduloFontesDeDados.map((fonte) => (
        <div key={fonte.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fonte.nome}</div>
              <div style={{ fontSize: 12, color: colors.textFaint }}>{fonte.tipo}</div>
            </div>
            <span
              style={{
                background: fonte.ultimoTesteSucesso === true ? colors.successBg : fonte.ultimoTesteSucesso === false ? colors.dangerBg : colors.warnBg,
                color: fonte.ultimoTesteSucesso === true ? colors.success : fonte.ultimoTesteSucesso === false ? colors.danger : colors.warnText,
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {fonte.ultimoTesteSucesso === true
                ? `Conectada · ${fonte.ultimoTesteEm}`
                : fonte.ultimoTesteSucesso === false
                  ? `Erro: ${fonte.ultimaMensagemErro}`
                  : 'Salva, não testada'}
            </span>
          </div>
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${colors.border}`, padding: '18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>Consultas cadastradas</span>
          <button onClick={actions.toggleNovaConsultaForm} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            + Nova consulta
          </button>
        </div>
        <p style={{ fontSize: 12, color: colors.textFaint, margin: '0 0 14px' }}>
          Cada consulta é parametrizada e somente leitura. Skills reutilizam estas consultas em vez de acessar o banco diretamente.
        </p>

        {state.showNovaConsultaForm && (
          <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={state.novaConsultaForm.fonteDeDadosId} onChange={actions.updateNovaConsultaField('fonteDeDadosId')} style={inputSm}>
              <option value="">Selecione a fonte de dados</option>
              {state.moduloFontesDeDados.map((fonte) => (
                <option key={fonte.id} value={fonte.id}>
                  {fonte.nome}
                </option>
              ))}
            </select>
            <input type="text" placeholder="Nome de exibição" value={state.novaConsultaForm.nome} onChange={actions.updateNovaConsultaField('nome')} style={inputSm} />
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              O CorePilot não permite digitar SQL livre. Informe o nome de uma consulta já criada e autorizada no TOTVS RM (módulo Consulta SQL) — ela será apenas referenciada, nunca reescrita aqui.
            </div>
            <input
              type="text"
              placeholder="Nome da consulta no RM · ex.: SOLICCOMPRAS_COPILOT"
              value={state.novaConsultaForm.codSentenca}
              onChange={actions.updateNovaConsultaField('codSentenca')}
              style={{ ...inputSm, fontFamily: "'SF Mono',Menlo,monospace" }}
            />

            <div style={{ fontWeight: 700, fontSize: 12.5, color: colors.navy, marginTop: 6 }}>Parâmetros de sincronização (fixos)</div>
            {state.novaConsultaForm.parametros.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder="chave (ex: CODFILIAL)" value={p.chave} onChange={(e) => actions.atualizarParametroConsulta(i, { chave: e.target.value })} style={{ ...inputSm, flex: 1 }} />
                <input type="text" placeholder="valor" value={p.valor} onChange={(e) => actions.atualizarParametroConsulta(i, { valor: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              </div>
            ))}
            <button onClick={actions.adicionarParametroConsulta} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              + Adicionar parâmetro
            </button>

            <div style={{ fontWeight: 700, fontSize: 12.5, color: colors.navy, marginTop: 6 }}>Campos de filtro (o que o agente pode informar)</div>
            {state.novaConsultaForm.camposFiltro.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" placeholder="nome do campo" value={c.nome} onChange={(e) => actions.atualizarCampoFiltroConsulta(i, { nome: e.target.value })} style={{ ...inputSm, flex: 1 }} />
                <select value={c.tipo} onChange={(e) => actions.atualizarCampoFiltroConsulta(i, { tipo: e.target.value as CampoSaida['tipo'] })} style={inputSm}>
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="string[]">string[]</option>
                </select>
              </div>
            ))}
            <button onClick={actions.adicionarCampoFiltroConsulta} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              + Adicionar campo de filtro
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                onClick={() => void actions.salvarNovaConsultaReal()}
                disabled={state.wizardSaving || !state.novaConsultaForm.fonteDeDadosId}
                style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {state.wizardSaving ? 'Salvando…' : 'Salvar consulta'}
              </button>
              <button onClick={actions.toggleNovaConsultaForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {state.consultasLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando consultas…</div>}
        {!state.consultasLoading && state.moduloConsultas.length === 0 && <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhuma consulta ainda.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.moduloConsultas.map((consulta) => {
            const testando = state.testandoConsultaId === consulta.id;
            const resultado = state.resultadosTesteConsulta[consulta.id];
            return (
              <div key={consulta.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                  <UploadIcon size={16} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{consulta.nome}</div>
                    <div style={{ fontSize: 12, color: colors.textFaint, fontFamily: "'SF Mono',Menlo,monospace" }}>{consulta.codSentenca}</div>
                  </div>
                  {testando && <SpinnerIcon />}
                  <span
                    style={{
                      background: consulta.testada ? colors.successBg : colors.warnBg,
                      color: consulta.testada ? colors.success : colors.warnText,
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {consulta.testada ? 'Testada' : 'Pendente de teste'}
                  </span>
                  <button onClick={() => void actions.testarConsultaReal(consulta.id)} disabled={testando} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                    Testar consulta
                  </button>
                </div>
                {resultado && (
                  <div style={{ padding: '0 16px 12px', fontSize: 12, color: resultado.sucesso ? colors.success : colors.danger }}>
                    {resultado.sucesso ? `${resultado.linhasLidas} linhas lidas` : resultado.erro}
                  </div>
                )}
                {consulta.colunas && consulta.colunas.length > 0 && (
                  <div style={{ padding: '0 16px 12px' }}>
                    {consulta.colunas.map((coluna) => (
                      <div key={coluna.nomeTecnico} style={{ fontSize: 12 }}>
                        <code>{coluna.nomeTecnico}</code> — {coluna.descricao ?? 'sem descrição'}
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '0 16px 12px' }}>
                  <input
                    type="checkbox"
                    checked={consulta.sincronizacaoAtiva}
                    disabled={!consulta.testada}
                    onChange={() => void actions.toggleSincronizacaoConsultaReal(consulta)}
                  />
                  Sincronização ativa
                  {consulta.ultimaSincronizacaoEm && ` (última: ${consulta.ultimaSincronizacaoEm})`}
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 3: Verificação manual**

Com backend/frontend rodando, dentro do Wizard de um módulo (novo ou existente) no Step3:
- "+ Conectar nova fonte" → selecione "TOTVS RM", preencha os campos, "Conectar" — confirme que
  aparece na lista logo abaixo com badge "Salva, não testada".
- "+ Nova consulta" → selecione a fonte recém-criada, preencha nome/consulta do RM, "Salvar
  consulta" — confirme que aparece com badge "Pendente de teste".
- "Testar consulta" — como não há um TOTVS RM real configurado neste ambiente, confirme que o erro
  de rede aparece corretamente (mesma mensagem já validada manualmente na Fase 4) e o badge
  permanece "Pendente de teste".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/corepilot/views/wizard/Step3DataSources.tsx
git commit -m "feat(frontend): Step3 do Wizard conectado a Fontes de Dados e Consultas reais"
```

---

### Task 9: Frontend — Step4: seletor de agentes + Identidade/Instruções reais

**Files:**
- Modify: `frontend/src/corepilot/useCorePilotState.ts`
- Modify: `frontend/src/corepilot/views/wizard/Step4Agent.tsx`
- Modify: `frontend/src/corepilot/views/wizard/step4/Identity.tsx`
- Modify: `frontend/src/corepilot/views/wizard/step4/Instructions.tsx`

**Interfaces:**
- Consumes: `moduloAgentes`, `selectedAgenteId`, `novoAgenteForm`, `showNovoAgenteForm`,
  `selecionarAgente`, `toggleNovoAgenteForm`, `updateNovoAgenteField`, `criarNovoAgenteReal`,
  `atualizarAgenteReal` (Task 5).
- Produces: `salvarInstrucoesReal()` — persiste `Modulo.instrucoes`.

- [ ] **Step 1: Adicionar `salvarInstrucoesReal` ao hook**

Em `frontend/src/corepilot/useCorePilotState.ts`, adicione esta função perto de `updateInstructions`
(não remova `updateInstructions` — ele continua atualizando o texto localmente a cada tecla; a nova
função só persiste ao perder o foco):

```typescript
  const salvarInstrucoesReal = async () => {
    if (!state.currentModuloId) return;
    try {
      await atualizarModulo(accessToken, state.currentModuloId, { instrucoes: state.instructions });
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao salvar instruções' });
    }
  };
```

Registre `salvarInstrucoesReal` no objeto `actions` retornado (mesma lista da Task 5).

- [ ] **Step 2: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 3: Adicionar o seletor de agentes ao topo do Step4**

Em `frontend/src/corepilot/views/wizard/Step4Agent.tsx`, adicione o import de `chipStyle`,
`btnDark`, `btnSecondary`, `inputSm` (junto do import já existente de `card, colors`):

```typescript
import { btnDark, btnSecondary, card, chipStyle, colors, inputSm } from '../../styles';
```

Envolva o conteúdo do componente com o seletor de agentes, substituindo o `return (...)` inteiro:

```typescript
export function Step4Agent({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 16px' }}>Agente e instruções</h2>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {state.agentesLoading && <span style={{ fontSize: 12.5, color: colors.textFaint }}>Carregando agentes…</span>}
        {state.moduloAgentes.map((agente) => (
          <span key={agente.id} onClick={() => actions.selecionarAgente(agente.id)} style={chipStyle(agente.id === state.selectedAgenteId)}>
            {agente.nome}
          </span>
        ))}
        <button onClick={actions.toggleNovoAgenteForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: colors.teal, cursor: 'pointer' }}>
          + Novo agente
        </button>
      </div>

      {state.showNovoAgenteForm && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          <input type="text" placeholder="Nome do agente" value={state.novoAgenteForm.nome} onChange={actions.updateNovoAgenteField('nome')} style={inputSm} />
          <textarea placeholder="Função" rows={2} value={state.novoAgenteForm.funcao} onChange={actions.updateNovoAgenteField('funcao')} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />
          <textarea placeholder="Objetivo" rows={2} value={state.novoAgenteForm.objetivo} onChange={actions.updateNovoAgenteField('objetivo')} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void actions.criarNovoAgenteReal()} disabled={state.wizardSaving || !state.novoAgenteForm.nome.trim()} style={btnDark}>
              {state.wizardSaving ? 'Criando…' : 'Criar agente'}
            </button>
            <button onClick={actions.toggleNovoAgenteForm} style={btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {!state.agentesLoading && state.moduloAgentes.length === 0 && !state.showNovoAgenteForm && (
        <div style={{ fontSize: 13, color: colors.textFaint, marginBottom: 18 }}>
          Nenhum agente ainda. Crie o primeiro para configurar identidade, skills e instruções.
        </div>
      )}

      {state.selectedAgenteId && (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 22, flexWrap: 'wrap' }}>
            {tabDefs.map((at) => {
              const active = at.key === state.agentTab || (at.key === 'skills' && state.agentTab === 'skill-editor');
              return (
                <div key={at.key} onClick={() => actions.setAgentTab(at.key)} style={{ padding: '9px 14px', cursor: 'pointer', position: 'relative' }}>
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? colors.teal : colors.textMuted }}>{at.label}</span>
                  {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
                </div>
              );
            })}
          </div>

          {state.agentTab === 'identity' && <AgentIdentityTab state={state} actions={actions} />}
          {state.agentTab === 'instructions' && <AgentInstructionsTab state={state} actions={actions} />}
          {state.agentTab === 'skills' && <AgentSkillsTab state={state} actions={actions} />}
          {state.agentTab === 'skill-editor' && <AgentSkillEditorTab state={state} actions={actions} />}
          {state.agentTab === 'tools' && <AgentToolsTab state={state} actions={actions} />}
          {state.agentTab === 'tasks' && <AgentTasksTab state={state} actions={actions} />}
          {state.agentTab === 'autonomy' && <AgentAutonomyTab state={state} actions={actions} />}
          {state.agentTab === 'test' && <AgentTestTab state={state} actions={actions} />}
        </>
      )}
    </div>
  );
}
```

Mantenha `tabDefs` e os imports dos 8 componentes de sub-aba (`AgentIdentityTab` etc.) exatamente
como já estão no topo do arquivo — só o corpo da função muda.

- [ ] **Step 4: Rodar o build**

Run: `cd frontend && npm run build`
Expected: FALHA — `AgentIdentityTab` ainda lê `state.agentForm` (campo mock antigo, sem relação com
o agente selecionado). O próximo passo corrige isso.

- [ ] **Step 5: Reescrever `AgentIdentityTab` para o agente real selecionado**

Substitua `frontend/src/corepilot/views/wizard/step4/Identity.tsx`:

```typescript
import { useEffect, useState } from 'react';
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, input, label } from '../../../styles';

export function AgentIdentityTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const agente = state.moduloAgentes.find((a) => a.id === state.selectedAgenteId);
  const [nome, setNome] = useState(agente?.nome ?? '');
  const [funcao, setFuncao] = useState(agente?.funcao ?? '');
  const [objetivo, setObjetivo] = useState(agente?.objetivo ?? '');

  useEffect(() => {
    setNome(agente?.nome ?? '');
    setFuncao(agente?.funcao ?? '');
    setObjetivo(agente?.objetivo ?? '');
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [agente?.id]);

  if (!agente) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <label style={label}>Nome do agente</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome !== agente.nome && void actions.atualizarAgenteReal('nome', nome)}
          style={{ ...input, width: '100%' }}
        />
      </div>
      <div>
        <label style={label}>Função</label>
        <textarea
          rows={2}
          value={funcao}
          onChange={(e) => setFuncao(e.target.value)}
          onBlur={() => funcao !== agente.funcao && void actions.atualizarAgenteReal('funcao', funcao)}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Objetivo</label>
        <textarea
          rows={2}
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          onBlur={() => objetivo !== agente.objetivo && void actions.atualizarAgenteReal('objetivo', objetivo)}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={{ ...label, marginBottom: 8 }}>Modelo de IA</label>
        <div style={{ border: `1.5px solid ${colors.teal}`, background: colors.successBg, borderRadius: 9, padding: '10px 16px', display: 'inline-block' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Claude</div>
          <div style={{ fontSize: 10.5, color: colors.teal, fontWeight: 700 }}>Único suportado nesta versão</div>
        </div>
        <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 8 }}>O CorePilot é otimizado e roda exclusivamente com Claude.</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Persistir as instruções do módulo ao sair do campo**

Em `frontend/src/corepilot/views/wizard/step4/Instructions.tsx`, adicione `onBlur` à `<textarea>`
existente (sem mudar `value`/`onChange`):

```typescript
      <textarea
        rows={7}
        value={state.instructions}
        onChange={actions.updateInstructions}
        onBlur={() => void actions.salvarInstrucoesReal()}
        style={{ width: '100%', maxWidth: 640, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.6, resize: 'vertical' }}
      />
```

- [ ] **Step 7: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 8: Verificação manual**

No Step4 de um módulo (novo ou existente): confirme que aparece "Nenhum agente ainda" quando não há
agentes; crie um agente pelo formulário; confirme que ele aparece como chip selecionado e que a aba
"Identidade" mostra os campos dele. Edite o nome, clique fora do campo (blur) e recarregue a página —
confirme que a mudança persistiu. Escreva algo em "Instruções", clique fora, recarregue — confirme
que persistiu em `Modulo.instrucoes` (pode conferir via `GET /modulos`).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/corepilot/useCorePilotState.ts frontend/src/corepilot/views/wizard/Step4Agent.tsx frontend/src/corepilot/views/wizard/step4/Identity.tsx frontend/src/corepilot/views/wizard/step4/Instructions.tsx
git commit -m "feat(frontend): Step4 do Wizard com seletor de agentes reais e Identidade/Instruções conectadas"
```

---

### Task 10: Frontend — Step4: Skills e editor de Skill reais (camposSaida + ferramentas)

Nota de limitação conhecida (mesma já aceita na Fase 4 em `SkillExecutor.tsx`): `GET
/agentes/:agenteId/skills` não inclui quais `ConsultaParametrizada` já estão anexadas a cada skill
(o tipo `Skill` do frontend não tem campo `ferramentas`). Por isso, ao abrir uma skill existente para
edição, os toggles de "Ferramentas de dados" sempre começam desmarcados — marcar e salvar sempre
_anexa_ (idempotente, seguro re-anexar o que já está anexado), nunca desanexa uma ferramenta de uma
sessão de edição anterior. Corrigir isso exigiria o backend retornar `ferramentas` também no `GET`,
fora do escopo desta fase.

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/step4/Skills.tsx`
- Modify: `frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx`

**Interfaces:**
- Consumes: `agenteSkills`, `skillsLoading`, `skillFormNome`, `skillFormObjetivo`, `skillFormCampos`,
  `skillFerramentasSelecionadas`, `moduloConsultas`, `abrirNovaSkill`, `abrirEdicaoSkill`,
  `cancelarEdicaoSkill`, `updateSkillFormNome`, `updateSkillFormObjetivo`, `adicionarCampoSaida`,
  `atualizarCampoSaida`, `removerCampoSaida`, `toggleFerramentaSkill`, `salvarSkillReal` (Task 5).

- [ ] **Step 1: Reescrever a lista de Skills**

Substitua `frontend/src/corepilot/views/wizard/step4/Skills.tsx`:

```typescript
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { btnPrimary, colors, panel } from '../../../styles';

export function AgentSkillsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13.5, color: colors.textMuted }}>Skills combinam objetivo, campos de saída e ferramentas de dados.</span>
        <button onClick={actions.abrirNovaSkill} style={btnPrimary}>+ Nova skill</button>
      </div>
      {state.skillsLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando skills…</div>}
      {!state.skillsLoading && state.agenteSkills.length === 0 && <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhuma skill ainda.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.agenteSkills.map((sk) => (
          <div key={sk.id} style={{ ...panel, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>{sk.nome}</div>
              <button onClick={() => actions.abrirEdicaoSkill(sk)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                Editar
              </button>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, margin: '8px 0' }}>{sk.objetivo}</div>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>{sk.camposSaida.length} campo(s) de saída</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar o build**

Run: `cd frontend && npm run build`
Expected: FALHA — `SkillEditor.tsx` (import `AgentSkillEditorTab`) ainda referencia campos mock
(`state.editingSkill`, `trigger`, `autonomy`). Corrigido no próximo passo.

- [ ] **Step 3: Reescrever o editor de Skill**

Substitua `frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx`:

```typescript
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { ToggleSwitch } from '../../../icons';
import { btnDark, btnSecondary, colors, input, inputSm, label } from '../../../styles';
import type { TipoCampoSaida } from '../../../agentes/types';

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

export function AgentSkillEditorTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const consultasTestadas = state.moduloConsultas.filter((c) => c.testada);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span onClick={actions.cancelarEdicaoSkill} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>
          ← Skills
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
        <div>
          <label style={label}>Nome da skill</label>
          <input type="text" value={state.skillFormNome} onChange={actions.updateSkillFormNome} style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={state.skillFormObjetivo} onChange={actions.updateSkillFormObjetivo} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Campos de saída</label>
          {state.skillFormCampos.map((campo, indice) => (
            <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input type="text" placeholder="nome do campo" value={campo.nome} onChange={(e) => actions.atualizarCampoSaida(indice, { nome: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              <select value={campo.tipo} onChange={(e) => actions.atualizarCampoSaida(indice, { tipo: e.target.value as TipoCampoSaida })} style={inputSm}>
                {TIPOS_CAMPO.map((tipo) => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
              <input type="text" placeholder="descrição (opcional)" value={campo.descricao ?? ''} onChange={(e) => actions.atualizarCampoSaida(indice, { descricao: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={campo.obrigatorio} onChange={(e) => actions.atualizarCampoSaida(indice, { obrigatorio: e.target.checked })} />
                obrigatório
              </label>
              <button type="button" onClick={() => actions.removerCampoSaida(indice)} disabled={state.skillFormCampos.length <= 1} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 12 }}>
                remover
              </button>
            </div>
          ))}
          <button type="button" onClick={actions.adicionarCampoSaida} style={{ background: 'none', border: 'none', color: colors.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            + Adicionar campo
          </button>
        </div>

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Ferramentas de dados</label>
          {consultasTestadas.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint }}>Nenhuma consulta testada disponível neste módulo ainda.</div>
          )}
          {consultasTestadas.map((consulta) => (
            <div key={consulta.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${colors.borderLight}` }}>
              <span style={{ fontSize: 13 }}>{consulta.nome}</span>
              <ToggleSwitch active={state.skillFerramentasSelecionadas.includes(consulta.id)} onClick={() => actions.toggleFerramentaSkill(consulta.id)} />
            </div>
          ))}
        </div>

        {state.wizardError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{state.wizardError}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void actions.salvarSkillReal()} disabled={state.wizardSaving || !state.skillFormNome.trim()} style={btnDark}>
            {state.wizardSaving ? 'Salvando…' : 'Salvar skill'}
          </button>
          <button onClick={actions.cancelarEdicaoSkill} style={btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 5: Verificação manual**

No Step4, com um agente selecionado: "+ Nova skill" → preencha nome/objetivo, adicione 1-2 campos de
saída, marque uma ferramenta de dados testada (se houver alguma do Step3) → "Salvar skill". Confirme
que a skill aparece na lista com a contagem certa de campos de saída. Edite-a de novo, mude o nome,
salve — confirme que atualizou (não duplicou).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/corepilot/views/wizard/step4/Skills.tsx frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx
git commit -m "feat(frontend): editor de Skill real no Wizard — campos de saída e ferramentas de dados"
```

---

### Task 11: Frontend — Step4: "Testar agente" com execução real de skill

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/step4/TestAgent.tsx`

**Interfaces:**
- Consumes: `agenteSkills`, `skillTestSelecionadaId`, `skillTestEntrada`, `skillTestando`,
  `skillTestResultado`, `skillTestErro`, `selecionarSkillParaTeste`, `updateSkillTestEntrada`,
  `executarTesteSkillReal` (Task 5).

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua `frontend/src/corepilot/views/wizard/step4/TestAgent.tsx`:

```typescript
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { btnDark, colors, inputSm } from '../../../styles';

export function AgentTestTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select
          value={state.skillTestSelecionadaId ?? ''}
          onChange={(e) => actions.selecionarSkillParaTeste(e.target.value)}
          style={inputSm}
        >
          <option value="">Selecione uma skill para testar</option>
          {state.agenteSkills.map((sk) => (
            <option key={sk.id} value={sk.id}>
              {sk.nome}
            </option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Entrada livre para a skill selecionada…"
        rows={3}
        value={state.skillTestEntrada}
        onChange={actions.updateSkillTestEntrada}
        style={{ width: '100%', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, fontSize: 13.5, resize: 'vertical', marginBottom: 10 }}
      />
      <button
        onClick={() => void actions.executarTesteSkillReal()}
        disabled={state.skillTestando || !state.skillTestSelecionadaId || !state.skillTestEntrada.trim()}
        style={btnDark}
      >
        {state.skillTestando ? 'Executando…' : 'Executar'}
      </button>

      {state.skillTestErro && <div style={{ color: colors.danger, fontSize: 12.5, marginTop: 10 }}>{state.skillTestErro}</div>}

      {state.skillTestResultado && (
        <div style={{ background: colors.bg, borderRadius: 12, padding: 18, marginTop: 14 }}>
          {Object.entries(state.skillTestResultado.saida).map(([campo, valor]) => (
            <div key={campo} style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>{campo}:</strong> {JSON.stringify(valor)}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 8 }}>
            Tokens: {state.skillTestResultado.tokensEntrada ?? '—'} entrada · {state.skillTestResultado.tokensSaida ?? '—'} saída
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 3: Verificação manual**

Na aba "Testar agente" do Step4, selecione uma skill já criada, digite uma entrada livre, clique
"Executar" — confirme que aparece uma resposta real da Anthropic com os campos de saída definidos na
skill (mesma chamada real já validada na Fase 3, agora nesta tela).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/corepilot/views/wizard/step4/TestAgent.tsx
git commit -m "feat(frontend): aba Testar agente executa skill real"
```

---

### Task 12: Frontend — Step6 Revisão real + unificar publicar/salvar

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/Step6Review.tsx`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Consumes: `salvarModuloReal` (Task 7).
- Produces: `publishModule` final (substitui o placeholder da Task 6).

- [ ] **Step 1: Reescrever o resumo do Step6**

Substitua `frontend/src/corepilot/views/wizard/Step6Review.tsx`:

```typescript
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { card, colors, panel } from '../../styles';

export function Step6Review({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const isEditing = !!state.editingModule;
  const agenteSelecionado = state.moduloAgentes.find((a) => a.id === state.selectedAgenteId);

  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 18px' }}>Revisão e publicação</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Identidade</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduleForm.name}</div>
          <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>Responsável: {state.moduleForm.owner || '—'}</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Fontes de dados</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduloFontesDeDados.length} conexões · {state.moduloConsultas.length} consultas</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Agentes</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduloAgentes.length} agente(s)</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Skills do agente selecionado</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{agenteSelecionado ? agenteSelecionado.nome : '—'} · {state.agenteSkills.length} skill(s)</div>
        </div>
      </div>
      {state.wizardError && (
        <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {state.wizardError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void actions.publishModule()}
          disabled={state.wizardSaving}
          style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {state.wizardSaving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Publicar módulo'}
        </button>
      </div>
    </div>
  );
}
```

Note: não há mais botão "Salvar rascunho" — publicar/salvar é uma ação só, decisão já tomada no
desenho desta fase (sem conceito de rascunho no backend).

- [ ] **Step 2: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo (`saveDraft` continua existindo no hook, só não é mais chamado por nenhuma
tela — sem problema, é só uma função não usada, não gera erro de tipo).

- [ ] **Step 3: Implementar o `publishModule` final**

Substitua o `publishModule` (placeholder da Task 6) em `frontend/src/corepilot/useCorePilotState.ts`:

```typescript
  const publishModule = async () => {
    const isMockEdit = state.editingModule === 'compras' || state.editingModule === 'financeiro';
    if (!isMockEdit) {
      const ok = await salvarModuloReal();
      if (!ok) return;
    }
    if (state.editingModule) {
      const target = state.editingModule;
      update({ view: target, editingModule: null });
      showToast('Alterações salvas.');
      return;
    }
    update((s) => ({ view: `module:${s.currentModuloId}` as ViewId, editingModule: null }));
    showToast('Módulo publicado. Já está disponível na navegação.');
  };
```

- [ ] **Step 4: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 5: Verificação manual completa do fluxo do Wizard**

Fluxo de ponta a ponta com backend/frontend rodando: "+ Criar módulo" → Step1 (nome/objetivo) →
Step3 (conectar fonte, criar consulta) → Step4 (criar agente, criar skill com campo de saída,
anexar ferramenta de dados, testar) → Step6 → "Publicar módulo". Confirme que:
- É redirecionado para a tela do módulo recém-criado (chat, ainda mockado até a Task 13).
- O módulo aparece na aba do Header com o nome certo.
- Reabrir a engrenagem de edição desse módulo recarrega Step1 (nome/objetivo corretos), Step3
  (fonte e consulta criadas aparecem) e Step4 (agente e skill criados aparecem).
- Editar "Compras" continua funcionando exatamente como antes (sem chamadas reais de rede para
  `/modulos`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/corepilot/views/wizard/Step6Review.tsx frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): Step6 do Wizard com resumo real e publicação unificada"
```

---

### Task 13: Frontend — `CustomModuleView` com chat real

**Files:**
- Modify: `frontend/src/corepilot/views/CustomModuleView.tsx`
- Modify: `frontend/src/corepilot/CorePilotApp.tsx`

**Interfaces:**
- Consumes: `moduloConversaId`, `moduloMensagens`, `moduloChatDraft`, `moduloChatEnviando`,
  `moduloChatErro`, `carregarConversaDoModulo`, `updateModuloChatDraft`, `enviarMensagemModuloReal`
  (Task 5); `editActiveModule` (existente, já correto após a Task 7).

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua `frontend/src/corepilot/views/CustomModuleView.tsx`:

```typescript
import { useEffect } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { GearIcon, LayersIcon } from '../icons';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble } from '../components/chat/MessageBubble';

export function CustomModuleView({ module, state, actions }: { module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    void actions.carregarConversaDoModulo(module.id);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 24px', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <span
        onClick={actions.editActiveModule}
        title="Configurar módulo"
        style={{ position: 'absolute', top: 0, right: 24, cursor: 'pointer', width: 34, height: 34, border: `1px solid ${colors.border}`, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <GearIcon />
      </span>
      <div style={{ textAlign: 'center', marginBottom: 24, flexShrink: 0 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: module.cor ?? colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <LayersIcon />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{module.nome}</h1>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>{module.objetivo}</p>
      </div>

      {state.moduloChatErro && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12, flexShrink: 0 }}>{state.moduloChatErro}</div>}

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
        {state.moduloMensagens.map((mensagem) => (
          <MessageBubble
            key={mensagem.id}
            msg={{ id: 0, isUser: mensagem.papel === 'usuario', isAi: mensagem.papel === 'agente', text: mensagem.conteudo }}
            agentLabel={module.nome}
          />
        ))}
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
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remover o `accessToken` que não é mais necessário na chamada**

Em `frontend/src/corepilot/CorePilotApp.tsx`, troque a linha do `CustomModuleView` (o componente lê
tudo através de `state`/`actions`, que já fecham sobre `accessToken` dentro do hook):

```typescript
        {activeModule && <CustomModuleView module={activeModule} state={state} actions={actions} />}
```

- [ ] **Step 3: Rodar o build**

Run: `cd frontend && npm run build`
Expected: build limpo.

- [ ] **Step 4: Verificação manual**

Abra um módulo real (criado nas tasks anteriores ou já existente) pela aba do Header. Confirme:
- Uma conversa é criada/retomada automaticamente (sem tela em branco de erro).
- Enviar uma mensagem produz uma resposta real da Anthropic, em streaming (o texto vai aparecendo
  progressivamente na bolha do agente, mesmo comportamento já validado na Fase 2's `ChatView`).
- Recarregar a página e reabrir o módulo mostra o histórico da conversa mais recente.
- O ícone de engrenagem no canto superior direito reabre o Wizard em modo edição, com Step1/Step3/
  Step4 pré-carregados com os dados reais do módulo (mesma verificação da Task 12, agora acessível
  a partir da tela de chat em vez de só pela lista de módulos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/corepilot/views/CustomModuleView.tsx frontend/src/corepilot/CorePilotApp.tsx
git commit -m "feat(frontend): CustomModuleView com chat real do módulo (Fase 2) e edição via engrenagem"
```

---

### Task 14: Limpeza — remover telas bare-bones substituídas + verificação final

As telas a seguir foram inteiramente substituídas pelas equivalentes reais dentro do protótipo
(Tasks 6-13) e não são mais importadas por nada além de si mesmas. **Confirmado por busca**: nenhum
arquivo fora deste cluster as referencia; `ModuleChatSidebar.tsx` (usado por `ComprasView`/
`FinanceiroView`, fora de escopo) **não está** nesta lista e não deve ser removido.

**Files (delete):**
- `frontend/src/corepilot/auth/FundacaoStatus.tsx`
- `frontend/src/corepilot/modulos/ModulosList.tsx`
- `frontend/src/corepilot/modulos/ModuloWorkspace.tsx`
- `frontend/src/corepilot/modulos/ChatView.tsx`
- `frontend/src/corepilot/modulos/ChatSidebarReal.tsx`
- `frontend/src/corepilot/modulos/CriarModuloForm.tsx`
- `frontend/src/corepilot/agentes/AgentesList.tsx`
- `frontend/src/corepilot/agentes/SkillsList.tsx`
- `frontend/src/corepilot/agentes/SkillExecutor.tsx`
- `frontend/src/corepilot/agentes/CriarAgenteForm.tsx`
- `frontend/src/corepilot/agentes/CriarSkillForm.tsx`
- `frontend/src/corepilot/fontes-de-dados/FontesDeDadosList.tsx`
- `frontend/src/corepilot/fontes-de-dados/CriarFonteDeDadosForm.tsx`
- `frontend/src/corepilot/consultas/ConsultasList.tsx`
- `frontend/src/corepilot/consultas/CriarConsultaForm.tsx`

**Modify:**
- `frontend/src/corepilot/types.ts` (remover o `PublishedModule` não mais usado, e o antigo `Skill`/
  `SkillAutonomy` mock se nada mais os referenciar)

- [ ] **Step 1: Confirmar que nada fora do cluster referencia esses arquivos**

Run (a partir de `frontend/src`):
```bash
cd frontend/src && grep -rl "FundacaoStatus\|ModulosList\|ModuloWorkspace\|from '\./ChatView'\|ChatSidebarReal\|CriarModuloForm\|AgentesList\|SkillsList\|SkillExecutor\|CriarAgenteForm\|CriarSkillForm\|FontesDeDadosList\|CriarFonteDeDadosForm\|ConsultasList\|CriarConsultaForm" . | grep -v -E "FundacaoStatus\.tsx|ModulosList\.tsx|ModuloWorkspace\.tsx|ChatView\.tsx|ChatSidebarReal\.tsx|CriarModuloForm\.tsx|AgentesList\.tsx|SkillsList\.tsx|SkillExecutor\.tsx|CriarAgenteForm\.tsx|CriarSkillForm\.tsx|FontesDeDadosList\.tsx|CriarFonteDeDadosForm\.tsx|ConsultasList\.tsx|CriarConsultaForm\.tsx"
```
Expected: nenhuma saída (nenhum arquivo fora do próprio cluster os referencia). Se algo aparecer,
pare e investigue antes de deletar — pode ser um uso legítimo que este plano não previu.

- [ ] **Step 2: Deletar os arquivos**

```bash
cd frontend/src/corepilot
rm auth/FundacaoStatus.tsx
rm modulos/ModulosList.tsx modulos/ModuloWorkspace.tsx modulos/ChatView.tsx modulos/ChatSidebarReal.tsx modulos/CriarModuloForm.tsx
rm agentes/AgentesList.tsx agentes/SkillsList.tsx agentes/SkillExecutor.tsx agentes/CriarAgenteForm.tsx agentes/CriarSkillForm.tsx
rm fontes-de-dados/FontesDeDadosList.tsx fontes-de-dados/CriarFonteDeDadosForm.tsx
rm consultas/ConsultasList.tsx consultas/CriarConsultaForm.tsx
```

- [ ] **Step 3: Remover o tipo `PublishedModule` não mais usado**

Em `frontend/src/corepilot/types.ts`, confirme com uma busca que nada mais importa
`PublishedModule` (`grep -rn "PublishedModule" frontend/src`) — depois da Task 6, só a própria
definição deveria sobrar. Remova a interface:

```typescript
export interface PublishedModule {
  id: string;
  name: string;
  color: string;
}
```

- [ ] **Step 4: Rodar o build do frontend**

Run: `cd frontend && npm run build`
Expected: build limpo — nenhum import quebrado pelas remoções.

- [ ] **Step 5: Rodar o lint do frontend**

Run: `cd frontend && npm run lint`
Expected: sem erros novos (oxlint pode reportar avisos pré-existentes não relacionados a esta
fase — confirme que nada novo aparece nos arquivos tocados por este plano).

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npm run build && npm test && npm run test:e2e`
Expected: build limpo, testes unitários passando, e2e passando (o e2e de Fontes de Dados contra RM
real pode aparecer como skip se `TOTVS_RM_TEST_*` não estiver configurado — normal, mesmo
comportamento das fases anteriores).

- [ ] **Step 7: Verificação manual final de ponta a ponta**

Com backend (`npm run start:dev`) e frontend (`npm run dev`) rodando:
1. Login com `seed-a@corepilot.dev` → vai direto para o protótipo real, sem tela "CorePilot —
   Fundação" e sem botão "Ver protótipo (mock)" em lugar nenhum.
2. Criar módulo → Fontes de Dados → Agente/Skills → Revisão → Publicar, de ponta a ponta.
3. Conversar com o módulo criado e receber resposta real da Anthropic.
4. Reabrir a edição do módulo (engrenagem) e confirmar que os dados reais recarregam certo.
5. Navegar por Compras, Financeiro, Admin (Usuários/Configurações/Empresa), e os Steps 2/5 do
   Wizard — tudo deve continuar idêntico ao protótipo original (mock, sem regressão visual).
6. Login com `seed-b@corepilot.dev` (outra empresa) e confirmar isolamento: nenhum módulo/agente/
   fonte de dados da Empresa Seed A aparece.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(frontend): remove telas bare-bones substituídas pelo protótipo real"
```

---

## Self-Review

**Cobertura da spec:** Todas as 11 seções de
`docs/superpowers/specs/2026-07-26-skinning-ui-design.md` têm task correspondente — §3 (tabela de
escopo) mapeia 1:1 para as Tasks 6-13; §4 (schema) → Task 1; §6 (superfície de API) → Tasks 2-4; §7
(fluxo de criação/edição) → Tasks 7, 9, 12; §8 (chat) → Task 13; §9 (fora de escopo) → garantido por
nunca tocar os arquivos mock correspondentes; §10 (critério de aceite) → coberto pelas verificações
manuais das Tasks 6, 7, 12, 13, 14.

**Placeholders:** nenhum "TBD"/"implementar depois" — toda task tem código completo. A única
simplificação deliberada e documentada é a de "ferramentas" no editor de Skill (Task 10), idêntica à
já aceita na Fase 4.

**Consistência de tipos:** `Modulo` (frontend `modulos/types.ts`) e `CreateModuloDto`/
`UpdateModuloDto` (backend) usam os mesmos 5 campos novos em todas as tasks que os tocam (1, 5, 6, 7).
`Agente`/`Skill`/`CampoSaida` são sempre importados de `agentes/types.ts` (nunca redefinidos) nas
Tasks 5, 9, 10, 11. `salvarModuloReal`/`publishModule`/`goStep`/`nextStep`/`editModule`/
`viewWizardNew` formam uma cadeia coerente entre as Tasks 6, 7 e 12 — cada uma referencia a versão
mais recente da anterior.

