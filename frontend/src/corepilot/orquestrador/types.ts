export type TipoEtapa = 'tarefa_agente' | 'interacao_usuario' | 'aprovacao' | 'decisao_automatica' | 'integracao' | 'espera';
export type ExecutorEtapa = 'agente' | 'usuario' | 'agente_mais_usuario' | 'integracao' | 'agente_mais_integracao' | 'automatico';

export type TipoCampoEtapa =
  | 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'attachment'
  | 'entity-reference' | 'table' | 'reference-table' | 'summary';

export interface TableColumn {
  id: string;
  label: string;
  tipo: 'text' | 'checkbox' | 'date' | 'datetime' | 'number' | 'select' | 'calculated';
  calc?: { operation: 'multiply' | 'add' | 'subtract' | 'divide'; column1Id: string; column2Id: string; format?: string };
}

export interface CustomFieldEtapa {
  id: string;
  label: string;
  required: boolean;
  tipo: TipoCampoEtapa;
  placeholder?: string;
  options?: { label: string; value: string }[];
  maxFiles?: number;
  acceptedTypes?: string;
  entityType?: string;
  consultaParametrizadaId?: string;
  tableColumns?: TableColumn[];
  referenceConfig?: { referenceStepId: string; referenceFieldId: string; allowMultiplePerItem: boolean; additionalColumns: TableColumn[] };
  summaryConfig?: { sourceTableFieldId: string; sourceColumnId: string; operation: 'sum' | 'average' | 'count' | 'min' | 'max'; format?: string };
}

export interface Macroetapa {
  id: string;
  fluxoId: string;
  nome: string;
  ordem: number;
}

export interface Etapa {
  id: string;
  fluxoId: string;
  macroetapaId: string;
  ordem: number;
  nome: string;
  tipo: TipoEtapa;
  executor: ExecutorEtapa;
  prazoDias: number | null;
  agenteId: string | null;
  skillId: string | null;
  autonomia: string | null;
  aprovadores: string[];
  loopParaEtapaId: string | null;
  entradaRefs: string[];
  camposUsuario: CustomFieldEtapa[];
}

export interface Fluxo {
  id: string;
  moduloId: string;
  versao: number;
  publicado: boolean;
  macroetapas: Macroetapa[];
  etapas: Etapa[];
}

export type StatusInstancia = 'em_andamento' | 'concluido' | 'erro';

export interface InstanciaDeProcesso {
  id: string;
  fluxoId: string;
  moduloId: string;
  empresaId: string;
  etapaAtualId: string;
  status: StatusInstancia;
  dadosAcumulados: Record<string, unknown>;
  criadoEm: string;
  atualizadoEm: string;
}

export interface InstanciaResumo extends InstanciaDeProcesso {
  etapaAtualNome: string;
  macroetapaAtualId: string;
  macroetapaAtualNome: string;
}

export type StatusExecucao = 'pending' | 'processing' | 'done' | 'failed';
export type AtorExecucao = 'agente' | 'usuario' | 'integracao' | 'automatico';

export interface ExecucaoDeEtapa {
  id: string;
  instanciaId: string;
  etapaId: string;
  numeroDaExecucao: number;
  ator: AtorExecucao;
  atorUsuarioId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: StatusExecucao;
  mensagemErro: string | null;
  criadoEm: string;
  concluidoEm: string | null;
}

export interface AcaoEtapa {
  id: string;
  label: string;
  etapaDestinoId: string | null;
  exigeCampo?: { key: string; label: string; obrigatorio: boolean };
  estilo: 'primario' | 'secundario' | 'perigo';
}

export interface InstanciaDetalhe {
  instancia: InstanciaDeProcesso;
  etapaAtual: Etapa;
  etapas: Etapa[];
  acoes: AcaoEtapa[];
  historico: ExecucaoDeEtapa[];
}

export interface IntegracaoWhatsApp {
  id: string;
  empresaId: string;
  apiUrl: string;
  instanceName: string;
  phone: string | null;
  ultimoTesteEm: string | null;
  ultimoTesteSucesso: boolean | null;
  ultimaMensagemErro: string | null;
}
