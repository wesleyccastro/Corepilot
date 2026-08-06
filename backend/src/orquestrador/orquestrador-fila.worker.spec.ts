import { OrquestradorFilaWorker } from './orquestrador-fila.worker';
import type { PrismaService } from '../prisma/prisma.service';
import type { AnthropicService } from '../chat/anthropic.service';
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
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const evolutionApi = {
      enviarMensagem: jest.fn(),
    } as unknown as EvolutionApiAdapterService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService;
    return { prisma, anthropicService, engine, evolutionApi, config };
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // recuperarExecucoesTravadas
      .mockResolvedValueOnce([execucaoPendente]); // pendentes
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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

  it('filtra a entrada da Skill pelas entradaRefs da etapa', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    const mensagemEnviada = (anthropicService.parseStructured as jest.Mock).mock
      .calls[0][0].mensagem as string;
    expect(mensagemEnviada).toContain('itens');
    expect(mensagemEnviada).not.toContain('irrelevante');
  });

  it('marca a execução e a instância como falha quando a Anthropic lança erro', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (anthropicService.parseStructured as jest.Mock).mockRejectedValue(
      new Error('timeout'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    const segunda = {
      ...execucaoPendente,
      id: 'exec-2',
      instanciaId: 'inst-2',
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente, segunda]);
    (anthropicService.parseStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        parsed_output: { grupos: [] },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaAgentes();

    expect(engine.avancar).toHaveBeenCalledWith('inst-2', 'e-2');
  });

  it('mantém a execução "done" quando avancar falha depois do commit', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    (engine.avancar as jest.Mock).mockRejectedValue(
      new Error('falha ao avançar'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const engine = {
      avancar: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const evolutionApi = {
      enviarMensagem: jest.fn(),
    } as unknown as EvolutionApiAdapterService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService;
    return { prisma, anthropicService, engine, evolutionApi, config };
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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

  it('numa etapa agente_mais_integracao, redige a mensagem com a Anthropic antes de enviar', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();
    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).toHaveBeenCalledTimes(1);
    expect(engine.avancar).toHaveBeenCalledTimes(1);
  });

  it('recupera execução travada em processing além do limite, marcando falha sem reenviar', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    const execucaoTravada = { id: 'exec-travada', instanciaId: 'inst-2' };
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([execucaoTravada]) // recuperarExecucoesTravadas encontra a linha travada
      .mockResolvedValueOnce([]); // nada pending pra processar depois
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
      engine,
      evolutionApi,
      config,
    );

    await worker.processarFilaIntegracoes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenCalledWith({
      where: { id: 'exec-travada' },
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
});
