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
        findMany: jest.fn(),
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

  it('renumera as macroetapas restantes após excluir uma do início, evitando colisão de ordem na próxima criação', async () => {
    const { prisma, moduloService } = buildDeps();
    const fluxo: {
      id: string;
      macroetapas: Array<{
        id: string;
        fluxoId: string;
        nome: string;
        ordem: number;
      }>;
      etapas: unknown[];
    } = {
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    };
    const macroetapasDb = new Map<
      string,
      { id: string; fluxoId: string; nome: string; ordem: number }
    >();
    let proximoId = 1;

    const sincronizarFluxo = () => {
      fluxo.macroetapas = Array.from(macroetapasDb.values()).sort(
        (a, b) => a.ordem - b.ordem,
      );
    };

    (prisma.fluxo.findFirst as jest.Mock).mockImplementation(() =>
      Promise.resolve(fluxo),
    );
    (prisma.macroetapa.create as jest.Mock).mockImplementation(
      ({
        data,
      }: {
        data: { fluxoId: string; nome: string; ordem: number };
      }) => {
        const registro = {
          id: `me-${proximoId++}`,
          fluxoId: data.fluxoId,
          nome: data.nome,
          ordem: data.ordem,
        };
        macroetapasDb.set(registro.id, registro);
        sincronizarFluxo();
        return Promise.resolve(registro);
      },
    );
    (prisma.macroetapa.findFirst as jest.Mock).mockImplementation(
      ({ where }: { where: { id: string; fluxoId: string } }) => {
        const registro = macroetapasDb.get(where.id);
        return Promise.resolve(
          registro && registro.fluxoId === where.fluxoId ? registro : null,
        );
      },
    );
    (prisma.macroetapa.findMany as jest.Mock).mockImplementation(
      ({ where }: { where: { fluxoId: string } }) => {
        const restantes = Array.from(macroetapasDb.values())
          .filter((m) => m.fluxoId === where.fluxoId)
          .sort((a, b) => a.ordem - b.ordem);
        return Promise.resolve(restantes);
      },
    );
    (prisma.macroetapa.update as jest.Mock).mockImplementation(
      ({ where, data }: { where: { id: string }; data: { ordem: number } }) => {
        const registro = macroetapasDb.get(where.id)!;
        registro.ordem = data.ordem;
        sincronizarFluxo();
        return Promise.resolve(registro);
      },
    );
    (prisma.macroetapa.delete as jest.Mock).mockImplementation(
      ({ where }: { where: { id: string } }) => {
        const registro = macroetapasDb.get(where.id)!;
        macroetapasDb.delete(where.id);
        sincronizarFluxo();
        return Promise.resolve(registro);
      },
    );
    (prisma.etapa.count as jest.Mock).mockResolvedValue(0);
    const service = new FluxoService(prisma, moduloService);

    await service.criarMacroetapa('modulo-1', 'empresa-1', { nome: 'Triagem' }); // ordem 0
    await service.criarMacroetapa('modulo-1', 'empresa-1', { nome: 'Cotação' }); // ordem 1
    await service.criarMacroetapa('modulo-1', 'empresa-1', {
      nome: 'Aprovação',
    }); // ordem 2

    const idOrdemZero = Array.from(macroetapasDb.values()).find(
      (m) => m.ordem === 0,
    )!.id;
    await service.excluirMacroetapa('modulo-1', 'empresa-1', idOrdemZero);

    const restantesOrdenados = Array.from(macroetapasDb.values()).sort(
      (a, b) => a.ordem - b.ordem,
    );
    expect(restantesOrdenados.map((m) => m.ordem)).toEqual([0, 1]);
    expect(restantesOrdenados.map((m) => m.nome)).toEqual([
      'Cotação',
      'Aprovação',
    ]);

    await service.criarMacroetapa('modulo-1', 'empresa-1', { nome: 'Entrega' });

    const todasAsOrdens = Array.from(macroetapasDb.values()).map(
      (m) => m.ordem,
    );
    expect(new Set(todasAsOrdens).size).toBe(todasAsOrdens.length); // sem colisão
    expect(
      macroetapasDb.get(
        Array.from(macroetapasDb.values()).find((m) => m.nome === 'Entrega')!
          .id,
      )!.ordem,
    ).toBe(2);
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

describe('FluxoService — Etapa', () => {
  function buildDeps() {
    const prisma = {
      fluxo: { findFirst: jest.fn(), create: jest.fn() },
      macroetapa: { findFirst: jest.fn() },
      etapa: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria uma etapa com o executor padrão do tipo, quando nenhum é informado', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      macroetapas: [{ id: 'me-1' }],
      etapas: [],
    });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({
      id: 'me-1',
      fluxoId: 'fluxo-1',
    });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'Comprador valida',
      tipo: 'aprovacao',
      macroetapaId: 'me-1',
    });

    expect(prisma.etapa.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ executor: 'usuario' }),
      }),
    );
  });

  it('ignora um executor informado que não é válido pro tipo, usando o padrão', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({
      id: 'me-1',
      fluxoId: 'fluxo-1',
    });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'X',
      tipo: 'decisao_automatica',
      macroetapaId: 'me-1',
      executor: 'agente',
    });

    expect(prisma.etapa.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ executor: 'automatico' }),
      }),
    );
  });

  it('trocar o tipo reseta o executor pro padrão do novo tipo, se o atual não for mais válido', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    });
    (prisma.etapa.findFirst as jest.Mock).mockResolvedValue({
      id: 'e-1',
      fluxoId: 'fluxo-1',
      tipo: 'aprovacao',
      executor: 'usuario',
      nome: 'X',
      macroetapaId: 'me-1',
      prazoDias: null,
      agenteId: null,
      skillId: null,
      autonomia: null,
      aprovadores: [],
      loopParaEtapaId: null,
      entradaRefs: [],
      camposUsuario: [],
    });
    (prisma.etapa.update as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.atualizarEtapa('modulo-1', 'empresa-1', 'e-1', {
      tipo: 'tarefa_agente',
    });

    expect(prisma.etapa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'tarefa_agente',
          executor: 'agente',
        }),
      }),
    );
  });

  it('excluir uma etapa limpa o loopParaEtapaId de quem apontava pra ela', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      macroetapas: [],
      etapas: [],
    });
    (prisma.etapa.findFirst as jest.Mock).mockResolvedValue({
      id: 'e-1',
      fluxoId: 'fluxo-1',
    });
    const service = new FluxoService(prisma, moduloService);

    await service.excluirEtapa('modulo-1', 'empresa-1', 'e-1');

    expect(prisma.etapa.updateMany).toHaveBeenCalledWith({
      where: { fluxoId: 'fluxo-1', loopParaEtapaId: 'e-1' },
      data: { loopParaEtapaId: null },
    });
    expect(prisma.etapa.delete).toHaveBeenCalledWith({
      where: { id: 'e-1' },
    });
  });

  it('renumera as etapas restantes após excluir uma do início, evitando colisão de ordem na próxima criação', async () => {
    const { moduloService } = buildDeps();
    const fluxo: {
      id: string;
      macroetapas: Array<{ id: string; fluxoId: string }>;
      etapas: Array<{
        id: string;
        fluxoId: string;
        nome: string;
        ordem: number;
      }>;
    } = {
      id: 'fluxo-1',
      macroetapas: [{ id: 'me-1', fluxoId: 'fluxo-1' }],
      etapas: [],
    };
    const etapasDb = new Map<
      string,
      { id: string; fluxoId: string; nome: string; ordem: number }
    >();
    let proximoId = 1;

    const sincronizarFluxo = () => {
      fluxo.etapas = Array.from(etapasDb.values()).sort(
        (a, b) => a.ordem - b.ordem,
      );
    };

    const prisma = {
      fluxo: { findFirst: jest.fn(() => Promise.resolve(fluxo)) },
      macroetapa: {
        findFirst: jest.fn(
          ({ where }: { where: { id: string; fluxoId: string } }) =>
            Promise.resolve(
              fluxo.macroetapas.find(
                (m) => m.id === where.id && m.fluxoId === where.fluxoId,
              ) ?? null,
            ),
        ),
      },
      etapa: {
        create: jest.fn(
          ({
            data,
          }: {
            data: { fluxoId: string; nome: string; ordem: number };
          }) => {
            const registro = {
              id: `e-${proximoId++}`,
              fluxoId: data.fluxoId,
              nome: data.nome,
              ordem: data.ordem,
            };
            etapasDb.set(registro.id, registro);
            sincronizarFluxo();
            return Promise.resolve(registro);
          },
        ),
        findFirst: jest.fn(
          ({ where }: { where: { id: string; fluxoId: string } }) => {
            const registro = etapasDb.get(where.id);
            return Promise.resolve(
              registro && registro.fluxoId === where.fluxoId ? registro : null,
            );
          },
        ),
        findMany: jest.fn(({ where }: { where: { fluxoId: string } }) => {
          const restantes = Array.from(etapasDb.values())
            .filter((e) => e.fluxoId === where.fluxoId)
            .sort((a, b) => a.ordem - b.ordem);
          return Promise.resolve(restantes);
        }),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: { ordem: number };
          }) => {
            const registro = etapasDb.get(where.id)!;
            registro.ordem = data.ordem;
            sincronizarFluxo();
            return Promise.resolve(registro);
          },
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(({ where }: { where: { id: string } }) => {
          const registro = etapasDb.get(where.id)!;
          etapasDb.delete(where.id);
          sincronizarFluxo();
          return Promise.resolve(registro);
        }),
      },
    } as unknown as PrismaService;
    const service = new FluxoService(prisma, moduloService);

    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'Triagem',
      tipo: 'decisao_automatica',
      macroetapaId: 'me-1',
    }); // ordem 0
    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'Cotação',
      tipo: 'decisao_automatica',
      macroetapaId: 'me-1',
    }); // ordem 1
    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'Aprovação',
      tipo: 'decisao_automatica',
      macroetapaId: 'me-1',
    }); // ordem 2

    const idOrdemZero = Array.from(etapasDb.values()).find(
      (e) => e.ordem === 0,
    )!.id;
    await service.excluirEtapa('modulo-1', 'empresa-1', idOrdemZero);

    const restantesOrdenados = Array.from(etapasDb.values()).sort(
      (a, b) => a.ordem - b.ordem,
    );
    expect(restantesOrdenados.map((e) => e.ordem)).toEqual([0, 1]);
    expect(restantesOrdenados.map((e) => e.nome)).toEqual([
      'Cotação',
      'Aprovação',
    ]);

    await service.criarEtapa('modulo-1', 'empresa-1', {
      nome: 'Entrega',
      tipo: 'decisao_automatica',
      macroetapaId: 'me-1',
    });

    const todasAsOrdens = Array.from(etapasDb.values()).map((e) => e.ordem);
    expect(new Set(todasAsOrdens).size).toBe(todasAsOrdens.length); // sem colisão
    expect(
      etapasDb.get(
        Array.from(etapasDb.values()).find((e) => e.nome === 'Entrega')!.id,
      )!.ordem,
    ).toBe(2);
  });
});

