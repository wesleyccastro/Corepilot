import { formatarParametros, montarAuthHeader, montarEnvelopeConsultaSQL } from './totvs-rm-envelope';

describe('totvs-rm-envelope', () => {
  const conexao = {
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  it('formata parâmetros como CHAVE=valor;CHAVE2=valor2', () => {
    expect(formatarParametros({ CODFILIAL: '001', DATASINC: '20260726' })).toBe(
      'CODFILIAL=001;DATASINC=20260726',
    );
  });

  it('formata string vazia quando não há parâmetros', () => {
    expect(formatarParametros({})).toBe('');
  });

  it('monta o envelope SOAP com AutenticacaoHeader e RealizarConsultaSQL', () => {
    const envelope = montarEnvelopeConsultaSQL(conexao, 'SALDOESTOQUEINSU', { CODFILIAL: '001' });

    expect(envelope).toContain('<tot:Chave>admin|segredo|T|1</tot:Chave>');
    expect(envelope).toContain('<tot:codSentenca>SALDOESTOQUEINSU</tot:codSentenca>');
    expect(envelope).toContain('<tot:codColigada>1</tot:codColigada>');
    expect(envelope).toContain('<tot:parameters>CODFILIAL=001</tot:parameters>');
  });

  it('monta o header de HTTP Basic Auth', () => {
    const header = montarAuthHeader(conexao);
    expect(header).toBe('Basic ' + Buffer.from('admin:segredo').toString('base64'));
  });
});
