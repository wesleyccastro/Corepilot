import { UnprocessableEntityException } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import type { SkillService } from './skill.service';
import type { SkillExecucaoService } from './skill-execucao.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillExecucaoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
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
    },
  };

  const skillComFerramenta = {
    ...skillComAgente,
    ferramentas: [
      {
        id: 'consulta-1',
        nome: 'Saldo de estoque',
        camposFiltro: [{ nome: 'codProduto', tipo: 'string', obrigatorio: true }],
      },
    ],
  };

  function buildPrismaVazio(): PrismaService {
    return {
      consultaResultado: { findMany: jest.fn() },
    } as unknown as PrismaService;
  }

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
    const anthropicService = {
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: { titulo: 'ok' },
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      createWithTools: jest.fn(),
      parseStructuredFromHistory: jest.fn(),
    } as unknown as AnthropicService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { skillService, skillExecucaoService, anthropicService, audit };
  }

  it('executa a skill, persiste a execução e audita', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', { entrada: 'Pedido: 10 parafusos' });

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith('skill-1', 'empresa-1');
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: 'Pedido: 10 parafusos', model: 'claude-sonnet-5' }),
    );
    expect(skillExecucaoService.appendExecucao).toHaveBeenCalledWith(
      'skill-1',
      'usuario-1',
      'Pedido: 10 parafusos',
      { titulo: 'ok' },
      10,
      5,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresa-1', atorUsuarioId: 'usuario-1', acao: 'skill_execucao' }),
    );
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });

  it('inclui guardrails e regra de escalonamento no system prompt quando preenchidos no agente', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (skillService.findByIdInEmpresa as jest.Mock).mockResolvedValue({
      ...skillComAgente,
      agente: {
        ...skillComAgente.agente,
        guardrails: 'Nunca aprove uma compra sozinho.',
        regraEscalonamento: 'Se o valor exceder R$ 50 mil, escale para o gestor.',
      },
    });
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    await controller.executar('skill-1', { entrada: 'Pedido: 10 parafusos' });

    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Nunca aprove uma compra sozinho.'),
      }),
    );
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Se o valor exceder R$ 50 mil, escale para o gestor.'),
      }),
    );
  });

  it('lança erro e não persiste quando a saída não bate com o schema (parsed_output nulo)', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    await expect(controller.executar('skill-1', { entrada: 'Pedido' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(skillExecucaoService.appendExecucao).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lista execuções da skill, validando que ela pertence à empresa do tenant', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (skillExecucaoService.listBySkill as jest.Mock).mockResolvedValue([{ id: 'execucao-1' }]);
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      buildPrismaVazio(),
      buildTenantContext(),
    );

    const resultado = await controller.listar('skill-1');

    expect(skillService.findByIdInEmpresa).toHaveBeenCalledWith('skill-1', 'empresa-1');
    expect(skillExecucaoService.listBySkill).toHaveBeenCalledWith('skill-1');
    expect(resultado).toEqual([{ id: 'execucao-1' }]);
  });

  it('roda o loop de tool-use e usa dados locais (nunca chama o RM) quando a skill tem ferramentas', async () => {
    const { skillService, skillExecucaoService, anthropicService, audit } = buildDeps();
    (skillService.findByIdInEmpresa as jest.Mock).mockResolvedValue(skillComFerramenta);
    (anthropicService.createWithTools as jest.Mock)
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'consulta_consulta-1', input: { codProduto: 'X1' } },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    (anthropicService.parseStructuredFromHistory as jest.Mock).mockResolvedValue({
      parsed_output: { titulo: 'ok' },
      usage: { input_tokens: 30, output_tokens: 10 },
    });
    const prisma = {
      consultaResultado: {
        findMany: jest.fn().mockResolvedValue([{ dados: { codProduto: 'X1', saldo: 42 } }]),
      },
    } as unknown as PrismaService;
    const controller = new SkillExecucaoController(
      skillService,
      skillExecucaoService,
      anthropicService,
      audit,
      prisma,
      buildTenantContext(),
    );

    const resultado = await controller.executar('skill-1', { entrada: 'Qual o saldo do produto X1?' });

    expect(anthropicService.createWithTools).toHaveBeenCalledTimes(2);
    expect(prisma.consultaResultado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ consultaParametrizadaId: 'consulta-1' }),
      }),
    );
    expect(anthropicService.parseStructuredFromHistory).toHaveBeenCalled();
    expect(resultado).toEqual({
      execucaoId: 'execucao-1',
      saida: { titulo: 'ok' },
      tokensEntrada: 10,
      tokensSaida: 5,
    });
  });
});
