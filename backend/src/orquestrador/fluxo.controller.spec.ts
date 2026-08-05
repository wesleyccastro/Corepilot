import { BadRequestException } from '@nestjs/common';
import { FluxoController } from './fluxo.controller';
import type { FluxoService } from './fluxo.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FluxoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('devolve o rascunho do fluxo do módulo', async () => {
    const service = {
      getOrCreateRascunho: jest.fn().mockResolvedValue({ id: 'fluxo-1' }),
    } as unknown as FluxoService;
    const controller = new FluxoController(service, buildTenantContext());

    const resultado = await controller.obterRascunho('modulo-1');

    expect(service.getOrCreateRascunho).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
    );
    expect(resultado).toEqual({ id: 'fluxo-1' });
  });

  it('rejeita criar macroetapa sem nome', async () => {
    const service = { criarMacroetapa: jest.fn() } as unknown as FluxoService;
    const controller = new FluxoController(service, buildTenantContext());

    await expect(
      controller.criarMacroetapa('modulo-1', { nome: '  ' }),
    ).rejects.toThrow(BadRequestException);
    expect(service.criarMacroetapa).not.toHaveBeenCalled();
  });
});
