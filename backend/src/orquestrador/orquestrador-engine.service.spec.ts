import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('OrquestradorEngineService', () => {
  function buildPrisma() {
    const prisma = {
      fluxo: { findFirst: jest.fn() },
      etapa: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn() },
      instanciaDeProcesso: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
      },
      execucaoDeEtapa: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
      },
    };
    return {
      ...prisma,
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as PrismaService;
  }

  const etapaAutomatica = {
    id: 'e-1',
    fluxoId: 'fluxo-1',
    ordem: 0,
    tipo: 'decisao_automatica' as const,
    executor: 'automatico' as const,
  };
  const etapaAgente = {
    id: 'e-2',
    fluxoId: 'fluxo-1',
    ordem: 1,
    tipo: 'tarefa_agente' as const,
    executor: 'agente' as const,
  };
  const etapaAprovacao = {
    id: 'e-3',
    fluxoId: 'fluxo-1',
    ordem: 2,
    tipo: 'aprovacao' as const,
    executor: 'usuario' as const,
    loopParaEtapaId: 'e-2',
    aprovadores: ['Comprador'],
  };

  describe('criarInstancia', () => {
    it('lança NotFoundException se o módulo não tem fluxo publicado', async () => {
      const prisma = buildPrisma();
      (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(
        service.criarInstancia('modulo-1', 'empresa-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('cria a instância na primeira etapa e, sendo automática, avança sozinha até a próxima etapa parada', async () => {
      const prisma = buildPrisma();
      (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
        id: 'fluxo-1',
        etapas: [etapaAutomatica, etapaAgente],
      });
      (prisma.instanciaDeProcesso.create as jest.Mock).mockResolvedValue({
        id: 'inst-1',
        etapaAtualId: 'e-1',
        dadosAcumulados: {},
      });
      (prisma.etapa.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(etapaAutomatica) // entrarNaEtapa(e-1)
        .mockResolvedValueOnce(etapaAutomatica); // avancar() lê a etapa de origem
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(etapaAgente); // próxima etapa (ordem 1)
      (
        prisma.instanciaDeProcesso.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue({ id: 'inst-1', etapaAtualId: 'e-2' });
      const service = new OrquestradorEngineService(prisma);

      await service.criarInstancia('modulo-1', 'empresa-1', {
        origem: 'teste',
      });

      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ etapaId: 'e-1', status: 'done' }),
        }),
      );
      // avançou pra e-2 (agente) e criou a execução pending correspondente, sem concluir de novo
      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ etapaAtualId: 'e-2' }),
        }),
      );
      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            etapaId: 'e-2',
            status: 'pending',
            ator: 'agente',
          }),
        }),
      );
    });
  });

  describe('avancar', () => {
    it('marca a instância como concluído quando não há próxima etapa', async () => {
      const prisma = buildPrisma();
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        etapaAprovacao,
      );
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await service.avancar('inst-1', 'e-3');

      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({
        where: { id: 'inst-1' },
        data: { status: 'concluido' },
      });
    });
  });

  describe('executarAcao', () => {
    it('rejeita uma ação que não existe pra etapa atual', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({
        id: 'inst-1',
        empresaId: 'empresa-1',
        etapaAtualId: 'e-3',
        dadosAcumulados: {},
      });
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        etapaAprovacao,
      );
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(
        service.executarAcao(
          'inst-1',
          'empresa-1',
          'acao-inexistente',
          {},
          'usuario-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita "solicitar_ajustes" sem o campo motivo_correcao', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({
        id: 'inst-1',
        empresaId: 'empresa-1',
        etapaAtualId: 'e-3',
        dadosAcumulados: {},
      });
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        etapaAprovacao,
      );
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(
        service.executarAcao(
          'inst-1',
          'empresa-1',
          'solicitar_ajustes',
          {},
          'usuario-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('"solicitar_ajustes" com motivo volta pra etapa de loop e reexecuta com um novo número de execução', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({
        id: 'inst-1',
        empresaId: 'empresa-1',
        etapaAtualId: 'e-3',
        dadosAcumulados: {},
      });
      (prisma.etapa.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(etapaAprovacao) // etapa atual, dentro de executarAcao
        .mockResolvedValueOnce(etapaAgente); // entrarNaEtapa(e-2), etapa de destino do loop
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null); // sem próxima depois de e-3 (não usado neste caminho)
      (prisma.execucaoDeEtapa.count as jest.Mock)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1); // 2ª execução de e-3, e já havia 1 de e-2
      (
        prisma.instanciaDeProcesso.findUniqueOrThrow as jest.Mock
      ).mockResolvedValue({ id: 'inst-1', etapaAtualId: 'e-2' });
      const service = new OrquestradorEngineService(prisma);

      await service.executarAcao(
        'inst-1',
        'empresa-1',
        'solicitar_ajustes',
        { motivo_correcao: 'preço alto' },
        'usuario-1',
      );

      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ etapaAtualId: 'e-2' }),
        }),
      );
      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            etapaId: 'e-2',
            numeroDaExecucao: 2,
            status: 'pending',
          }),
        }),
      );
    });
  });
});
