import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from '../chat/anthropic.service';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';
import type { UpdateModuloDto } from './dto/update-modulo.dto';
import type { RascunharInstrucoesDto } from './dto/rascunhar-instrucoes.dto';

const RASCUNHO_INSTRUCOES_SCHEMA = z.object({ instrucoes: z.string() });

@Controller('modulos')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModuloController {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly anthropicService: AnthropicService,
  ) {}

  @Post()
  async criar(@Body() body: CreateModuloDto) {
    if (!body.nome?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.moduloService.create(empresaId, body);
  }

  @Get()
  async listar(@Query('todos') todos?: string) {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId, todos === 'true');
  }

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.moduloService.update(id, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'modulo_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }

  @Post(':id/rascunho-instrucoes')
  async rascunharInstrucoes(@Param('id') id: string, @Body() body: RascunharInstrucoesDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const modulo = await this.moduloService.findByIdInEmpresa(id, empresaId);

    const system =
      'Você ajuda a escrever instruções operacionais claras e objetivas para agentes de IA corporativos dentro do CorePilot.';
    const mensagem = [
      `Módulo: "${modulo.nome}"`,
      `Objetivo do módulo: ${modulo.objetivo}`,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Escreva instruções gerais (2 a 5 frases) que todo agente deste módulo deve seguir: papel, forma de comunicação, o que priorizar, o que não pode fazer, e quando encaminhar para um responsável humano.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: 'claude-sonnet-5',
      maxTokens: 2048,
      schema: RASCUNHO_INSTRUCOES_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException('A resposta da IA não pôde ser validada');
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'instrucoes_modulo',
        moduloId: id,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }
}
