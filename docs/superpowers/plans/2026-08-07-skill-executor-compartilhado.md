# SkillExecutorService compartilhado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Orquestrador (execução real de etapas `tarefa_agente` do BPM) usar as ferramentas
anexadas a uma skill e as instruções do módulo, igualando seu comportamento ao do endpoint manual
"Testar skill" — hoje o worker nem busca `skill.ferramentas` do banco nem inclui
`modulo.instrucoes` no prompt.

**Architecture:** Extrair a lógica de "montar system prompt + decidir entre `parseStructured`
direto ou loop de tool-use", hoje implementada só dentro de `SkillExecucaoController`, para um
serviço novo (`SkillExecutorService`). Os dois lugares que executam uma skill contra o modelo —
`SkillExecucaoController` (endpoint manual) e `OrquestradorFilaWorker` (execução real de BPM) —
passam a chamar esse único serviço.

**Tech Stack:** NestJS 11, Prisma, Jest, Anthropic SDK (via `AnthropicService` já existente).

## Global Constraints

- Testes ficam colocados junto do código (`*.spec.ts` ao lado do arquivo testado), `rootDir` do
  Jest é `src`.
- Prettier: aspas simples, vírgula final em tudo (`trailingComma: 'all'`).
- ESLint: `no-explicit-any` desabilitado; `no-floating-promises` e `no-unsafe-argument` são
  warnings, não erros.
- Identificadores de domínio em português (`agente`, `skill`, `modulo`, `entrada`, `execucao`),
  seguindo o padrão já usado em todo o `backend/src`.
- Sem comentários novos além dos que já existem, exceto onde uma decisão não-óbvia precisar de
  explicação (nenhum caso previsto neste plano — a lógica está só sendo movida, não inventada).
- Rodar cada suíte de teste com `npx jest <arquivo>.spec.ts` a partir de `backend/`.

---

## Task 1: Criar `SkillExecutorService`

**Files:**
- Create: `backend/src/skill/skill-executor.service.ts`
- Create: `backend/src/skill/skill-executor.module.ts`
- Test: `backend/src/skill/skill-executor.service.spec.ts`

**Interfaces:**
- Consumes: `AnthropicService` (`backend/src/chat/anthropic.service.ts`, já existe —
  `parseStructured`, `createWithTools`, `parseStructuredFromHistory`), `PrismaService`
  (`backend/src/prisma/prisma.service.ts`, já existe, `@Global()`), `construirSchemaSaida` +
  `CampoSaida` (`backend/src/skill/schema-builder.ts`, já existe), `buscarDadosLocaisConsulta` +
  `consultaIdDaFerramenta` + `montarFerramentasDeConsultas`
  (`backend/src/consulta/consulta-ferramenta.util.ts`, já existe).
- Produces: `SkillExecutorService.executar(params: ExecutarSkillParams):
  Promise<{ output: unknown; usage: { input_tokens: number; output_tokens: number } }>` e o
  `SkillExecutorModule` (exporta `SkillExecutorService`) — usados pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste (arquivo inteiro, ainda vai falhar por `skill-executor.service.ts` não existir)**

Criar `backend/src/skill/skill-executor.service.spec.ts`:

```ts
import { SkillExecutorService } from './skill-executor.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CampoSaida } from './schema-builder';

describe('SkillExecutorService', () => {
  const agenteBase = {
    nome: 'Comprador',
    funcao: 'Analisar pedidos',
    objetivo: 'Ajudar compras',
    guardrails: null as string | null,
    regraEscalonamento: null as string | null,
    modeloIA: 'claude-sonnet-5',
  };

  const moduloSemInstrucoes = { instrucoes: null as string | null };

  const camposSaidaBase: CampoSaida[] = [
    { nome: 'titulo', tipo: 'string', obrigatorio: true },
  ];

  const skillSemFerramentas = {
    objetivo: 'Triar solicitações',
    camposSaida: camposSaidaBase,
    ferramentas: [] as { id: string; nome: string; camposFiltro: unknown }[],
  };

  function buildDeps() {
    const anthropicService = {
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: { titulo: 'ok' },
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      createWithTools: jest.fn(),
      parseStructuredFromHistory: jest.fn(),
    } as unknown as AnthropicService;
    const prisma = {
      consultaResultado: { findMany: jest.fn() },
    } as unknown as PrismaService;
    return { anthropicService, prisma };
  }

  it('chama parseStructured direto quando a skill não tem ferramentas', async () => {
    const { anthropicService, prisma } = buildDeps();
    const service = new SkillExecutorService(anthropicService, prisma);

    const resultado = await service.executar({
      agente: agenteBase,
      modulo: moduloSemInstrucoes,
      skill: skillSemFerramentas,
      entrada: 'Pedido: 10 parafusos',
    });

    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: 'Pedido: 10 parafusos',
        model: 'claude-sonnet-5',
        maxTokens: 4096,
      }),
    );
    expect(anthropicService.createWithTools).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      output: { titulo: 'ok' },
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });

  it('inclui guardrails e regra de escalonamento no system prompt quando preenchidos no agente', async () => {
    const { anthropicService, prisma } = buildDeps();
    const service = new SkillExecutorService(anthropicService, prisma);

    await service.executar({
      agente: {
        ...agenteBase,
        guardrails: 'Nunca aprove uma compra sozinho.',
        regraEscalonamento:
          'Se o valor exceder R$ 50 mil, escale para o gestor.',
      },
      modulo: moduloSemInstrucoes,
      skill: skillSemFerramentas,
      entrada: 'Pedido: 10 parafusos',
    });

    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Nunca aprove uma compra sozinho.'),
      }),
    );
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Se o valor exceder R$ 50 mil, escale para o gestor.',
        ),
      }),
    );
  });

  it('inclui as instruções do módulo no system prompt quando preenchidas', async () => {
    const { anthropicService, prisma } = buildDeps();
    const service = new SkillExecutorService(anthropicService, prisma);

    await service.executar({
      agente: agenteBase,
      modulo: { instrucoes: 'Sempre responda em português formal.' },
      skill: skillSemFerramentas,
      entrada: 'Pedido: 10 parafusos',
    });

    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Instruções adicionais: Sempre responda em português formal.',
        ),
      }),
    );
  });

  it('omite a seção de instruções adicionais quando modulo.instrucoes é nulo ou só espaços', async () => {
    const { anthropicService, prisma } = buildDeps();
    const service = new SkillExecutorService(anthropicService, prisma);

    await service.executar({
      agente: agenteBase,
      modulo: { instrucoes: '   ' },
      skill: skillSemFerramentas,
      entrada: 'Pedido: 10 parafusos',
    });

    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining('Instruções adicionais'),
      }),
    );
  });

  it('roda o loop de tool-use e usa dados locais quando a skill tem ferramentas', async () => {
    const { anthropicService, prisma } = buildDeps();
    (anthropicService.createWithTools as jest.Mock)
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'consulta_consulta-1',
            input: { codProduto: 'X1' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      });
    (
      anthropicService.parseStructuredFromHistory as jest.Mock
    ).mockResolvedValue({
      parsed_output: { titulo: 'ok' },
      usage: { input_tokens: 30, output_tokens: 10 },
    });
    (prisma.consultaResultado.findMany as jest.Mock).mockResolvedValue([
      { dados: { codProduto: 'X1', saldo: 42 } },
    ]);
    const service = new SkillExecutorService(anthropicService, prisma);

    const resultado = await service.executar({
      agente: agenteBase,
      modulo: moduloSemInstrucoes,
      skill: {
        ...skillSemFerramentas,
        ferramentas: [
          { id: 'consulta-1', nome: 'Saldo de estoque', camposFiltro: [] },
        ],
      },
      entrada: 'Qual o saldo do produto X1?',
    });

    expect(anthropicService.createWithTools).toHaveBeenCalledTimes(2);
    expect(prisma.consultaResultado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consultaParametrizadaId: 'consulta-1',
        }),
      }),
    );
    expect(anthropicService.parseStructuredFromHistory).toHaveBeenCalled();
    expect(resultado).toEqual({
      output: { titulo: 'ok' },
      usage: { input_tokens: 30, output_tokens: 10 },
    });
  });

  it('esgota as iterações do loop e ainda assim retorna a saída final via parseStructuredFromHistory', async () => {
    const { anthropicService, prisma } = buildDeps();
    (anthropicService.createWithTools as jest.Mock).mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'call-1',
          name: 'consulta_consulta-1',
          input: {},
        },
      ],
    });
    (
      anthropicService.parseStructuredFromHistory as jest.Mock
    ).mockResolvedValue({
      parsed_output: { titulo: 'parcial' },
      usage: { input_tokens: 50, output_tokens: 15 },
    });
    (prisma.consultaResultado.findMany as jest.Mock).mockResolvedValue([]);
    const service = new SkillExecutorService(anthropicService, prisma);

    const resultado = await service.executar({
      agente: agenteBase,
      modulo: moduloSemInstrucoes,
      skill: {
        ...skillSemFerramentas,
        ferramentas: [
          { id: 'consulta-1', nome: 'Saldo de estoque', camposFiltro: [] },
        ],
      },
      entrada: 'Qual o saldo?',
    });

    expect(anthropicService.createWithTools).toHaveBeenCalledTimes(5);
    expect(
      anthropicService.parseStructuredFromHistory,
    ).toHaveBeenCalledTimes(1);
    expect(resultado.output).toEqual({ titulo: 'parcial' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest skill-executor.service.spec.ts`
