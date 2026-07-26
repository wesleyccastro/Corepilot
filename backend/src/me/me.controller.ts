import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeController {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async getMe() {
    const { usuarioId, empresaId, perfil } = this.tenantContext.get();

    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    const empresa = await this.prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'consultar_me',
      dadosDepois: { perfil },
    });

    return {
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      empresa: { id: empresa.id, nome: empresa.nome },
      perfil,
    };
  }
}
