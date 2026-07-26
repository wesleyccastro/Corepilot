# CorePilot — Fase 3 (Agentes + Skills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter `Agente`s reais (multi-tenant, múltiplos por `Modulo`) com `Skill`s reais (múltiplas por `Agente`), cada Skill com schema de saída definido por um construtor guiado de campos, e uma execução avulsa de Skill (sem BPM) que chama a Messages API de forma escopada e devolve saída estruturada validada.

**Architecture:** Frontend nunca fala com a Anthropic; toda chamada passa pelo NestJS. Uma Skill não usa histórico de conversa nem streaming — é uma chamada síncrona única: `system` = identidade do Agente + objetivo da Skill, `messages` = só a entrada de texto livre daquela execução, saída forçada via **Structured Outputs** (`client.messages.parse()` + `output_config.format: zodOutputFormat(schema)`), onde `schema` é um `z.object()` construído dinamicamente a partir de `Skill.camposSaida`. `TenantGuard`/`JwtAuthGuard`/`AuditService`/`PrismaService`/`AnthropicService` da Fase 2 são reaproveitados (o último ganha um novo método, não é reescrito).

**Tech Stack:** NestJS 11, Prisma, `@anthropic-ai/sdk` (Structured Outputs via `messages.parse`), `zod` (novo), React 19 + Vite (frontend, sem test runner ainda).

## Global Constraints

- Lógica de backend só em `backend/` — nunca em Supabase Edge Functions (CLAUDE.md).
- Frontend nunca chama a Anthropic diretamente e nunca recebe `ANTHROPIC_API_KEY` — só fala com a API do NestJS (spec §5).
- Toda execução de Skill gera exatamente uma linha em `AuditLog` com `acao: 'skill_execucao'` (spec §8) — reaproveitando o `AuditService` já existente, sem alterá-lo.
- Escopo de tenant é explícito no código: toda query por `moduloId`/`agenteId`/`skillId` vindo do cliente precisa ser validada contra `TenantContext` antes de qualquer leitura/escrita — nunca confiar em um ID só porque veio autenticado.
- `Agente` e `Skill` são recursos da empresa (como `Modulo`), não privados de um usuário — qualquer usuário da empresa pode ver/usar. `SkillExecucao.usuarioId` é só metadado de quem disparou, não restringe acesso (spec §4).
- **Toda tabela nova nasce com RLS habilitada e sem policies** (regra permanente estabelecida na revisão final da Fase 1, `docs/superpowers/specs/2026-07-24-fundacao-design.md` §3.1) — `Agente`, `Skill`, `SkillExecucao` precisam de `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;` na própria migração que as cria.
- Nenhuma Skill tem `ferramentas[]` reais nesta fase — a única "ferramenta" em jogo é o mecanismo de saída estruturada (spec §2). Não implementar tool use real, não implementar fontes de dados.
- Execução de Skill **não usa streaming** — é uma resposta HTTP síncrona comum (spec §5).
- `ChatComposer`, `MessageBubble`, `ChatView`, `ChatSidebarReal` (Fase 2) são reaproveitados **sem nenhuma modificação**. `ModuleChatSidebar`, `ComprasView`, `FinanceiroView` e `CorePilotApp` (protótipo mock) **não são tocados** em nenhuma task deste plano.
- Segredos (`ANTHROPIC_API_KEY`) só em `backend/.env.local`, nunca commitados — já configurado desde a Fase 2, nenhuma nova variável de ambiente nesta fase.
- Prettier do backend: aspas simples, trailing commas em tudo.
- Backend: testes Jest colocados junto do código (`*.spec.ts` em `src/`), e2e em `test/*.e2e-spec.ts`.
- Frontend não tem test runner configurado — verificação é manual (rodar `npm run dev`, testar no navegador).

---

## Task 1: Prisma — schema de Agente/Skill/SkillExecucao e migração

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migração via `npm run prisma:migrate`

**Interfaces:**
- Produces: modelos Prisma `Agente`, `Skill`, `SkillExecucao`; back-relations `Empresa.agentes`, `Modulo.agentes`, `Usuario.skillExecucoes`; migração aplicada com RLS habilitada nas 3 tabelas novas (sem policies).

- [ ] **Step 1: Editar `backend/prisma/schema.prisma`**

Adicionar `agentes Agente[]` ao model `Empresa` existente (ao lado de `modulos`/`conversas`/`auditLogs`):

```prisma
model Empresa {
  id       String   @id @default(uuid())
  nome     String
  criadoEm DateTime @default(now())

  usuarios  UsuarioEmpresa[]
  auditLogs AuditLog[]
  modulos   Modulo[]
  conversas Conversa[]
  agentes   Agente[]
}
```

Adicionar `agentes Agente[]` ao model `Modulo` existente:

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
  agentes   Agente[]
}
```

Adicionar `skillExecucoes SkillExecucao[]` ao model `Usuario` existente (ao lado de `conversas`):

```prisma
model Usuario {
  id             String   @id @default(uuid())
  supabaseUserId String   @unique
  nome           String
  email          String
  criadoEm       DateTime @default(now())

  empresas       UsuarioEmpresa[]
  auditLogs      AuditLog[]
  conversas      Conversa[]
  skillExecucoes SkillExecucao[]
}
```

(Ajuste os campos acima só para bater com o que já existe em `Usuario` no schema atual — o importante é acrescentar a linha `skillExecucoes SkillExecucao[]`, não reescrever o resto do model.)

Adicionar os três models novos ao final do arquivo:

```prisma
model Agente {
  id        String   @id @default(uuid())
  empresaId String
  moduloId  String
  nome      String
  funcao    String
  objetivo  String
  modeloIA  String   @default("claude-sonnet-5")
  criadoEm  DateTime @default(now())

  empresa Empresa @relation(fields: [empresaId], references: [id])
  modulo  Modulo  @relation(fields: [moduloId], references: [id])
  skills  Skill[]
}

model Skill {
  id          String   @id @default(uuid())
  agenteId    String
  nome        String
  objetivo    String
  camposSaida Json
  criadoEm    DateTime @default(now())

  agente    Agente          @relation(fields: [agenteId], references: [id])
  execucoes SkillExecucao[]
}

