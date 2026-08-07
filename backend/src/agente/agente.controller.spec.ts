import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AgenteController } from './agente.controller';
import type { AgenteService } from './agente.service';
import type { TenantContext } from '../auth/tenant-context';
import type { AuditService } from '../audit/audit.service';
import type { AnthropicService } from '../chat/anthropic.service';

describe('AgenteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildAnthropicService(
    overrides: Partial<AnthropicService> = {},
  ): AnthropicService {
    return {
      parseStructured: jest.fn(),
      ...overrides,
    } as unknown as AnthropicService;
  }

  it('cria um agente no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'agente-1' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      buildAnthropicService(),
    );

    const resultado = await controller.criar('modulo-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
    });

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'empresa-1', {
      nome: 'Comprador',
      funcao: 'Analisar pedidos',
      objetivo: 'Ajudar compras',
    });
    expect(resultado).toEqual({ id: 'agente-1' });
  });

  it('rejeita quando nome, funcao ou objetivo estão vazios', async () => {
    const service = { create: jest.fn() } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      buildAnthropicService(),
    );

    await expect(
      controller.criar('modulo-1', { nome: '', funcao: 'X', objetivo: 'Y' }),
    ).rejects.toThrow('nome, funcao e objetivo são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista agentes do módulo informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'agente-1' }]),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      buildAnthropicService(),
    );

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
    );
    expect(resultado).toEqual([{ id: 'agente-1' }]);
  });

  it('atualiza um agente da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'agente-1', nome: 'Novo nome' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      buildAnthropicService(),
    );

    const resultado = await controller.atualizar('modulo-1', 'agente-1', {
      nome: 'Novo nome',
    });

    expect(service.update).toHaveBeenCalledWith('agente-1', 'empresa-1', {
      nome: 'Novo nome',
    });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'agente_atualizado',
      dadosDepois: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'agente-1', nome: 'Novo nome' });
  });

  it('gera um rascunho de guardrails/escalonamento a partir do agente e audita', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: {
          guardrails: 'Nunca aprove uma compra sozinho.',
          regraEscalonamento:
            'Se o valor exceder R$ 50 mil, escale para o gestor.',
        },
        usage: { input_tokens: 50, output_tokens: 25 },
      }),
    });
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      anthropicService,
    );

    const resultado = await controller.rascunharGuardrails(
      'modulo-1',
      'agente-1',
      { brief: 'foco em compliance' },
    );

    expect(service.findByIdInEmpresa).toHaveBeenCalledWith(
      'agente-1',
      'empresa-1',
    );
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.stringContaining('foco em compliance'),
        model: 'claude-sonnet-5',
        maxTokens: 2048,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'guardrails_agente',
        agenteId: 'agente-1',
        tokensEntrada: 50,
        tokensSaida: 25,
      },
    });
    expect(resultado).toEqual({
      guardrails: 'Nunca aprove uma compra sozinho.',
      regraEscalonamento: 'Se o valor exceder R$ 50 mil, escale para o gestor.',
    });
  });

  it('rascunho de guardrails lança 422 quando a IA não devolve saída validável', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'X',
        objetivo: 'Y',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
    });
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      anthropicService,
    );

    await expect(
      controller.rascunharGuardrails('modulo-1', 'agente-1', {}),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('gera um rascunho de campos de saída de skill a partir do agente e audita', async () => {
    const service = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({
        id: 'agente-1',
        nome: 'Comprador',
        funcao: 'Analisar pedidos de compra',
        objetivo: 'Ajudar o time de compras a triar solicitações',
        modeloIA: 'claude-sonnet-5',
      }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService({
      parseStructured: jest.fn().mockResolvedValue({
        parsed_output: {
          camposSaida: [
            {
              nome: 'fornecedor',
              tipo: 'string',
              obrigatorio: true,
              descricao: 'Nome do fornecedor',
            },
            {
              nome: 'preco',
              tipo: 'number',
              obrigatorio: true,
              descricao: 'Preço cotado',
            },
          ],
        },
        usage: { input_tokens: 60, output_tokens: 40 },
      }),
    });
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      anthropicService,
    );

    const resultado = await controller.rascunharSkill('modulo-1', 'agente-1', {
      skillNome: 'Cotação de peças',
      skillObjetivo: 'Buscar preços de peças agrícolas em fornecedores',
    });

    expect(service.findByIdInEmpresa).toHaveBeenCalledWith(
      'agente-1',
      'empresa-1',
    );
    expect(anthropicService.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        mensagem: expect.stringContaining('Cotação de peças'),
        model: 'claude-sonnet-5',
        maxTokens: 2048,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'campos_saida_skill',
        agenteId: 'agente-1',
        tokensEntrada: 60,
        tokensSaida: 40,
      },
    });
    expect(resultado).toEqual({
      camposSaida: [
        {
          nome: 'fornecedor',
          tipo: 'string',
          obrigatorio: true,
          descricao: 'Nome do fornecedor',
        },
        {
          nome: 'preco',
          tipo: 'number',
          obrigatorio: true,
          descricao: 'Preço cotado',
        },
      ],
    });
  });

  it('rejeita rascunho de skill sem objetivo nem brief', async () => {
    const service = {
      findByIdInEmpresa: jest.fn(),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const anthropicService = buildAnthropicService();
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
      anthropicService,
    );

    await expect(
      controller.rascunharSkill('modulo-1', 'agente-1', {}),
    ).rejects.toThrow(BadRequestException);
    expect(service.findByIdInEmpresa).not.toHaveBeenCalled();
    expect(anthropicService.parseStructured).not.toHaveBeenCalled();
  });
});
