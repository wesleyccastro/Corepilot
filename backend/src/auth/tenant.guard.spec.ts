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
  // Os mocks de escrita (`create`/`upsert`) existem só para provar que o guard
  // nunca os chama: ele resolve o tenant em modo somente-leitura.
  function buildPrismaMock() {
    const findUnique = jest.fn();
    const create = jest.fn();
    const upsert = jest.fn();
    const findMany = jest.fn();

    const prisma = {
      usuario: { findUnique, create, upsert },
      usuarioEmpresa: { findMany },
    } as unknown as PrismaService;

    return { prisma, findUnique, create, upsert, findMany };
  }

  it('lança erro se o JwtAuthGuard não rodou antes', async () => {
    const { prisma } = buildPrismaMock();
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {};

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('rejeita usuário sem linha Usuario sem escrever nada no banco', async () => {
    const { prisma, findUnique, create, upsert, findMany } = buildPrismaMock();
    findUnique.mockResolvedValue(null);
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {
      jwtPayload: { sub: 'sub-desconhecido', email: 'estranho@b.com' },
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      ForbiddenException,
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { supabaseUserId: 'sub-desconhecido' },
    });
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejeita usuário sem empresa associada', async () => {
    const { prisma, findUnique, create, upsert, findMany } = buildPrismaMock();
    findUnique.mockResolvedValue({ id: 'usuario-1' });
    findMany.mockResolvedValue([]);
    const guard = new TenantGuard(prisma);
    const request: Partial<RequestComJwt> = {
      jwtPayload: { sub: 'sub-1', email: 'a@b.com' },
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      ForbiddenException,
    );

    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejeita usuário com mais de uma empresa (não suportado nesta fase)', async () => {
    const { prisma, findUnique, findMany } = buildPrismaMock();
    findUnique.mockResolvedValue({ id: 'usuario-1' });
    findMany.mockResolvedValue([
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
    const { prisma, findUnique, create, upsert, findMany } = buildPrismaMock();
    findUnique.mockResolvedValue({ id: 'usuario-1' });
    findMany.mockResolvedValue([{ empresaId: 'empresa-1', perfil: 'admin' }]);
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
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