model SkillExecucao {
  id            String   @id @default(uuid())
  skillId       String
  usuarioId     String
  entrada       String
  saida         Json
  tokensEntrada Int?
  tokensSaida   Int?
  criadoEm      DateTime @default(now())

  skill   Skill   @relation(fields: [skillId], references: [id])
  usuario Usuario @relation(fields: [usuarioId], references: [id])
}
```

- [ ] **Step 2: Criar a migração sem aplicar ainda, para poder editar o SQL antes**

Run: `npm run prisma:migrate -- --create-only --name agentes_skills`

Isso gera `backend/prisma/migrations/<timestamp>_agentes_skills/migration.sql` com o DDL das tabelas/colunas novas, **sem** executá-lo no banco ainda.

- [ ] **Step 3: Adicionar as linhas de RLS ao final do arquivo de migração gerado**

Abrir o `migration.sql` recém-criado e acrescentar ao final:

```sql
-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "Agente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SkillExecucao" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Aplicar a migração (agora já com as linhas de RLS) e regenerar o client**

Run: `npm run prisma:migrate`

Expected: detecta a migração pendente `agentes_skills` e a aplica (DDL + RLS numa única execução), regenera `@prisma/client`.

- [ ] **Step 5: Verificar que as 3 tabelas têm RLS habilitada**

Criar um script temporário `backend/scratch-check-rls.ts` (não commitar):

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('Agente', 'Skill', 'SkillExecucao')
  `;
  console.log(rows);
}

main().finally(() => prisma.$disconnect());
```

Run: `npx dotenv -e .env.local -- npx tsx scratch-check-rls.ts` (ou `ts-node`, o que já estiver disponível no projeto)
Expected: as 3 linhas com `relrowsecurity: true`.

Depois, **apagar** `backend/scratch-check-rls.ts` — é só um script de verificação, não faz parte do repositório.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): schema Prisma de Agente/Skill/SkillExecucao com RLS"
```

---

## Task 2: AgenteModule (criar e listar agentes por módulo)

**Files:**
- Create: `backend/src/agente/dto/create-agente.dto.ts`
- Create: `backend/src/agente/agente.service.ts`
- Create: `backend/src/agente/agente.service.spec.ts`
- Create: `backend/src/agente/agente.controller.ts`
- Create: `backend/src/agente/agente.controller.spec.ts`
- Create: `backend/src/agente/agente.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ModuloService.findByIdInEmpresa` (Fase 2), `PrismaService`, `TenantContext`/guards (Fase 1).
- Produces: `AgenteService.create(moduloId, empresaId, dto): Promise<Agente>` (lança `NotFoundException` se o módulo não pertencer à empresa), `AgenteService.findAllByModulo(moduloId, empresaId): Promise<Agente[]>`, `AgenteService.findByIdInEmpresa(agenteId, empresaId): Promise<Agente>` (lança `NotFoundException` — **usado pela Task 3**). Rotas `POST /modulos/:moduloId/agentes`, `GET /modulos/:moduloId/agentes`.

- [ ] **Step 1: Criar o DTO**

Criar `backend/src/agente/dto/create-agente.dto.ts`:

```typescript
export interface CreateAgenteDto {
  nome: string;
  funcao: string;
  objetivo: string;
  modeloIA?: string;
}
```

- [ ] **Step 2: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/agente/agente.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { AgenteService } from './agente.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('AgenteService', () => {
  function buildDeps() {
    const prisma = {
      agente: {
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

  it('cria um agente depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.agente.create as jest.Mock).mockResolvedValue({ id: 'agente-1' });
    const service = new AgenteService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'empresa-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos de compra',
      objetivo: 'Ajudar o time de compras a triar solicitações',
    });

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.agente.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        moduloId: 'modulo-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: undefined,
      },
    });
    expect(resultado).toEqual({ id: 'agente-1' });
  });

  it('propaga o NotFoundException se o módulo não for da empresa (não cria o agente)', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new AgenteService(prisma, moduloService);

    await expect(
      service.create('modulo-x', 'empresa-1', { nome: 'X', funcao: 'Y', objetivo: 'Z' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.agente.create).not.toHaveBeenCalled();
  });

  it('lista agentes só do módulo informado', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.agente.findMany as jest.Mock).mockResolvedValue([]);
    const service = new AgenteService(prisma, moduloService);

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.agente.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se o agente não existir ou não for da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.agente.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AgenteService(prisma, moduloService);

    await expect(service.findByIdInEmpresa('agente-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.agente.findFirst).toHaveBeenCalledWith({
      where: { id: 'agente-x', empresaId: 'empresa-1' },
    });
  });

  it('findByIdInEmpresa retorna o agente quando encontrado', async () => {
    const { prisma, moduloService } = buildDeps();
    const agente = { id: 'agente-1', empresaId: 'empresa-1' };
    (prisma.agente.findFirst as jest.Mock).mockResolvedValue(agente);
    const service = new AgenteService(prisma, moduloService);

    const resultado = await service.findByIdInEmpresa('agente-1', 'empresa-1');

    expect(resultado).toBe(agente);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- agente.service.spec.ts`
Expected: FAIL com "Cannot find module './agente.service'"

- [ ] **Step 4: Implementar `AgenteService`**

Criar `backend/src/agente/agente.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';

@Injectable()
export class AgenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, empresaId: string, dto: CreateAgenteDto) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.agente.create({
      data: {
        empresaId,
        moduloId,
        nome: dto.nome,
        funcao: dto.funcao,
        objetivo: dto.objetivo,
        modeloIA: dto.modeloIA,
      },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.agente.findMany({
      where: { moduloId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(agenteId: string, empresaId: string) {
    const agente = await this.prisma.agente.findFirst({
      where: { id: agenteId, empresaId },
    });

    if (!agente) {
      throw new NotFoundException('Agente não encontrado');
    }

    return agente;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- agente.service.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/agente/agente.controller.spec.ts`:

```typescript
import { AgenteController } from './agente.controller';
import type { AgenteService } from './agente.service';
import type { TenantContext } from '../auth/tenant-context';

describe('AgenteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  it('cria um agente no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'agente-1' }),
    } as unknown as AgenteService;
    const controller = new AgenteController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
    });

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'empresa-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
    });
    expect(resultado).toEqual({ id: 'agente-1' });
  });

  it('rejeita quando nome, funcao ou objetivo estão vazios', async () => {
    const service = { create: jest.fn() } as unknown as AgenteService;
    const controller = new AgenteController(service, buildTenantContext());

    await expect(
      controller.criar('modulo-1', { nome: '', funcao: 'X', objetivo: 'Y' }),
    ).rejects.toThrow('nome, funcao e objetivo são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista agentes do módulo informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'agente-1' }]),
    } as unknown as AgenteService;
    const controller = new AgenteController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'agente-1' }]);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- agente.controller.spec.ts`
Expected: FAIL com "Cannot find module './agente.controller'"

- [ ] **Step 8: Implementar `AgenteController`**

Criar `backend/src/agente/agente.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
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
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- agente.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 10: Criar `AgenteModule` e importar no `AppModule`**

Criar `backend/src/agente/agente.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';

