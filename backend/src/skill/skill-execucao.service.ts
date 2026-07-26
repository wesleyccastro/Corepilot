import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillExecucaoService {
  constructor(private readonly prisma: PrismaService) {}

  async listBySkill(skillId: string) {
    return this.prisma.skillExecucao.findMany({
      where: { skillId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async appendExecucao(
    skillId: string,
    usuarioId: string,
    entrada: string,
    saida: Prisma.InputJsonValue,
    tokensEntrada: number,
    tokensSaida: number,
  ) {
    return this.prisma.skillExecucao.create({
      data: { skillId, usuarioId, entrada, saida, tokensEntrada, tokensSaida },
    });
  }
}
