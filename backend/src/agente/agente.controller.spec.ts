import { AgenteController } from './agente.controller';
import type { AgenteService } from './agente.service';
import type { TenantContext } from '../auth/tenant-context';

describe('AgenteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  it('cria um agente no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'agente-1' }),
    } as unknown as AgenteService;
    const controller = new AgenteController(service, buildTenantContext());

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
    const controller = new AgenteController(service, buildTenantContext());

    await expect(
      controller.criar('modulo-1', { nome: '', funcao: 'X', objetivo: 'Y' }),
    ).rejects.toThrow('nome, funcao e objetivo são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista agentes do módulo informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'agente-1' }]),
    } as unknown as AgenteService;
    const controller = new AgenteController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'agente-1' }]);
  });
});