@Module({
  imports: [AuthModule, ModuloModule],
  controllers: [AgenteController],
  providers: [AgenteService],
  exports: [AgenteService],
})
export class AgenteModule {}
```

Editar `backend/src/app.module.ts` para importar `AgenteModule`.

- [ ] **Step 11: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 12: Commit**

```bash
git add backend/src/agente backend/src/app.module.ts
git commit -m "feat(backend): AgenteService/Controller — criar e listar agentes por módulo"
```

---

## Task 3: SkillModule (criar e listar skills por agente) + construtor de schema

**Files:**
- Create: `backend/src/skill/schema-builder.ts`
- Create: `backend/src/skill/schema-builder.spec.ts`
- Create: `backend/src/skill/dto/create-skill.dto.ts`
- Create: `backend/src/skill/skill.service.ts`
- Create: `backend/src/skill/skill.service.spec.ts`
- Create: `backend/src/skill/skill.controller.ts`
- Create: `backend/src/skill/skill.controller.spec.ts`
- Create: `backend/src/skill/skill.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json` (nova dependência `zod`)

**Interfaces:**
- Consumes: `AgenteService.findByIdInEmpresa` (Task 2), `PrismaService`, `TenantContext`/guards (Fase 1).
- Produces: `CampoSaida` (tipo `{ nome, tipo, descricao?, obrigatorio }`), `construirSchemaSaida(campos: CampoSaida[]): z.ZodObject<...>` (**usado pela Task 5**), `SkillService.create(agenteId, empresaId, dto): Promise<Skill>`, `SkillService.findAllByAgente(agenteId, empresaId): Promise<Skill[]>`, `SkillService.findByIdInEmpresa(skillId, empresaId): Promise<Skill & { agente: Agente }>` (**usado pela Task 5**, já retorna `agente` via `include`). Rotas `POST /agentes/:agenteId/skills`, `GET /agentes/:agenteId/skills`.

- [ ] **Step 1: Instalar o Zod**

```bash
cd backend
npm install zod
```

Se o `npm install` mostrar um aviso de peer dependency envolvendo `zod` (o helper
`@anthropic-ai/sdk/helpers/zod`, usado na Task 4, exige uma versão mínima de `zod`),
instale a versão compatível indicada no aviso em vez da mais recente por padrão.

- [ ] **Step 2: Escrever o teste do construtor de schema (falha primeiro)**

Criar `backend/src/skill/schema-builder.ts` ainda vazio não é necessário — vá direto ao teste.

Criar `backend/src/skill/schema-builder.spec.ts`:

```typescript
import { construirSchemaSaida } from './schema-builder';

describe('construirSchemaSaida', () => {
  it('constrói um schema que aceita todos os tipos suportados', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
      { nome: 'prioridade', tipo: 'number', obrigatorio: true },
      { nome: 'urgente', tipo: 'boolean', obrigatorio: true },
      { nome: 'tags', tipo: 'string[]', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({
      titulo: 'Pedido de compra',
      prioridade: 2,
      urgente: false,
      tags: ['ferramentas', 'urgente'],
    });

    expect(resultado.success).toBe(true);
  });

  it('rejeita quando falta um campo obrigatório', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({});

    expect(resultado.success).toBe(false);
  });

  it('aceita omitir um campo marcado como não obrigatório', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
      { nome: 'observacao', tipo: 'string', obrigatorio: false },
    ]);

    const resultado = schema.safeParse({ titulo: 'Pedido de compra' });

    expect(resultado.success).toBe(true);
  });

  it('rejeita um tipo incompatível com o campo declarado', () => {
    const schema = construirSchemaSaida([
      { nome: 'prioridade', tipo: 'number', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({ prioridade: 'alta' });

    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- schema-builder.spec.ts`
Expected: FAIL com "Cannot find module './schema-builder'"

- [ ] **Step 4: Implementar `construirSchemaSaida`**

Criar `backend/src/skill/schema-builder.ts`:

```typescript
import { z } from 'zod';

export interface CampoSaida {
  nome: string;
  tipo: 'string' | 'number' | 'boolean' | 'string[]';
  descricao?: string;
  obrigatorio: boolean;
}

function tipoBaseParaZod(tipo: CampoSaida['tipo']) {
  switch (tipo) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'string[]':
      return z.array(z.string());
  }
}

export function construirSchemaSaida(campos: CampoSaida[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const campo of campos) {
    let tipoZod: z.ZodTypeAny = tipoBaseParaZod(campo.tipo);

    if (campo.descricao) {
      tipoZod = tipoZod.describe(campo.descricao);
    }
    if (!campo.obrigatorio) {
      tipoZod = tipoZod.optional();
    }

    shape[campo.nome] = tipoZod;
  }

  return z.object(shape);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- schema-builder.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Criar o DTO de criação de Skill**

Criar `backend/src/skill/dto/create-skill.dto.ts`:

```typescript
import type { CampoSaida } from '../schema-builder';

export interface CreateSkillDto {
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
}
```

- [ ] **Step 7: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/skill/skill.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { SkillService } from './skill.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgenteService } from '../agente/agente.service';

describe('SkillService', () => {
  function buildDeps() {
    const prisma = {
      skill: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    const agenteService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as AgenteService;
    return { prisma, agenteService };
  }

  const camposSaida = [{ nome: 'titulo', tipo: 'string' as const, obrigatorio: true }];

  it('cria uma skill depois de validar que o agente é da empresa', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'agente-1' });
    (prisma.skill.create as jest.Mock).mockResolvedValue({ id: 'skill-1' });
    const service = new SkillService(prisma, agenteService);

    const resultado = await service.create('agente-1', 'empresa-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações de compra',
      camposSaida,
    });

    expect(agenteService.findByIdInEmpresa).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: {
        agenteId: 'agente-1',
        nome: 'Triagem',
        objetivo: 'Triar solicitações de compra',
        camposSaida,
      },
    });
    expect(resultado).toEqual({ id: 'skill-1' });
  });

  it('propaga o NotFoundException se o agente não for da empresa (não cria a skill)', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new SkillService(prisma, agenteService);

    await expect(
      service.create('agente-x', 'empresa-1', { nome: 'X', objetivo: 'Y', camposSaida }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('lista skills só do agente informado', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'agente-1' });
    (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
    const service = new SkillService(prisma, agenteService);

    await service.findAllByAgente('agente-1', 'empresa-1');

    expect(agenteService.findByIdInEmpresa).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { agenteId: 'agente-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se a skill não existir ou o agente não for da empresa', async () => {
    const { prisma, agenteService } = buildDeps();
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new SkillService(prisma, agenteService);

    await expect(service.findByIdInEmpresa('skill-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: { id: 'skill-x', agente: { empresaId: 'empresa-1' } },
      include: { agente: true },
    });
  });

  it('findByIdInEmpresa retorna a skill com o agente incluído', async () => {
    const { prisma, agenteService } = buildDeps();
    const skillComAgente = { id: 'skill-1', agente: { id: 'agente-1', empresaId: 'empresa-1' } };
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue(skillComAgente);
    const service = new SkillService(prisma, agenteService);

    const resultado = await service.findByIdInEmpresa('skill-1', 'empresa-1');

    expect(resultado).toBe(skillComAgente);
  });
});
```

- [ ] **Step 8: Rodar e confirmar que falha**

Run: `npm test -- skill.service.spec.ts`
Expected: FAIL com "Cannot find module './skill.service'"

- [ ] **Step 9: Implementar `SkillService`**

Criar `backend/src/skill/skill.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
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
        camposSaida: dto.camposSaida,
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
      include: { agente: true },
    });

    if (!skill) {
      throw new NotFoundException('Skill não encontrada');
    }

    return skill;
  }
}
```

- [ ] **Step 10: Rodar e confirmar que passa**

Run: `npm test -- skill.service.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 11: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/skill/skill.controller.spec.ts`:

```typescript
import { SkillController } from './skill.controller';
import type { SkillService } from './skill.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const camposSaida = [{ nome: 'titulo', tipo: 'string' as const, obrigatorio: true }];

  it('cria uma skill no agente informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'skill-1' }),
    } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    const resultado = await controller.criar('agente-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações',
      camposSaida,
    });

    expect(service.create).toHaveBeenCalledWith('agente-1', 'empresa-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações',
      camposSaida,
    });
    expect(resultado).toEqual({ id: 'skill-1' });
  });

  it('rejeita quando não há pelo menos um campo de saída', async () => {
    const service = { create: jest.fn() } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    await expect(
      controller.criar('agente-1', { nome: 'X', objetivo: 'Y', camposSaida: [] }),
    ).rejects.toThrow('nome, objetivo e ao menos um campo de saída são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista skills do agente informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByAgente: jest.fn().mockResolvedValue([{ id: 'skill-1' }]),
    } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    const resultado = await controller.listar('agente-1');

    expect(service.findAllByAgente).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'skill-1' }]);
  });
});
```

- [ ] **Step 12: Rodar e confirmar que falha**

Run: `npm test -- skill.controller.spec.ts`
Expected: FAIL com "Cannot find module './skill.controller'"

- [ ] **Step 13: Implementar `SkillController`**

Criar `backend/src/skill/skill.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import type { CreateSkillDto } from './dto/create-skill.dto';

