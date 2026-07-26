import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgenteService } from '../agente/agente.service';
import type { CreateSkillDto } from './dto/create-skill.dto';

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenteService: AgenteService,
  ) {}

  async create(agenteId: string, empresaId: string, dto: CreateSkillDto) {
    await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.skill.create({
      data: {
        agenteId,
        nome: dto.nome,
        objetivo: dto.objetivo,
        camposSaida: dto.camposSaida as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByAgente(agenteId: string, empresaId: string) {
    await this.agenteService.findByIdInEmpresa(agenteId, empresaId);

    return this.prisma.skill.findMany({
      where: { agenteId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(skillId: string, empresaId: string) {
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, agente: { empresaId } },
      include: { agente: true },
    });

    if (!skill) {
      throw new NotFoundException('Skill não encontrada');
    }

    return skill;
  }
}
