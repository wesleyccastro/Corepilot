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
}
