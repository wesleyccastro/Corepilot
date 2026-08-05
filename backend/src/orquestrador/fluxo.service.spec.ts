import { NotFoundException } from '@nestjs/common';
import { FluxoService } from './fluxo.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('FluxoService', () => {
  function buildDeps() {
    const prisma = {
      fluxo: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      macroetapa: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
      },
      etapa: { create: jest.fn(), update: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria um rascunho vazio quando o módulo nunca teve um fluxo', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.fluxo.create as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      moduloId: 'modulo-1',
      versao: 1,
      publicado: false,
      macroetapas: [],
      etapas: [],
    });
    const service = new FluxoService(prisma, moduloService);

    const rascunho = await service.getOrCreateRascunho('modulo-1', 'empresa-1');

    expect(rascunho.versao).toBe(1);
    expect(prisma.fluxo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { moduloId: 'modulo-1', versao: 1, publicado: false },
      }),
    );
  });

  it('devolve o rascunho existente sem criar um novo', async () => {
    const { prisma, moduloService } = buildDeps();
    const rascunhoExistente = {
      id: 'fluxo-2',
      publicado: false,
      macroetapas: [],
      etapas: [],
    };
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce(
      rascunhoExistente,
    );
    const service = new FluxoService(prisma, moduloService);

    const resultado = await service.getOrCreateRascunho(
      'modulo-1',
      'empresa-1',
    );

    expect(resultado).toBe(rascunhoExistente);
    expect(prisma.fluxo.create).not.toHaveBeenCalled();
  });

  it('clona a última versão publicada como novo rascunho quando não há rascunho aberto', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // sem rascunho
      .mockResolvedValueOnce({
        id: 'fluxo-1',
        moduloId: 'modulo-1',
        versao: 1,
        macroetapas: [{ id: 'me-1', nome: 'Triagem', ordem: 0 }],
        etapas: [
          {
            id: 'e-1',
            macroetapaId: 'me-1',
            ordem: 0,
            nome: 'Solicitação recebida',
            tipo: 'decisao_automatica',
            executor: 'automatico',
            prazoDias: null,
            agenteId: null,
            skillId: null,
            autonomia: null,
            aprovadores: [],
            camposUsuario: [],
            loopParaEtapaId: null,
            entradaRefs: [],
          },
        ],
      }); // última publicada
    (prisma.fluxo.create as jest.Mock).mockResolvedValue({
      id: 'fluxo-2',
      moduloId: 'modulo-1',
      versao: 2,
    });
    (prisma.macroetapa.create as jest.Mock).mockResolvedValue({ id: 'me-2' });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-2' });
    (prisma.fluxo.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'fluxo-2',
      versao: 2,
      macroetapas: [{ id: 'me-2' }],
      etapas: [{ id: 'e-2' }],
    });
    const service = new FluxoService(prisma, moduloService);

    const rascunho = await service.getOrCreateRascunho('modulo-1', 'empresa-1');

    expect(prisma.fluxo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { moduloId: 'modulo-1', versao: 2, publicado: false },
      }),
    );
    expect(rascunho.versao).toBe(2);
  });

  it('cria uma macroetapa no fluxo em rascunho, na próxima posição', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'fluxo-1',
      macroetapas: [{ id: 'me-1' }],
      etapas: [],
    });
    (prisma.macroetapa.create as jest.Mock).mockResolvedValue({
      id: 'me-2',
      nome: 'Cotação',
      ordem: 1,
    });
    const service = new FluxoService(prisma, moduloService);

    await service.criarMacroetapa('modulo-1', 'empresa-1', { nome: 'Cotação' });

    expect(prisma.macroetapa.create).toHaveBeenCalledWith({
      data: { fluxoId: 'fluxo-1', nome: 'Cotação', ordem: 1 },
    });
  });

  it('rejeita excluir uma macroetapa que ainda tem etapas', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({
      id: 'me-1',
      fluxoId: 'fluxo-1',
    });
    (prisma.etapa.count as jest.Mock).mockResolvedValue(2);
    const service = new FluxoService(prisma, moduloService);

    await expect(
      service.excluirMacroetapa('modulo-1', 'empresa-1', 'me-1'),
    ).rejects.toThrow('Não é possível excluir uma coluna com etapas');
  });

  it('lança NotFoundException ao editar uma macroetapa de outro fluxo', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new FluxoService(prisma, moduloService);

    await expect(
      service.atualizarMacroetapa(
        'modulo-1',
        'empresa-1',
        'me-de-outro-fluxo',
        { nome: 'X' },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
