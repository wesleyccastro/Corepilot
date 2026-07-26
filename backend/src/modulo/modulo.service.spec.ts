import { NotFoundException } from '@nestjs/common';
import { ModuloService } from './modulo.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ModuloService', () => {
  function buildPrismaMock() {
    return {
      modulo: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('cria um módulo escopado à empresa informada', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.create as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
      empresaId: 'empresa-1',
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      instrucoes: null,
      modeloIA: 'claude-sonnet-5',
    });
    const service = new ModuloService(prisma);

    const resultado = await service.create('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });

    expect(prisma.modulo.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        nome: 'Compras',
        objetivo: 'Ajudar com compras',
        instrucoes: undefined,
      },
    });
    expect(resultado.id).toBe('modulo-1');
  });

  it('lista só os módulos da empresa informada', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ModuloService(prisma);

    await service.findAllByEmpresa('empresa-1');

    expect(prisma.modulo.findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se o módulo não existir na empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ModuloService(prisma);

    await expect(service.findByIdInEmpresa('modulo-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.modulo.findFirst).toHaveBeenCalledWith({
      where: { id: 'modulo-x', empresaId: 'empresa-1' },
    });
  });

  it('findByIdInEmpresa retorna o módulo se ele existir na empresa', async () => {
    const prisma = buildPrismaMock();
    const modulo = { id: 'modulo-1', empresaId: 'empresa-1' };
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(modulo);
    const service = new ModuloService(prisma);

    const resultado = await service.findByIdInEmpresa('modulo-1', 'empresa-1');

    expect(resultado).toBe(modulo);
  });
});