@Controller('agentes/:agenteId/skills')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
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
}
```

- [ ] **Step 14: Rodar e confirmar que passa**

Run: `npm test -- skill.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 15: Criar `SkillModule` e importar no `AppModule`**

Criar `backend/src/skill/skill.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { AuthModule } from '../auth/auth.module';
import { AgenteModule } from '../agente/agente.module';

@Module({
  imports: [AuthModule, AgenteModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
```

Editar `backend/src/app.module.ts` para importar `SkillModule`.

- [ ] **Step 16: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 17: Commit**

```bash
git add backend/src/skill backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): SkillService/Controller — criar e listar skills, construtor de schema de saída"
```

---

## Task 4: AnthropicService — método `parseStructured` (Structured Outputs)

**Files:**
- Modify: `backend/src/chat/anthropic.service.ts`
- Modify: `backend/src/chat/anthropic.service.spec.ts`
- Modify: `backend/src/chat/chat.module.ts`

**Interfaces:**
- Consumes: `zodOutputFormat` (`@anthropic-ai/sdk/helpers/zod`), `z.ZodTypeAny` (Zod).
- Produces: `AnthropicService.parseStructured(params: { system: string; mensagem: string; model: string; maxTokens: number; schema: z.ZodTypeAny })` retornando o resultado de `client.messages.parse(...)` (consumido pela Task 5 via `.parsed_output` e `.usage`). `ChatModule` passa a exportar `AnthropicService` (antes só usado internamente pelo `MensagemController`).

- [ ] **Step 1: Escrever o teste do novo método (falha primeiro)**

Substituir **todo o conteúdo** de `backend/src/chat/anthropic.service.spec.ts` (o teste de
`streamReply` já existente da Fase 2 continua, só ganha um vizinho novo no mesmo
`describe`):

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
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- anthropic.service.spec.ts`
Expected: FAIL com "service.parseStructured is not a function" (ou erro de tipo equivalente)

- [ ] **Step 3: Implementar `parseStructured`**

Editar `backend/src/chat/anthropic.service.ts`, acrescentando o import do helper de Zod e o novo método (mantendo `streamReply` intacto):

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
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- anthropic.service.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Confirmar que o build TypeScript compila**

Run: `npm run build`
Expected: sem erros de tipo. Se a assinatura real de `client.messages.parse`/`output_config.format`/`zodOutputFormat` divergir do uso acima (nome do campo, formato do retorno), ajuste conforme o erro do compilador — não adivinhe a API, deixe o TypeScript apontar a diferença exata (mesma orientação da Task 4 da Fase 2 para `messages.stream`).

- [ ] **Step 6: Exportar `AnthropicService` do `ChatModule`**

Editar `backend/src/chat/chat.module.ts`, acrescentando `exports`:

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
  exports: [AnthropicService],
})
export class ChatModule {}
```

- [ ] **Step 7: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 8: Commit**

```bash
git add backend/src/chat/anthropic.service.ts backend/src/chat/anthropic.service.spec.ts backend/src/chat/chat.module.ts
git commit -m "feat(backend): AnthropicService.parseStructured — Structured Outputs via Zod"
```

---

## Task 5: SkillExecucaoController — executar skill avulsa + histórico

**Files:**
- Create: `backend/src/skill/skill-execucao.service.ts`
- Create: `backend/src/skill/skill-execucao.service.spec.ts`
- Create: `backend/src/skill/dto/executar-skill.dto.ts`
- Create: `backend/src/skill/skill-execucao.controller.ts`
- Create: `backend/src/skill/skill-execucao.controller.spec.ts`
- Create: `backend/src/skill/skill-execucao.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SkillService.findByIdInEmpresa` (Task 3, já retorna `skill.agente`), `construirSchemaSaida` (Task 3), `AnthropicService.parseStructured` (Task 4), `AuditService.record` (Fase 1), `TenantContext`/guards (Fase 1).
- Produces: `SkillExecucaoService.listBySkill(skillId): Promise<SkillExecucao[]>`, `SkillExecucaoService.appendExecucao(skillId, usuarioId, entrada, saida, tokensEntrada, tokensSaida): Promise<SkillExecucao>`. Rotas `GET /skills/:skillId/execucoes` (histórico) e `POST /skills/:skillId/execucoes` (executa, resposta síncrona `{ execucaoId, saida, tokensEntrada, tokensSaida }`).

