import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConectorProvider,
  DadosToken,
} from '../conector-provider.interface';

const ESCOPOS_GOOGLE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

interface RespostaTokenGoogle {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

@Injectable()
export class GoogleConectorProvider implements ConectorProvider {
  constructor(private readonly config: ConfigService) {}

  montarUrlAutorizacao(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: ESCOPOS_GOOGLE.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async trocarCodigoPorToken(code: string): Promise<DadosToken> {
    const dados = await this.chamarEndpointDeToken({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI'),
    });
    const contaExterna = await this.buscarEmailDaConta(dados.access_token);

    return {
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token,
      expiraEm: this.calcularExpiracao(dados.expires_in),
      escopos: dados.scope ? dados.scope.split(' ') : ESCOPOS_GOOGLE,
      contaExterna,
    };
  }

  async renovarToken(
    refreshToken: string,
  ): Promise<Pick<DadosToken, 'accessToken' | 'expiraEm'>> {
    const dados = await this.chamarEndpointDeToken({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return {
      accessToken: dados.access_token,
      expiraEm: this.calcularExpiracao(dados.expires_in),
    };
  }

  async revogarToken(token: string): Promise<void> {
    const resposta = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    if (!resposta.ok) {
      throw new Error(
        `Google rejeitou a revogação do token (status ${resposta.status}): ${await resposta.text()}`,
      );
    }
  }

  private async chamarEndpointDeToken(
    parametros: Record<string, string>,
  ): Promise<RespostaTokenGoogle> {
    const resposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>(
          'GOOGLE_OAUTH_CLIENT_SECRET',
        ),
        ...parametros,
      }),
    });
    if (!resposta.ok) {
      const acao =
        parametros.grant_type === 'refresh_token'
          ? 'renovação do token'
          : 'troca do código de autorização';
      throw new Error(
        `Google rejeitou a ${acao} (status ${resposta.status}): ${await resposta.text()}`,
      );
    }
    return (await resposta.json()) as RespostaTokenGoogle;
  }

  private calcularExpiracao(expiresIn?: number): Date | undefined {
    return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  }

  private async buscarEmailDaConta(
    accessToken: string,
  ): Promise<string | undefined> {
    const resposta = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resposta.ok) return undefined;
    const dados = (await resposta.json()) as { email?: string };
    return dados.email;
  }
}