Expected: FAIL — `Cannot find module './skill-executor.service'`.

- [ ] **Step 3: Implementar `SkillExecutorService`**

Criar `backend/src/skill/skill-executor.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnthropicService,
  type MensagemConversa,
} from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
import {
  buscarDadosLocaisConsulta,
  consultaIdDaFerramenta,
  montarFerramentasDeConsultas,
} from '../consulta/consulta-ferramenta.util';

export interface ExecutarSkillAgente {
  nome: string;
  funcao: string;
  objetivo: string;
  guardrails: string | null;
  regraEscalonamento: string | null;
  modeloIA: string;
}

export interface ExecutarSkillModulo {
  instrucoes: string | null;
}

export interface ExecutarSkillSkill {
  objetivo: string;
  camposSaida: CampoSaida[];
  ferramentas: { id: string; nome: string; camposFiltro: unknown }[];
}

export interface ExecutarSkillParams {
  agente: ExecutarSkillAgente;
  modulo: ExecutarSkillModulo;
  skill: ExecutarSkillSkill;
  entrada: string;
}

export interface ExecutarSkillResultado {
  output: unknown;
  usage: { input_tokens: number; output_tokens: number };
}

function montarSystemPrompt(
  agente: ExecutarSkillAgente,
  modulo: ExecutarSkillModulo,
  skill: ExecutarSkillSkill,
): string {
  const partes = [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a skill com o seguinte objetivo: ${skill.objetivo}`,
  ];

  if (agente.guardrails?.trim()) {
    partes.push(`RESTRIÇÕES (nunca viole):\n${agente.guardrails.trim()}`);
  }
  if (agente.regraEscalonamento?.trim()) {
    partes.push(
      `ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`,
    );
  }
  if (modulo.instrucoes?.trim()) {
    partes.push(`Instruções adicionais: ${modulo.instrucoes}`);
  }

  return partes.join('\n\n');
}

const MAX_ITERACOES_TOOL_USE = 5;

@Injectable()
export class SkillExecutorService {
  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly prisma: PrismaService,
  ) {}

  async executar(
    params: ExecutarSkillParams,
  ): Promise<ExecutarSkillResultado> {
    const { agente, modulo, skill, entrada } = params;
    const schema = construirSchemaSaida(skill.camposSaida);
    const system = montarSystemPrompt(agente, modulo, skill);

    const response =
      skill.ferramentas.length === 0
        ? await this.anthropicService.parseStructured({
            system,
            mensagem: entrada,
            model: agente.modeloIA,
            maxTokens: 4096,
            schema,
          })
        : await this.executarComFerramentas(
            skill,
            agente.modeloIA,
            system,
            entrada,
            schema,
          );

    return { output: response.parsed_output, usage: response.usage };
  }

  private async executarComFerramentas(
    skill: ExecutarSkillSkill,
    model: string,
    system: string,
    entrada: string,
    schema: ReturnType<typeof construirSchemaSaida>,
  ) {
    const tools = montarFerramentasDeConsultas(skill.ferramentas);
    let mensagens: MensagemConversa[] = [{ role: 'user', content: entrada }];

    for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_USE; iteracao++) {
      const resposta = (await this.anthropicService.createWithTools({
        system,
        messages: mensagens,
        model,
        maxTokens: 4096,
        tools,
      })) as unknown as {
        stop_reason: string;
        content: Array<Record<string, unknown>>;
      };

      mensagens = [
        ...mensagens,
        { role: 'assistant', content: resposta.content },
      ];

      if (resposta.stop_reason !== 'tool_use') {
        break;
      }

      const blocosDeTool = resposta.content.filter(
        (bloco) => bloco.type === 'tool_use',
      );

      const resultadosDeTool = await Promise.all(
        blocosDeTool.map(async (bloco) => {
          const consultaId = consultaIdDaFerramenta(bloco.name as string);
          const linhas = await buscarDadosLocaisConsulta(
            this.prisma,
            consultaId,
            bloco.input as Record<string, unknown>,
          );
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
      model,
      maxTokens: 4096,
      schema,
    });
  }
}
```

Criar `backend/src/skill/skill-executor.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AnthropicModule } from '../chat/anthropic.module';
import { SkillExecutorService } from './skill-executor.service';