Diferente da Task 5 da Fase 2 (`MensagemController`), esta é uma resposta HTTP síncrona
comum — sem `@Res()` manual, sem streaming — então dá para testar o controller inteiro
com um teste unitário simples, igual `ConversaController`.

- [ ] **Step 1: Escrever o teste do `SkillExecucaoService` (falha primeiro)**

Criar `backend/src/skill/skill-execucao.service.spec.ts`:

```typescript
import { SkillExecucaoService } from './skill-execucao.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('SkillExecucaoService', () => {
  function buildPrismaMock() {
    return {
      skillExecucao: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('lista execuções de uma skill em ordem cronológica decrescente', async () => {
    const prisma = buildPrismaMock();
    (prisma.skillExecucao.findMany as jest.Mock).mockResolvedValue([]);
    const service = new SkillExecucaoService(prisma);

    await service.listBySkill('skill-1');

    expect(prisma.skillExecucao.findMany).toHaveBeenCalledWith({
      where: { skillId: 'skill-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('appendExecucao grava entrada, saida e tokens', async () => {
    const prisma = buildPrismaMock();
    (prisma.skillExecucao.create as jest.Mock).mockResolvedValue({ id: 'execucao-1' });
    const service = new SkillExecucaoService(prisma);

    await service.appendExecucao('skill-1', 'usuario-1', 'Pedido: 10 parafusos', { titulo: 'ok' }, 10, 5);

    expect(prisma.skillExecucao.create).toHaveBeenCalledWith({
      data: {
        skillId: 'skill-1',
        usuarioId: 'usuario-1',
        entrada: 'Pedido: 10 parafusos',
        saida: { titulo: 'ok' },
        tokensEntrada: 10,
        tokensSaida: 5,
      },
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- skill-execucao.service.spec.ts`
Expected: FAIL com "Cannot find module './skill-execucao.service'"

- [ ] **Step 3: Implementar `SkillExecucaoService`**

Criar `backend/src/skill/skill-execucao.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillExecucaoService {
  constructor(private readonly prisma: PrismaService) {}

  async listBySkill(skillId: string) {
    return this.prisma.skillExecucao.findMany({
      where: { skillId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async appendExecucao(
    skillId: string,
    usuarioId: string,
    entrada: string,
    saida: Prisma.InputJsonValue,
    tokensEntrada: number,
    tokensSaida: number,
  ) {
    return this.prisma.skillExecucao.create({
      data: { skillId, usuarioId, entrada, saida, tokensEntrada, tokensSaida },
    });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- skill-execucao.service.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Criar o DTO de execução**

Criar `backend/src/skill/dto/executar-skill.dto.ts`:

```typescript
export interface ExecutarSkillDto {
  entrada: string;
}
```

- [ ] **Step 6: Escrever o teste do controller (falha primeiro)**

Criar `backend/src/skill/skill-execucao.controller.spec.ts`:

```typescript
import { UnprocessableEntityException } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import type { SkillService } from './skill.service';
import type { SkillExecucaoService } from './skill-execucao.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { AuditService } from '../audit/audit.service';
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
    agente: {
      id: 'agente-1',
      moduloId: 'modulo-1',
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
      modeloIA: 'claude-sonnet-5',
    },
  };

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
      buildTenantContext(),
    );

    const resultado = await controller.listar('skill-1');

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith('skill-1', 'empresa-1');
    expect(skillExecucaoService.listBySkill).toHaveBeenCalledWith('skill-1');
    expect(resultado).toEqual([{ id: 'execucao-1' }]);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm test -- skill-execucao.controller.spec.ts`
Expected: FAIL com "Cannot find module './skill-execucao.controller'"

- [ ] **Step 8: Implementar `SkillExecucaoController`**

Criar `backend/src/skill/skill-execucao.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { AnthropicService } from '../chat/anthropic.service';
import { AuditService } from '../audit/audit.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
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

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
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

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem: body.entrada,
      model: skill.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });

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
}
```

Se o tipo de retorno de `client.messages.parse` (via `AnthropicService.parseStructured`)
não bater exatamente com `response.parsed_output`/`response.usage.input_tokens`/
`response.usage.output_tokens` usados acima, ajuste conforme o erro do compilador no
Step 10 — não adivinhe, deixe o TypeScript apontar a diferença exata.

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm test -- skill-execucao.controller.spec.ts`
Expected: PASS (3 testes)

- [ ] **Step 10: Confirmar que o build compila**

Run: `npm run build`
Expected: sem erros de tipo.

- [ ] **Step 11: Criar `SkillExecucaoModule` e importar no `AppModule`**

Criar `backend/src/skill/skill-execucao.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import { SkillExecucaoService } from './skill-execucao.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SkillModule } from './skill.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [AuthModule, AuditModule, SkillModule, ChatModule],
  controllers: [SkillExecucaoController],
  providers: [SkillExecucaoService],
})
export class SkillExecucaoModule {}
```

Editar `backend/src/app.module.ts` para importar `SkillExecucaoModule`.

- [ ] **Step 12: Verificação manual real**

Suba o backend (`PORT=3001 npm run start:dev`) e, usando um token de acesso real (seed
da Fase 1), faça manualmente (via `curl` ou similar), reaproveitando um módulo já criado
na Fase 2:

1. `POST /modulos/<moduloId>/agentes` com `{"nome": "Comprador", "funcao": "Analisar pedidos", "objetivo": "Ajudar o time de compras"}` — confirme que retorna um agente com `id`.
2. `POST /agentes/<agenteId>/skills` com `{"nome": "Triagem", "objetivo": "Triar uma solicitação de compra", "camposSaida": [{"nome": "titulo", "tipo": "string", "obrigatorio": true}, {"nome": "prioridade", "tipo": "number", "obrigatorio": true}]}` — confirme que retorna uma skill com `id`.
3. `POST /skills/<skillId>/execucoes` com `{"entrada": "Preciso de 10 parafusos M6, é urgente"}` — confirme que a resposta é um JSON com `saida.titulo` (string) e `saida.prioridade` (number), não texto livre.
4. `GET /skills/<skillId>/execucoes` — confirme que retorna a execução salva.

Pare o servidor depois.

- [ ] **Step 13: Rodar a suíte completa e confirmar que passa**

Run: `npm test`

- [ ] **Step 14: Commit**

