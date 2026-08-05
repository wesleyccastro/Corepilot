import { BadRequestException } from '@nestjs/common';
import { FluxoController } from './fluxo.controller';
import type { FluxoService } from './fluxo.service';
import type { AuditService } from '../audit/audit.service';
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

  function buildAudit(): AuditService {
    return { record: jest.fn() } as unknown as AuditService;
  }

  it('devolve o rascunho do fluxo do módulo', async () => {
    const service = {
      getOrCreateRascunho: jest.fn().mockResolvedValue({ id: 'fluxo-1' }),
    } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    const resultado = await controller.obterRascunho('modulo-1');

    expect(service.getOrCreateRascunho).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
    );
    expect(resultado).toEqual({ id: 'fluxo-1' });
  });

  it('rejeita criar macroetapa sem nome', async () => {
    const service = { criarMacroetapa: jest.fn() } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    await expect(
      controller.criarMacroetapa('modulo-1', { nome: '  ' }),
    ).rejects.toThrow(BadRequestException);
    expect(service.criarMacroetapa).not.toHaveBeenCalled();
  });
});

describe('FluxoController — Etapa', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildAudit(): AuditService {
    return { record: jest.fn() } as unknown as AuditService;
  }

  it('rejeita criar etapa sem tipo ou macroetapaId', async () => {
    const service = { criarEtapa: jest.fn() } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    await expect(
      controller.criarEtapa('modulo-1', {
        nome: 'X',
        tipo: undefined as never,
        macroetapaId: 'me-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(service.criarEtapa).not.toHaveBeenCalled();
  });

  it('cria a etapa quando nome, tipo e macroetapaId são informados', async () => {
    const service = {
      criarEtapa: jest.fn().mockResolvedValue({ id: 'e-1' }),
    } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    const resultado = await controller.criarEtapa('modulo-1', {
      nome: 'Comprador valida',
      tipo: 'aprovacao',
      macroetapaId: 'me-1',
    });

    expect(service.criarEtapa).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
      expect.objectContaining({ nome: 'Comprador valida' }),
    );
    expect(resultado).toEqual({ id: 'e-1' });
  });

  it('atualiza a etapa delegando pro service', async () => {
    const service = {
      atualizarEtapa: jest.fn().mockResolvedValue({ id: 'e-1' }),
    } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    await controller.atualizarEtapa('modulo-1', 'e-1', { nome: 'Novo nome' });

    expect(service.atualizarEtapa).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
      'e-1',
      { nome: 'Novo nome' },
    );
  });

  it('exclui a etapa delegando pro service', async () => {
    const service = {
      excluirEtapa: jest.fn().mockResolvedValue(undefined),
    } as unknown as FluxoService;
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      buildAudit(),
    );

    await controller.excluirEtapa('modulo-1', 'e-1');

    expect(service.excluirEtapa).toHaveBeenCalledWith(
      'modulo-1',
      'empresa-1',
      'e-1',
    );
  });
});

describe('FluxoController — publicar', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildAudit(): AuditService {
    return { record: jest.fn() } as unknown as AuditService;
  }

  it('publica e audita', async () => {
    const service = {
      publicar: jest.fn().mockResolvedValue({ id: 'fluxo-1', publicado: true }),
    } as unknown as FluxoService;
    const audit = buildAudit();
    const controller = new FluxoController(
      service,
      buildTenantContext(),
      audit,
    );

    await controller.publicar('modulo-1');

    expect(service.publicar).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'fluxo_publicado',
      }),
    );
  });
});
