import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AtorExecucao,
  Etapa,
  InstanciaDeProcesso,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calcularAcoes } from './acoes';
import { chaveIdempotencia } from './idempotencia';

function atorParaExecutor(executor: string): AtorExecucao {
  if (executor === 'agente') return 'agente';
  if (executor === 'automatico') return 'automatico';
  return 'integracao'; // integracao | agente_mais_integracao
}

@Injectable()
export class OrquestradorEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async criarInstancia(
    moduloId: string,
    empresaId: string,
    dadosIniciais: Record<string, unknown>,
  ): Promise<InstanciaDeProcesso> {
    const fluxo = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: true },
      orderBy: { versao: 'desc' },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
    if (!fluxo)
      throw new NotFoundException('Módulo não tem um fluxo publicado');

    const primeiraEtapa = fluxo.etapas[0];
    if (!primeiraEtapa)
      throw new UnprocessableEntityException('Fluxo publicado não tem etapas');

    const instancia = await this.prisma.instanciaDeProcesso.create({
      data: {
        fluxoId: fluxo.id,
        moduloId,
        empresaId,
        etapaAtualId: primeiraEtapa.id,
        dadosAcumulados: dadosIniciais as Prisma.InputJsonValue,
      },
    });

    await this.entrarNaEtapa(instancia.id, primeiraEtapa.id);
    return instancia;
  }

  async listar(moduloId: string, empresaId: string) {
    const instancias = await this.prisma.instanciaDeProcesso.findMany({
      where: { moduloId, empresaId },
      orderBy: { criadoEm: 'desc' },
    });
    if (instancias.length === 0) return [];

    // Cada instância trava numa versão do fluxo (Global Constraints): a etapa
    // atual precisa ser resolvida a partir do `etapaAtualId` de cada instância,
    // nunca do rascunho de fluxo mais recente, pra continuar correta em
    // instâncias antigas mesmo depois do builder evoluir o fluxo.
    const etapaIds = [...new Set(instancias.map((i) => i.etapaAtualId))];
    const etapas = await this.prisma.etapa.findMany({
      where: { id: { in: etapaIds } },
      include: { macroetapa: true },
    });
    const etapaPorId = new Map(etapas.map((e) => [e.id, e]));

    return instancias.map((instancia) => {
      const etapa = etapaPorId.get(instancia.etapaAtualId);
      return {
        ...instancia,
        etapaAtualNome: etapa?.nome ?? '—',
        macroetapaAtualId: etapa?.macroetapaId ?? '',
        macroetapaAtualNome: etapa?.macroetapa.nome ?? '—',
      };
    });
  }

  async detalhar(instanciaId: string, empresaId: string) {
    const instancia = await this.prisma.instanciaDeProcesso.findFirst({
      where: { id: instanciaId, empresaId },
    });
    if (!instancia) throw new NotFoundException('Instância não encontrada');

    const etapaAtual = await this.prisma.etapa.findUniqueOrThrow({
      where: { id: instancia.etapaAtualId },
    });
    const proxima = await this.prisma.etapa.findFirst({
      where: { fluxoId: etapaAtual.fluxoId, ordem: etapaAtual.ordem + 1 },
    });
    const etapas = await this.prisma.etapa.findMany({
      where: { fluxoId: instancia.fluxoId },
      orderBy: { ordem: 'asc' },
    });
    const historico = await this.prisma.execucaoDeEtapa.findMany({
      where: { instanciaId },
      orderBy: { criadoEm: 'asc' },
    });

    return {
      instancia,
      etapaAtual,
      etapas,
      acoes: calcularAcoes(etapaAtual, proxima?.id ?? null),
      historico,
    };
  }

  private async entrarNaEtapa(
    instanciaId: string,
    etapaId: string,
  ): Promise<void> {
    const etapa = await this.prisma.etapa.findUniqueOrThrow({
      where: { id: etapaId },
    });
    await this.processarEtapa(instanciaId, etapa);
  }

  // Recebe a etapa já carregada (ex.: pelo `findFirst` de `avancar`) para evitar
  // uma segunda ida ao banco só para reler o mesmo registro.
  private async processarEtapa(
    instanciaId: string,
    etapa: Etapa,
  ): Promise<void> {
    if (
      etapa.executor === 'usuario' ||
      etapa.executor === 'agente_mais_usuario'
    ) {
      return; // aguarda executarAcao
    }

    const numeroDaExecucao =
      (await this.prisma.execucaoDeEtapa.count({
        where: { instanciaId, etapaId: etapa.id },
      })) + 1;
    const concluiImediatamente =
      etapa.tipo === 'decisao_automatica' || etapa.tipo === 'espera';

    // execucaoDeEtapa.create (+ eventual atualização de status da instância que
    // viesse a se juntar aqui) precisa ser atômico: uma execução gravada sem a
    // instância refletir o mesmo estado deixaria os dois dessincronizados.
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.create({
        data: {
          instanciaId,
          etapaId: etapa.id,
          numeroDaExecucao,
          ator: atorParaExecutor(etapa.executor),
          input: {},
          status: concluiImediatamente ? 'done' : 'pending',
          chaveIdempotencia: chaveIdempotencia(
            instanciaId,
            etapa.id,
            numeroDaExecucao,
          ),
          concluidoEm: concluiImediatamente ? new Date() : null,
        },
      });
    });

    // Passo lógico separado (avança para a etapa seguinte) — fica fora da
    // transação acima para não aninhar transações.
    if (concluiImediatamente) {
      await this.avancar(instanciaId, etapa.id);
    }
    // etapas de agente/integração ficam pending — processadas pelas Tasks 8/10 (worker)
  }

  async avancar(instanciaId: string, etapaOrigemId: string): Promise<void> {
    const etapaOrigem = await this.prisma.etapa.findUniqueOrThrow({
      where: { id: etapaOrigemId },
    });
    const proxima = await this.prisma.etapa.findFirst({
      where: { fluxoId: etapaOrigem.fluxoId, ordem: etapaOrigem.ordem + 1 },
    });

    if (!proxima) {
      await this.prisma.instanciaDeProcesso.update({
        where: { id: instanciaId },
        data: { status: 'concluido' },
      });
      return;
    }

    await this.prisma.instanciaDeProcesso.update({
      where: { id: instanciaId },
      data: { etapaAtualId: proxima.id },
    });
    await this.processarEtapa(instanciaId, proxima);
  }

  async executarAcao(
    instanciaId: string,
    empresaId: string,
    acaoId: string,
    dadosFormulario: Record<string, unknown>,
    atorUsuarioId: string,
  ): Promise<InstanciaDeProcesso> {
    const instancia = await this.prisma.instanciaDeProcesso.findFirst({
      where: { id: instanciaId, empresaId },
    });
    if (!instancia) throw new NotFoundException('Instância não encontrada');

    const etapaAtual = await this.prisma.etapa.findUniqueOrThrow({
      where: { id: instancia.etapaAtualId },
    });
    const proxima = await this.prisma.etapa.findFirst({
      where: { fluxoId: etapaAtual.fluxoId, ordem: etapaAtual.ordem + 1 },
    });
    const acao = calcularAcoes(etapaAtual, proxima?.id ?? null).find(
      (a) => a.id === acaoId,
    );
    if (!acao)
      throw new BadRequestException('Ação inválida para a etapa atual');
    if (acao.exigeCampo?.obrigatorio && !dadosFormulario[acao.exigeCampo.key]) {
      throw new BadRequestException(
        `Campo obrigatório: ${acao.exigeCampo.label}`,
      );
    }

    const numeroDaExecucao =
      (await this.prisma.execucaoDeEtapa.count({
        where: { instanciaId, etapaId: etapaAtual.id },
      })) + 1;
    const dadosAcumulados = {
      ...(instancia.dadosAcumulados as Record<string, unknown>),
      [etapaAtual.id]: dadosFormulario,
    };

    // Registrar a ação humana + atualizar dadosAcumulados + mover a instância
    // (ou concluí-la) são uma única operação lógica: não pode sobrar uma
    // execução "done" com a instância ainda apontando pra etapa antiga.
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.create({
        data: {
          instanciaId,
          etapaId: etapaAtual.id,
          numeroDaExecucao,
          ator: 'usuario',
          atorUsuarioId,
          input: dadosFormulario as Prisma.InputJsonValue,
          output: dadosFormulario as Prisma.InputJsonValue,
          status: 'done',
          concluidoEm: new Date(),
          chaveIdempotencia: chaveIdempotencia(
            instanciaId,
            etapaAtual.id,
            numeroDaExecucao,
          ),
        },
      });

      await tx.instanciaDeProcesso.update({
        where: { id: instanciaId },
        data: { dadosAcumulados: dadosAcumulados as Prisma.InputJsonValue },
      });

      await tx.instanciaDeProcesso.update({
        where: { id: instanciaId },
        data: acao.etapaDestinoId
          ? { etapaAtualId: acao.etapaDestinoId }
          : { status: 'concluido' },
      });
    });

    // Passo lógico separado (entrar na etapa de destino) — fica fora da
    // transação acima para não aninhar transações.
    if (acao.etapaDestinoId) {
      await this.entrarNaEtapa(instanciaId, acao.etapaDestinoId);
    }

    return this.prisma.instanciaDeProcesso.findUniqueOrThrow({
      where: { id: instanciaId },
    });
  }
}
