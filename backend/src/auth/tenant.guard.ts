import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestComJwt } from './jwt-auth.guard';
import type { TenantContextData } from './tenant-context';

type RequestComTudo = RequestComJwt & { tenantContext?: TenantContextData };

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComTudo>();
    const payload = request.jwtPayload;

    if (!payload) {
      throw new InternalServerErrorException(
        'TenantGuard exige que JwtAuthGuard rode antes',
      );
    }

    const usuario = await this.prisma.usuario.upsert({
      where: { supabaseUserId: payload.sub },
      update: {},
      create: {
        supabaseUserId: payload.sub,
        nome: payload.email ? payload.email.split('@')[0] : payload.sub,
        email: payload.email ?? `${payload.sub}@sem-email.local`,
      },
    });

    const vinculos = await this.prisma.usuarioEmpresa.findMany({
      where: { usuarioId: usuario.id },
    });

    if (vinculos.length === 0) {
      throw new ForbiddenException('Usuário sem empresa associada');
    }
    if (vinculos.length > 1) {
      throw new InternalServerErrorException(
        'Usuário associado a mais de uma empresa — não suportado nesta fase',
      );
    }

    request.tenantContext = {
      usuarioId: usuario.id,
      empresaId: vinculos[0].empresaId,
      perfil: vinculos[0].perfil,
    };

    return true;
  }
}
