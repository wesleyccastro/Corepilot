import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Etapa, Fluxo, Macroetapa, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import type { CreateMacroetapaDto } from './dto/create-macroetapa.dto';
import type { UpdateMacroetapaDto } from './dto/update-macroetapa.dto';
import { executorPadrao, executorValido } from './tipo-executor';
import type { CreateEtapaDto } from './dto/create-etapa.dto';
import type { UpdateEtapaDto } from './dto/update-etapa.dto';

type FluxoComRelacoes = Fluxo & { macroetapas: Macroetapa[]; etapas: Etapa[] };

@Injectable()
export class FluxoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async getOrCreateRascunho(
    moduloId: string,
    empresaId: string,
  ): Promise<FluxoComRelacoes> {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    const incluir = {
      macroetapas: { orderBy: { ordem: 'asc' as const } },
      etapas: { orderBy: { ordem: 'asc' as const } },
    };

    const rascunho = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: false },
      orderBy: { versao: 'desc' },
      include: incluir,
    });
    if (rascunho) return rascunho;

    const ultimoPublicado = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: true },
      orderBy: { versao: 'desc' },
      include: incluir,
    });

    if (!ultimoPublicado) {
      const criado = await this.prisma.fluxo.create({
        data: { moduloId, versao: 1, publicado: false },
      });
      return { ...criado, macroetapas: [], etapas: [] };
    }

    return this.clonarComoRascunho(ultimoPublicado);
  }

  private async clonarComoRascunho(
    origem: FluxoComRelacoes,
  ): Promise<FluxoComRelacoes> {
    return this.prisma.$transaction(async (tx) => {
      const novoFluxo = await tx.fluxo.create({
        data: {
          moduloId: origem.moduloId,
          versao: origem.versao + 1,
          publicado: false,
        },
      });

      const mapaMacroetapas = new Map<string, string>();
      for (const macroetapa of origem.macroetapas) {
        const nova = await tx.macroetapa.create({
          data: {
            fluxoId: novoFluxo.id,
            nome: macroetapa.nome,
            ordem: macroetapa.ordem,
          },
        });
        mapaMacroetapas.set(macroetapa.id, nova.id);
      }

      const mapaEtapas = new Map<string, string>();
      for (const etapa of origem.etapas) {
        const nova = await tx.etapa.create({
          data: {
            fluxoId: novoFluxo.id,
            macroetapaId: mapaMacroetapas.get(etapa.macroetapaId)!,
            ordem: etapa.ordem,
            nome: etapa.nome,
            tipo: etapa.tipo,
            executor: etapa.executor,
            prazoDias: etapa.prazoDias,
            agenteId: etapa.agenteId,
            skillId: etapa.skillId,
            autonomia: etapa.autonomia,
            aprovadores: etapa.aprovadores as Prisma.InputJsonValue,
            camposUsuario: etapa.camposUsuario as Prisma.InputJsonValue,
            entradaRefs: [],
          },
        });
        mapaEtapas.set(etapa.id, nova.id);
      }

      // Segunda passada: loopParaEtapaId/entradaRefs só podem ser remapeados depois
      // que todas as etapas clonadas já existem (podem apontar pra frente na lista).
      for (const etapa of origem.etapas) {
        const novaId = mapaEtapas.get(etapa.id)!;
        const entradaRefsAntigas = etapa.entradaRefs as unknown as string[];
        await tx.etapa.update({
          where: { id: novaId },
          data: {
            loopParaEtapaId: etapa.loopParaEtapaId
              ? (mapaEtapas.get(etapa.loopParaEtapaId) ?? null)
              : null,
            entradaRefs: entradaRefsAntigas
              .map((id) => mapaEtapas.get(id))
              .filter((id): id is string => !!id),
          },
        });
      }

      return tx.fluxo.findUniqueOrThrow({
        where: { id: novoFluxo.id },
        include: {
          macroetapas: { orderBy: { ordem: 'asc' } },
          etapas: { orderBy: { ordem: 'asc' } },
        },
      });
    });
  }

  async criarMacroetapa(
    moduloId: string,
    empresaId: string,
    dto: CreateMacroetapaDto,
  ) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    return this.prisma.macroetapa.create({
      data: {
        fluxoId: fluxo.id,
        nome: dto.nome,
        ordem: fluxo.macroetapas.length,
      },
    });
  }

  async atualizarMacroetapa(
    moduloId: string,
    empresaId: string,
    macroetapaId: string,
    dto: UpdateMacroetapaDto,
  ) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, macroetapaId);
    return this.prisma.macroetapa.update({
      where: { id: macroetapaId },
      data: { nome: dto.nome },
    });
  }

  async excluirMacroetapa(
    moduloId: string,
    empresaId: string,
    macroetapaId: string,
  ): Promise<void> {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, macroetapaId);
    const emUso = await this.prisma.etapa.count({ where: { macroetapaId } });
    if (emUso > 0) {
      throw new BadRequestException(
        'Não é possível excluir uma coluna com etapas — mova as etapas antes',
      );
    }
    await this.prisma.macroetapa.delete({ where: { id: macroetapaId } });
    await this.renumerarMacroetapas(fluxo.id);
  }

  private async renumerarMacroetapas(fluxoId: string): Promise<void> {
    const restantes = await this.prisma.macroetapa.findMany({
      where: { fluxoId },
      orderBy: { ordem: 'asc' },
    });
    await Promise.all(
      restantes.map((macroetapa, index) =>
        this.prisma.macroetapa.update({
          where: { id: macroetapa.id },
          data: { ordem: index },
        }),
      ),
    );
  }

  private async garantirMacroetapaDoFluxo(
    fluxoId: string,
    macroetapaId: string,
  ): Promise<void> {
    const macroetapa = await this.prisma.macroetapa.findFirst({
      where: { id: macroetapaId, fluxoId },
    });
    if (!macroetapa) {
      throw new NotFoundException(
        'Coluna do Kanban não encontrada neste fluxo',
      );
    }
  }

  async criarEtapa(moduloId: string, empresaId: string, dto: CreateEtapaDto) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, dto.macroetapaId);
    const executor =
      dto.executor && executorValido(dto.tipo, dto.executor)
        ? dto.executor
        : executorPadrao(dto.tipo);

    return this.prisma.etapa.create({
      data: {
        fluxoId: fluxo.id,
        macroetapaId: dto.macroetapaId,
        ordem: fluxo.etapas.length,
        nome: dto.nome,
        tipo: dto.tipo,
        executor,
        aprovadores: [],
        entradaRefs: [],
        camposUsuario: [],
      },
    });
  }

  async atualizarEtapa(
    moduloId: string,
    empresaId: string,
    etapaId: string,
    dto: UpdateEtapaDto,
  ) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    const etapaAtual = await this.garantirEtapaDoFluxo(fluxo.id, etapaId);
    if (dto.macroetapaId)
      await this.garantirMacroetapaDoFluxo(fluxo.id, dto.macroetapaId);

    const tipo = dto.tipo ?? etapaAtual.tipo;
    let executor = dto.executor ?? etapaAtual.executor;
    if (!executorValido(tipo, executor)) executor = executorPadrao(tipo);

    return this.prisma.etapa.update({
      where: { id: etapaId },
      data: {
        nome: dto.nome ?? etapaAtual.nome,
        tipo,
        executor,
        macroetapaId: dto.macroetapaId ?? etapaAtual.macroetapaId,
        prazoDias:
          dto.prazoDias === undefined ? etapaAtual.prazoDias : dto.prazoDias,
        agenteId:
          dto.agenteId === undefined ? etapaAtual.agenteId : dto.agenteId,
        skillId: dto.skillId === undefined ? etapaAtual.skillId : dto.skillId,
        autonomia:
          dto.autonomia === undefined ? etapaAtual.autonomia : dto.autonomia,
        aprovadores:
          dto.aprovadores === undefined
            ? (etapaAtual.aprovadores as Prisma.InputJsonValue)
            : (dto.aprovadores as unknown as Prisma.InputJsonValue),
        loopParaEtapaId:
          dto.loopParaEtapaId === undefined
            ? etapaAtual.loopParaEtapaId
            : dto.loopParaEtapaId,
        entradaRefs:
          dto.entradaRefs === undefined
            ? (etapaAtual.entradaRefs as Prisma.InputJsonValue)
            : (dto.entradaRefs as unknown as Prisma.InputJsonValue),
        camposUsuario:
          dto.camposUsuario === undefined
            ? (etapaAtual.camposUsuario as Prisma.InputJsonValue)
            : (dto.camposUsuario as unknown as Prisma.InputJsonValue),
      },
    });
  }

  async excluirEtapa(
    moduloId: string,
    empresaId: string,
    etapaId: string,
  ): Promise<void> {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirEtapaDoFluxo(fluxo.id, etapaId);
    await this.prisma.etapa.updateMany({
      where: { fluxoId: fluxo.id, loopParaEtapaId: etapaId },
      data: { loopParaEtapaId: null },
    });
    await this.prisma.etapa.delete({ where: { id: etapaId } });
    await this.renumerarEtapas(fluxo.id);
  }

  private async renumerarEtapas(fluxoId: string): Promise<void> {
    const restantes = await this.prisma.etapa.findMany({
      where: { fluxoId },
      orderBy: { ordem: 'asc' },
    });
    await Promise.all(
      restantes.map((etapa, index) =>
        this.prisma.etapa.update({
          where: { id: etapa.id },
          data: { ordem: index },
        }),
      ),
    );
  }

  private async garantirEtapaDoFluxo(fluxoId: string, etapaId: string) {
    const etapa = await this.prisma.etapa.findFirst({
      where: { id: etapaId, fluxoId },
    });
    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada neste fluxo');
    }
    return etapa;
  }
}
