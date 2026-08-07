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
