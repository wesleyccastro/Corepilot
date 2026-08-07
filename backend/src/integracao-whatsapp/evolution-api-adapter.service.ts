import { Injectable } from '@nestjs/common';

export interface EvolutionApiConexao {
  apiUrl: string;
  instanceName: string;
  apiKey: string;
}

@Injectable()
export class EvolutionApiAdapterService {
  async testarConexao(
    conexao: EvolutionApiConexao,
  ): Promise<{ conectado: boolean; estado: string }> {
    let resposta: Response;
    try {
      resposta = await fetch(
        `${conexao.apiUrl}/instance/connectionState/${conexao.instanceName}`,
        {
          headers: { apikey: conexao.apiKey },
        },
      );
    } catch (erro) {
      throw new Error(
        `Evolution API inacessível — confira a URL da instância: ${String(erro)}`,
      );
    }
    if (!resposta.ok) {
      throw new Error(
        `Evolution API respondeu com erro (status ${resposta.status}): ${await resposta.text()}`,
      );
    }
    const dados = (await resposta.json()) as { instance?: { state?: string } };
    const estado = dados.instance?.state ?? 'desconhecido';
    return { conectado: estado === 'open', estado };
  }

  async enviarMensagem(
    conexao: EvolutionApiConexao,
    telefone: string,
    texto: string,
  ): Promise<{ messageId: string }> {
    let resposta: Response;
    try {
      resposta = await fetch(
        `${conexao.apiUrl}/message/sendText/${conexao.instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: conexao.apiKey,
          },
          body: JSON.stringify({ number: telefone, text: texto }),
        },
      );
    } catch (erro) {
      throw new Error(
        `Evolution API inacessível ao enviar mensagem: ${String(erro)}`,
      );
    }
    if (!resposta.ok) {
      throw new Error(
        `Evolution API rejeitou o envio (status ${resposta.status}): ${await resposta.text()}`,
      );
    }
    const dados = (await resposta.json()) as { key?: { id?: string } };
    return { messageId: dados.key?.id ?? '' };
  }
}
