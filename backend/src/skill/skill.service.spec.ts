import { NotFoundException } from '@nestjs/common';
import { SkillService } from './skill.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgenteService } from '../agente/agente.service';

describe('SkillService', () => {
  function buildDeps() {
    const prisma = {
      skill: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const agenteService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as AgenteService;
    return { prisma, agenteService };
  }

  const camposSaida = [
    { nome: 'titulo', tipo: 'string' as const, obrigatorio: true },
  ];

  it('cria uma skill depois de validar que o agente é da empresa', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'agente-1',
    });
    (prisma.skill.create as jest.Mock).mockResolvedValue({ id: 'skill-1' });
    const service = new SkillService(prisma, agenteService);

    const resultado = await service.create('agente-1', 'empresa-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações de compra',
      camposSaida,
    });

    expect(agenteService.findByIdInEmpresa).toHaveBeenCalledWith(
      'agente-1',
      'empresa-1',
    );
    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: {
        agenteId: 'agente-1',
        nome: 'Triagem',
        objetivo: 'Triar solicitações de compra',
        camposSaida,
      },
    });
    expect(resultado).toEqual({ id: 'skill-1' });
  });

  it('propaga o NotFoundException se o agente não for da empresa (não cria a skill)', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockRejectedValue(
      new NotFoundException(),
    );
    const service = new SkillService(prisma, agenteService);

    await expect(
      service.create('agente-x', 'empresa-1', {
        nome: 'X',
        objetivo: 'Y',
        camposSaida,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('lista skills só do agente informado', async () => {
    const { prisma, agenteService } = buildDeps();
    (agenteService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'agente-1',
    });
    (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
    const service = new SkillService(prisma, agenteService);

    await service.findAllByAgente('agente-1', 'empresa-1');

    expect(agenteService.findByIdInEmpresa).toHaveBeenCalledWith(
      'agente-1',
      'empresa-1',
    );
    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { agenteId: 'agente-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se a skill não existir ou o agente não for da empresa', async () => {
    const { prisma, agenteService } = buildDeps();
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new SkillService(prisma, agenteService);

    await expect(
      service.findByIdInEmpresa('skill-x', 'empresa-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: { id: 'skill-x', agente: { empresaId: 'empresa-1' } },
      include: { agente: { include: { modulo: true } }, ferramentas: true },
    });
  });

  it('findByIdInEmpresa retorna a skill com o agente incluído', async () => {
    const { prisma, agenteService } = buildDeps();
    const skillComAgente = {
      id: 'skill-1',
      agente: { id: 'agente-1', empresaId: 'empresa-1' },
    };
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue(skillComAgente);
    const service = new SkillService(prisma, agenteService);

    const resultado = await service.findByIdInEmpresa('skill-1', 'empresa-1');

    expect(resultado).toBe(skillComAgente);
  });

  it('update atualiza só os campos informados, escopado à empresa via agente', async () => {
    const { prisma, agenteService } = buildDeps();
    (prisma.skill.findFirst as jest.Mock).mockResolvedValue({ id: 'skill-1' });
    (prisma.skill.update as jest.Mock).mockResolvedValue({
      id: 'skill-1',
      nome: 'Novo nome',
    });
    const service = new SkillService(prisma, agenteService);

    const resultado = await service.update('skill-1', 'empresa-1', {
      nome: 'Novo nome',
    });

    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: { id: 'skill-1', agente: { empresaId: 'empresa-1' } },
      include: { agente: { include: { modulo: true } }, ferramentas: true },
    });
    expect(prisma.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'skill-1', nome: 'Novo nome' });
  });
});
