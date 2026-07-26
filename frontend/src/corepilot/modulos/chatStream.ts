import { apiFetch } from '../api/apiFetch';
import type { Conversa, Mensagem } from './types';

export async function listarConversas(accessToken: string, moduloId: string): Promise<Conversa[]> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar conversas (status ${response.status})`);
  return (await response.json()) as Conversa[];
}

export async function criarConversa(accessToken: string, moduloId: string): Promise<Conversa> {
  const response = await apiFetch(`/modulos/${moduloId}/conversas`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao criar conversa (status ${response.status})`);
  return (await response.json()) as Conversa;
}

export async function listarMensagens(accessToken: string, conversaId: string): Promise<Mensagem[]> {
  const response = await apiFetch(`/conversas/${conversaId}/mensagens`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar mensagens (status ${response.status})`);
  return (await response.json()) as Mensagem[];
}

export interface EnviarMensagemHandlers {
  onDelta: (texto: string) => void;
  onDone: (info: { mensagemId: string; tokensEntrada: number; tokensSaida: number }) => void;
  onErro: (mensagem: string) => void;
}

export async function enviarMensagemStreaming(
  accessToken: string,
  conversaId: string,
  conteudo: string,
  handlers: EnviarMensagemHandlers,
): Promise<void> {
  const response = await apiFetch(`/conversas/${conversaId}/mensagens`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conteudo }),
  });

  if (!response.ok || !response.body) {
    handlers.onErro(`Falha ao enviar mensagem (status ${response.status})`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let indiceQuebra: number;
    while ((indiceQuebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, indiceQuebra).trim();
      buffer = buffer.slice(indiceQuebra + 1);
      if (!linha) continue;

      const evento = JSON.parse(linha) as
        | { type: 'delta'; text: string }
        | { type: 'done'; mensagemId: string; tokensEntrada: number; tokensSaida: number }
        | { type: 'erro'; mensagem: string };

      if (evento.type === 'delta') handlers.onDelta(evento.text);
      else if (evento.type === 'done') handlers.onDone(evento);
      else handlers.onErro(evento.mensagem);
    }
  }
}
