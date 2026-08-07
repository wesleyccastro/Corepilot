import { ConsultaTesteController } from './consulta-teste.controller';
import type { ConsultaService } from './consulta.service';
import type { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConsultaTesteController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('valida a posse da consulta e roda a sincronização', async () => {
    const consultaService = {
      findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'consulta-1' }),
    } as unknown as ConsultaService;
    const consultaSincronizacaoService = {
      executarSincronizacao: jest.fn().mockResolvedValue({
        sucesso: true,
        linhasLidas: 3,
        colunas: [],
        amostra: [],
      }),
    } as unknown as ConsultaSincronizacaoService;
    const controller = new ConsultaTesteController(
      consultaService,
      consultaSincronizacaoService,
      buildTenantContext(),
    );

    const resultado = await controller.testar('consulta-1');

    expect(consultaService.findByIdInEmpresa).toHaveBeenCalledWith(
      'consulta-1',
      'empresa-1',
    );
    expect(
      consultaSincronizacaoService.executarSincronizacao,
    ).toHaveBeenCalledWith({
      id: 'consulta-1',
    });
    expect(resultado).toEqual({
      sucesso: true,
      linhasLidas: 3,
      colunas: [],
      amostra: [],
    });
  });
});
