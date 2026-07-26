import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';

function buildContext(headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  it('rejeita quando não há cabeçalho Authorization', async () => {
    const verifier = { verifyToken: jest.fn() } as unknown as SupabaseJwtVerifier;
    const guard = new JwtAuthGuard(verifier);
    const { context } = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita quando o token é inválido', async () => {
    const verifier = {
      verifyToken: jest.fn().mockRejectedValue(new Error('assinatura inválida')),
    } as unknown as SupabaseJwtVerifier;
    const guard = new JwtAuthGuard(verifier);
    const { context } = buildContext({ authorization: 'Bearer token-invalido' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('aceita um token válido e anexa o payload na request', async () => {
    const payload = { sub: 'user-123', email: 'user@example.com' };
    const verifier = {
      verifyToken: jest.fn().mockResolvedValue(payload),
    } as unknown as SupabaseJwtVerifier;
    const guard = new JwtAuthGuard(verifier);
    const { context, request } = buildContext({ authorization: 'Bearer token-valido' });

    const resultado = await guard.canActivate(context);

    expect(resultado).toBe(true);
    expect(request.jwtPayload).toEqual(payload);
    expect(verifier.verifyToken).toHaveBeenCalledWith('token-valido');
  });
});
