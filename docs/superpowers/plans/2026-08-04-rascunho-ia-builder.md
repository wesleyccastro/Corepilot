# Rascunho com IA no builder de módulo/agente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão "Gerar rascunho com IA" em três campos difíceis do builder de módulo/agente (instruções do módulo, guardrails/escalonamento do agente, campos de saída de uma skill), reaproveitando `AnthropicService.parseStructured` já usado na execução real de skills.

**Architecture:** Três endpoints REST novos, cada um dentro do controller do recurso ao qual o campo pertence (`ModuloController`, `AgenteController` × 2) — sem módulo "assistente" genérico. Cada endpoint monta um prompt a partir do contexto já persistido + um `brief` opcional do usuário, chama `AnthropicService.parseStructured` com um schema Zod fixo, e devolve o rascunho sem persistir nada. O frontend usa um componente compartilhado (`GerarRascunhoButton`) em três telas, que preenche o `useState` local do campo — o salvamento continua acontecendo pelo mecanismo que já existe (blur, ou botão "Salvar skill").

**Tech Stack:** NestJS (backend), `@anthropic-ai/sdk` + `zod` (já instalados), React + TypeScript (frontend), Jest (testes backend).

## Global Constraints

- Todo endpoint novo fica atrás de `JwtAuthGuard` + `TenantGuard`, e valida que o recurso pai pertence à empresa do tenant atual via `findByIdInEmpresa` (mesmo padrão de todo o resto do backend) — nunca confiar em um ID vindo do cliente sem essa checagem.
- Nenhum endpoint novo persiste nada em `Modulo`/`Agente`/`Skill` — só gera e retorna. Quem salva é o fluxo que já existe hoje.
- Cada chamada gera uma linha em `AuditLog` (`acao: 'rascunho_ia_gerado'`, `dadosDepois` com `tipo` + `tokensEntrada`/`tokensSaida`), via `AuditService.record` já existente.
- `maxTokens: 2048` em todas as três chamadas (rascunhos são mais curtos que uma execução de skill real, que usa 4096).
- Se `response.parsed_output` vier `null` (falha de validação contra o schema), lançar `UnprocessableEntityException` — mesmo tratamento que `SkillExecucaoController` já usa.
- Frontend: nenhuma chamada nova precisa de teste unitário — este projeto não tem test runner de frontend configurado (`CLAUDE.md`). Verificação é `npm run build` (type-check) + `npm run lint` (oxlint) + verificação manual/Playwright no Task 10.
- Backend: toda mudança de comportamento precisa de teste Jest cobrindo o caminho feliz e o caminho de erro, seguindo o estilo já usado em `*.controller.spec.ts` (construir o controller diretamente com dependências mockadas via `as unknown as X`, sem `Test.createTestingModule`).

---

## Contexto técnico que todo task precisa saber

**`AnthropicService.parseStructured`** (`backend/src/chat/anthropic.service.ts`, já existe, não muda):

```typescript
export interface ParseStructuredParams {
  system: string;
  mensagem: string;
  model: string;
  maxTokens: number;
  schema: z.ZodTypeAny;
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
```

A resposta tem `response.parsed_output` (o objeto validado, ou `null` se a validação falhou) e `response.usage.input_tokens` / `response.usage.output_tokens`. Isso já é consumido exatamente assim em `backend/src/skill/skill-execucao.controller.ts` — use esse arquivo como referência de estilo para qualquer dúvida não coberta aqui.

**`AuditService.record`** (`backend/src/audit/audit.service.ts`, não muda):

```typescript
export interface RecordAuditParams {
  empresaId: string;
  atorUsuarioId: string;
  acao: string;
  dadosAntes?: Prisma.InputJsonValue | null;
  dadosDepois?: Prisma.InputJsonValue | null;
}
async record(params: RecordAuditParams): Promise<void>
```

**`TenantContext.get()`** retorna `{ usuarioId: string; empresaId: string; perfil: Perfil }`.

---

### Task 1: Extrair `AnthropicModule` (elimina risco de dependência circular)

**Por quê:** `ChatModule` hoje declara `AnthropicService` e `anthropicClientProvider` diretamente, e importa `ConversaModule` + `ConsultaModule`. Ambos os dois importam `ModuloModule`. Se `ModuloModule` (Task 2) importar `ChatModule` para usar `AnthropicService`, fecha um ciclo: `ModuloModule → ChatModule → ConversaModule → ModuloModule`. A correção é extrair `AnthropicService`/`anthropicClientProvider` para um módulo-folha próprio, sem nenhum import — `ModuloModule` e `AgenteModule` importam esse módulo-folha diretamente, nunca `ChatModule`.

**Files:**
- Create: `backend/src/chat/anthropic.module.ts`
- Modify: `backend/src/chat/chat.module.ts`

**Interfaces:**
- Produces: `AnthropicModule` (exporta `AnthropicService`), importável por qualquer módulo sem risco de ciclo.

- [ ] **Step 1: Criar o módulo-folha**

`backend/src/chat/anthropic.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { anthropicClientProvider } from './anthropic-client.provider';

@Module({
  providers: [AnthropicService, anthropicClientProvider],
  exports: [AnthropicService],
})
export class AnthropicModule {}
```

- [ ] **Step 2: Fazer `ChatModule` consumir o novo módulo em vez de declarar os providers direto**

`backend/src/chat/chat.module.ts` — conteúdo atual:

```typescript
import { Module } from '@nestjs/common';
import { MensagemController } from './mensagem.controller';
import { MensagemService } from './mensagem.service';
import { AnthropicService } from './anthropic.service';
import { anthropicClientProvider } from './anthropic-client.provider';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConversaModule } from '../conversa/conversa.module';
import { ConsultaModule } from '../consulta/consulta.module';

@Module({
  imports: [AuthModule, AuditModule, ConversaModule, ConsultaModule],
  controllers: [MensagemController],
  providers: [MensagemService, AnthropicService, anthropicClientProvider],
  exports: [AnthropicService],
})
export class ChatModule {}
```

Substitua pelo novo conteúdo:

