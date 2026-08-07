import { TotvsRmAdapterService } from './totvs-rm-adapter.service';

describe('TotvsRmAdapterService', () => {
  const conexao = {
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama o endpoint wsConsultaSQL com o envelope e headers corretos', async () => {
    const respostaXml = '<Resultado><CODPRODUTO>123</CODPRODUTO></Resultado>';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () => Promise.resolve(respostaXml),
    } as Response);
    const service = new TotvsRmAdapterService();

    const resultado = await service.realizarConsultaSQL(
      conexao,
      'SALDOESTOQUEINSU',
      {
        CODFILIAL: '001',
      },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://servidor:8051/wsConsultaSQL/IwsConsultaSQL',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction:
            '"http://www.totvs.com/IwsConsultaSQL/RealizarConsultaSQL"',
        }),
      }),
    );
    expect(resultado).toEqual([{ CODPRODUTO: '123' }]);
  });

  it('lança erro com a mensagem de negócio do RM quando a resposta contém um faultstring', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: () =>
        Promise.resolve(
          '<soap:Fault><faultstring>Coligada inválida</faultstring></soap:Fault>',
        ),
    } as Response);
    const service = new TotvsRmAdapterService();

    await expect(service.realizarConsultaSQL(conexao, 'X', {})).rejects.toThrow(
      'Coligada inválida',
    );
  });

  it('lança erro de rede quando o fetch falha', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new TotvsRmAdapterService();

    await expect(service.realizarConsultaSQL(conexao, 'X', {})).rejects.toThrow(
      'inacessível',
    );
  });
});