@Module({
  imports: [AnthropicModule],
  providers: [SkillExecutorService],
  exports: [SkillExecutorService],
})
export class SkillExecutorModule {}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest skill-executor.service.spec.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/skill/skill-executor.service.ts backend/src/skill/skill-executor.module.ts backend/src/skill/skill-executor.service.spec.ts
git commit -m "feat(backend): extrai SkillExecutorService compartilhado (prompt + loop de ferramentas)"
```

---

## Task 2: `SkillExecucaoController` passa a usar `SkillExecutorService`

**Files:**
- Modify: `backend/src/skill/skill-execucao.controller.ts`
- Modify: `backend/src/skill/skill-execucao.module.ts`
- Modify: `backend/src/skill/skill.service.ts:37-48`
- Modify: `backend/src/skill/skill.service.spec.ts:100-103`
- Modify (rewrite): `backend/src/skill/skill-execucao.controller.spec.ts`

**Interfaces:**
- Consumes: `SkillExecutorService.executar` (Task 1).
- Produces: nenhuma interface nova consumida por outra task — este endpoint HTTP é uma folha.

- [ ] **Step 1: Reescrever `skill-execucao.controller.spec.ts` pra esperar `SkillExecutorService` (vai falhar — o controller ainda não tem esse construtor)**

Substituir todo o conteúdo de `backend/src/skill/skill-execucao.controller.spec.ts`:

```ts
import { UnprocessableEntityException } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import type { SkillService } from './skill.service';
import type { SkillExecucaoService } from './skill-execucao.service';
import type { SkillExecutorService } from './skill-executor.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillExecucaoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
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
      modulo: { instrucoes: null as string | null },
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
    const skillExecutorService = {
      executar: jest.fn().mockResolvedValue({
        output: { titulo: 'ok' },
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    } as unknown as SkillExecutorService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, skillExecucaoService, skillExecutorService, audit };
  }

  it('executa a skill, persiste a execução e audita', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', {
      entrada: 'Pedido: 10 parafusos',
    });

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith(
      'skill-1',
      'empresa-1',
    );
    expect(skillExecutorService.executar).toHaveBeenCalledWith({
      agente: skillComAgente.agente,
      modulo: skillComAgente.agente.modulo,
      skill: {
        objetivo: skillComAgente.objetivo,
        camposSaida: skillComAgente.camposSaida,
        ferramentas: skillComAgente.ferramentas,
      },
      entrada: 'Pedido: 10 parafusos',
    });
    expect(skillExecucaoService.appendExecucao).toHaveBeenCalledWith(
      'skill-1',
      'usuario-1',
      'Pedido: 10 parafusos',
      { titulo: 'ok' },
      10,
      5,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'skill_execucao',
      }),
    );
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });

  it('lança erro e não persiste quando a saída não bate com o schema (output nulo)', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    await expect(
      controller.executar('skill-1', { entrada: 'Pedido' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(skillExecucaoService.appendExecucao).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lista execuções da skill, validando que ela pertence à empresa do tenant', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    (skillExecucaoService.listBySkill as jest.Mock).mockResolvedValue([
      { id: 'execucao-1' },
    ]);
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.listar('skill-1');

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith(
      'skill-1',
      'empresa-1',
    );
    expect(skillExecucaoService.listBySkill).toHaveBeenCalledWith('skill-1');
    expect(resultado).toEqual([{ id: 'execucao-1' }]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest skill-execucao.controller.spec.ts`
Expected: FAIL — o construtor de `SkillExecucaoController` ainda espera `(skillService,
skillExecucaoService, anthropicService, audit, prisma, tenantContext)`, não o novo formato de 5
argumentos.

- [ ] **Step 3: Atualizar `SkillService.findByIdInEmpresa` pra incluir `agente.modulo`**

Em `backend/src/skill/skill.service.ts:37-41`, trocar:

```ts
  async findByIdInEmpresa(skillId: string, empresaId: string) {
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, agente: { empresaId } },
      include: { agente: true, ferramentas: true },
    });
```

por:

```ts
  async findByIdInEmpresa(skillId: string, empresaId: string) {
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, agente: { empresaId } },
      include: { agente: { include: { modulo: true } }, ferramentas: true },
    });
```

Em `backend/src/skill/skill.service.spec.ts`, essa mudança quebra DUAS asserções estritas sobre o
`include` (uma no teste de `findByIdInEmpresa` lançando `NotFoundException`, outra no teste de
`update`) — usar `replace_all` pra trocar as duas de uma vez, já que o texto é idêntico nos dois
lugares:

Old string (aparece 2x, nas linhas ~102 e ~135):
```ts
      include: { agente: true, ferramentas: true },
```

New string:
```ts
      include: { agente: { include: { modulo: true } }, ferramentas: true },
