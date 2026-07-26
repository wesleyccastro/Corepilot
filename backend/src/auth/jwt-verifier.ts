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
    });
    return payload as SupabaseJwtPayload;
  };
}
