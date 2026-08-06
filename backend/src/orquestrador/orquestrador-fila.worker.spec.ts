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

  it('reseta a instância pra "em_andamento" no caminho de sucesso, desfazendo um "erro" deixado por um sweep de travadas anterior (C3)', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
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

    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ status: 'em_andamento' }),
      }),
    );
  });

  it('limpa uma mensagemErro deixada por um sweep de travadas anterior ao concluir com sucesso', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execucaoPendente]);
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

    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'done', mensagemErro: null }),
      }),
    );
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

  it('não propaga uma falha inesperada fora do loop por execução (ex.: blip no recuperarExecucoesTravadas) — o tick não pode derrubar o processo', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    // @nestjs/schedule chama este método via setInterval puro, sem .catch();
    // se esta rejeição escapasse, seria uma unhandled rejection derrubando a
    // API inteira a cada 5s. O try/catch por execução dentro do for não
    // protege esta falha porque ela acontece ANTES do loop, dentro do
    // recuperarExecucoesTravadas.
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Supabase indisponível'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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

  it('reseta a instância pra "em_andamento" no caminho de sucesso do envio de WhatsApp (C3)', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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

  it('recupera uma execução travada em processing que não foi reivindicada por este processo, mesmo recém-criada (sem limiar de tempo)', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 0, // outro tick já reivindicou a linha primeiro
    });
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.execucaoDeEtapa.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error('conexão perdida'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Supabase indisponível'),
    );
    const worker = new OrquestradorFilaWorker(
      prisma,
      anthropicService,
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

  it('na subida da aplicação, recupera incondicionalmente toda execução "processing" de agente e de integração encontrada', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
    const { prisma, anthropicService, engine, evolutionApi, config } =
      buildDeps();
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
