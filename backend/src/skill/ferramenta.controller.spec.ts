import { BadRequestException } from '@nestjs/common';
import { FerramentaController } from './ferramenta.controller';
import type { SkillService } from './skill.service';
import type { ConsultaService } from '../consulta/consulta.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FerramentaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildDeps() {
    const skillService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'skill-1' }),
    } as unknown as SkillService;
    const consultaService = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as ConsultaService;
    const prisma = { skill: { update: jest.fn() } } as unknown as PrismaService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, consultaService, prisma, audit };
  }

  it('anexa uma consulta testada como ferramenta e audita', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: true,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.anexar('skill-1', 'consulta-1');

    expect(prisma.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { ferramentas: { connect: { id: 'consulta-1' } } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'ferramenta_anexada',
      }),
    );
    expect(resultado).toEqual({ skillId: 'skill-1', consultaId: 'consulta-1' });
  });

  it('rejeita anexar uma consulta ainda não testada', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: false,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    await expect(controller.anexar('skill-1', 'consulta-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('remove uma ferramenta e audita', async () => {
    const { skillService, consultaService, prisma, audit } = buildDeps();
    (consultaService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      id: 'consulta-1',
      testada: true,
    });
    const controller = new FerramentaController(
      skillService,
      consultaService,
      prisma,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.remover('skill-1', 'consulta-1');

    expect(prisma.skill.update).toHaveBeenCalledWith({
      where: { id: 'skill-1' },
      data: { ferramentas: { disconnect: { id: 'consulta-1' } } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'ferramenta_removida' }),
    );
    expect(resultado).toEqual({ skillId: 'skill-1', consultaId: 'consulta-1' });
  });
});
