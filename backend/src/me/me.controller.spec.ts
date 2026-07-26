import { MeController } from './me.controller';
import type { TenantContext } from '../auth/tenant-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

describe('MeController', () => {
  it('retorna usuário, empresa e perfil, e grava auditoria', async () => {
    const tenantContext = {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;

    const prisma = {
      usuario: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'usuario-1',
          nome: 'Ana',
          email: 'ana@empresa-a.com',
        }),
      },
      empresa: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'empresa-1', nome: 'Empresa A' }),
      },
    } as unknown as PrismaService;

    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

    const controller = new MeController(tenantContext, prisma, audit);

    const resultado = await controller.getMe();

    expect(resultado).toEqual({
      usuario: { id: 'usuario-1', nome: 'Ana', email: 'ana@empresa-a.com' },
      empresa: { id: 'empresa-1', nome: 'Empresa A' },
      perfil: 'admin',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresa-1', atorUsuarioId: 'usuario-1', acao: 'consultar_me' }),
    );
  });
});
