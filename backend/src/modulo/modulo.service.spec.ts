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
        update: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('cria um módulo escopado à empresa informada, com campos de identidade visual', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.create as jest.Mock).mockResolvedValue({
      id: 'modulo-1',
      empresaId: 'empresa-1',
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      instrucoes: null,
      descricao: 'Módulo de compras',
      responsavel: 'Marcos Silva',
      areas: 'Matriz',
      icone: 'cart',
      cor: '#0EA5A0',
      modeloIA: 'claude-sonnet-5',
    });
    const service = new ModuloService(prisma);

    const resultado = await service.create('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
      descricao: 'Módulo de compras',
      responsavel: 'Marcos Silva',
      areas: 'Matriz',
      icone: 'cart',
      cor: '#0EA5A0',
    });

    expect(prisma.modulo.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        nome: 'Compras',
        objetivo: 'Ajudar com compras',
        instrucoes: undefined,
        descricao: 'Módulo de compras',
        responsavel: 'Marcos Silva',
        areas: 'Matriz',
        icone: 'cart',
        cor: '#0EA5A0',
      },
    });
    expect(resultado.id).toBe('modulo-1');
  });

  it('lista só os módulos ativos da empresa informada, por padrão', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ModuloService(prisma);

    await service.findAllByEmpresa('empresa-1');

    expect(prisma.modulo.findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1', ativo: true },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('lista módulos ativos e inativos quando incluirInativos é true', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ModuloService(prisma);

    await service.findAllByEmpresa('empresa-1', true);

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

  it('update atualiza só os campos informados, escopado à empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue({ id: 'modulo-1', empresaId: 'empresa-1' });
    (prisma.modulo.update as jest.Mock).mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' });
    const service = new ModuloService(prisma);

    const resultado = await service.update('modulo-1', 'empresa-1', { nome: 'Novo nome' });

    expect(prisma.modulo.findFirst).toHaveBeenCalledWith({ where: { id: 'modulo-1', empresaId: 'empresa-1' } });
    expect(prisma.modulo.update).toHaveBeenCalledWith({
      where: { id: 'modulo-1' },
      data: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'modulo-1', nome: 'Novo nome' });
  });

  it('update permite desativar/ativar o módulo via campo ativo', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue({ id: 'modulo-1', empresaId: 'empresa-1' });
    (prisma.modulo.update as jest.Mock).mockResolvedValue({ id: 'modulo-1', ativo: false });
    const service = new ModuloService(prisma);

    const resultado = await service.update('modulo-1', 'empresa-1', { ativo: false });

    expect(prisma.modulo.update).toHaveBeenCalledWith({
      where: { id: 'modulo-1' },
      data: { ativo: false },
    });
    expect(resultado).toEqual({ id: 'modulo-1', ativo: false });
  });

  it('update lança NotFoundException se o módulo não existir na empresa', async () => {
    const prisma = buildPrismaMock();
    (prisma.modulo.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ModuloService(prisma);

    await expect(service.update('modulo-x', 'empresa-1', { nome: 'X' })).rejects.toThrow(NotFoundException);
    expect(prisma.modulo.update).not.toHaveBeenCalled();
  });
});
