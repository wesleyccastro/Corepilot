import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';
import type { SupabaseJwtPayload } from './jwt-verifier';

export type RequestComJwt = Request & { jwtPayload?: SupabaseJwtPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: SupabaseJwtVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComJwt>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Cabeçalho Authorization ausente ou inválido');
    }

    const token = header.slice('Bearer '.length);

    try {
      request.jwtPayload = await this.verifier.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    return true;
  }
}
