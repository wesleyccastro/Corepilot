export interface DadosToken {
  accessToken: string;
  refreshToken?: string;
  expiraEm?: Date;
  escopos: string[];
  contaExterna?: string;
}

export interface ConectorProvider {
  montarUrlAutorizacao(state: string): string;
  trocarCodigoPorToken(code: string): Promise<DadosToken>;
  renovarToken(
    refreshToken: string,
  ): Promise<Pick<DadosToken, 'accessToken' | 'expiraEm'>>;
  revogarToken(token: string): Promise<void>;
}
