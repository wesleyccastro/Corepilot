import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TotvsRmAdapterService } from '../totvs-rm/totvs-rm-adapter.service';
import { descriptografar } from '../fonte-de-dados/crypto';
import type { ConfiguracaoFonteDeDados } from '../fonte-de-dados/fonte-de-dados.service';
import { mesclarColunas, type ColunaDescrita } from './colunas';

export interface ConsultaComFonte {
  id: string;
  fonteDeDadosId: string;
  codSentenca: string;
  parametrosSincronizacao: unknown;
  colunas: unknown;
  fonteDeDados: { configuracao: unknown };
}

export type ResultadoSincronizacao =
  | {
      sucesso: true;
      linhasLidas: number;
      colunas: ColunaDescrita[];
      amostra: Record<string, string>[];
    }
  | { sucesso: false; erro: string };

@Injectable()
export class ConsultaSincronizacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly totvsRmAdapter: TotvsRmAdapterService,
  ) {}

  async executarSincronizacao(
    consulta: ConsultaComFonte,
  ): Promise<ResultadoSincronizacao> {
    const configuracao = consulta.fonteDeDados
      .configuracao as ConfiguracaoFonteDeDados;
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');

    const conexao = {
      serverUrl: configuracao.serverUrl,
      username: configuracao.username,
      senha: descriptografar(configuracao.senhaCriptografada, chave),
      codSistema: configuracao.codSistema,
      codColigada: configuracao.codColigada,
    };

    let linhas: Record<string, string>[];
    try {
      linhas = await this.totvsRmAdapter.realizarConsultaSQL(
        conexao,
        consulta.codSentenca,
        consulta.parametrosSincronizacao as Record<string, string>,
      );
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.consultaParametrizada.update({
        where: { id: consulta.id },
        data: {
          ultimoResultadoSincronizacao: {
            sucesso: false,
            erro: mensagem,
          },
        },
      });
      await this.prisma.fonteDeDados.update({
        where: { id: consulta.fonteDeDadosId },
        data: {
          ultimoTesteEm: new Date(),
          ultimoTesteSucesso: false,
          ultimaMensagemErro: mensagem,
        },
      });
      return { sucesso: false, erro: mensagem };
    }

    const colunasMescladas = mesclarColunas(
      consulta.colunas as ColunaDescrita[] | null,
      linhas.length > 0 ? Object.keys(linhas[0]) : [],
    );

    await this.prisma.consultaResultado.deleteMany({
      where: { consultaParametrizadaId: consulta.id },
    });
    if (linhas.length > 0) {
      await this.prisma.consultaResultado.createMany({
        data: linhas.map((linha) => ({
          consultaParametrizadaId: consulta.id,
          dados: linha,
        })),
      });
    }

    await this.prisma.consultaParametrizada.update({
      where: { id: consulta.id },
      data: {
        testada: true,
        colunas: colunasMescladas as unknown as Prisma.InputJsonValue,
        ultimaSincronizacaoEm: new Date(),
        ultimoResultadoSincronizacao: {
          sucesso: true,
          linhasLidas: linhas.length,
        },
      },
    });
    await this.prisma.fonteDeDados.update({
      where: { id: consulta.fonteDeDadosId },
      data: {
        ultimoTesteEm: new Date(),
        ultimoTesteSucesso: true,
        ultimaMensagemErro: null,
      },
    });

    return {
      sucesso: true,
      linhasLidas: linhas.length,
      colunas: colunasMescladas,
      amostra: linhas.slice(0, 5),
    };
  }
}
