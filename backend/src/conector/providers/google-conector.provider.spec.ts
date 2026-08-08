import type { ConfigService } from '@nestjs/config';
import { GoogleConectorProvider } from './google-conector.provider';

describe('GoogleConectorProvider', () => {
  const VALORES: Record<string, string> = {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id-teste',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-teste',
    GOOGLE_OAUTH_REDIRECT_URI:
      'http://localhost:3000/conectores/google/callback',
  };

  function buildConfig(): ConfigService {
    return {
      getOrThrow: jest.fn((chave: string) => VALORES[chave]),
    } as unknown as ConfigService;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('montarUrlAutorizacao monta a URL de consentimento com os escopos somente-leitura e o state repassado', () => {
    const provider = new GoogleConectorProvider(buildConfig());

    const url = new URL(provider.montarUrlAutorizacao('state-de-teste'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('client-id-teste');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/conectores/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-de-teste');
    const escopos = url.searchParams.get('scope') ?? '';
    expect(escopos).toContain('drive.readonly');
    expect(escopos).toContain('spreadsheets.readonly');
    expect(escopos).toContain('calendar.readonly');
    expect(escopos).toContain('gmail.readonly');
  });

  it('trocarCodigoPorToken troca o código por tokens e busca o e-mail da conta', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-123',
            refresh_token: 'refresh-123',
            expires_in: 3600,
            scope:
              'openid email https://www.googleapis.com/auth/drive.readonly',
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ email: 'fulano@gmail.com' }),
      } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    const resultado = await provider.trocarCodigoPorToken(
      'codigo-de-autorizacao',
    );

    expect(resultado.accessToken).toBe('access-123');
    expect(resultado.refreshToken).toBe('refresh-123');
    expect(resultado.contaExterna).toBe('fulano@gmail.com');
    expect(resultado.escopos).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/drive.readonly',
    ]);
    expect(resultado.expiraEm).toBeInstanceOf(Date);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/oauth2/v2/userinfo',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-123' },
      }),
    );
  });

  it('trocarCodigoPorToken lança erro descritivo quando o Google rejeita o código', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    await expect(
      provider.trocarCodigoPorToken('codigo-invalido'),
    ).rejects.toThrow('Google rejeitou a troca do código de autorização');
  });

  it('renovarToken troca o refresh token por um access token novo', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ access_token: 'access-renovado', expires_in: 3600 }),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    const resultado = await provider.renovarToken('refresh-123');

    expect(resultado.accessToken).toBe('access-renovado');
    expect(resultado.expiraEm).toBeInstanceOf(Date);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renovarToken lança erro descritivo quando o Google rejeita o refresh token', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    } as Response);
    const provider = new GoogleConectorProvider(buildConfig());

    await expect(provider.renovarToken('refresh-invalido')).rejects.toThrow(
      'Google rejeitou a renovação do token',
    );
  });
});
