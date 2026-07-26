import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import { FonteDeDadosService } from '../fonte-de-dados/fonte-de-dados.service';
import type { CreateConsultaDto } from './dto/create-consulta.dto';

@Injectable()
export class ConsultaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
    private readonly fonteDeDadosService: FonteDeDadosService,
  ) {}

  async create(moduloId: string, empresaId: string, dto: CreateConsultaDto) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);
    await this.fonteDeDadosService.findByIdInEmpresa(dto.fonteDeDadosId, empresaId);

    return this.prisma.consultaParametrizada.create({
      data: {
        moduloId,
        fonteDeDadosId: dto.fonteDeDadosId,
        nome: dto.nome,
        codSentenca: dto.codSentenca,
        parametrosSincronizacao: dto.parametrosSincronizacao as unknown as Prisma.InputJsonValue,
        camposFiltro: dto.camposFiltro as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.consultaParametrizada.findMany({
      where: { moduloId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(consultaId: string, empresaId: string) {
    const consulta = await this.prisma.consultaParametrizada.findFirst({
      where: { id: consultaId, modulo: { empresaId } },
      include: { fonteDeDados: true },
    });

    if (!consulta) {
      throw new NotFoundException('Consulta não encontrada');
    }

    return consulta;
  }

  async atualizarSincronizacao(
    consultaId: string,
    empresaId: string,
    ativa: boolean,
    intervaloMinutos: number | undefined,
  ) {
    await this.findByIdInEmpresa(consultaId, empresaId);

    return this.prisma.consultaParametrizada.update({
      where: { id: consultaId },
      data: { sincronizacaoAtiva: ativa, intervaloSincronizacaoMinutos: intervaloMinutos },
    });
  }
}
