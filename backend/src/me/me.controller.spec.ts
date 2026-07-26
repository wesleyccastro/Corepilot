import { MeController } from './me.controller';
import type { TenantContext } from '../auth/tenant-context';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

describe('MeController', () => {
  it('retorna usuário, empresa e perfil, e grava auditoria', async () => {
    const tenantContext = {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
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
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'empresa-1', nome: 'Empresa A' }),
      },
    } as unknown as PrismaService;

    // O mock fica numa const própria (em vez de ser lido de volta como
    // `audit.record` na asserção) para não disparar
    // @typescript-eslint/unbound-method.
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditService;

    const controller = new MeController(tenantContext, prisma, audit);

    const resultado = await controller.getMe();

    expect(resultado).toEqual({
      usuario: { id: 'usuario-1', nome: 'Ana', email: 'ana@empresa-a.com' },
      empresa: { id: 'empresa-1', nome: 'Empresa A' },
      perfil: 'admin',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'consultar_me',
      }),
    );
  });
});
