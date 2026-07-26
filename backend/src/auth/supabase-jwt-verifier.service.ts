import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet } from 'jose';
import { createJwtVerifier, type SupabaseJwtPayload } from './jwt-verifier';

@Injectable()
export class SupabaseJwtVerifier {
  private readonly verify: (token: string) => Promise<SupabaseJwtPayload>;

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    const issuer = `${supabaseUrl}/auth/v1`;
    const getKey = createRemoteJWKSet(
      new URL(`${issuer}/.well-known/jwks.json`),
    );
    this.verify = createJwtVerifier(getKey, issuer);
  }

  verifyToken(token: string): Promise<SupabaseJwtPayload> {
    return this.verify(token);
  }
}
