import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  createLocalJWKSet,
  type JWTVerifyGetKey,
} from 'jose';
import { createJwtVerifier } from './jwt-verifier';

describe('createJwtVerifier', () => {
  const issuer = 'https://test-project.supabase.co/auth/v1';

  async function buildVerifier() {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';

    const getKey: JWTVerifyGetKey = createLocalJWKSet({ keys: [publicJwk] });
    return { privateKey, verify: createJwtVerifier(getKey, issuer) };
  }

  it('aceita um token assinado corretamente, com issuer e audience corretos', async () => {
    const { privateKey, verify } = await buildVerifier();

    const token = await new SignJWT({
      email: 'user@example.com',
      role: 'authenticated',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject('user-123')
      .setExpirationTime('1h')
      .sign(privateKey);

    const payload = await verify(token);

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejeita um token com issuer diferente', async () => {
    const { privateKey, verify } = await buildVerifier();

    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer('https://outro-projeto.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setSubject('user-123')
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejeita um token sem a claim sub', async () => {
    const { privateKey, verify } = await buildVerifier();

    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejeita um token expirado', async () => {
    const { privateKey, verify } = await buildVerifier();

    const agora = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject('user-123')
      .setIssuedAt(agora - 7200)
      .setExpirationTime(agora - 3600)
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });
});
