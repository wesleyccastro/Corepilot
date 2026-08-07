import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import type { SalvarIntegracaoWhatsAppDto } from './dto/salvar-integracao-whatsapp.dto';

function sanitizar<T extends { apiKeyCriptografada: string }>(integracao: T) {
  const { apiKeyCriptografada, ...resto } = integracao;
  void apiKeyCriptografada;
  return resto;
}

@Controller('empresas/atual/integracao-whatsapp')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegracaoWhatsAppController {
  constructor(
    private readonly service: IntegracaoWhatsAppService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async buscar() {
    const { empresaId } = this.tenantContext.get();
    const integracao = await this.service.buscar(empresaId);
    return integracao ? sanitizar(integracao) : null;
  }

  @Post()
  async salvar(@Body() body: SalvarIntegracaoWhatsAppDto) {
    if (!body.apiUrl?.trim() || !body.instanceName?.trim()) {
      throw new BadRequestException('apiUrl e instanceName são obrigatórios');
    }
    const { empresaId } = this.tenantContext.get();
    return sanitizar(await this.service.salvar(empresaId, body));
  }

  @Post('testar')
  async testar() {
    const { empresaId } = this.tenantContext.get();
    return sanitizar(await this.service.testar(empresaId));
  }
}
