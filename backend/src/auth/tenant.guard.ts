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

    // Somente leitura, de propósito: o guard NUNCA escreve antes de
    // autorizar. O Supabase permite auto-cadastro público e a chave anon vai
    // no bundle do frontend, então um lazy-create aqui deixaria qualquer
    // estranho com um JWT válido inserir linhas em `Usuario` sem nunca ter
    // sido autorizado. Nesta fase não existe fluxo de convite/signup próprio:
    // `Usuario` + `UsuarioEmpresa` são sempre criados juntos por
    // `provisionUsuarioParaEmpresa` (seed/admin) antes da primeira request.
    const usuario = await this.prisma.usuario.findUnique({
      where: { supabaseUserId: payload.sub },
    });

    // Sem linha `Usuario` não há como existir `UsuarioEmpresa` (FK) — logo o
    // resultado é o mesmo 403, sem tocar no banco para escrita.
    if (!usuario) {
      throw new ForbiddenException('Usuário sem empresa associada');
    }

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
