import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConsultaService } from './consulta.service';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';

@Controller('consultas/:consultaId/testar')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConsultaTesteController {
  constructor(
    private readonly consultaService: ConsultaService,
    private readonly consultaSincronizacaoService: ConsultaSincronizacaoService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async testar(@Param('consultaId') consultaId: string) {
    const { empresaId } = this.tenantContext.get();
    const consulta = await this.consultaService.findByIdInEmpresa(
      consultaId,
      empresaId,
    );
    return this.consultaSincronizacaoService.executarSincronizacao(consulta);
  }
}
