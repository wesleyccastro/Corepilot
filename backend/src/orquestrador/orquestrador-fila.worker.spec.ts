import { OrquestradorFilaWorker } from './orquestrador-fila.worker';
import type { PrismaService } from '../prisma/prisma.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { OrquestradorEngineService } from './orquestrador-engine.service';

describe('OrquestradorFilaWorker — processarFilaAgentes', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: { findMany: jest.fn(), update: jest.fn() },
      instanciaDeProcesso: { update: jest.fn() },
    } as unknown as PrismaService;
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    const anthropicService = {
      parseStructured: jest.fn(),
    } as unknown as AnthropicService;
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    return { prisma, anthropicService, engine };
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
      },
      skill: {
        objetivo: 'Agrupar itens por família',
        camposSaida: [{ nome: 'grupos', tipo: 'string[]', obrigatorio: true }],
      },
    },
  };

  it('processa uma execução de agente pendente, grava a saída e avança', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([
      execucaoPendente,
    ]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'processing' }),
      }),
    );
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

  it('filtra a entrada da Skill pelas entradaRefs da etapa', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
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
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([
      execucaoComMaisDados,
    ]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    const mensagemEnviada = (anthropicService.parseStructured as jest.Mock).mock
      .calls[0][0].mensagem as string;
    expect(mensagemEnviada).toContain('itens');
    expect(mensagemEnviada).not.toContain('irrelevante');
  });

  it('marca a execução e a instância como falha quando a Anthropic lança erro', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([
      execucaoPendente,
    ]);
    (anthropicService.parseStructured as jest.Mock).mockRejectedValue(
      new Error('timeout'),
    );
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

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
    const { prisma, anthropicService, engine } = buildDeps();
    const segunda = {
      ...execucaoPendente,
      id: 'exec-2',
      instanciaId: 'inst-2',
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([
      execucaoPendente,
      segunda,
    ]);
    (anthropicService.parseStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        parsed_output: { grupos: [] },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    expect(engine.avancar).toHaveBeenCalledWith('inst-2', 'e-2');
  });

  it('mantém a execução "done" quando avancar falha depois do commit', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([
      execucaoPendente,
    ]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    (engine.avancar as jest.Mock).mockRejectedValue(
      new Error('falha ao avançar'),
    );
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

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
});
