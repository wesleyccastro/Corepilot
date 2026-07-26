import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditParams {
  empresaId: string;
  atorUsuarioId: string;
  acao: string;
  dadosAntes?: Prisma.InputJsonValue | null;
  dadosDepois?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        empresaId: params.empresaId,
        atorUsuarioId: params.atorUsuarioId,
        acao: params.acao,
        dadosAntes: params.dadosAntes ?? undefined,
        dadosDepois: params.dadosDepois ?? undefined,
      },
    });
  }
}
