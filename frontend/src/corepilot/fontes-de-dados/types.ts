export interface FonteDeDados {
  id: string;
  tipo: string;
  nome: string;
  configuracao: {
    serverUrl: string;
    username: string;
    codSistema: string;
    codColigada: string;
  };
  ultimoTesteEm: string | null;
  ultimoTesteSucesso: boolean | null;
  ultimaMensagemErro: string | null;
  criadoEm: string;
}