```

- [ ] **Step 4: Reescrever `skill-execucao.controller.ts`**

Substituir todo o conteúdo de `backend/src/skill/skill-execucao.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { SkillExecutorService } from './skill-executor.service';
import { AuditService } from '../audit/audit.service';
import type { CampoSaida } from './schema-builder';
import type { ExecutarSkillDto } from './dto/executar-skill.dto';

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly skillExecutorService: SkillExecutorService,
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
  async executar(
    @Param('skillId') skillId: string,
    @Body() body: ExecutarSkillDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const skill = await this.skillService.findByIdInEmpresa(
      skillId,
      empresaId,
    );

    const { output, usage } = await this.skillExecutorService.executar({
      agente: skill.agente,
      modulo: skill.agente.modulo,
      skill: {
        objetivo: skill.objetivo,
        camposSaida: skill.camposSaida as unknown as CampoSaida[],
        ferramentas: skill.ferramentas,
      },
      entrada: body.entrada,
    });

    if (!output) {
      throw new UnprocessableEntityException(
        'A resposta do agente não pôde ser validada contra o schema da skill',
      );
    }

    const execucao = await this.skillExecucaoService.appendExecucao(
      skillId,
      usuarioId,
      body.entrada,
      output as Prisma.InputJsonValue,
      usage.input_tokens,
      usage.output_tokens,
    );

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_execucao',
      dadosDepois: {
        skillId,
        agenteId: skill.agenteId,
        moduloId: skill.agente.moduloId,
        tokensEntrada: usage.input_tokens,
        tokensSaida: usage.output_tokens,
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

- [ ] **Step 5: Atualizar `skill-execucao.module.ts`**

Substituir todo o conteúdo de `backend/src/skill/skill-execucao.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import { SkillExecucaoService } from './skill-execucao.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SkillModule } from './skill.module';
import { SkillExecutorModule } from './skill-executor.module';

@Module({
  imports: [AuthModule, AuditModule, SkillModule, SkillExecutorModule],
  controllers: [SkillExecucaoController],
  providers: [SkillExecucaoService],
})
export class SkillExecucaoModule {}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest skill-execucao.controller.spec.ts skill.service.spec.ts`
Expected: PASS em ambos os arquivos.

- [ ] **Step 7: Rodar o build do backend pra pegar qualquer outro caller que quebrou**

Run: `cd backend && npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add backend/src/skill/skill-execucao.controller.ts backend/src/skill/skill-execucao.module.ts backend/src/skill/skill.service.ts backend/src/skill/skill.service.spec.ts backend/src/skill/skill-execucao.controller.spec.ts
git commit -m "refactor(backend): SkillExecucaoController usa o SkillExecutorService compartilhado"
```

---

## Task 3: `OrquestradorFilaWorker` passa a usar `SkillExecutorService`

**Files:**
- Modify: `backend/src/orquestrador/orquestrador-fila.worker.ts`
- Modify: `backend/src/orquestrador/orquestrador.module.ts`
- Modify (rewrite): `backend/src/orquestrador/orquestrador-fila.worker.spec.ts`

**Interfaces:**
- Consumes: `SkillExecutorService.executar` (Task 1) — mesma interface usada pela Task 2.

- [ ] **Step 1: Reescrever `orquestrador-fila.worker.spec.ts` pra esperar `SkillExecutorService` (vai falhar — o worker ainda tem 5 parâmetros no construtor)**

Substituir todo o conteúdo de `backend/src/orquestrador/orquestrador-fila.worker.spec.ts`:

```ts
import { OrquestradorFilaWorker } from './orquestrador-fila.worker';
import type { PrismaService } from '../prisma/prisma.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { SkillExecutorService } from '../skill/skill-executor.service';
import type { OrquestradorEngineService } from './orquestrador-engine.service';
import type { ConfigService } from '@nestjs/config';
import { criptografar } from '../fonte-de-dados/crypto';
import type { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';

describe('OrquestradorFilaWorker — processarFilaAgentes', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      instanciaDeProcesso: { update: jest.fn() },
    } as unknown as PrismaService;
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    const anthropicService = {
      parseStructured: jest.fn(),
    } as unknown as AnthropicService;
    const skillExecutorService = {
      executar: jest.fn(),
    } as unknown as SkillExecutorService;
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const evolutionApi = {
      enviarMensagem: jest.fn(),
    } as unknown as EvolutionApiAdapterService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService;
    return {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    };
  }

  const execucaoPendente = {
    id: 'exec-1',
    instanciaId: 'inst-1',
    etapaId: 'e-2',
    instancia: {
      id: 'inst-1',
      dadosAcumulados: { 'e-1': { itens: ['parafuso'] } },
    },
    etapa: {
      id: 'e-2',
      entradaRefs: ['e-1'],
      agente: {
        nome: 'Agente de Compras',
        funcao: 'Comprador IA',
        objetivo: 'Agrupar solicitações',
        guardrails: null,
        regraEscalonamento: null,
        modeloIA: 'claude-sonnet-5',
        modulo: { instrucoes: null as string | null },
      },
      skill: {
        objetivo: 'Agrupar itens por família',
        camposSaida: [{ nome: 'grupos', tipo: 'string[]', obrigatorio: true }],
        ferramentas: [] as { id: string; nome: string; camposFiltro: unknown }[],
      },
    },
  };

  it('processa uma execução de agente pendente, grava a saída e avança', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas
      .mockResolvedValueOnce([execucaoPendente]); // pendentes
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-1', status: 'pending' },
      data: { status: 'processing' },
    });
    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'done',
          output: { grupos: ['parafusos'] },
        }),
      }),
    );
    expect(engine.avancar).toHaveBeenCalledWith('inst-1', 'e-2');
  });

  it('passa as ferramentas da skill e as instruções do módulo pro SkillExecutorService', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    const execucaoComFerramentasEInstrucoes = {
      ...execucaoPendente,
      etapa: {
        ...execucaoPendente.etapa,
        agente: {
          ...execucaoPendente.etapa.agente,
          modulo: { instrucoes: 'Sempre responda em português.' },
        },
        skill: {
          ...execucaoPendente.etapa.skill,
          ferramentas: [
            { id: 'consulta-1', nome: 'Estoque', camposFiltro: [] },
          ],
        },
      },
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoComFerramentasEInstrucoes]);
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(skillExecutorService.executar).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: { instrucoes: 'Sempre responda em português.' },
        skill: expect.objectContaining({
          ferramentas: [
            { id: 'consulta-1', nome: 'Estoque', camposFiltro: [] },
          ],
        }),
      }),
    );
  });

  it('reseta a instância pra "em_andamento" no caminho de sucesso, desfazendo um "erro" deixado por um sweep de travadas anterior (C3)', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ status: 'em_andamento' }),
      }),
    );
  });

  it('limpa uma mensagemErro deixada por um sweep de travadas anterior ao concluir com sucesso', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'done', mensagemErro: null }),
      }),
    );
  });

  it('filtra a entrada da Skill pelas entradaRefs da etapa', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    const execucaoComMaisDados = {
      ...execucaoPendente,
      instancia: {
        id: 'inst-1',
        dadosAcumulados: {
          'e-1': { itens: ['parafuso'] },
          'outra-etapa': { irrelevante: true },
        },
      },
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoComMaisDados]);
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    const entradaEnviada = (skillExecutorService.executar as jest.Mock).mock
      .calls[0][0].entrada as string;
    expect(entradaEnviada).toContain('itens');
    expect(entradaEnviada).not.toContain('irrelevante');
  });

  it('marca a execução e a instância como falha quando o SkillExecutorService lança erro', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (skillExecutorService.executar as jest.Mock).mockRejectedValue(
      new Error('timeout'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { status: 'erro' },
    });
    expect(engine.avancar).not.toHaveBeenCalled();
  });

  it('continua para a próxima execução mesmo se uma falhar', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    const segunda = {
      ...execucaoPendente,
      id: 'exec-2',
      instanciaId: 'inst-2',
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente, segunda]);
    (skillExecutorService.executar as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        output: { grupos: [] },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(engine.avancar).toHaveBeenCalledWith('inst-2', 'e-2');
  });

  it('mantém a execução "done" quando avancar falha depois do commit', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    (engine.avancar as jest.Mock).mockRejectedValue(
      new Error('falha ao avançar'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    const chamadasDeExecucao = (prisma.execucaoDeEtapa.update as jest.Mock).mock
      .calls as { data?: { status?: string } }[][];
    expect(
      chamadasDeExecucao.some(([args]) => args.data?.status === 'failed'),
    ).toBe(false);
    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'done',
          output: { grupos: ['parafusos'] },
        }),
      }),
    );
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { status: 'erro' },
    });
  });

  it('não propaga uma falha inesperada fora do loop por execução (ex.: blip no recuperarExecucoesTravadas) — o tick não pode derrubar o processo', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Supabase indisponível'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );
    const erroSpy = jest.spyOn(worker['logger'], 'error');

    await expect(worker.processarFilaAgentes()).resolves.toBeUndefined();

    expect(erroSpy).toHaveBeenCalledWith(
      expect.stringContaining('Falha inesperada no processamento da fila'),
      expect.any(Error),
    );
  });
});

describe('OrquestradorFilaWorker — processarFilaIntegracoes', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      instanciaDeProcesso: { update: jest.fn() },
      integracaoWhatsApp: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    const anthropicService = {
      parseStructured: jest.fn(),
    } as unknown as AnthropicService;
    const skillExecutorService = {
      executar: jest.fn(),
    } as unknown as SkillExecutorService;
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const evolutionApi = {
      enviarMensagem: jest.fn(),
    } as unknown as EvolutionApiAdapterService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService;
    return {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    };
  }

  const integracaoSalva = {
    empresaId: 'empresa-1',
    apiUrl: 'https://evolution.exemplo.com',
    instanceName: 'corepilot',
    apiKeyCriptografada: criptografar('chave-123', 'a'.repeat(64)),
    phone: '+5511900000000',
  };

  const execucaoIntegracaoPura = {
    id: 'exec-3',
    instanciaId: 'inst-1',
    etapaId: 'e-6',
    chaveIdempotencia: 'inst-1:e-6:1',
    instancia: { id: 'inst-1', empresaId: 'empresa-1', dadosAcumulados: {} },
    etapa: { id: 'e-6', executor: 'integracao', agente: null },
  };

  it('envia via Evolution API com o texto padrão numa etapa de integração pura, e avança', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas
      .mockResolvedValueOnce([execucaoIntegracaoPura]); // pendentes
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({
      messageId: 'msg-1',
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://evolution.exemplo.com',
        instanceName: 'corepilot',
        apiKey: 'chave-123',
      }),
      '+5511900000000',
      expect.any(String),
    );
    expect(engine.avancar).toHaveBeenCalledWith('inst-1', 'e-6');
  });

  it('reseta a instância pra "em_andamento" no caminho de sucesso do envio de WhatsApp (C3)', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoIntegracaoPura]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({
      messageId: 'msg-1',
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { status: 'em_andamento' },
    });
  });

  it('limpa uma mensagemErro deixada por um sweep de travadas anterior ao concluir o envio com sucesso', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoIntegracaoPura]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({
      messageId: 'msg-1',
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-3' },
        data: expect.objectContaining({ status: 'done', mensagemErro: null }),
      }),
    );
  });

  it('numa etapa agente_mais_integracao, redige a mensagem com a Anthropic antes de enviar', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    const execucaoComAgente = {
      ...execucaoIntegracaoPura,
      etapa: {
        id: 'e-6',
        executor: 'agente_mais_integracao',
        agente: { nome: 'Agente de Compras', modeloIA: 'claude-sonnet-5' },
      },
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoComAgente]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { mensagem: 'Seu pedido foi aprovado!' },
    });
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({
      messageId: 'msg-2',
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(anthropicService.parseStructured).toHaveBeenCalled();
    expect(evolutionApi.enviarMensagem).toHaveBeenCalledWith(
      expect.anything(),
      '+5511900000000',
      'Seu pedido foi aprovado!',
    );
  });

  it('marca falha e instância em erro quando não há telefone de destino nem na instância nem na integração', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoIntegracaoPura]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue({
      ...integracaoSalva,
      phone: null,
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).not.toHaveBeenCalled();
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { status: 'erro' },
    });
  });

  it('reivindicação atômica evita envio duplicado quando um segundo tick concorrente pega a mesma execução pendente', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    // Simula duas execuções "concorrentes" do @Interval: ambas enxergam a
    // mesma linha pending (o mock de findMany não reflete a escrita da
    // primeira tick), mas só a primeira consegue reivindicá-la — o
    // updateMany da segunda retorna count: 0 porque a linha já não está mais
    // "pending" na base real.
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas — 1º tick
      .mockResolvedValueOnce([execucaoIntegracaoPura]) // pendentes — 1º tick
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas — 2º tick
      .mockResolvedValueOnce([execucaoIntegracaoPura]); // pendentes — 2º tick
    (prisma.execucaoDeEtapa.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // 1º tick reivindica com sucesso
      .mockResolvedValueOnce({ count: 0 }); // 2º tick chega tarde demais
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({
      messageId: 'msg-1',
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();
    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).toHaveBeenCalledTimes(1);
    expect(engine.avancar).toHaveBeenCalledTimes(1);
  });

  it('recupera uma execução travada em processing que não foi reivindicada por este processo, mesmo recém-criada (sem limiar de tempo)', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    // Sem `criadoEm` no fixture de propósito: a recuperação de travadas não
    // depende mais de idade da linha (ver C3), só de ela não estar no Set de
    // execuções reivindicadas por este processo — então mesmo "recém-criada"
    // ela é varrida, por não ter sido claimed por ninguém.
    const execucaoTravada = { id: 'exec-travada', instanciaId: 'inst-2' };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([execucaoTravada]) // recuperarExecucoesTravadas encontra a linha travada
      .mockResolvedValueOnce([]); // nada pending pra processar depois
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: 'processing',
        ator: 'integracao',
        id: { notIn: [] },
      },
    });
    expect(prisma.execucaoDeEtapa.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-travada', status: 'processing' },
      data: expect.objectContaining({
        status: 'failed',
        mensagemErro: expect.stringContaining('travada em processing'),
      }),
    });
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-2' },
      data: { status: 'erro' },
    });
    expect(evolutionApi.enviarMensagem).not.toHaveBeenCalled();
    expect(engine.avancar).not.toHaveBeenCalled();
  });

  it('exclui do filtro de travadas qualquer execução que este processo reivindicou e ainda não terminou de processar', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    // Reivindica diretamente (sem passar pelo loop inteiro) pra simular uma
    // execução que este processo tem em mãos agora — updateMany count: 1
    // confirma a reivindicação, o que deve colocar o id no Set interno.
    const reivindicou = await worker['reivindicarExecucao']('exec-em-voo');
    expect(reivindicou).toBe(true);

    await worker['recuperarExecucoesTravadas']('integracao');

    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenCalledWith({
      where: {
        status: 'processing',
        ator: 'integracao',
        id: { notIn: ['exec-em-voo'] },
      },
    });
    // A própria linha reivindicada nunca aparece como alvo de um updateMany
    // de recuperação, porque o filtro acima já a exclui da consulta.
    expect(prisma.execucaoDeEtapa.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-em-voo', status: 'processing' },
      }),
    );
  });

  it('não remove do Set um id que já pertencia a OUTRA chamada em andamento quando esta chamada perde a reivindicação (updateMany count: 0)', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    // Simula tick A: reivindicou 'exec-2' com sucesso e ainda está
    // processando (ex.: aguardando uma chamada externa lenta) — o id
    // legitimamente pertence a essa chamada em andamento.
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 1,
    });
    const reivindicouA = await worker['reivindicarExecucao']('exec-2');
    expect(reivindicouA).toBe(true);

    // Tick B (uma execução sobreposta do @Interval) também tenta reivindicar
    // o mesmo id — chega tarde, a linha já não está mais "pending", então seu
    // updateMany retorna count: 0. Isso NÃO pode remover 'exec-2' do Set,
    // porque A ainda não terminou de processar.
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    const reivindicouB = await worker['reivindicarExecucao']('exec-2');
    expect(reivindicouB).toBe(false);

    // 'exec-2' deve continuar no Set (excluído do filtro de travadas) — se a
    // tentativa perdedora de B tivesse removido, um sweep rodando agora
    // marcaria 'exec-2' como travada e falha por engano, mesmo com A ainda
    // legitimamente em andamento.
    await worker['recuperarExecucoesTravadas']('integracao');
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenCalledWith({
      where: {
        status: 'processing',
        ator: 'integracao',
        id: { notIn: ['exec-2'] },
      },
    });
  });

  it('remove do Set uma reivindicação que não se confirmou (updateMany count: 0)', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 0, // outro tick já reivindicou a linha primeiro
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    const reivindicou = await worker['reivindicarExecucao']('exec-perdeu');
    expect(reivindicou).toBe(false);

    // O id não pode ter ficado "preso" no Set: se tivesse, o filtro de
    // travadas excluiria pra sempre uma linha que este processo nunca
    // chegou a reivindicar de verdade.
    await worker['recuperarExecucoesTravadas']('integracao');
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenCalledWith({
      where: { status: 'processing', ator: 'integracao', id: { notIn: [] } },
    });
  });

  it('remove do Set e propaga o erro se o updateMany da reivindicação lançar', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error('conexão perdida'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await expect(worker['reivindicarExecucao']('exec-falhou')).rejects.toThrow(
      'conexão perdida',
    );

    await worker['recuperarExecucoesTravadas']('integracao');
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenCalledWith({
      where: { status: 'processing', ator: 'integracao', id: { notIn: [] } },
    });
  });

  it('remove a execução do Set de reivindicadas ao terminar de processar (sucesso ou falha), voltando a ficar sujeita ao sweep', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas
      .mockResolvedValueOnce([execucaoIntegracaoPura]); // pendentes
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(
      integracaoSalva,
    );
    (evolutionApi.enviarMensagem as jest.Mock).mockRejectedValue(
      new Error('falha de rede'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes(); // reivindica 'exec-3' e falha ao processar

    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValueOnce([]);
    await worker['recuperarExecucoesTravadas']('integracao');

    // Depois de terminar (mesmo com falha), 'exec-3' não está mais no Set —
    // o filtro de exclusão volta a ficar vazio.
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenLastCalledWith({
      where: { status: 'processing', ator: 'integracao', id: { notIn: [] } },
    });
  });

  it('não sobrescreve nem toca a instância quando a execução travada termina entre ser encontrada e a recuperação', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    const execucaoTravada = { id: 'exec-travada', instanciaId: 'inst-2' };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([execucaoTravada]) // recuperarExecucoesTravadas encontra a linha travada
      .mockResolvedValueOnce([]); // nada pending pra processar depois
    // A linha, na verdade, terminou "done" entre o findMany acima e esta
    // escrita (ex.: um tick anterior, ainda em andamento, concluiu o envio
    // nesse meio-tempo) — o updateMany condicional não encontra mais a linha
    // em "processing" e retorna count: 0.
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(prisma.execucaoDeEtapa.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-travada', status: 'processing' },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(prisma.instanciaDeProcesso.update).not.toHaveBeenCalled();
    expect(evolutionApi.enviarMensagem).not.toHaveBeenCalled();
    expect(engine.avancar).not.toHaveBeenCalled();
  });

  it('não propaga uma falha inesperada fora do loop por execução (ex.: blip no recuperarExecucoesTravadas) — o tick não pode derrubar o processo', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Supabase indisponível'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );
    const erroSpy = jest.spyOn(worker['logger'], 'error');

    await expect(worker.processarFilaIntegracoes()).resolves.toBeUndefined();

    expect(erroSpy).toHaveBeenCalledWith(
      expect.stringContaining('Falha inesperada no processamento da fila'),
      expect.any(Error),
    );
  });
});

describe('OrquestradorFilaWorker — onApplicationBootstrap (sweep de partida)', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      instanciaDeProcesso: { update: jest.fn() },
    } as unknown as PrismaService;
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    const anthropicService = {
      parseStructured: jest.fn(),
    } as unknown as AnthropicService;
    const skillExecutorService = {
      executar: jest.fn(),
    } as unknown as SkillExecutorService;
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const evolutionApi = {
      enviarMensagem: jest.fn(),
    } as unknown as EvolutionApiAdapterService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService;
    return {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    };
  }

  it('na subida da aplicação, recupera incondicionalmente toda execução "processing" de agente e de integração encontrada', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    // Sem nenhum limiar de tempo/idade envolvido: o Set em memória está
    // garantidamente vazio recém-subido o processo, então qualquer linha
    // "processing" encontrada aqui só pode ser resquício de uma instância
    // anterior — não há tráfego legítimo "em voo" possível ainda.
    const execucaoDeAgenteTravada = {
      id: 'exec-agente-1',
      instanciaId: 'inst-1',
    };
    const execucaoDeIntegracaoTravada = {
      id: 'exec-integracao-1',
      instanciaId: 'inst-2',
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([execucaoDeAgenteTravada]) // sweep de 'agente'
      .mockResolvedValueOnce([execucaoDeIntegracaoTravada]); // sweep de 'integracao'
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );

    await worker.onApplicationBootstrap();

    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'processing', ator: 'agente', id: { notIn: [] } },
    });
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenNthCalledWith(2, {
      where: { status: 'processing', ator: 'integracao', id: { notIn: [] } },
    });
    expect(prisma.execucaoDeEtapa.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-agente-1', status: 'processing' },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(prisma.execucaoDeEtapa.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-integracao-1', status: 'processing' },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { status: 'erro' },
    });
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
      where: { id: 'inst-2' },
      data: { status: 'erro' },
    });
  });

  it('não propaga uma falha do sweep de partida (ex.: blip transitório do banco) — a API não pode cair por causa disso', async () => {
    const {
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    } = buildDeps();
    // main.ts's bootstrap() não tem .catch(): se isso escapasse como uma
    // rejeição não tratada, derrubaria o processo inteiro (todos os
    // endpoints HTTP), não só o worker — bem pior do que a recuperação de
    // travadas simplesmente não rodar nesta subida (o @Interval periódico
    // tenta de novo em 5s).
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockRejectedValueOnce(new Error('Supabase indisponível'))
      .mockResolvedValueOnce([]);
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      skillExecutorService,
      engine,
      evolutionApi,
      config,
    );
    const erroSpy = jest.spyOn(worker['logger'], 'error');

    await expect(worker.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(erroSpy).toHaveBeenCalledWith(
      expect.stringContaining('sweep de partida'),
      expect.any(Error),
    );
    // O sweep de 'integracao' ainda roda mesmo com o de 'agente' tendo
    // falhado — cada chamada tem seu próprio try/catch independente.
    expect(prisma.execucaoDeEtapa.findMany).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest orquestrador-fila.worker.spec.ts`
Expected: FAIL — `OrquestradorFilaWorker` ainda tem 5 parâmetros no construtor, não 6.

- [ ] **Step 3: Editar `orquestrador-fila.worker.ts` — imports**

Em `backend/src/orquestrador/orquestrador-fila.worker.ts:1-19`, trocar:

```ts
import type {
  Agente,
  AtorExecucao,
  Etapa,
  ExecucaoDeEtapa,
  InstanciaDeProcesso,
  Prisma,
  Skill,
} from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from '../skill/schema-builder';
import { descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';
import { OrquestradorEngineService } from './orquestrador-engine.service';
```

por:

```ts
import type {
  Agente,
  AtorExecucao,
  ConsultaParametrizada,
  Etapa,
  ExecucaoDeEtapa,
  InstanciaDeProcesso,
  Modulo,
  Prisma,
  Skill,
} from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../chat/anthropic.service';
import { SkillExecutorService } from '../skill/skill-executor.service';
import type { CampoSaida } from '../skill/schema-builder';
import { descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';
import { OrquestradorEngineService } from './orquestrador-engine.service';
```

- [ ] **Step 4: Editar `orquestrador-fila.worker.ts` — tipos e remoção de `montarSystemPromptDaEtapa`**

Em `backend/src/orquestrador/orquestrador-fila.worker.ts:21-44` (o trecho entre os dois `type` e a
função `montarSystemPromptDaEtapa`), trocar:

```ts
type ExecucaoDeAgente = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null; skill: Skill | null };
};

type ExecucaoDeIntegracao = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null };
};

function montarSystemPromptDaEtapa(agente: Agente, skill: Skill): string {
  const partes = [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a etapa "${skill.objetivo}" de um processo automatizado.`,
  ];
  if (agente.guardrails?.trim())
    partes.push(`RESTRIÇÕES (nunca viole):\n${agente.guardrails.trim()}`);
  if (agente.regraEscalonamento?.trim())
    partes.push(
      `ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`,
    );
  return partes.join('\n\n');
}
```

por:

```ts
type ExecucaoDeAgente = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & {
    agente: (Agente & { modulo: Modulo }) | null;
    skill: (Skill & { ferramentas: ConsultaParametrizada[] }) | null;
  };
};

