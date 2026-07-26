import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Perfil } from '@prisma/client';
import type { Request } from 'express';

export interface TenantContextData {
  usuarioId: string;
  empresaId: string;
  perfil: Perfil;
}

export type RequestComTenant = Request & { tenantContext?: TenantContextData };

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: RequestComTenant) {}

  get(): TenantContextData {
    if (!this.request.tenantContext) {
      throw new Error(
        'TenantContext acessado fora de uma rota protegida por TenantGuard',
      );
    }
    return this.request.tenantContext;
  }
}
