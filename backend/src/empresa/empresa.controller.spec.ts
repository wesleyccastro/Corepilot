import { EmpresaController } from './empresa.controller';
import type { EmpresaService } from './empresa.service';
import type { TenantContext } from '../auth/tenant-context';

describe('EmpresaController', () => {
  function buildTenantContext(empresaId: string): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId, perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  function buildAudit() {
    return { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
  }

  const arquivo = {
    buffer: Buffer.from('fake-png'),
    mimetype: 'image/png',
    size: 8,
  } as Express.Multer.File;

  it('atualiza a logo da empresa do tenant atual e audita', async () => {
    const service = {
      atualizarLogo: jest.fn().mockResolvedValue({
        id: 'empresa-1',
        nome: 'Empresa A',
        logoDataUrl: 'data:image/png;base64,ZmFrZS1wbmc=',
      }),
    } as unknown as EmpresaService;
    const audit = buildAudit();
    const controller = new EmpresaController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.atualizarLogo(arquivo);

    expect(service.atualizarLogo).toHaveBeenCalledWith('empresa-1', arquivo);
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'empresa_logo_atualizado',
      dadosDepois: { contentType: 'image/png', tamanhoBytes: 8 },
    });
    expect(resultado).toEqual({
      id: 'empresa-1',
      nome: 'Empresa A',
      logoDataUrl: 'data:image/png;base64,ZmFrZS1wbmc=',
    });
  });

  it('propaga o erro do service quando nenhum arquivo é enviado', async () => {
    const service = {
      atualizarLogo: jest.fn().mockRejectedValue(new Error('Nenhum arquivo enviado')),
    } as unknown as EmpresaService;
    const audit = buildAudit();
    const controller = new EmpresaController(service, audit, buildTenantContext('empresa-1'));

    await expect(controller.atualizarLogo(undefined)).rejects.toThrow('Nenhum arquivo enviado');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('atualiza nome e razão social da empresa do tenant atual e audita', async () => {
    const service = {
      atualizarDados: jest.fn().mockResolvedValue({
        id: 'empresa-1',
        nome: 'Grupo LFG Agro',
        razaoSocial: 'LFG Agronegócios Ltda',
        logoDataUrl: null,
      }),
    } as unknown as EmpresaService;
    const audit = buildAudit();
    const controller = new EmpresaController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.atualizar({
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
    });

    expect(service.atualizarDados).toHaveBeenCalledWith('empresa-1', {
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
    });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'empresa_atualizada',
      dadosDepois: { nome: 'Grupo LFG Agro', razaoSocial: 'LFG Agronegócios Ltda' },
    });
    expect(resultado).toEqual({
      id: 'empresa-1',
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
      logoDataUrl: null,
    });
  });
});
