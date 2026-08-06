import { IntegracaoWhatsAppController } from './integracao-whatsapp.controller';
import type { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import type { TenantContext } from '../auth/tenant-context';

describe('IntegracaoWhatsAppController', () => {
  function buildTenantContext(): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('nunca devolve apiKeyCriptografada ao buscar', async () => {
    const service = {
      buscar: jest.fn().mockResolvedValue({ id: 'wa-1', apiUrl: 'x', instanceName: 'y', apiKeyCriptografada: 'zzz', phone: null }),
    } as unknown as IntegracaoWhatsAppService;
    const controller = new IntegracaoWhatsAppController(service, buildTenantContext());

    const resultado = await controller.buscar();

    expect(resultado).not.toHaveProperty('apiKeyCriptografada');
  });

  it('nunca devolve apiKeyCriptografada ao salvar', async () => {
    const service = {
      salvar: jest.fn().mockResolvedValue({ id: 'wa-1', apiUrl: 'x', instanceName: 'y', apiKeyCriptografada: 'zzz', phone: null }),
    } as unknown as IntegracaoWhatsAppService;
    const controller = new IntegracaoWhatsAppController(service, buildTenantContext());

    const resultado = await controller.salvar({ apiUrl: 'x', instanceName: 'y', apiKey: 'segredo' });

    expect(resultado).not.toHaveProperty('apiKeyCriptografada');
  });

  it('nunca devolve apiKeyCriptografada ao testar', async () => {
    const service = {
      testar: jest.fn().mockResolvedValue({ id: 'wa-1', apiUrl: 'x', instanceName: 'y', apiKeyCriptografada: 'zzz', phone: null }),
    } as unknown as IntegracaoWhatsAppService;
    const controller = new IntegracaoWhatsAppController(service, buildTenantContext());

    const resultado = await controller.testar();

    expect(resultado).not.toHaveProperty('apiKeyCriptografada');
  });
});
