export interface Modulo {
  id: string;
  nome: string;
  objetivo: string;
  instrucoes: string | null;
  modeloIA: string;
  criadoEm: string;
}

export interface Conversa {
  id: string;
  moduloId: string;
  titulo: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type PapelMensagem = 'usuario' | 'agente';

export interface Mensagem {
  id: string;
  conversaId: string;
  papel: PapelMensagem;
  conteudo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  criadoEm: string;
}
