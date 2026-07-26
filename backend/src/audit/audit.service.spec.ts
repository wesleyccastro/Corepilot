import { AuditService } from './audit.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  it('grava um AuditLog com os dados informados', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    const service = new AuditService(prisma);

    await service.record({
      empresaId: 'empresa-1',
      atorUsuarioId: 'usuario-1',
      acao: 'consultar_me',
      dadosDepois: { perfil: 'admin' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'consultar_me',
        dadosAntes: undefined,
        dadosDepois: { perfil: 'admin' },
      },
    });
  });
});