```bash
git add backend/src/skill backend/src/app.module.ts
git commit -m "feat(backend): SkillExecucaoController — executar skill avulsa com saída estruturada real"
```

---

## Task 6: E2E — fluxo completo de Agente/Skill real, com isolamento entre tenants

**Files:**
- Create: `backend/test/skill.e2e-spec.ts`

**Interfaces:**
- Consumes: `AppModule` completo (Tasks 2-5), helpers de teste da Fase 1
  (`backend/src/testing/supabase-admin.helper.ts`, `backend/src/testing/provision-usuario.helper.ts`).
- Produces: prova automatizada do caso de validação da Fase 3 (spec §10) — agente real,
  skill real, execução real (chamada de verdade à Anthropic com saída estruturada
  validada), persistência, auditoria, e isolamento entre empresas.

Este teste faz uma chamada real e paga à API da Anthropic (uma por empresa de teste) —
mantenha a entrada e o `max_tokens` pequenos para o custo ficar desprezível (mesma
filosofia da Fase 2 de preferir uma prova real a um mock).

- [ ] **Step 1: Escrever o teste**

Criar `backend/test/skill.e2e-spec.ts`:

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

describe('Fluxo de Agente/Skill (skill real + Anthropic real + isolamento entre tenants)', () => {
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
      await prisma.skillExecucao.deleteMany({ where: { skill: { agente: { empresaId: { in: empresaIdsParaLimpar } } } } });
    } catch (erro) {
      console.warn('Falha ao limpar execuções de teste', erro);
    }
    try {
      await prisma.skill.deleteMany({ where: { agente: { empresaId: { in: empresaIdsParaLimpar } } } });
    } catch (erro) {
      console.warn('Falha ao limpar skills de teste', erro);
    }
    try {
      await prisma.agente.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar agentes de teste', erro);
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

    const password = 'TesteFase3!23';
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

  it('cria agente/skill reais, executa a skill com saída estruturada real, persiste e audita — e nunca vaza entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado('E2E Skill Empresa A', `e2e-skill-a-${sufixo}@corepilot.dev`);
    const empresaB = await criarEmpresaComUsuarioLogado('E2E Skill Empresa B', `e2e-skill-b-${sufixo}@corepilot.dev`);

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Compras', objetivo: 'Ajudar o time de compras' })
      .expect(201);
    const moduloId = moduloResposta.body.id as string;

    const agenteResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/agentes`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Comprador', funcao: 'Analisar pedidos', objetivo: 'Ajudar o time de compras' })
      .expect(201);
    const agenteId = agenteResposta.body.id as string;

    const skillResposta = await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        nome: 'Triagem',
        objetivo: 'Extrair item e quantidade de um pedido de compra em texto livre',
        camposSaida: [
          { nome: 'item', tipo: 'string', obrigatorio: true },
          { nome: 'quantidade', tipo: 'number', obrigatorio: true },
        ],
      })
      .expect(201);
    const skillId = skillResposta.body.id as string;

    const execucaoResposta = await request(app.getHttpServer())
      .post(`/skills/${skillId}/execucoes`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ entrada: 'Preciso de 10 parafusos M6' })
      .expect(201);

    expect(typeof execucaoResposta.body.execucaoId).toBe('string');
    expect(typeof execucaoResposta.body.saida.item).toBe('string');
    expect(typeof execucaoResposta.body.saida.quantidade).toBe('number');

    const execucoesSalvas = await prisma.skillExecucao.findMany({ where: { skillId } });
    expect(execucoesSalvas).toHaveLength(1);

    const auditLogs = await prisma.auditLog.findMany({ where: { empresaId: empresaA.empresa.id } });
    expect(auditLogs.filter((log) => log.acao === 'skill_execucao')).toHaveLength(1);

    // Isolamento: o usuário da empresa B não consegue acessar agente/skill da empresa A
    await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ nome: 'X', objetivo: 'Y', camposSaida: [{ nome: 'a', tipo: 'string', obrigatorio: true }] })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/skills/${skillId}/execucoes`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ entrada: 'qualquer coisa' })
      .expect(404);

    // A lista de agentes da empresa B nunca inclui o agente da empresa A
    const moduloRespostaB = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ nome: 'Compras B', objetivo: 'Compras da empresa B' })
      .expect(201);
    const listaAgentesB = await request(app.getHttpServer())
      .get(`/modulos/${moduloRespostaB.body.id}/agentes`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect((listaAgentesB.body as Array<{ id: string }>).some((a) => a.id === agenteId)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npm run test:e2e -- skill.e2e-spec.ts`
Expected: PASS (1 teste). Aumente `jest.setTimeout` se necessário (chamadas reais à
Anthropic + Supabase podem variar).

- [ ] **Step 3: Rodar a suíte e2e completa**

Run: `npm run test:e2e`
Expected: PASS (inclui `app.e2e-spec.ts`, `me.e2e-spec.ts`, `chat.e2e-spec.ts` das Fases
1/2, e este novo).

- [ ] **Step 4: Commit**

```bash
git add backend/test/skill.e2e-spec.ts
git commit -m "test(backend): e2e cobre fluxo real de agente/skill (Anthropic real) e isolamento entre tenants"
```

---

## Task 7: Frontend — lista/criação de Agentes e Skills (construtor guiado de campos)

**Files:**
- Create: `frontend/src/corepilot/agentes/types.ts`
- Create: `frontend/src/corepilot/agentes/api.ts`
- Create: `frontend/src/corepilot/agentes/AgentesList.tsx`
- Create: `frontend/src/corepilot/agentes/CriarAgenteForm.tsx`
- Create: `frontend/src/corepilot/agentes/SkillsList.tsx`
- Create: `frontend/src/corepilot/agentes/CriarSkillForm.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Fase 1).
- Produces: `<AgentesList moduloId accessToken onAbrirAgente={(agente) => void} />`,
  `<SkillsList agenteId accessToken onAbrirSkill={(skill) => void} />` — consumidos pela
  Task 8.

- [ ] **Step 1: Criar os tipos**

Criar `frontend/src/corepilot/agentes/types.ts`:

```typescript
export interface Agente {
  id: string;
  moduloId: string;
  nome: string;
  funcao: string;
  objetivo: string;
  modeloIA: string;
  criadoEm: string;
}

export type TipoCampoSaida = 'string' | 'number' | 'boolean' | 'string[]';

export interface CampoSaida {
  nome: string;
  tipo: TipoCampoSaida;
  descricao?: string;
  obrigatorio: boolean;
}

export interface Skill {
  id: string;
  agenteId: string;
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
  criadoEm: string;
}

export interface SkillExecucao {
  id: string;
  skillId: string;
  usuarioId: string;
  entrada: string;
  saida: Record<string, unknown>;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  criadoEm: string;
}
```

- [ ] **Step 2: Criar o cliente de API**

Criar `frontend/src/corepilot/agentes/api.ts`:

```typescript
import { apiFetch } from '../api/apiFetch';
import type { Agente, CampoSaida, Skill, SkillExecucao } from './types';

export interface CriarAgenteDto {
  nome: string;
  funcao: string;
  objetivo: string;
  modeloIA?: string;
}

export async function listarAgentes(accessToken: string, moduloId: string): Promise<Agente[]> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar agentes (status ${response.status})`);
  return (await response.json()) as Agente[];
}