describe('FluxoService — publicar', () => {
  function buildDeps() {
    const prisma = {
      fluxo: { findFirst: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  const etapaValida = {
    id: 'e-1',
    nome: 'IA confere',
    tipo: 'tarefa_agente' as const,
    executor: 'agente' as const,
    agenteId: 'agente-1',
    skillId: 'skill-1',
    aprovadores: [],
  };

  it('rejeita publicar um fluxo sem etapas', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow(
      'pelo menos uma etapa',
    );
  });

  it('rejeita publicar uma etapa de agente sem skill selecionada', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [{ ...etapaValida, skillId: null }],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow(
      'precisa de um agente e uma skill',
    );
  });

  it('rejeita publicar uma etapa de aprovação sem aprovadores', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [
        {
          id: 'e-2',
          nome: 'Comprador valida',
          tipo: 'aprovacao',
          executor: 'usuario',
          aprovadores: [],
        },
      ],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow(
      'pelo menos um aprovador',
    );
  });

  it('rejeita publicar uma combinação Tipo×Executor inválida', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [
        {
          id: 'e-3',
          nome: 'X',
          tipo: 'interacao_usuario',
          executor: 'automatico',
          aprovadores: [],
        },
      ],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow(
      'combinação de tipo e executor inválida',
    );
  });

  it('publica um fluxo válido', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [etapaValida],
    });
    (prisma.fluxo.update as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      publicado: true,
    });
    const service = new FluxoService(prisma, moduloService);

    const resultado = await service.publicar('modulo-1', 'empresa-1');

    expect(prisma.fluxo.update).toHaveBeenCalledWith({
      where: { id: 'fluxo-1' },
      data: { publicado: true },
    });
    expect(resultado.publicado).toBe(true);
  });
});
