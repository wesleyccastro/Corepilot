import { NotFoundException } from '@nestjs/common';
import { ConsultaService } from './consulta.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';
import type { FonteDeDadosService } from '../fonte-de-dados/fonte-de-dados.service';

describe('ConsultaService', () => {
  function buildDeps() {
    const prisma = {
      consultaParametrizada: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    const fonteDeDadosService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as FonteDeDadosService;
    return { prisma, moduloService, fonteDeDadosService };
  }

  const dto = {
    fonteDeDadosId: 'fonte-1',
    nome: 'Saldo de estoque',
    codSentenca: 'SALDOESTOQUEINSU',
    parametrosSincronizacao: { CODFILIAL: '001' },
    camposFiltro: [
      { nome: 'codProduto', tipo: 'string' as const, obrigatorio: true },
    ],
  };

  it('cria uma consulta depois de validar módulo e fonte de dados na empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
    });
    (fonteDeDadosService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'fonte-1',
    });
    (prisma.consultaParametrizada.create as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
    });
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    const resultado = await service.create('modulo-1', 'empresa-1', dto);

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
    );
    expect(fonteDeDadosService.findByIdInEmpresa).toHaveBeenCalledWith(
      'fonte-1',
      'empresa-1',
    );
    expect(prisma.consultaParametrizada.create).toHaveBeenCalledWith({
      data: {
        moduloId: 'modulo-1',
        fonteDeDadosId: 'fonte-1',
        nome: 'Saldo de estoque',
        codSentenca: 'SALDOESTOQUEINSU',
        parametrosSincronizacao: { CODFILIAL: '001' },
        camposFiltro: dto.camposFiltro,
      },
    });
    expect(resultado).toEqual({ id: 'consulta-1' });
  });

  it('propaga NotFoundException se o módulo não for da empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(
      new NotFoundException(),
    );
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    await expect(service.create('modulo-x', 'empresa-1', dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.consultaParametrizada.create).not.toHaveBeenCalled();
  });

  it('propaga NotFoundException se a fonte de dados não for da empresa', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
    });
    (fonteDeDadosService.findByIdInEmpresa as jest.Mock).mockRejectedValue(
      new NotFoundException(),
    );
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    await expect(service.create('modulo-1', 'empresa-1', dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.consultaParametrizada.create).not.toHaveBeenCalled();
  });

  it('lista consultas só do módulo informado', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
    });
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(prisma.consultaParametrizada.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se não encontrar', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (prisma.consultaParametrizada.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    await expect(
      service.findByIdInEmpresa('consulta-x', 'empresa-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.consultaParametrizada.findFirst).toHaveBeenCalledWith({
      where: { id: 'consulta-x', modulo: { empresaId: 'empresa-1' } },
      include: { fonteDeDados: true },
    });
  });

  it('atualizarSincronizacao valida posse antes de atualizar', async () => {
    const { prisma, moduloService, fonteDeDadosService } = buildDeps();
    (prisma.consultaParametrizada.findFirst as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
    });
    (prisma.consultaParametrizada.update as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      sincronizacaoAtiva: true,
    });
    const service = new ConsultaService(
      prisma,
      moduloService,
      fonteDeDadosService,
    );

    await service.atualizarSincronizacao('consulta-1', 'empresa-1', true, 60);

    expect(prisma.consultaParametrizada.update).toHaveBeenCalledWith({
      where: { id: 'consulta-1' },
      data: { sincronizacaoAtiva: true, intervaloSincronizacaoMinutos: 60 },
    });
  });
});