export async function criarAgente(
  accessToken: string,
  moduloId: string,
  dto: CriarAgenteDto,
): Promise<Agente> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar agente (status ${response.status})`);
  return (await response.json()) as Agente;
}

export interface CriarSkillDto {
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
}

export async function listarSkills(accessToken: string, agenteId: string): Promise<Skill[]> {
  const response = await apiFetch(`/agentes/${agenteId}/skills`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar skills (status ${response.status})`);
  return (await response.json()) as Skill[];
}

export async function criarSkill(
  accessToken: string,
  agenteId: string,
  dto: CriarSkillDto,
): Promise<Skill> {
  const response = await apiFetch(`/agentes/${agenteId}/skills`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar skill (status ${response.status})`);
  return (await response.json()) as Skill;
}

export interface ExecutarSkillResultado {
  execucaoId: string;
  saida: Record<string, unknown>;
  tokensEntrada: number;
  tokensSaida: number;
}

export async function executarSkill(
  accessToken: string,
  skillId: string,
  entrada: string,
): Promise<ExecutarSkillResultado> {
  const response = await apiFetch(`/skills/${skillId}/execucoes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entrada }),
  });
  if (!response.ok) throw new Error(`Falha ao executar skill (status ${response.status})`);
  return (await response.json()) as ExecutarSkillResultado;
}

