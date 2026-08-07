import { ConversaController } from './conversa.controller';
import type { ConversaService } from './conversa.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConversaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('cria uma conversa no módulo informado, para o usuário do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'conversa-1' }),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1');

    expect(service.create).toHaveBeenCalledWith(
      'modulo-1',
      'usuario-1',
      'empresa-1',
    );
    expect(resultado).toEqual({ id: 'conversa-1' });
  });

  it('lista conversas do módulo informado, para o usuário do tenant atual', async () => {
    const service = {
      findAllByModuloAndUsuario: jest
        .fn()
        .mockResolvedValue([{ id: 'conversa-1' }]),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModuloAndUsuario).toHaveBeenCalledWith(
      'modulo-1',
      'usuario-1',
    );
    expect(resultado).toEqual([{ id: 'conversa-1' }]);
  });

  it('atualiza uma conversa do usuário do tenant atual', async () => {
    const service = {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'conversa-1', arquivada: true }),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.atualizar('conversa-1', {
      arquivada: true,
    });

    expect(service.update).toHaveBeenCalledWith('conversa-1', 'usuario-1', {
      arquivada: true,
    });
    expect(resultado).toEqual({ id: 'conversa-1', arquivada: true });
  });

  it('remove uma conversa do usuário do tenant atual', async () => {
    const service = {
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversaService;
    const controller = new ConversaController(service, buildTenantContext());

    const resultado = await controller.remover('conversa-1');

    expect(service.remove).toHaveBeenCalledWith('conversa-1', 'usuario-1');
    expect(resultado).toEqual({ ok: true });
  });
});