type ExecucaoDeIntegracao = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null };
};
```

- [ ] **Step 5: Editar `orquestrador-fila.worker.ts` — construtor**

Trocar:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicService: AnthropicService,
    private readonly engine: OrquestradorEngineService,
    private readonly evolutionApi: EvolutionApiAdapterService,
    private readonly config: ConfigService,
  ) {}
```

por:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicService: AnthropicService,
    private readonly skillExecutorService: SkillExecutorService,
    private readonly engine: OrquestradorEngineService,
    private readonly evolutionApi: EvolutionApiAdapterService,
    private readonly config: ConfigService,
  ) {}
```

- [ ] **Step 6: Editar `orquestrador-fila.worker.ts` — `include` da query em `processarFilaAgentes`**

Trocar:

```ts
      const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
        where: { status: 'pending', ator: 'agente' },
        orderBy: { criadoEm: 'asc' },
        take: 5,
        include: {
          instancia: true,
          etapa: { include: { agente: true, skill: true } },
        },
      })) as ExecucaoDeAgente[];
```

por:

```ts
      const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
        where: { status: 'pending', ator: 'agente' },
        orderBy: { criadoEm: 'asc' },
        take: 5,
        include: {
          instancia: true,
          etapa: {
            include: {
              agente: { include: { modulo: true } },
              skill: { include: { ferramentas: true } },
            },
          },
        },
      })) as ExecucaoDeAgente[];
