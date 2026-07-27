import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';
import type { UpdateAgenteDto } from './dto/update-agente.dto';

@Injectable()
export class AgenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, empresaId: string, dto: CreateAgenteDto) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.agente.create({
      data: {
        empresaId,
        moduloId,
        nome: dto.nome,
        funcao: dto.funcao,
        objetivo: dto.objetivo,
        modeloIA: dto.modeloIA,
      },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.agente.findMany({
      where: { moduloId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(agenteId: string, empresaId: string) {
    const agente = await this.prisma.agente.findFirst({
      where: { id: agenteId, empresaId },
    });

    if (!agente) {
      throw new NotFoundException('Agente não encontrado');
    }

    return agente;
  }

  async update(agenteId: string, empresaId: string, dto: UpdateAgenteDto) {
    await this.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.agente.update({
      where: { id: agenteId },
      data: {
        nome: dto.nome,
        funcao: dto.funcao,
        objetivo: dto.objetivo,
      },
    });
  }
}
