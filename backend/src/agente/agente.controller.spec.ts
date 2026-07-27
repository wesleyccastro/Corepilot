import { AgenteController } from './agente.controller';
import type { AgenteService } from './agente.service';
import type { TenantContext } from '../auth/tenant-context';
import type { AuditService } from '../audit/audit.service';

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

  it('cria um agente no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'agente-1' }),
    } as unknown as AgenteService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new AgenteController(
      service,
      audit,
      buildTenantContext(),
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
});
