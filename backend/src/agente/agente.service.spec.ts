import { NotFoundException } from '@nestjs/common';
import { AgenteService } from './agente.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('AgenteService', () => {
  function buildDeps() {
    const prisma = {
      agente: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria um agente depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.agente.create as jest.Mock).mockResolvedValue({ id: 'agente-1' });
    const service = new AgenteService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'empresa-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos de compra',
      objetivo: 'Ajudar o time de compras a triar solicitações',
    });

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.agente.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        moduloId: 'modulo-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: undefined,
      },
    });
    expect(resultado).toEqual({ id: 'agente-1' });
  });

  it('propaga o NotFoundException se o módulo não for da empresa (não cria o agente)', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new AgenteService(prisma, moduloService);

    await expect(
      service.create('modulo-x', 'empresa-1', { nome: 'X', funcao: 'Y', objetivo: 'Z' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.agente.create).not.toHaveBeenCalled();
  });

  it('lista agentes só do módulo informado', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.agente.findMany as jest.Mock).mockResolvedValue([]);
    const service = new AgenteService(prisma, moduloService);

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.agente.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se o agente não existir ou não for da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.agente.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AgenteService(prisma, moduloService);

    await expect(service.findByIdInEmpresa('agente-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.agente.findFirst).toHaveBeenCalledWith({
      where: { id: 'agente-x', empresaId: 'empresa-1' },
    });
  });

  it('findByIdInEmpresa retorna o agente quando encontrado', async () => {
    const { prisma, moduloService } = buildDeps();
    const agente = { id: 'agente-1', empresaId: 'empresa-1' };
    (prisma.agente.findFirst as jest.Mock).mockResolvedValue(agente);
    const service = new AgenteService(prisma, moduloService);

    const resultado = await service.findByIdInEmpresa('agente-1', 'empresa-1');

    expect(resultado).toBe(agente);
  });
});
