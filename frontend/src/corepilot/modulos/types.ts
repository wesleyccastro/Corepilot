export interface Modulo {
  id: string;
  nome: string;
  objetivo: string;
  instrucoes: string | null;
  descricao: string | null;
  responsavel: string | null;
  areas: string | null;
  icone: string | null;
  cor: string | null;
  modeloIA: string;
  criadoEm: string;
}

export interface Conversa {
  id: string;
  moduloId: string;
  titulo: string | null;
  arquivada: boolean;
  fixada: boolean;
  tagId: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ConversaTag {
  id: string;
  moduloId: string;
  nome: string;
  criadoEm: string;
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
