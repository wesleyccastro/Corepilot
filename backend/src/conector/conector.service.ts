import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar } from '../fonte-de-dados/crypto';
import { assinarEstado, verificarEstado } from './estado-oauth';
import { GoogleConectorProvider } from './providers/google-conector.provider';
import type { ConectorProvider } from './conector-provider.interface';

const DURACAO_STATE_MS = 10 * 60 * 1000;

@Injectable()
export class ConectorService {
  private readonly providers: Map<string, ConectorProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    googleProvider: GoogleConectorProvider,
  ) {
    this.providers = new Map<string, ConectorProvider>([
      ['google', googleProvider],
    ]);
  }

  iniciar(provider: string, usuarioId: string, empresaId: string): string {
    const instancia = this.obterProvider(provider);
    const state = assinarEstado(
      { usuarioId, empresaId, provider, exp: Date.now() + DURACAO_STATE_MS },
      this.chaveState(),
    );
    return instancia.montarUrlAutorizacao(state);
  }

  async processarCallback(
    provider: string,
    code: string,
    state: string,
  ): Promise<{ usuarioId: string; empresaId: string }> {
    let payload;
    try {
      payload = verificarEstado(state, this.chaveState());
    } catch (erro) {
      throw new UnauthorizedException(
        erro instanceof Error ? erro.message : 'state inválido',
      );
    }
    if (payload.provider !== provider) {
      throw new UnauthorizedException(
        'state não corresponde ao provider da rota',
      );
    }

    const instancia = this.obterProvider(provider);
    const dados = await instancia.trocarCodigoPorToken(code);
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');

    await this.prisma.conectorConexao.upsert({
      where: {
        usuarioId_empresaId_provider: {
          usuarioId: payload.usuarioId,
          empresaId: payload.empresaId,
          provider,
        },
      },
      create: {
        usuarioId: payload.usuarioId,
        empresaId: payload.empresaId,
        provider,
        contaExterna: dados.contaExterna,
        accessTokenCriptografado: criptografar(dados.accessToken, chave),
        refreshTokenCriptografado: dados.refreshToken
          ? criptografar(dados.refreshToken, chave)
          : null,
        expiraEm: dados.expiraEm,
        escopos: dados.escopos,
      },
      update: {
        contaExterna: dados.contaExterna,
        accessTokenCriptografado: criptografar(dados.accessToken, chave),
        refreshTokenCriptografado: dados.refreshToken
          ? criptografar(dados.refreshToken, chave)
          : undefined,
        expiraEm: dados.expiraEm,
        escopos: dados.escopos,
      },
    });

    return { usuarioId: payload.usuarioId, empresaId: payload.empresaId };
  }

  async listar(usuarioId: string, empresaId: string) {
    const conexoes = await this.prisma.conectorConexao.findMany({
      where: { usuarioId, empresaId },
      orderBy: { criadoEm: 'desc' },
    });
    return conexoes.map((conexao) => {
      const { accessTokenCriptografado, refreshTokenCriptografado, ...resto } =
        conexao;
      void accessTokenCriptografado;
      void refreshTokenCriptografado;
      return resto;
    });
  }

  async desconectar(
    provider: string,
    usuarioId: string,
    empresaId: string,
  ): Promise<void> {
    await this.prisma.conectorConexao.deleteMany({
      where: { usuarioId, empresaId, provider },
    });
  }

  private obterProvider(provider: string): ConectorProvider {
    const instancia = this.providers.get(provider);
    if (!instancia) {
      throw new NotFoundException(`Provider "${provider}" não suportado`);
    }
    return instancia;
  }

  private chaveState(): string {
    return this.config.getOrThrow<string>('CONECTOR_STATE_SECRET');
  }
}
