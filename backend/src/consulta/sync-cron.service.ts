import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { estaDevida } from './sync-devida';

@Injectable()
export class SyncCronService {
  private readonly logger = new Logger(SyncCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consultaSincronizacaoService: ConsultaSincronizacaoService,
  ) {}

  @Cron('*/5 * * * *')
  async verificarConsultasDevidas() {
    const consultasAtivas = await this.prisma.consultaParametrizada.findMany({
      where: { sincronizacaoAtiva: true },
      include: { fonteDeDados: true },
    });

    const devidas = consultasAtivas.filter((consulta) =>
      estaDevida(consulta.ultimaSincronizacaoEm, consulta.intervaloSincronizacaoMinutos),
    );

    for (const consulta of devidas) {
      try {
        await this.consultaSincronizacaoService.executarSincronizacao(consulta);
      } catch (erro) {
        this.logger.error(`Falha inesperada ao sincronizar consulta ${consulta.id}`, erro);
      }
    }
  }
}
