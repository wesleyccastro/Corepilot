import { UnprocessableEntityException } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import type { SkillService } from './skill.service';
import type { SkillExecucaoService } from './skill-execucao.service';
import type { SkillExecutorService } from './skill-executor.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillExecucaoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  const skillComAgente = {
    id: 'skill-1',
    agenteId: 'agente-1',
    objetivo: 'Triar solicitações',
    camposSaida: [{ nome: 'titulo', tipo: 'string', obrigatorio: true }],
    ferramentas: [] as { id: string; nome: string; camposFiltro: unknown }[],
    agente: {
      id: 'agente-1',
      moduloId: 'modulo-1',
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
      modeloIA: 'claude-sonnet-5',
      modulo: { instrucoes: null as string | null },
    },
  };

  function buildDeps() {
    const skillService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue(skillComAgente),
    } as unknown as SkillService;
    const skillExecucaoService = {
      appendExecucao: jest.fn().mockResolvedValue({
        id: 'execucao-1',
        saida: { titulo: 'ok' },
        tokensEntrada: 10,
        tokensSaida: 5,
      }),
      listBySkill: jest.fn().mockResolvedValue([]),
    } as unknown as SkillExecucaoService;
    const skillExecutorService = {
      executar: jest.fn().mockResolvedValue({
        output: { titulo: 'ok' },
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    } as unknown as SkillExecutorService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, skillExecucaoService, skillExecutorService, audit };
  }

  it('executa a skill, persiste a execução e audita', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', {
      entrada: 'Pedido: 10 parafusos',
    });

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith(
      'skill-1',
      'empresa-1',
    );
    expect(skillExecutorService.executar).toHaveBeenCalledWith({
      agente: skillComAgente.agente,
      modulo: skillComAgente.agente.modulo,
      skill: {
        objetivo: skillComAgente.objetivo,
        camposSaida: skillComAgente.camposSaida,
        ferramentas: skillComAgente.ferramentas,
      },
      entrada: 'Pedido: 10 parafusos',
    });
    expect(skillExecucaoService.appendExecucao).toHaveBeenCalledWith(
      'skill-1',
      'usuario-1',
      'Pedido: 10 parafusos',
      { titulo: 'ok' },
      10,
      5,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'skill_execucao',
      }),
    );
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });

  it('lança erro e não persiste quando a saída não bate com o schema (output nulo)', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    (skillExecutorService.executar as jest.Mock).mockResolvedValue({
      output: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    await expect(
      controller.executar('skill-1', { entrada: 'Pedido' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(skillExecucaoService.appendExecucao).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lista execuções da skill, validando que ela pertence à empresa do tenant', async () => {
    const { skillService, skillExecucaoService, skillExecutorService, audit } =
      buildDeps();
    (skillExecucaoService.listBySkill as jest.Mock).mockResolvedValue([
      { id: 'execucao-1' },
    ]);
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      skillExecutorService,
      audit,
      buildTenantContext(),
    );

    const resultado = await controller.listar('skill-1');

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith(
      'skill-1',
      'empresa-1',
    );
    expect(skillExecucaoService.listBySkill).toHaveBeenCalledWith('skill-1');
    expect(resultado).toEqual([{ id: 'execucao-1' }]);
  });
});