```

- [ ] **Step 7: Editar `orquestrador-fila.worker.ts` — corpo de `processarExecucaoDeAgente`**

Trocar:

```ts
    const entrada = this.montarEntrada(instancia, etapa);
    const schema = construirSchemaSaida(
      etapa.skill.camposSaida as unknown as CampoSaida[],
    );
    const response = await this.anthropicService.parseStructured({
      system: montarSystemPromptDaEtapa(etapa.agente, etapa.skill),
      mensagem: JSON.stringify(entrada),
      model: etapa.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });

    if (!response.parsed_output) {
      throw new Error(
        'A saída do agente não pôde ser validada contra o schema da skill',
      );
    }

    // Marcar a execução como "done" com a saída E acumular a saída em
    // InstanciaDeProcesso.dadosAcumulados são uma única operação lógica: se
    // uma delas falhar, a outra não pode ter sido persistida (mesmo padrão de
    // fluxo.service.ts's clonarComoRascunho e orquestrador-engine.service.ts).
    const dadosAcumulados = {
      ...(instancia.dadosAcumulados as Record<string, unknown>),
      [etapa.id]: response.parsed_output,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.update({
        where: { id: execucao.id },
        data: {
          status: 'done',
          output: response.parsed_output as Prisma.InputJsonValue,
          tokensEntrada: response.usage.input_tokens,
          tokensSaida: response.usage.output_tokens,
          concluidoEm: new Date(),
```

por:

```ts
    const entrada = this.montarEntrada(instancia, etapa);
    const { output, usage } = await this.skillExecutorService.executar({
      agente: etapa.agente,
      modulo: etapa.agente.modulo,
      skill: {
        objetivo: etapa.skill.objetivo,
        camposSaida: etapa.skill.camposSaida as unknown as CampoSaida[],
        ferramentas: etapa.skill.ferramentas,
      },
      entrada: JSON.stringify(entrada),
    });

    if (!output) {
      throw new Error(
        'A saída do agente não pôde ser validada contra o schema da skill',
      );
    }

    // Marcar a execução como "done" com a saída E acumular a saída em
    // InstanciaDeProcesso.dadosAcumulados são uma única operação lógica: se
    // uma delas falhar, a outra não pode ter sido persistida (mesmo padrão de
    // fluxo.service.ts's clonarComoRascunho e orquestrador-engine.service.ts).
    const dadosAcumulados = {
      ...(instancia.dadosAcumulados as Record<string, unknown>),
      [etapa.id]: output,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.update({
        where: { id: execucao.id },
        data: {
          status: 'done',
          output: output as Prisma.InputJsonValue,
          tokensEntrada: usage.input_tokens,
          tokensSaida: usage.output_tokens,
          concluidoEm: new Date(),
```

(O resto do método, a partir de `mensagemErro: null,`, fica inalterado.)

- [ ] **Step 8: Atualizar `orquestrador.module.ts`**

Em `backend/src/orquestrador/orquestrador.module.ts`, adicionar o import e incluir nos `imports`:

```ts
import { SkillExecutorModule } from '../skill/skill-executor.module';
```

E trocar:

```ts
  imports: [
    AuthModule,
    AuditModule,
    ModuloModule,
    AnthropicModule,
    IntegracaoWhatsAppModule,
  ],
```

por:

```ts
  imports: [
    AuthModule,
    AuditModule,
    ModuloModule,
    AnthropicModule,
    IntegracaoWhatsAppModule,
    SkillExecutorModule,
  ],
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest orquestrador-fila.worker.spec.ts`
Expected: PASS (todos os testes, incluindo o novo caso de ferramentas + instruções).

- [ ] **Step 10: Rodar o build do backend**

Run: `cd backend && npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 11: Commit**

```bash
git add backend/src/orquestrador/orquestrador-fila.worker.ts backend/src/orquestrador/orquestrador.module.ts backend/src/orquestrador/orquestrador-fila.worker.spec.ts
git commit -m "fix(backend): worker do Orquestrador usa ferramentas da skill e instruções do módulo (Achados 1 e 2)"
```

---

## Task 4: Verificação final

**Files:** nenhum (só rodar comandos de verificação).

**Interfaces:** nenhuma — task de fechamento.

- [ ] **Step 1: Rodar a suíte inteira de testes unitários do backend**

Run: `cd backend && npm run test`
Expected: PASS em todos os arquivos (a suíte `prisma.smoke.spec.ts` pode pular se `DATABASE_URL`
não estiver setado — comportamento normal, ver `CLAUDE.md`).

- [ ] **Step 2: Rodar lint**

Run: `cd backend && npm run lint`
Expected: sem erros (warnings de `no-floating-promises`/`no-unsafe-argument` pré-existentes, se
houver, não bloqueiam).

- [ ] **Step 3: Rodar o build**

Run: `cd backend && npm run build`
Expected: sucesso.

- [ ] **Step 4: Revisão manual — confirmar que os dois achados foram fechados**

Conferir:
- `orquestrador-fila.worker.ts` não tem mais `montarSystemPromptDaEtapa` nem chama
  `anthropicService.parseStructured` diretamente pro caminho de agente (só
  `skillExecutorService.executar`).
- A query de `processarFilaAgentes` inclui `skill.ferramentas` e `agente.modulo`.
- `skill-execucao.controller.ts` e `orquestrador-fila.worker.ts` não têm mais nenhuma cópia própria
  de "montar system prompt" — só existe uma, em `skill-executor.service.ts`.

Nenhum commit neste step — é só checagem.
