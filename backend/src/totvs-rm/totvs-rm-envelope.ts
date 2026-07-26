export interface TotvsRmConexao {
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export function formatarParametros(parametros: Record<string, string>): string {
  return Object.entries(parametros)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(';');
}

export function montarEnvelopeConsultaSQL(
  conexao: TotvsRmConexao,
  codSentenca: string,
  parametros: Record<string, string>,
): string {
  const chave = `${conexao.username}|${conexao.senha}|${conexao.codSistema}|${conexao.codColigada}`;
  const parametrosString = formatarParametros(parametros);

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tot="http://www.totvs.com/">
  <soap:Header>
    <tot:AutenticacaoHeader>
      <tot:Chave>${chave}</tot:Chave>
    </tot:AutenticacaoHeader>
  </soap:Header>
  <soap:Body>
    <tot:RealizarConsultaSQL>
      <tot:codSentenca>${codSentenca}</tot:codSentenca>
      <tot:codColigada>${conexao.codColigada}</tot:codColigada>
      <tot:codSistema>${conexao.codSistema}</tot:codSistema>
      <tot:parameters>${parametrosString}</tot:parameters>
    </tot:RealizarConsultaSQL>
  </soap:Body>
</soap:Envelope>`;
}

export function montarAuthHeader(conexao: TotvsRmConexao): string {
  const credenciais = `${conexao.username}:${conexao.senha}`;
  return 'Basic ' + Buffer.from(credenciais, 'utf8').toString('base64');
}
