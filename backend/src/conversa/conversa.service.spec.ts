import { NotFoundException } from '@nestjs/common';
import { ConversaService } from './conversa.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('ConversaService', () => {
  function buildDeps() {
    const prisma = {
      conversa: {
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

  it('cria uma conversa depois de validar que o módulo é da empresa', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockResolvedValue({ id: 'modulo-1' });
    (prisma.conversa.create as jest.Mock).mockResolvedValue({ id: 'conversa-1' });
    const service = new ConversaService(prisma, moduloService);

    const resultado = await service.create('modulo-1', 'usuario-1', 'empresa-1');

    expect(moduloService.findByIdInEmpresa).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(prisma.conversa.create).toHaveBeenCalledWith({
      data: { moduloId: 'modulo-1', usuarioId: 'usuario-1', empresaId: 'empresa-1' },
    });
    expect(resultado).toEqual({ id: 'conversa-1' });
  });

  it('propaga o NotFoundException se o módulo não for da empresa (não cria a conversa)', async () => {
    const { prisma, moduloService } = buildDeps();
    (moduloService.findByIdInEmpresa as jest.Mock).mockRejectedValue(new NotFoundException());
    const service = new ConversaService(prisma, moduloService);

    await expect(service.create('modulo-x', 'usuario-1', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.conversa.create).not.toHaveBeenCalled();
  });

  it('lista conversas só do módulo e usuário informados', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findMany as jest.Mock).mockResolvedValue([]);
    const service = new ConversaService(prisma, moduloService);

    await service.findAllByModuloAndUsuario('modulo-1', 'usuario-1');

    expect(prisma.conversa.findMany).toHaveBeenCalledWith({
      where: { moduloId: 'modulo-1', usuarioId: 'usuario-1' },
      orderBy: { atualizadoEm: 'desc' },
    });
  });

  it('findOwned lança NotFoundException se a conversa não existir ou não for do usuário', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ConversaService(prisma, moduloService);

    await expect(service.findOwned('conversa-x', 'usuario-1')).rejects.toThrow(NotFoundException);
    expect(prisma.conversa.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversa-x', usuarioId: 'usuario-1' },
      include: { modulo: true },
    });
  });

  it('findOwned retorna a conversa com o módulo incluído', async () => {
    const { prisma, moduloService } = buildDeps();
    const conversaComModulo = { id: 'conversa-1', usuarioId: 'usuario-1', modulo: { id: 'modulo-1' } };
    (prisma.conversa.findFirst as jest.Mock).mockResolvedValue(conversaComModulo);
    const service = new ConversaService(prisma, moduloService);

    const resultado = await service.findOwned('conversa-1', 'usuario-1');

    expect(resultado).toBe(conversaComModulo);
  });
});
