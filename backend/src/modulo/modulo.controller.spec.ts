import { BadRequestException } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import type { ModuloService } from './modulo.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ModuloController', () => {
  function buildTenantContext(empresaId: string): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId, perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  function buildAudit() {
    return { record: jest.fn() } as unknown as import('../audit/audit.service').AuditService;
  }

  it('cria um módulo usando a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.criar({ nome: 'Compras', objetivo: 'Ajudar com compras' });

    expect(service.create).toHaveBeenCalledWith('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });
    expect(resultado).toEqual({ id: 'modulo-1' });
  });

  it('rejeita criação sem nome ou objetivo', async () => {
    const service = { create: jest.fn() } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    await expect(controller.criar({ nome: '', objetivo: 'x' })).rejects.toThrow(BadRequestException);
    await expect(controller.criar({ nome: 'x', objetivo: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista módulos ativos da empresa do tenant atual por padrão', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }]),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.listar();

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1', false);
    expect(resultado).toEqual([{ id: 'modulo-1' }]);
  });

  it('lista módulos ativos e inativos quando ?todos=true', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }, { id: 'modulo-2' }]),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.listar('true');

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1', true);
    expect(resultado).toEqual([{ id: 'modulo-1' }, { id: 'modulo-2' }]);
  });

  it('atualiza um módulo da empresa do tenant atual e audita', async () => {
    const service = {
      update: jest.fn().mockResolvedValue({ id: 'modulo-1', nome: 'Novo nome' }),
    } as unknown as ModuloService;
    const audit = buildAudit();
    const controller = new ModuloController(service, audit, buildTenantContext('empresa-1'));

    const resultado = await controller.atualizar('modulo-1', { nome: 'Novo nome' });

    expect(service.update).toHaveBeenCalledWith('modulo-1', 'empresa-1', { nome: 'Novo nome' });
    expect(audit.record).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'modulo_atualizado',
      dadosDepois: { nome: 'Novo nome' },
    });
    expect(resultado).toEqual({ id: 'modulo-1', nome: 'Novo nome' });
  });
});
