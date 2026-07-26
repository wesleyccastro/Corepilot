import { Injectable } from '@nestjs/common';
import { montarAuthHeader, montarEnvelopeConsultaSQL, type TotvsRmConexao } from './totvs-rm-envelope';
import { decodificarXml, extrairMensagemErro, extrairResultados } from './totvs-rm-parser';

@Injectable()
export class TotvsRmAdapterService {
  async realizarConsultaSQL(
    conexao: TotvsRmConexao,
    codSentenca: string,
    parametros: Record<string, string>,
  ): Promise<Record<string, string>[]> {
    const envelope = montarEnvelopeConsultaSQL(conexao, codSentenca, parametros);

    let resposta: Response;
    try {
      resposta = await fetch(`${conexao.serverUrl}/wsConsultaSQL/IwsConsultaSQL`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://www.totvs.com/IwsConsultaSQL/RealizarConsultaSQL"',
          Authorization: montarAuthHeader(conexao),
        },
        body: envelope,
      });
    } catch (erro) {
      throw new Error(`Servidor TOTVS RM inacessível — confira URL/porta: ${String(erro)}`);
    }

    const textoXml = await resposta.text();
    const decodificado = decodificarXml(textoXml);

    const mensagemErro = extrairMensagemErro(decodificado);
    if (mensagemErro) {
      throw new Error(mensagemErro);
    }

    return extrairResultados(decodificado);
  }
}