```typescript
import { Module } from '@nestjs/common';
import { MensagemController } from './mensagem.controller';
import { MensagemService } from './mensagem.service';
import { AnthropicModule } from './anthropic.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConversaModule } from '../conversa/conversa.module';
import { ConsultaModule } from '../consulta/consulta.module';

@Module({
  imports: [AuthModule, AuditModule, ConversaModule, ConsultaModule, AnthropicModule],
  controllers: [MensagemController],
  providers: [MensagemService],
  exports: [AnthropicModule],
})
export class ChatModule {}
```

`SkillExecucaoModule` continua importando `ChatModule` sem nenhuma mudança — como `ChatModule` agora reexporta `AnthropicModule`, `AnthropicService` continua resolvível por quem já importava `ChatModule` para consumi-lo (mesmo caminho de resolução de módulo do Nest, só que indireto por mais um salto).

- [ ] **Step 3: Rodar a suíte de testes do backend (nada deve quebrar — é um refactor de wiring, sem mudança de comportamento)**

Run: `cd backend && npm test`
Expected: todos os 162 testes existentes continuam passando.

- [ ] **Step 4: Rodar o build e confirmar que o app sobe sem erro de dependência circular**

Run: `cd backend && npm run build`
Expected: build limpo (nenhuma saída de erro).

Run (num terminal separado, depois interrompa com Ctrl+C após confirmar):
```bash
cd backend && npm run start:dev
```
Expected no log: `[Nest] ... Nest application successfully started`, sem nenhuma mensagem de `Circular dependency` ou erro de resolução de provider.

- [ ] **Step 5: Commit**

```bash
git add backend/src/chat/anthropic.module.ts backend/src/chat/chat.module.ts
git commit -m "refactor(backend): extrai AnthropicModule para evitar dependência circular"
```

---

### Task 2: `POST /modulos/:id/rascunho-instrucoes`

**Files:**
- Create: `backend/src/modulo/dto/rascunhar-instrucoes.dto.ts`
- Modify: `backend/src/modulo/modulo.module.ts`
- Modify: `backend/src/modulo/modulo.controller.ts`
- Modify: `backend/src/modulo/modulo.controller.spec.ts`

**Interfaces:**
- Consumes: `AnthropicService.parseStructured` (Task 1), `AuditService.record`, `ModuloService.findByIdInEmpresa(moduloId, empresaId)` (já existe, retorna `{ id, nome, objetivo, ... }`).
- Produces: `POST /modulos/:id/rascunho-instrucoes` retornando `{ instrucoes: string }` (200) ou 422 se a IA não devolver algo validável.

- [ ] **Step 1: Criar o DTO**

`backend/src/modulo/dto/rascunhar-instrucoes.dto.ts`:

```typescript
export interface RascunharInstrucoesDto {
  brief?: string;
}
```

- [ ] **Step 2: Importar `AnthropicModule` em `ModuloModule`**

`backend/src/modulo/modulo.module.ts` — conteúdo atual:

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

Substitua pelo novo conteúdo:

```typescript
import { Module } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import { ModuloService } from './modulo.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AnthropicModule } from '../chat/anthropic.module';

@Module({
  imports: [AuthModule, AuditModule, AnthropicModule],
  controllers: [ModuloController],
  providers: [ModuloService],
  exports: [ModuloService],
})
export class ModuloModule {}
```

- [ ] **Step 3: Escrever os testes (falhando, porque o método/constructor ainda não existem)**

Substitua **todo** o conteúdo de `backend/src/modulo/modulo.controller.spec.ts` por (nota: todo `new ModuloController(...)` ganha um 4º argumento, `anthropicService`):

```typescript
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import type { ModuloService } from './modulo.service';
import type { TenantContext } from '../auth/tenant-context';
import type { AnthropicService } from '../chat/anthropic.service';

describe('ModuloController', () => {
  function buildTenantContext(empresaId: string): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId, perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  function buildAudit() {
    return { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
  }

  function buildAnthropicService(overrides: Partial<AnthropicService> = {}): AnthropicService {
    return {
      parseStructured: jest.fn(),
      ...overrides,
    } as unknown as AnthropicService;
  }

  it('cria um módulo usando a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), buildAnthropicService());

    const resultado = await controller.criar({ nome: 'Compras', objetivo: 'Ajudar com compras' });

    expect(service.create).toHaveBeenCalledWith('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });
    expect(resultado).toEqual({ id: 'modulo-1' });
  });

  it('rejeita criação sem nome ou objetivo', async () => {
    const service = { create: jest.fn() } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), buildAnthropicService());

    await expect(controller.criar({ nome: '', objetivo: 'x' })).rejects.toThrow(BadRequestException);
    await expect(controller.criar({ nome: 'x', objetivo: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista módulos ativos da empresa do tenant atual por padrão', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }]),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), buildAnthropicService());

    const resultado = await controller.listar();

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1', false);
    expect(resultado).toEqual([{ id: 'modulo-1' }]);
  });

  it('lista módulos ativos e inativos quando ?todos=true', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }, { id: 'modulo-2' }]),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), buildAnthropicService());

    const resultado = await controller.listar('true');

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1', true);
    expect(resultado).toEqual([{ id: 'modulo-1' }, { id: 'modulo-2' }]);
  });

  it('atualiza um módulo da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), buildAnthropicService());

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

  it('gera um rascunho de instruções a partir do módulo e audita', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'modulo-1',
        nome: 'Agronomia',
        objetivo: 'Gestão agronômica das fazendas',
      }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: { instrucoes: 'Sempre informe a fazenda e o talhão de origem dos dados.' },
        usage: { input_tokens: 40, output_tokens: 20 },
      }),
    });
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), anthropicService);

    const resultado = await controller.rascunharInstrucoes('modulo-1', { brief: 'foco em rastreabilidade' });

    expect(service.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.stringContaining('foco em rastreabilidade'),
        maxTokens: 2048,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'rascunho_ia_gerado',
      dadosDepois: { tipo: 'instrucoes_modulo', moduloId: 'modulo-1', tokensEntrada: 40, tokensSaida: 20 },
    });
    expect(resultado).toEqual({ instrucoes: 'Sempre informe a fazenda e o talhão de origem dos dados.' });
  });

  it('rascunho de instruções lança 422 quando a IA não devolve saída validável', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1', nome: 'Agronomia', objetivo: 'X' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({ parsed_output: null, usage: { input_tokens: 10, output_tokens: 0 } }),
    });
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'), anthropicService);

    await expect(controller.rascunharInstrucoes('modulo-1', {})).rejects.toThrow(UnprocessableEntityException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham (o método/constructor ainda não existem)**

Run: `cd backend && npx jest src/modulo/modulo.controller.spec.ts`
Expected: FAIL — `Expected 3 arguments, but got 4` (erro de compilação TS) ou `controller.rascunharInstrucoes is not a function`.

- [ ] **Step 5: Implementar no controller**

`backend/src/modulo/modulo.controller.ts` — conteúdo atual:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
    private readonly audit: AuditService,
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
  async listar(@Query('todos') todos?: string) {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId, todos === 'true');
  }

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.moduloService.update(id, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'modulo_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }
}
```

