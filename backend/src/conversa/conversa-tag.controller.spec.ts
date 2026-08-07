import { BadRequestException } from '@nestjs/common';
import { ConversaTagController } from './conversa-tag.controller';
import type { ConversaTagService } from './conversa-tag.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConversaTagController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('cria uma tag no módulo informado, para a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'tag-1', nome: 'Cotações' }),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1', { nome: 'Cotações' });

    expect(service.create).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
      'Cotações',
    );
    expect(resultado).toEqual({ id: 'tag-1', nome: 'Cotações' });
  });

  it('rejeita criar tag sem nome', async () => {
    const service = { create: jest.fn() } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    await expect(controller.criar('modulo-1', { nome: '  ' })).rejects.toThrow(
      BadRequestException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista tags do módulo informado, para a empresa do tenant atual', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'tag-1' }]),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
    );
    expect(resultado).toEqual([{ id: 'tag-1' }]);
  });

  it('remove uma tag, para a empresa do tenant atual', async () => {
    const service = {
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversaTagService;
    const controller = new ConversaTagController(service, buildTenantContext());

    const resultado = await controller.remover('tag-1');

    expect(service.remove).toHaveBeenCalledWith('tag-1', 'empresa-1');
    expect(resultado).toEqual({ ok: true });
  });
});
