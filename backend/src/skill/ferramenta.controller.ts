import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { ConsultaService } from '../consulta/consulta.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Controller('skills/:skillId/ferramentas')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FerramentaController {
  constructor(
    private readonly skillService: SkillService,
    private readonly consultaService: ConsultaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post(':consultaId')
  async anexar(
    @Param('skillId') skillId: string,
    @Param('consultaId') consultaId: string,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    const consulta = await this.consultaService.findByIdInEmpresa(
      consultaId,
      empresaId,
    );

    if (!consulta.testada) {
      throw new BadRequestException(
        'A consulta precisa ser testada com sucesso antes de virar ferramenta',
      );
    }

    await this.prisma.skill.update({
      where: { id: skillId },
      data: { ferramentas: { connect: { id: consultaId } } },
    });

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'ferramenta_anexada',
      dadosDepois: { skillId, consultaId },
    });

    return { skillId, consultaId };
  }

  @Delete(':consultaId')
  async remover(
    @Param('skillId') skillId: string,
    @Param('consultaId') consultaId: string,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    await this.consultaService.findByIdInEmpresa(consultaId, empresaId);

    await this.prisma.skill.update({
      where: { id: skillId },
      data: { ferramentas: { disconnect: { id: consultaId } } },
    });

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'ferramenta_removida',
      dadosDepois: { skillId, consultaId },
    });

    return { skillId, consultaId };
  }
}
