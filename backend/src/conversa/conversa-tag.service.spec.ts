import { NotFoundException } from '@nestjs/common';
import { ConversaTagService } from './conversa-tag.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('ConversaTagService', () => {
  function buildDeps() {
    const prisma = {
      conversaTag: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    const moduloService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria uma tag depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.conversaTag.create as jest.Mock).mockResolvedValue({ id: 'tag-1', nome: 'Cotações' });
    const service = new ConversaTagService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'empresa-1', 'Cotações');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.conversaTag.create).toHaveBeenCalledWith({
      data: { moduloId: 'modulo-1', empresaId: 'empresa-1', nome: 'Cotações' },
    });
    expect(resultado).toEqual({ id: 'tag-1', nome: 'Cotações' });
  });

  it('lista tags só do módulo e empresa informados', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConversaTagService(prisma, moduloService);

    await service.findAllByModulo('modulo-1', 'empresa-1');

    expect(prisma.conversaTag.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1', empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'asc' },
    });
  });

  it('remove uma tag depois de confirmar que é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findFirst as jest.Mock).mockResolvedValue({ id: 'tag-1', empresaId: 'empresa-1' });
    const service = new ConversaTagService(prisma, moduloService);

    await service.remove('tag-1', 'empresa-1');

    expect(prisma.conversaTag.findFirst).toHaveBeenCalledWith({ where: { id: 'tag-1', empresaId: 'empresa-1' } });
    expect(prisma.conversaTag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
  });

  it('remove lança NotFoundException se a tag não for da empresa (não apaga nada)', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversaTag.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaTagService(prisma, moduloService);

    await expect(service.remove('tag-x', 'empresa-1')).rejects.toThrow(NotFoundException);
    expect(prisma.conversaTag.delete).not.toHaveBeenCalled();
  });
});
