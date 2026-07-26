import { ConsultaController } from './consulta.controller';
import type { ConsultaService } from './consulta.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ConsultaController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const dto = {
    fonteDeDadosId: 'fonte-1',
    nome: 'Saldo de estoque',
    codSentenca: 'SALDOESTOQUEINSU',
    parametrosSincronizacao: { CODFILIAL: '001' },
    camposFiltro: [{ nome: 'codProduto', tipo: 'string' as const, obrigatorio: true }],
  };

  it('cria uma consulta no módulo informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'consulta-1' }),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.criar('modulo-1', dto);

    expect(service.create).toHaveBeenCalledWith('modulo-1', 'empresa-1', dto);
    expect(resultado).toEqual({ id: 'consulta-1' });
  });

  it('rejeita quando falta nome, codSentenca ou fonteDeDadosId', async () => {
    const service = { create: jest.fn() } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    await expect(controller.criar('modulo-1', { ...dto, codSentenca: '' })).rejects.toThrow(
      'nome, codSentenca e fonteDeDadosId são obrigatórios',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista consultas do módulo informado', async () => {
    const service = {
      findAllByModulo: jest.fn().mockResolvedValue([{ id: 'consulta-1' }]),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.listar('modulo-1');

    expect(service.findAllByModulo).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'consulta-1' }]);
  });

  it('atualiza a configuração de sincronização', async () => {
    const service = {
      atualizarSincronizacao: jest
        .fn()
        .mockResolvedValue({ id: 'consulta-1', sincronizacaoAtiva: true }),
    } as unknown as ConsultaService;
    const controller = new ConsultaController(service, buildTenantContext());

    const resultado = await controller.atualizarSincronizacao('consulta-1', {
      ativa: true,
      intervaloMinutos: 60,
    });

    expect(service.atualizarSincronizacao).toHaveBeenCalledWith('consulta-1', 'empresa-1', true, 60);
    expect(resultado).toEqual({ id: 'consulta-1', sincronizacaoAtiva: true });
  });
});