export async function listarExecucoes(accessToken: string, skillId: string): Promise<SkillExecucao[]> {
  const response = await apiFetch(`/skills/${skillId}/execucoes`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar execuções (status ${response.status})`);
  return (await response.json()) as SkillExecucao[];
}
```

- [ ] **Step 3: Criar o formulário de criação de Agente**

Criar `frontend/src/corepilot/agentes/CriarAgenteForm.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { criarAgente } from './api';
import type { Agente } from './types';

interface CriarAgenteFormProps {
  accessToken: string;
  moduloId: string;
  onCriado: (agente: Agente) => void;
  onCancelar: () => void;
}

export function CriarAgenteForm({ accessToken, moduloId, onCriado, onCancelar }: CriarAgenteFormProps) {
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const agente = await criarAgente(accessToken, moduloId, { nome, funcao, objetivo });
      onCriado(agente);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar agente');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <input
        type="text"
        placeholder="Nome do agente"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Função (ex: Analista de compras)"
        value={funcao}
        onChange={(e) => setFuncao(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo do agente"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />
      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar agente'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Criar a lista de Agentes**

Criar `frontend/src/corepilot/agentes/AgentesList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { listarAgentes } from './api';
import { CriarAgenteForm } from './CriarAgenteForm';
import type { Agente } from './types';

interface AgentesListProps {
  accessToken: string;
  moduloId: string;
  onAbrirAgente: (agente: Agente) => void;
}

export function AgentesList({ accessToken, moduloId, onAbrirAgente }: AgentesListProps) {
  const [agentes, setAgentes] = useState<Agente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarAgentes(accessToken, moduloId)
      .then(setAgentes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, moduloId]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!agentes) return <div>Carregando agentes…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3>Agentes</h3>
      {agentes.length === 0 && <div>Nenhum agente ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agentes.map((agente) => (
          <li key={agente.id}>
            <button onClick={() => onAbrirAgente(agente)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{agente.nome}</strong> — {agente.funcao}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarAgenteForm
          accessToken={accessToken}
          moduloId={moduloId}
          onCriado={(agente) => {
            setMostrandoForm(false);
            setAgentes((atual) => [agente, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar agente</button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Criar o formulário de criação de Skill (construtor guiado de campos)**

Criar `frontend/src/corepilot/agentes/CriarSkillForm.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { criarSkill } from './api';
import type { CampoSaida, Skill, TipoCampoSaida } from './types';

interface CriarSkillFormProps {
  accessToken: string;
  agenteId: string;
  onCriado: (skill: Skill) => void;
  onCancelar: () => void;
}

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

function novoCampo(): CampoSaida {
  return { nome: '', tipo: 'string', descricao: '', obrigatorio: true };
}

export function CriarSkillForm({ accessToken, agenteId, onCriado, onCancelar }: CriarSkillFormProps) {
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [campos, setCampos] = useState<CampoSaida[]>([novoCampo()]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function atualizarCampo(indice: number, parcial: Partial<CampoSaida>) {
    setCampos((atual) => atual.map((campo, i) => (i === indice ? { ...campo, ...parcial } : campo)));
  }

  function removerCampo(indice: number) {
    setCampos((atual) => atual.filter((_, i) => i !== indice));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const skill = await criarSkill(accessToken, agenteId, {
        nome,
        objetivo,
        camposSaida: campos.map((campo) => ({
          ...campo,
          descricao: campo.descricao?.trim() ? campo.descricao : undefined,
        })),
      });
      onCriado(skill);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar skill');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <input
        type="text"
        placeholder="Nome da skill"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo da skill"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />

      <div style={{ fontWeight: 600, marginTop: 8 }}>Campos de saída</div>
      {campos.map((campo, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="nome do campo"
            value={campo.nome}
            onChange={(e) => atualizarCampo(indice, { nome: e.target.value })}
            required
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
          <input
            type="text"
            placeholder="descrição (opcional)"
            value={campo.descricao ?? ''}
            onChange={(e) => atualizarCampo(indice, { descricao: e.target.value })}
            style={{ flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={campo.obrigatorio}
              onChange={(e) => atualizarCampo(indice, { obrigatorio: e.target.checked })}
            />
            obrigatório
          </label>
          <button type="button" onClick={() => removerCampo(indice)} disabled={campos.length <= 1}>
            remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setCampos((atual) => [...atual, novoCampo()])}>
        + Adicionar campo
      </button>

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar skill'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Criar a lista de Skills**

Criar `frontend/src/corepilot/agentes/SkillsList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { listarSkills } from './api';
import { CriarSkillForm } from './CriarSkillForm';
import type { Skill } from './types';

interface SkillsListProps {
  accessToken: string;
  agenteId: string;
  onAbrirSkill: (skill: Skill) => void;
}

export function SkillsList({ accessToken, agenteId, onAbrirSkill }: SkillsListProps) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarSkills(accessToken, agenteId)
      .then(setSkills)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, agenteId]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!skills) return <div>Carregando skills…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h4>Skills</h4>
      {skills.length === 0 && <div>Nenhuma skill ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {skills.map((skill) => (
          <li key={skill.id}>
            <button onClick={() => onAbrirSkill(skill)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{skill.nome}</strong> — {skill.objetivo}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarSkillForm
          accessToken={accessToken}
          agenteId={agenteId}
          onCriado={(skill) => {
            setMostrandoForm(false);
            setSkills((atual) => [skill, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar skill</button>
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
git add frontend/src/corepilot/agentes
git commit -m "feat(frontend): lista e criação de Agentes/Skills com construtor guiado de campos"
```

---

## Task 8: Frontend — execução de Skill + navegação em abas (Chat | Agentes)

**Files:**
- Create: `frontend/src/corepilot/agentes/SkillExecutor.tsx`
- Create: `frontend/src/corepilot/modulos/ModuloWorkspace.tsx`
- Modify: `frontend/src/corepilot/auth/FundacaoStatus.tsx`

**Interfaces:**
- Consumes: `executarSkill`/`listarExecucoes` (Task 7 `api.ts`), `AgentesList`/`SkillsList`
  (Task 7), `ChatView` (Fase 2, **sem alteração**).
- Produces: `<ModuloWorkspace accessToken modulo onVoltar />` — substitui a renderização
  direta de `<ChatView />` em `FundacaoStatus` quando um módulo é selecionado.

- [ ] **Step 1: Criar o executor de Skill**

Criar `frontend/src/corepilot/agentes/SkillExecutor.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { executarSkill, listarExecucoes } from './api';
import type { Skill, SkillExecucao } from './types';

interface SkillExecutorProps {
  accessToken: string;
  skill: Skill;
  onVoltar: () => void;
}

export function SkillExecutor({ accessToken, skill, onVoltar }: SkillExecutorProps) {
  const [entrada, setEntrada] = useState('');
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<SkillExecucao[]>([]);

  useEffect(() => {
    listarExecucoes(accessToken, skill.id)
      .then(setExecucoes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, skill.id]);

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

- [ ] **Step 2: Criar o workspace do módulo com abas Chat | Agentes**

Criar `frontend/src/corepilot/modulos/ModuloWorkspace.tsx`:

```typescript
import { useState } from 'react';
import { ChatView } from './ChatView';
import { AgentesList } from '../agentes/AgentesList';
import { SkillsList } from '../agentes/SkillsList';
import { SkillExecutor } from '../agentes/SkillExecutor';
import type { Modulo } from './types';
import type { Agente, Skill } from '../agentes/types';

interface ModuloWorkspaceProps {
  accessToken: string;
  modulo: Modulo;
  onVoltar: () => void;
}

type Aba = 'chat' | 'agentes';

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
          skill={skillSelecionada}
          onVoltar={() => setSkillSelecionada(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Trocar `ChatView` por `ModuloWorkspace` em `FundacaoStatus`**

Editar `frontend/src/corepilot/auth/FundacaoStatus.tsx`: trocar o import de `ChatView`
por `ModuloWorkspace` (`../modulos/ModuloWorkspace`) e trocar o bloco:

```typescript
  if (moduloSelecionado) {
    return (
      <ChatView
        accessToken={session.access_token}
        modulo={moduloSelecionado}
        onVoltar={() => setModuloSelecionado(null)}
      />
    );
  }
```

por:

```typescript
  if (moduloSelecionado) {
    return (
      <ModuloWorkspace
        accessToken={session.access_token}
        modulo={moduloSelecionado}
        onVoltar={() => setModuloSelecionado(null)}
      />
    );
  }
```

Nenhuma outra parte de `FundacaoStatus.tsx` muda. `ChatView`/`ChatSidebarReal`/
`ChatComposer`/`MessageBubble` continuam intocados — `ModuloWorkspace` só os invoca.

- [ ] **Step 4: Verificação manual completa**

Com o backend rodando e `npm run dev` no frontend:
1. Logar com um usuário seed, abrir um módulo existente (ou criar um novo).
2. Confirmar que a aba "Chat" continua funcionando exatamente como na Fase 2.
3. Ir para a aba "Agentes", criar um agente, criar uma skill com 2 campos de saída de
   tipos diferentes usando o construtor guiado de campos.
4. Abrir a skill, executar com uma entrada de texto livre, confirmar que o resultado
   aparece como pares label/valor (não texto livre, não JSON bruto sem formatação).
5. Recarregar a página, reabrir o módulo → agente → skill, confirmar que a execução
   anterior aparece no histórico.

- [ ] **Step 5: Rodar o build e o lint do frontend**

Run: `npm run build && npm run lint` (dentro de `frontend/`)
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/corepilot/agentes/SkillExecutor.tsx frontend/src/corepilot/modulos/ModuloWorkspace.tsx frontend/src/corepilot/auth/FundacaoStatus.tsx
git commit -m "feat(frontend): execução de skill e navegação em abas (Chat | Agentes) no módulo"
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

Expected: todos os testes PASS, incluindo `skill.e2e-spec.ts` (Task 6) e os testes já
existentes das Fases 1 e 2.

- [ ] **Step 2: Checklist final contra a spec (§10)**

- [ ] Criar um Agente real pela UI, dentro de um módulo — persistido no Postgres,
  sobrevive a reload.
- [ ] Múltiplos Agentes por módulo e múltiplas Skills por agente coexistem (testado com
  pelo menos 2 de cada).
- [ ] Criar uma Skill com ao menos 2 campos de saída de tipos diferentes usando o
  construtor guiado de campos.
- [ ] Executar a skill avulsa com entrada de texto livre — resposta chega como objeto
  estruturado validado, não texto livre.
- [ ] Resultado estruturado renderizado como pares label/valor, disponível no histórico
  após reload.
- [ ] Cada execução gera exatamente uma linha em `AuditLog` com `acao: 'skill_execucao'`.
- [ ] Isolamento entre empresas vale para agentes, skills e execuções (Task 6
  automatizado + checagem manual, se quiser, com um segundo usuário seed).
- [ ] `ANTHROPIC_API_KEY` nunca aparece no frontend nem é commitada.

Se todos os itens acima passarem, a Fase 3 (Agentes + Skills) está validada e a Fase 4
(Fontes de dados) pode começar como um novo ciclo brainstorm → spec → plano.
