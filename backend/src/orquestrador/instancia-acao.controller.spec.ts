import { BadRequestException } from '@nestjs/common';
import { InstanciaAcaoController } from './instancia-acao.controller';
import type { OrquestradorEngineService } from './orquestrador-engine.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('InstanciaAcaoController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  it('detalha uma instância', async () => {
    const engine = {
      detalhar: jest.fn().mockResolvedValue({
        instancia: {},
        etapaAtual: {},
        acoes: [],
        historico: [],
      }),
    } as unknown as OrquestradorEngineService;
    const controller = new InstanciaAcaoController(
      engine,
      { record: jest.fn() } as unknown as AuditService,
      buildTenantContext(),
    );

    await controller.detalhar('inst-1');

    expect(engine.detalhar).toHaveBeenCalledWith('inst-1', 'empresa-1');
  });

  it('rejeita executar ação sem acaoId', async () => {
    const engine = {
      executarAcao: jest.fn(),
    } as unknown as OrquestradorEngineService;
    const controller = new InstanciaAcaoController(
      engine,
      { record: jest.fn() } as unknown as AuditService,
      buildTenantContext(),
    );

    await expect(
      controller.executarAcao('inst-1', { acaoId: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('executa a ação e audita', async () => {
    const engine = {
      executarAcao: jest
        .fn()
        .mockResolvedValue({ id: 'inst-1', status: 'em_andamento' }),
    } as unknown as OrquestradorEngineService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new InstanciaAcaoController(
      engine,
      audit,
      buildTenantContext(),
    );

    await controller.executarAcao('inst-1', { acaoId: 'aprovar', dados: {} });

    expect(engine.executarAcao).toHaveBeenCalledWith(
      'inst-1',
      'empresa-1',
      'aprovar',
      {},
      'usuario-1',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'etapa_acao_executada',
      }),
    );
  });
});
