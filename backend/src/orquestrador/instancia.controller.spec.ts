import { InstanciaController } from './instancia.controller';
import type { OrquestradorEngineService } from './orquestrador-engine.service';
import type { TenantContext } from '../auth/tenant-context';

describe('InstanciaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('cria uma instância com os dados iniciais informados', async () => {
    const engine = {
      criarInstancia: jest.fn().mockResolvedValue({ id: 'inst-1' }),
    } as unknown as OrquestradorEngineService;
    const controller = new InstanciaController(engine, buildTenantContext());

    await controller.criar('modulo-1', { dadosIniciais: { origem: 'teste' } });

    expect(engine.criarInstancia).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
      { origem: 'teste' },
    );
  });

  it('lista as instâncias do módulo na empresa do tenant', async () => {
    const engine = {
      listar: jest.fn().mockResolvedValue([]),
    } as unknown as OrquestradorEngineService;
    const controller = new InstanciaController(engine, buildTenantContext());

    await controller.listar('modulo-1');

    expect(engine.listar).toHaveBeenCalledWith('modulo-1', 'empresa-1');
  });
});
