import { jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';

export interface SupabaseJwtPayload extends JWTPayload {
  sub: string;
  email?: string;
}

export function createJwtVerifier(getKey: JWTVerifyGetKey, issuer: string) {
  return async function verify(token: string): Promise<SupabaseJwtPayload> {
    const { payload } = await jwtVerify(token, getKey, {
      issuer,
      audience: 'authenticated',
      // `SupabaseJwtPayload.sub` é tipado como `string` obrigatório, mas o
      // `jose` não exige a claim por conta própria. Sem isto, um token sem
      // `sub` passaria na verificação e só estouraria lá na frente, como
      // erro do Prisma (500) em vez de 401.
      requiredClaims: ['sub'],
    });
    return payload as SupabaseJwtPayload;
  };
}
