import {
  decodificarXml,
  extrairMensagemErro,
  extrairResultados,
} from './totvs-rm-parser';

describe('totvs-rm-parser', () => {
  it('decodifica entidades XML escapadas', () => {
    expect(decodificarXml('&lt;tag&gt; A &amp; B &quot;C&quot;')).toBe(
      '<tag> A & B "C"',
    );
  });

  it('extrai múltiplas linhas de <Resultado>', () => {
    const xml =
      '<Resultados>' +
      '<Resultado><CODPRODUTO>1</CODPRODUTO><QUANTIDADE>10</QUANTIDADE></Resultado>' +
      '<Resultado><CODPRODUTO>2</CODPRODUTO><QUANTIDADE>20</QUANTIDADE></Resultado>' +
      '</Resultados>';

    expect(extrairResultados(xml)).toEqual([
      { CODPRODUTO: '1', QUANTIDADE: '10' },
      { CODPRODUTO: '2', QUANTIDADE: '20' },
    ]);
  });

  it('retorna array vazio quando não há <Resultado>', () => {
    expect(extrairResultados('<Resultados></Resultados>')).toEqual([]);
  });

  it('extrai mensagem de erro de faultstring', () => {
    const xml =
      '<soap:Fault><faultstring>Coligada inválida</faultstring></soap:Fault>';
    expect(extrairMensagemErro(xml)).toBe('Coligada inválida');
  });

  it('retorna null quando não há mensagem de erro', () => {
    expect(extrairMensagemErro('<Resultado></Resultado>')).toBeNull();
  });
});
