import type { ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestComJwt } from './jwt-auth.guard';

function buildContext(request: Partial<RequestComJwt>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  function buildPrismaMock() {
    return {
      usuario: { upsert: jest.fn() },
      usuarioEmpresa: { findMany: jest.fn() },
    } as unknown as PrismaService;
  }

  it('lança erro se o JwtAuthGuard não rodou antes', async () => {
    const prisma = buildPrismaMock();
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {};

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('rejeita usuário sem empresa associada', async () => {
    const prisma = buildPrismaMock();
    (prisma.usuario.upsert as jest.Mock).mockResolvedValue({ id: 'usuario-1' });
    (prisma.usuarioEmpresa.findMany as jest.Mock).mockResolvedValue([]);
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {
      jwtPayload: { sub: 'sub-1', email: 'a@b.com' },
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejeita usuário com mais de uma empresa (não suportado nesta fase)', async () => {
    const prisma = buildPrismaMock();
    (prisma.usuario.upsert as jest.Mock).mockResolvedValue({ id: 'usuario-1' });
    (prisma.usuarioEmpresa.findMany as jest.Mock).mockResolvedValue([
      { empresaId: 'empresa-1', perfil: 'admin' },
      { empresaId: 'empresa-2', perfil: 'membro' },
    ]);
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {
      jwtPayload: { sub: 'sub-1', email: 'a@b.com' },
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('resolve o tenant e anexa tenantContext na request', async () => {
    const prisma = buildPrismaMock();
    (prisma.usuario.upsert as jest.Mock).mockResolvedValue({ id: 'usuario-1' });
    (prisma.usuarioEmpresa.findMany as jest.Mock).mockResolvedValue([
      { empresaId: 'empresa-1', perfil: 'admin' },
    ]);
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> & { tenantContext?: unknown } = {
      jwtPayload: { sub: 'sub-1', email: 'a@b.com' },
    };

    const resultado = await guard.canActivate(buildContext(request));

    expect(resultado).toBe(true);
    expect(request.tenantContext).toEqual({
      usuarioId: 'usuario-1',
      empresaId: 'empresa-1',
      perfil: 'admin',
    });
  });
});
