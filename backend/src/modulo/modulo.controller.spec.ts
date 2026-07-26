import { BadRequestException } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import type { ModuloService } from './modulo.service';
import type { TenantContext } from '../auth/tenant-context';

describe('ModuloController', () => {
  function buildTenantContext(empresaId: string): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId, perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('cria um módulo usando a empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'modulo-1' }),
    } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    const resultado = await controller.criar({ nome: 'Compras', objetivo: 'Ajudar com compras' });

    expect(service.create).toHaveBeenCalledWith('empresa-1', {
      nome: 'Compras',
      objetivo: 'Ajudar com compras',
    });
    expect(resultado).toEqual({ id: 'modulo-1' });
  });

  it('rejeita criação sem nome ou objetivo', async () => {
    const service = { create: jest.fn() } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    await expect(controller.criar({ nome: '', objetivo: 'x' })).rejects.toThrow(BadRequestException);
    await expect(controller.criar({ nome: 'x', objetivo: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista módulos da empresa do tenant atual', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([{ id: 'modulo-1' }]),
    } as unknown as ModuloService;
    const controller = new ModuloController(service, buildTenantContext('empresa-1'));

    const resultado = await controller.listar();

    expect(service.findAllByEmpresa).toHaveBeenCalledWith('empresa-1');
    expect(resultado).toEqual([{ id: 'modulo-1' }]);
  });
});
