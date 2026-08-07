import { EvolutionApiAdapterService } from './evolution-api-adapter.service';

describe('EvolutionApiAdapterService', () => {
  const conexao = {
    apiUrl: 'https://evolution.exemplo.com',
    instanceName: 'corepilot',
    apiKey: 'chave-123',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('testarConexao reporta conectado quando o estado é "open"', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instance: { state: 'open' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.testarConexao(conexao);

    expect(resultado).toEqual({ conectado: true, estado: 'open' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evolution.exemplo.com/instance/connectionState/corepilot',
      expect.objectContaining({ headers: { apikey: 'chave-123' } }),
    );
  });

  it('testarConexao reporta não conectado pra qualquer estado diferente de "open"', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instance: { state: 'close' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.testarConexao(conexao);

    expect(resultado.conectado).toBe(false);
  });

  it('lança erro descritivo quando o servidor está inacessível', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new EvolutionApiAdapterService();

    await expect(adapter.testarConexao(conexao)).rejects.toThrow(
      'Evolution API inacessível',
    );
  });

  it('enviarMensagem envia number/text e devolve o messageId', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: { id: 'msg-abc' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.enviarMensagem(
      conexao,
      '+5511999999999',
      'Olá!',
    );

    expect(resultado).toEqual({ messageId: 'msg-abc' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evolution.exemplo.com/message/sendText/corepilot',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'chave-123' },
        body: JSON.stringify({ number: '+5511999999999', text: 'Olá!' }),
      }),
    );
  });

  it('enviarMensagem lança erro quando a Evolution API rejeita o envio', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('número inválido'),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    await expect(adapter.enviarMensagem(conexao, 'x', 'y')).rejects.toThrow(
      'Evolution API rejeitou o envio',
    );
  });
});
