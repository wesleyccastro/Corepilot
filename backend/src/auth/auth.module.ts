import { Module } from '@nestjs/common';
import { SupabaseJwtVerifier } from './supabase-jwt-verifier.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';
import { TenantContext } from './tenant-context';

@Module({
  providers: [SupabaseJwtVerifier, JwtAuthGuard, TenantGuard, TenantContext],
  exports: [SupabaseJwtVerifier, JwtAuthGuard, TenantGuard, TenantContext],
})
export class AuthModule {}
