import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';
import type { UpdateAgenteDto } from './dto/update-agente.dto';
import type { RascunharGuardrailsDto } from './dto/rascunhar-guardrails.dto';
import type { RascunharSkillDto } from './dto/rascunhar-skill.dto';

const RASCUNHO_GUARDRAILS_SCHEMA = z.object({
  guardrails: z.string(),
  regraEscalonamento: z.string(),
});

const RASCUNHO_SKILL_SCHEMA = z.object({
  camposSaida: z.array(
    z.object({
      nome: z.string(),
      tipo: z.enum(['string', 'number', 'boolean', 'string[]']),
      obrigatorio: z.boolean(),
      descricao: z.string().optional(),
    }),
  ),
});

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly anthropicService: AnthropicService,
  ) {}

  @Post()
  async criar(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateAgenteDto,
  ) {
    if (!body.nome?.trim() || !body.funcao?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome, funcao e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.agenteService.create(moduloId, empresaId, body);
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.agenteService.findAllByModulo(moduloId, empresaId);
  }

  @Patch(':agenteId')
  async atualizar(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: UpdateAgenteDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.agenteService.update(
      agenteId,
      empresaId,
      body,
    );
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'agente_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }

  @Post(':agenteId/rascunho-guardrails')
  async rascunharGuardrails(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: RascunharGuardrailsDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const agente = await this.agenteService.findByIdInEmpresa(
      agenteId,
      empresaId,
    );

    const system =
      'Você ajuda a definir restrições de segurança e regras de escalonamento para agentes de IA corporativos dentro do CorePilot.';
    const mensagem = [
      `Agente: "${agente.nome}" (${agente.funcao})`,
      `Objetivo do agente: ${agente.objetivo}`,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Escreva: (1) restrições claras do que este agente NUNCA deve fazer sozinho, e (2) em quais situações ele deve escalar a decisão para um humano em vez de agir.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: agente.modeloIA,
      maxTokens: 2048,
      schema: RASCUNHO_GUARDRAILS_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException(
        'A resposta da IA não pôde ser validada',
      );
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'guardrails_agente',
        agenteId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }

  @Post(':agenteId/rascunho-skill')
  async rascunharSkill(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: RascunharSkillDto,
  ) {
    if (!body.brief?.trim() && !body.skillObjetivo?.trim()) {
      throw new BadRequestException(
        'Informe o objetivo da skill ou descreva o que você precisa',
      );
    }

    const { usuarioId, empresaId } = this.tenantContext.get();
    const agente = await this.agenteService.findByIdInEmpresa(
      agenteId,
      empresaId,
    );

    const system =
      'Você ajuda a definir o contrato de saída (campos estruturados) de uma skill de agente de IA dentro do CorePilot. Os tipos disponíveis são apenas: string, number, boolean, string[].';
    const mensagem = [
      `Agente: "${agente.nome}" (${agente.funcao})`,
      body.skillNome?.trim() ? `Nome da skill: ${body.skillNome.trim()}` : null,
      body.skillObjetivo?.trim()
        ? `Objetivo da skill: ${body.skillObjetivo.trim()}`
        : null,
      body.brief?.trim() ? `O que o usuário pediu: ${body.brief.trim()}` : null,
      '',
      'Defina de 2 a 6 campos de saída estruturados que essa skill deve retornar, cada um com nome (em snake_case), tipo, se é obrigatório, e uma descrição curta.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem,
      model: agente.modeloIA,
      maxTokens: 2048,
      schema: RASCUNHO_SKILL_SCHEMA,
    });

    if (!response.parsed_output) {
      throw new UnprocessableEntityException(
        'A resposta da IA não pôde ser validada',
      );
    }

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'rascunho_ia_gerado',
      dadosDepois: {
        tipo: 'campos_saida_skill',
        agenteId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
      },
    });

    return response.parsed_output;
  }
}