Substitua pelo novo conteúdo:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from '../chat/anthropic.service';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';
import type { UpdateModuloDto } from './dto/update-modulo.dto';
import type { RascunharInstrucoesDto } from './dto/rascunhar-instrucoes.dto';

const RASCUNHO_INSTRUCOES_SCHEMA = z.object({ instrucoes: z.string() });

@Controller('modulos')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModuloController {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly anthropicService: AnthropicService,
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
  async listar(@Query('todos') todos?: string) {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId, todos === 'true');
  }

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.moduloService.update(id, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'modulo_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }

  @Post(':id/rascunho-instrucoes')
  async rascunharInstrucoes(@Param('id') id: string, @Body() body: RascunharInstrucoesDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const modulo = await this.moduloService.findByIdInEmpresa(id, empresaId);

    const system =
      'Você ajuda a escrever instruções operacionais claras e objetivas para agentes de IA corporativos dentro do CorePilot.';
    const mensagem = [
      `Módulo: "${modulo.nome}"`,
      `Objetivo do módulo: ${modulo.objetivo}`,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Escreva instruções gerais (2 a 5 frases) que todo agente deste módulo deve seguir: papel, forma de comunicação, o que priorizar, o que não pode fazer, e quando encaminhar para um responsável humano.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: 'claude-sonnet-5',
      maxTokens: 2048,
      schema: RASCUNHO_INSTRUCOES_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException('A resposta da IA não pôde ser validada');
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'instrucoes_modulo',
        moduloId: id,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest src/modulo/modulo.controller.spec.ts`
Expected: PASS, 7 testes.

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `cd backend && npm test && npm run build`
Expected: tudo passa, build limpo.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modulo
git commit -m "feat(backend): endpoint de rascunho com IA para instruções do módulo"
```

---

### Task 3: `POST /modulos/:moduloId/agentes/:agenteId/rascunho-guardrails`

**Files:**
- Create: `backend/src/agente/dto/rascunhar-guardrails.dto.ts`
- Modify: `backend/src/agente/agente.module.ts`
- Modify: `backend/src/agente/agente.controller.ts`
- Modify: `backend/src/agente/agente.controller.spec.ts`

**Interfaces:**
- Consumes: `AnthropicService.parseStructured` (Task 1), `AuditService.record`, `AgenteService.findByIdInEmpresa(agenteId, empresaId)` (já existe, retorna `{ id, nome, funcao, objetivo, modeloIA, guardrails, regraEscalonamento, ... }`).
- Produces: `POST /modulos/:moduloId/agentes/:agenteId/rascunho-guardrails` retornando `{ guardrails: string, regraEscalonamento: string }` (200) ou 422.

- [ ] **Step 1: Criar o DTO**

`backend/src/agente/dto/rascunhar-guardrails.dto.ts`:

```typescript
export interface RascunharGuardrailsDto {
  brief?: string;
}
```

- [ ] **Step 2: Importar `AnthropicModule` em `AgenteModule`**

`backend/src/agente/agente.module.ts` — conteúdo atual:

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

Substitua pelo novo conteúdo:

```typescript
import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';
import { AuditModule } from '../audit/audit.module';
import { AnthropicModule } from '../chat/anthropic.module';

@Module({
  imports: [AuthModule, ModuloModule, AuditModule, AnthropicModule],
  controllers: [AgenteController],
  providers: [AgenteService],
  exports: [AgenteService],
})
export class AgenteModule {}
```

- [ ] **Step 3: Escrever os testes (falhando)**

Substitua **todo** o conteúdo de `backend/src/agente/agente.controller.spec.ts` por (todo `new AgenteController(...)` ganha um 4º argumento, `anthropicService`; este task só cobre `rascunharGuardrails` — `rascunharSkill` é o Task 4):

```typescript
import { UnprocessableEntityException } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import type { AgenteService } from './agente.service';
import type { TenantContext } from '../auth/tenant-context';
import type { AuditService } from '../audit/audit.service';
import type { AnthropicService } from '../chat/anthropic.service';

describe('AgenteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildAnthropicService(overrides: Partial<AnthropicService> = {}): AnthropicService {
    return {
      parseStructured: jest.fn(),
      ...overrides,
    } as unknown as AnthropicService;
  }

  it('cria um agente no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'agente-1' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(service, audit, buildTenantContext(), buildAnthropicService());

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
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(service, audit, buildTenantContext(), buildAnthropicService());

    await expect(
      controller.criar('modulo-1', { nome: '', funcao: 'X', objetivo: 'Y' }),
    ).rejects.toThrow('nome, funcao e objetivo são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista agentes do módulo informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'agente-1' }]),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(service, audit, buildTenantContext(), buildAnthropicService());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'agente-1' }]);
  });

  it('atualiza um agente da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'agente-1', nome: 'Novo nome' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(service, audit, buildTenantContext(), buildAnthropicService());

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

  it('gera um rascunho de guardrails/escalonamento a partir do agente e audita', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: {
          guardrails: 'Nunca aprove uma compra sozinho.',
          regraEscalonamento: 'Se o valor exceder R$ 50 mil, escale para o gestor.',
        },
        usage: { input_tokens: 50, output_tokens: 25 },
      }),
    });
    const controller = new AgenteController(service, audit, buildTenantContext(), anthropicService);

    const resultado = await controller.rascunharGuardrails('modulo-1', 'agente-1', { brief: 'foco em compliance' });

    expect(service.findByIdInEmpresa).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.stringContaining('foco em compliance'),
        model: 'claude-sonnet-5',
        maxTokens: 2048,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'rascunho_ia_gerado',
      dadosDepois: { tipo: 'guardrails_agente', agenteId: 'agente-1', tokensEntrada: 50, tokensSaida: 25 },
    });
    expect(resultado).toEqual({
      guardrails: 'Nunca aprove uma compra sozinho.',
      regraEscalonamento: 'Se o valor exceder R$ 50 mil, escale para o gestor.',
    });
  });

  it('rascunho de guardrails lança 422 quando a IA não devolve saída validável', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'X',
        objetivo: 'Y',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({ parsed_output: null, usage: { input_tokens: 10, output_tokens: 0 } }),
    });
    const controller = new AgenteController(service, audit, buildTenantContext(), anthropicService);

    await expect(controller.rascunharGuardrails('modulo-1', 'agente-1', {})).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest src/agente/agente.controller.spec.ts`
Expected: FAIL — erro de compilação (4º argumento) ou `controller.rascunharGuardrails is not a function`.

- [ ] **Step 5: Implementar no controller**

`backend/src/agente/agente.controller.ts` — conteúdo atual:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
  async criar(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateAgenteDto,
  ) {
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
    const resultado = await this.agenteService.update(
      agenteId,
      empresaId,
      body,
    );
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'agente_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }
}
```

Substitua pelo novo conteúdo (este task adiciona `rascunharGuardrails`; o Task 4 adiciona `rascunharSkill` no mesmo arquivo, então o resultado final deste Step 5 já deixa espaço para ele):

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from '../chat/anthropic.service';
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';
import type { UpdateAgenteDto } from './dto/update-agente.dto';
import type { RascunharGuardrailsDto } from './dto/rascunhar-guardrails.dto';

const RASCUNHO_GUARDRAILS_SCHEMA = z.object({
  guardrails: z.string(),
  regraEscalonamento: z.string(),
});

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly anthropicService: AnthropicService,
  ) {}

  @Post()
  async criar(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateAgenteDto,
  ) {
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
    const resultado = await this.agenteService.update(
      agenteId,
      empresaId,
      body,
    );
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'agente_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }

  @Post(':agenteId/rascunho-guardrails')
  async rascunharGuardrails(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: RascunharGuardrailsDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const agente = await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    const system =
      'Você ajuda a definir restrições de segurança e regras de escalonamento para agentes de IA corporativos dentro do CorePilot.';
    const mensagem = [
      `Agente: "${agente.nome}" (${agente.funcao})`,
      `Objetivo do agente: ${agente.objetivo}`,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Escreva: (1) restrições claras do que este agente NUNCA deve fazer sozinho, e (2) em quais situações ele deve escalar a decisão para um humano em vez de agir.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: agente.modeloIA,
      maxTokens: 2048,
      schema: RASCUNHO_GUARDRAILS_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException('A resposta da IA não pôde ser validada');
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'guardrails_agente',
        agenteId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest src/agente/agente.controller.spec.ts`
Expected: PASS, 6 testes.

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `cd backend && npm test && npm run build`
Expected: tudo passa, build limpo.

- [ ] **Step 8: Commit**

```bash
git add backend/src/agente
git commit -m "feat(backend): endpoint de rascunho com IA para guardrails/escalonamento do agente"
```

---

### Task 4: `POST /modulos/:moduloId/agentes/:agenteId/rascunho-skill`

**Files:**
- Create: `backend/src/agente/dto/rascunhar-skill.dto.ts`
- Modify: `backend/src/agente/agente.controller.ts`
- Modify: `backend/src/agente/agente.controller.spec.ts`

**Interfaces:**
- Consumes: mesmo `AnthropicService`/`AuditService`/`AgenteService.findByIdInEmpresa` do Task 3 (já injetados no controller).
- Produces: `POST /modulos/:moduloId/agentes/:agenteId/rascunho-skill` retornando `{ camposSaida: Array<{ nome: string; tipo: 'string'|'number'|'boolean'|'string[]'; obrigatorio: boolean; descricao?: string }> }` (200), 400 se não houver contexto suficiente, ou 422.

- [ ] **Step 1: Criar o DTO**

`backend/src/agente/dto/rascunhar-skill.dto.ts`:

```typescript
export interface RascunharSkillDto {
  skillNome?: string;
  skillObjetivo?: string;
  brief?: string;
}
```

- [ ] **Step 2: Adicionar os testes (falhando) no final do `describe` de `backend/src/agente/agente.controller.spec.ts`**

Adicione este `import` no topo do arquivo (junto aos já existentes):

```typescript
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
```

(substitua a linha `import { UnprocessableEntityException } from '@nestjs/common';` que o Task 3 deixou por essa, incluindo `BadRequestException` também.)

Adicione estes dois testes logo antes do `});` que fecha o `describe('AgenteController', ...)`:

```typescript
  it('gera um rascunho de campos de saída de skill a partir do agente e audita', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: {
          camposSaida: [
            { nome: 'fornecedor', tipo: 'string', obrigatorio: true, descricao: 'Nome do fornecedor' },
            { nome: 'preco', tipo: 'number', obrigatorio: true, descricao: 'Preço cotado' },
          ],
        },
        usage: { input_tokens: 60, output_tokens: 40 },
      }),
    });
    const controller = new AgenteController(service, audit, buildTenantContext(), anthropicService);

    const resultado = await controller.rascunharSkill('modulo-1', 'agente-1', {
      skillNome: 'Cotação de peças',
      skillObjetivo: 'Buscar preços de peças agrícolas em fornecedores',
    });

    expect(service.findByIdInEmpresa).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.stringContaining('Cotação de peças'),
        model: 'claude-sonnet-5',
        maxTokens: 2048,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'rascunho_ia_gerado',
      dadosDepois: { tipo: 'campos_saida_skill', agenteId: 'agente-1', tokensEntrada: 60, tokensSaida: 40 },
    });
    expect(resultado).toEqual({
      camposSaida: [
        { nome: 'fornecedor', tipo: 'string', obrigatorio: true, descricao: 'Nome do fornecedor' },
        { nome: 'preco', tipo: 'number', obrigatorio: true, descricao: 'Preço cotado' },
      ],
    });
  });

  it('rejeita rascunho de skill sem objetivo nem brief', async () => {
    const service = { findByIdInEmpresa: jest.fn() } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService();
    const controller = new AgenteController(service, audit, buildTenantContext(), anthropicService);

    await expect(controller.rascunharSkill('modulo-1', 'agente-1', {})).rejects.toThrow(BadRequestException);
    expect(service.findByIdInEmpresa).not.toHaveBeenCalled();
    expect(anthropicService.parseStructured).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest src/agente/agente.controller.spec.ts`
Expected: FAIL — `controller.rascunharSkill is not a function`.

- [ ] **Step 4: Implementar no controller**

Em `backend/src/agente/agente.controller.ts`, adicione este schema junto ao `RASCUNHO_GUARDRAILS_SCHEMA` já existente (mesmo nível, fora da classe):

```typescript
const RASCUNHO_SKILL_SCHEMA = z.object({
  camposSaida: z.array(
    z.object({
      nome: z.string(),
      tipo: z.enum(['string', 'number', 'boolean', 'string[]']),
      obrigatorio: z.boolean(),
      descricao: z.string().optional(),
    }),
  ),
});
```

Adicione o import de `type { RascunharSkillDto } from './dto/rascunhar-skill.dto';` junto ao import de `RascunharGuardrailsDto` já existente.

Adicione este método dentro da classe `AgenteController`, logo depois de `rascunharGuardrails`:

```typescript
  @Post(':agenteId/rascunho-skill')
  async rascunharSkill(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: RascunharSkillDto,
  ) {
    if (!body.brief?.trim() && !body.skillObjetivo?.trim()) {
      throw new BadRequestException('Informe o objetivo da skill ou descreva o que você precisa');
    }

    const { usuarioId, empresaId } = this.tenantContext.get();
    const agente = await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    const system =
      'Você ajuda a definir o contrato de saída (campos estruturados) de uma skill de agente de IA dentro do CorePilot. Os tipos disponíveis são apenas: string, number, boolean, string[].';
    const mensagem = [
      `Agente: "${agente.nome}" (${agente.funcao})`,
      body.skillNome?.trim() ? `Nome da skill: ${body.skillNome.trim()}` : null,
      body.skillObjetivo?.trim() ? `Objetivo da skill: ${body.skillObjetivo.trim()}` : null,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Defina de 2 a 6 campos de saída estruturados que essa skill deve retornar, cada um com nome (em snake_case), tipo, se é obrigatório, e uma descrição curta.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: agente.modeloIA,
      maxTokens: 2048,
      schema: RASCUNHO_SKILL_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException('A resposta da IA não pôde ser validada');
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'campos_saida_skill',
        agenteId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest src/agente/agente.controller.spec.ts`
Expected: PASS, 8 testes.

- [ ] **Step 6: Rodar a suíte completa e o build**

Run: `cd backend && npm test && npm run build`
Expected: tudo passa (170 testes no total), build limpo.

- [ ] **Step 7: Commit**

```bash
git add backend/src/agente
git commit -m "feat(backend): endpoint de rascunho com IA para campos de saída de skill"
```

---

### Task 5: Frontend — componente `GerarRascunhoButton`

**Files:**
- Create: `frontend/src/corepilot/components/GerarRascunhoButton.tsx`

**Interfaces:**
- Produces: `GerarRascunhoButton({ onGerar: (brief: string) => Promise<void> })` — componente React sem estado externo, usado pelos Tasks 7-9.

- [ ] **Step 1: Criar o componente**

`frontend/src/corepilot/components/GerarRascunhoButton.tsx`:

```tsx
import { useState } from 'react';
import { colors, btnGhostSm, inputSm } from '../styles';

interface GerarRascunhoButtonProps {
  onGerar: (brief: string) => Promise<void>;
}

export function GerarRascunhoButton({ onGerar }: GerarRascunhoButtonProps) {
  const [aberto, setAberto] = useState(false);
  const [brief, setBrief] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setErro(null);
    setGerando(true);
    try {
      await onGerar(brief);
      setAberto(false);
      setBrief('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar rascunho');
    } finally {
      setGerando(false);
    }
  };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} style={btnGhostSm}>
        ✨ Gerar rascunho com IA
      </button>
    );
  }

  return (
    <div style={{ background: colors.bg, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, marginBottom: 8 }}>
      <textarea
        rows={2}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Descreva em poucas palavras o que você precisa (opcional)"
        style={{ ...inputSm, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void gerar()} disabled={gerando} style={btnGhostSm}>
          {gerando ? 'Gerando…' : 'Gerar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} disabled={gerando} style={btnGhostSm}>
          Cancelar
        </button>
      </div>
      {erro && <div style={{ fontSize: 12, color: colors.danger, fontWeight: 600 }}>{erro}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint limpos (o componente ainda não é usado em nenhum lugar, mas precisa compilar sozinho sem erro).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/components/GerarRascunhoButton.tsx
git commit -m "feat(frontend): componente GerarRascunhoButton reutilizável"
```

---

### Task 6: Frontend — funções de API e actions

**Files:**
- Modify: `frontend/src/corepilot/modulos/api.ts`
- Modify: `frontend/src/corepilot/agentes/api.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Produces:
  - `rascunharInstrucoesModulo(accessToken, moduloId, brief?): Promise<{ instrucoes: string }>`
  - `rascunharGuardrailsAgente(accessToken, moduloId, agenteId, brief?): Promise<{ guardrails: string; regraEscalonamento: string }>`
  - `rascunharCamposSaidaSkill(accessToken, moduloId, agenteId, params: { skillNome?: string; skillObjetivo?: string; brief?: string }): Promise<{ camposSaida: CampoSaida[] }>`
  - `actions.gerarRascunhoInstrucoesModulo(brief: string): Promise<void>` (seta `state.instructions` diretamente)
  - `actions.gerarRascunhoGuardrailsAgente(agenteId: string, brief: string): Promise<{ guardrails: string; regraEscalonamento: string }>` (retorna o valor — quem chama decide onde colocar, porque `guardrails`/`regraEscalonamento` são `useState` locais do componente `Identity.tsx`, Task 8)
  - `actions.gerarRascunhoSkill(agenteId: string, params: { skillNome?: string; skillObjetivo?: string; brief?: string }): Promise<{ camposSaida: CampoSaida[] }>` (mesmo motivo — usado no Task 9)
  - `actions.aplicarRascunhoCamposSaida(campos: CampoSaida[]): void` (substitui `state.skillFormCampos` inteiro)

- [ ] **Step 1: Adicionar `rascunharInstrucoesModulo` em `frontend/src/corepilot/modulos/api.ts`**

Adicione ao final do arquivo (depois de `atualizarModulo`):

```typescript
export interface RascunhoInstrucoes {
  instrucoes: string;
}

export async function rascunharInstrucoesModulo(
  accessToken: string,
  moduloId: string,
  brief?: string,
): Promise<RascunhoInstrucoes> {
  const response = await apiFetch(`/modulos/${moduloId}/rascunho-instrucoes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
  });
  if (!response.ok) throw new Error(`Falha ao gerar rascunho de instruções (status ${response.status})`);
  return (await response.json()) as RascunhoInstrucoes;
}
```

- [ ] **Step 2: Adicionar `rascunharGuardrailsAgente` e `rascunharCamposSaidaSkill` em `frontend/src/corepilot/agentes/api.ts`**

Adicione ao final do arquivo (depois de `atualizarSkill`):

```typescript
export interface RascunhoGuardrails {
  guardrails: string;
  regraEscalonamento: string;
}

export async function rascunharGuardrailsAgente(
  accessToken: string,
  moduloId: string,
  agenteId: string,
  brief?: string,
): Promise<RascunhoGuardrails> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes/${agenteId}/rascunho-guardrails`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
  });
  if (!response.ok) throw new Error(`Falha ao gerar rascunho de guardrails (status ${response.status})`);
  return (await response.json()) as RascunhoGuardrails;
}

export interface RascunharSkillParams {
  skillNome?: string;
  skillObjetivo?: string;
  brief?: string;
}

export interface RascunhoSkill {
  camposSaida: CampoSaida[];
}

export async function rascunharCamposSaidaSkill(
  accessToken: string,
  moduloId: string,
  agenteId: string,
  params: RascunharSkillParams,
): Promise<RascunhoSkill> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes/${agenteId}/rascunho-skill`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`Falha ao gerar rascunho de campos de saída (status ${response.status})`);
  return (await response.json()) as RascunhoSkill;
}
```

- [ ] **Step 3: Importar as três funções novas em `useCorePilotState.ts`**

`frontend/src/corepilot/useCorePilotState.ts` — o import de `agentes/api` (linhas 20-30) atualmente é:

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
```

Substitua por:

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
  rascunharGuardrailsAgente,
  rascunharCamposSaidaSkill,
} from './agentes/api';
```

A linha do import de `modulos/api` (linha 32) atualmente é:

```typescript
import { atualizarModulo, criarModulo, listarModulos } from './modulos/api';
```

Substitua por:

```typescript
import { atualizarModulo, criarModulo, listarModulos, rascunharInstrucoesModulo } from './modulos/api';
```

- [ ] **Step 4: Adicionar as quatro actions**

Em `frontend/src/corepilot/useCorePilotState.ts`, logo depois do fechamento de `atualizarAgenteReal` (a função termina em `};` na linha 789, imediatamente antes do comentário `// --- Skills reais ---`), adicione:

```typescript
  const gerarRascunhoInstrucoesModulo = async (brief: string) => {
    const moduloId = state.currentModuloId;
    if (!moduloId) return;
    const resultado = await rascunharInstrucoesModulo(accessToken, moduloId, brief);
    update({ instructions: resultado.instrucoes });
  };
  const gerarRascunhoGuardrailsAgente = async (agenteId: string, brief: string) => {
    const moduloId = state.currentModuloId;
    if (!moduloId) throw new Error('Módulo não encontrado');
    return rascunharGuardrailsAgente(accessToken, moduloId, agenteId, brief);
  };
  const gerarRascunhoSkill = async (
    agenteId: string,
    params: { skillNome?: string; skillObjetivo?: string; brief?: string },
  ) => {
    const moduloId = state.currentModuloId;
    if (!moduloId) throw new Error('Módulo não encontrado');
    return rascunharCamposSaidaSkill(accessToken, moduloId, agenteId, params);
  };
```

Em seguida, logo depois da linha `const removerCampoSaida = (indice: number) => update((s) => ({ skillFormCampos: s.skillFormCampos.filter((_, i) => i !== indice) }));` (dentro do bloco `// --- Skills reais ---`), adicione:

```typescript
  const aplicarRascunhoCamposSaida = (campos: CampoSaida[]) =>
    update({ skillFormCampos: campos.map((c) => ({ ...c, descricao: c.descricao ?? '' })) });
```

- [ ] **Step 5: Exportar as quatro actions no objeto `actions`**

A linha (atualmente próxima da 1278):

```typescript
    carregarAgentesDoModulo, selecionarAgente, toggleNovoAgenteForm, updateNovoAgenteField, criarNovoAgenteReal, atualizarAgenteReal,
```

Substitua por:

```typescript
    carregarAgentesDoModulo, selecionarAgente, toggleNovoAgenteForm, updateNovoAgenteField, criarNovoAgenteReal, atualizarAgenteReal,
    gerarRascunhoInstrucoesModulo, gerarRascunhoGuardrailsAgente, gerarRascunhoSkill,
```

A linha logo abaixo (atualmente):

```typescript
    adicionarCampoSaida, atualizarCampoSaida, removerCampoSaida, toggleFerramentaSkill, salvarSkillReal,
```

Substitua por:

```typescript
    adicionarCampoSaida, atualizarCampoSaida, removerCampoSaida, toggleFerramentaSkill, salvarSkillReal,
    aplicarRascunhoCamposSaida,
```

- [ ] **Step 6: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint limpos (as actions ainda não são chamadas por nenhuma UI, mas precisam compilar).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/corepilot/modulos/api.ts frontend/src/corepilot/agentes/api.ts frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): funções de API e actions para rascunho com IA"
```

---

### Task 7: Frontend — botão na aba Instruções do módulo

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/step4/Instructions.tsx`

**Interfaces:**
- Consumes: `GerarRascunhoButton` (Task 5), `actions.gerarRascunhoInstrucoesModulo` (Task 6).

- [ ] **Step 1: Adicionar o botão**

`frontend/src/corepilot/views/wizard/step4/Instructions.tsx` — conteúdo atual:

```tsx
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, label } from '../../../styles';

export function AgentInstructionsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <label style={{ ...label, marginBottom: 8 }}>Instruções do agente</label>
      <textarea
        rows={7}
        value={state.instructions}
        onChange={actions.updateInstructions}
        onBlur={() => void actions.salvarInstrucoesReal()}
        style={{ width: '100%', maxWidth: 640, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 10, maxWidth: 640 }}>Defina papel, forma de comunicação, o que priorizar, o que não pode fazer e quando encaminhar ao responsável.</div>
    </div>
  );
}
```

Substitua pelo novo conteúdo:

```tsx
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, label } from '../../../styles';
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';

export function AgentInstructionsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <label style={{ ...label, marginBottom: 8 }}>Instruções do agente</label>
      <div style={{ marginBottom: 8 }}>
        <GerarRascunhoButton onGerar={actions.gerarRascunhoInstrucoesModulo} />
      </div>
      <textarea
        rows={7}
        value={state.instructions}
        onChange={actions.updateInstructions}
        onBlur={() => void actions.salvarInstrucoesReal()}
        style={{ width: '100%', maxWidth: 640, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 10, maxWidth: 640 }}>Defina papel, forma de comunicação, o que priorizar, o que não pode fazer e quando encaminhar ao responsável.</div>
    </div>
  );
}
```

- [ ] **Step 2: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint limpos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/views/wizard/step4/Instructions.tsx
git commit -m "feat(frontend): botão de rascunho com IA nas instruções do módulo"
```

---

### Task 8: Frontend — botão na aba Identidade do agente

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/step4/Identity.tsx`

**Interfaces:**
- Consumes: `GerarRascunhoButton` (Task 5), `actions.gerarRascunhoGuardrailsAgente` (Task 6, retorna `{ guardrails, regraEscalonamento }`).

- [ ] **Step 1: Adicionar o botão acima dos campos de guardrails**

`frontend/src/corepilot/views/wizard/step4/Identity.tsx` — o bloco atual dos dois campos novos (guardrails/regraEscalonamento) é:

```tsx
      <div>
        <label style={label}>Restrições (o que este agente NUNCA deve fazer)</label>
        <textarea
          rows={3}
          value={guardrails}
          onChange={(e) => setGuardrails(e.target.value)}
          onBlur={() => guardrails !== (agente.guardrails ?? '') && void actions.atualizarAgenteReal('guardrails', guardrails)}
          placeholder="Ex.: nunca aprovar ou fechar uma compra sozinho; nunca inventar preço sem fonte."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Quando escalar para um humano</label>
        <textarea
          rows={3}
          value={regraEscalonamento}
          onChange={(e) => setRegraEscalonamento(e.target.value)}
          onBlur={() => regraEscalonamento !== (agente.regraEscalonamento ?? '') && void actions.atualizarAgenteReal('regraEscalonamento', regraEscalonamento)}
          placeholder="Ex.: se não encontrar 3 fornecedores confiáveis, ou se o preço variar mais de 40% entre fontes."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
```

Substitua pelo novo conteúdo (adiciona o botão logo antes do campo "Restrições", compartilhado pelos dois campos já que o endpoint devolve os dois juntos):

```tsx
      <div>
        <GerarRascunhoButton
          onGerar={async (brief) => {
            const rascunho = await actions.gerarRascunhoGuardrailsAgente(agente.id, brief);
            setGuardrails(rascunho.guardrails);
            setRegraEscalonamento(rascunho.regraEscalonamento);
          }}
        />
      </div>
      <div>
        <label style={label}>Restrições (o que este agente NUNCA deve fazer)</label>
        <textarea
          rows={3}
          value={guardrails}
          onChange={(e) => setGuardrails(e.target.value)}
          onBlur={() => guardrails !== (agente.guardrails ?? '') && void actions.atualizarAgenteReal('guardrails', guardrails)}
          placeholder="Ex.: nunca aprovar ou fechar uma compra sozinho; nunca inventar preço sem fonte."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Quando escalar para um humano</label>
        <textarea
          rows={3}
          value={regraEscalonamento}
          onChange={(e) => setRegraEscalonamento(e.target.value)}
          onBlur={() => regraEscalonamento !== (agente.regraEscalonamento ?? '') && void actions.atualizarAgenteReal('regraEscalonamento', regraEscalonamento)}
          placeholder="Ex.: se não encontrar 3 fornecedores confiáveis, ou se o preço variar mais de 40% entre fontes."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
```

Adicione também o import do componente, junto aos outros imports no topo do arquivo:

```typescript
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';
```

Note que **importante**: ao chamar `actions.atualizarAgenteReal('guardrails', guardrails)` logo depois de `setGuardrails(rascunho.guardrails)`, o `onBlur` só dispara quando o textarea perde o foco — como preencher via rascunho não move o foco pra dentro do textarea, o usuário ainda precisa clicar/tocar no campo e sair dele (ou editar algo) para o salvamento automático disparar. Isso é aceitável para este v1 (o usuário está ali revisando o texto de qualquer forma) e não é um bug a corrigir nesta tarefa.

- [ ] **Step 2: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint limpos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/views/wizard/step4/Identity.tsx
git commit -m "feat(frontend): botão de rascunho com IA em guardrails/escalonamento do agente"
```

---

### Task 9: Frontend — botão no editor de skill

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx`

**Interfaces:**
- Consumes: `GerarRascunhoButton` (Task 5), `actions.gerarRascunhoSkill` + `actions.aplicarRascunhoCamposSaida` (Task 6).

- [ ] **Step 1: Adicionar o botão acima de "Campos de saída"**

`frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx` — o trecho atual (dentro do `return`, logo depois do campo "Objetivo" e antes do label "Campos de saída") é:

```tsx
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={state.skillFormObjetivo} onChange={actions.updateSkillFormObjetivo} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Campos de saída</label>
```

Substitua por:

```tsx
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={state.skillFormObjetivo} onChange={actions.updateSkillFormObjetivo} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>

        <GerarRascunhoButton
          onGerar={async (brief) => {
            if (!state.selectedAgenteId) return;
            const rascunho = await actions.gerarRascunhoSkill(state.selectedAgenteId, {
              skillNome: state.skillFormNome,
              skillObjetivo: state.skillFormObjetivo,
              brief,
            });
            actions.aplicarRascunhoCamposSaida(rascunho.camposSaida);
          }}
        />

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Campos de saída</label>
```

Adicione também o import do componente, junto aos outros imports no topo do arquivo (que hoje são `CorePilotState`, `CorePilotActions`, `ToggleSwitch`, `btnDark`/`btnSecondary`/`colors`/`input`/`inputSm`/`label`, `TipoCampoSaida`):

```typescript
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';
```

- [ ] **Step 2: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint limpos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/views/wizard/step4/SkillEditor.tsx
git commit -m "feat(frontend): botão de rascunho com IA nos campos de saída da skill"
```

---

### Task 10: Verificação de ponta a ponta

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: todos os testes passam (170: 162 anteriores + 8 novos entre os Tasks 2-4).

- [ ] **Step 2: Build de backend e frontend**

Run: `cd backend && npm run build`
Run: `cd frontend && npm run build && npm run lint`
Expected: tudo limpo.

- [ ] **Step 3: Subir os dois servidores**

Run (background): `cd backend && npm run start:dev`
Run (background): `cd frontend && npm run dev`

Espere os dois responderem:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/me   # espera 401 (sem token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173      # espera 200
```

Confirme no log do backend que as três rotas novas aparecem mapeadas:
```
Mapped {/modulos/:id/rascunho-instrucoes, POST} route
Mapped {/modulos/:moduloId/agentes/:agenteId/rascunho-guardrails, POST} route
Mapped {/modulos/:moduloId/agentes/:agenteId/rascunho-skill, POST} route
```

- [ ] **Step 4: Percorrer os três fluxos como usuário, num módulo customizado real**

Logado como `seed-a@corepilot.dev` (senha em `backend/.env.local`, chave `SEED_USER_PASSWORD`), abrir qualquer módulo customizado (ex.: Agronomia) → "Configurar módulo" → "Agente e instruções":

1. Aba **Instruções**: clicar "✨ Gerar rascunho com IA", opcionalmente digitar um brief, clicar "Gerar" — o textarea de instruções deve se preencher com texto coerente. Sair do campo (blur) e recarregar a página — o texto deve persistir.
2. Aba **Identidade** de um agente existente (ou criar um novo): clicar "✨ Gerar rascunho com IA" acima de "Restrições" — os dois textareas (Restrições, Quando escalar) devem se preencher. Clicar dentro de um deles e sair (blur) para salvar; recarregar e confirmar que persistiu.
3. Aba **Skills** → "+ Nova skill" (ou editar uma existente): preencher nome/objetivo da skill, clicar "✨ Gerar rascunho com IA" acima de "Campos de saída" — a lista de campos deve ser substituída pelo rascunho (pelo menos 2 linhas, com nome/tipo/obrigatório preenchidos). Clicar "Salvar skill" e confirmar que persiste após reload.

Se qualquer um desses passos gerar erro de console no browser, investigar antes de prosseguir (usar as ferramentas de screenshot/Playwright já usadas nesta sessão para o resto do projeto, seguindo o mesmo padrão: login via preenchimento de `input[type="email"]`/`input[type="password"]`, aguardar seletores de texto, nunca usar sleep fixo sem necessidade).

- [ ] **Step 5: Confirmar auditoria**

Verificar no Postgres (ou via um pequeno script com `PrismaClient`, ou consultando a tabela `AuditLog` diretamente) que cada uma das três chamadas do Step 4 gerou uma linha com `acao = 'rascunho_ia_gerado'` e `dadosDepois.tipo` igual a `instrucoes_modulo`, `guardrails_agente` e `campos_saida_skill` respectivamente.

- [ ] **Step 6: Encerrar os servidores de teste**

Identificar os PIDs exatos dos processos `node` cuja `CommandLine` contenha `Corepilot\backend` ou `Corepilot\frontend` (via `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` no PowerShell, filtrando por `CommandLine -like`) e encerrar só esses — nunca matar processos node por porta sem antes confirmar de quem são, para não derrubar um servidor de desenvolvimento que o usuário já tinha rodando por conta própria.

- [ ] **Step 7: Commit final (se sobrar algo não commitado, ex. ajuste feito durante a verificação)**

```bash
git status --short
```

Se houver mudanças pendentes relacionadas a esta feature, `git add` só os arquivos relevantes e commitar. Não commitar nada que não tenha sido tocado por este plano.
