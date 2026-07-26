import { SkillExecucaoService } from './skill-execucao.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('SkillExecucaoService', () => {
  function buildPrismaMock() {
    return {
      skillExecucao: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('lista execuções de uma skill em ordem cronológica decrescente', async () => {
    const prisma = buildPrismaMock();
    (prisma.skillExecucao.findMany as jest.Mock).mockResolvedValue([]);
    const service = new SkillExecucaoService(prisma);

    await service.listBySkill('skill-1');

    expect(prisma.skillExecucao.findMany).toHaveBeenCalledWith({
      where: { skillId: 'skill-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('appendExecucao grava entrada, saida e tokens', async () => {
    const prisma = buildPrismaMock();
    (prisma.skillExecucao.create as jest.Mock).mockResolvedValue({ id: 'execucao-1' });
    const service = new SkillExecucaoService(prisma);

    await service.appendExecucao('skill-1', 'usuario-1', 'Pedido: 10 parafusos', { titulo: 'ok' }, 10, 5);

    expect(prisma.skillExecucao.create).toHaveBeenCalledWith({
      data: {
        skillId: 'skill-1',
        usuarioId: 'usuario-1',
        entrada: 'Pedido: 10 parafusos',
        saida: { titulo: 'ok' },
        tokensEntrada: 10,
        tokensSaida: 5,
      },
    });
  });
});
