export type ViewId =
  | 'overview'
  | 'compras'
  | 'financeiro'
  | 'wizard'
  | 'admin-users'
  | 'admin-settings'
  | 'admin-company'
  | `module:${string}`;

export interface ChatMessage {
  id: number;
  isUser: boolean;
  isAi: boolean;
  text: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  sub: string;
  tag: string;
  status: string | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  dot: string;
  cards: KanbanCard[];
}

export interface CardTimelineStep {
  t: string;
  label: string;
  dotColor: string;
}

export interface CardQuote {
  supplier: string;
  value: string;
  days: string;
  best: boolean;
  borderColor: string;
}

export interface CardDetailExtra {
  equipment: string;
  timeline: CardTimelineStep[];
  quotes: CardQuote[];
}

export type ModuleKey = 'compras' | 'financeiro';
export type ChatSeedKind = 'quotes' | 'suppliers' | 'budget' | 'cashflow';

export interface ModuleChat {
  id: string;
  title: string;
  agent: string;
  tag: string;
  seedKind: ChatSeedKind;
  pinned: boolean;
  hidden: boolean;
  order: number;
}

export type KnowledgeSourceType = 'text' | 'file' | 'link' | 'folder';
export type KnowledgeStatus = 'indexed' | 'synced' | 'processing';

export interface KnowledgeSource {
  id: string;
  name: string;
  category: string;
  owner: string;
  updated: string;
  status: KnowledgeStatus;
  sourceType: KnowledgeSourceType;
  textContent?: string;
  fileName?: string;
  link?: string;
  folderLink?: string;
}

export interface KnowledgeFormState {
  name: string;
  category: string;
  owner: string;
  sourceType: KnowledgeSourceType;
  textContent: string;
  fileName: string;
  link: string;
  folderLink: string;
}

export const emptyKnowledgeForm: KnowledgeFormState = {
  name: '',
  category: '',
  owner: '',
  sourceType: 'text',
  textContent: '',
  fileName: '',
  link: '',
  folderLink: '',
};

export interface ModuleForm {
  name: string;
  description: string;
  objective: string;
  owner: string;
  areas: string;
  icon: string;
  color: string;
}

export interface AgentForm {
  name: string;
  role: string;
  objective: string;
  owner: string;
  model: string;
}

export type SkillAutonomy = 'Consultar' | 'Confirmar' | 'Executar';

export interface Skill {
  id: number;
  name: string;
  objective: string;
  trigger: string;
  autonomy: SkillAutonomy;
}

export type TaskFrequency = 'diaria' | 'semanal' | 'mensal' | 'evento';
export type TaskAutonomyAction = 'notificar' | 'executar_notificar' | 'executar_aprovar';

export interface AgentTask {
  id: string;
  name: string;
  action: string;
  frequency: TaskFrequency;
  weekday: string;
  time: string;
  monthDay: string;
  eventTrigger: string;
  autonomyAction: TaskAutonomyAction;
  recipients: string;
  active: boolean;
}

export interface NewTaskForm {
  name: string;
  action: string;
  frequency: TaskFrequency;
  weekday: string;
  time: string;
  monthDay: string;
  eventTrigger: string;
  autonomyAction: TaskAutonomyAction;
  recipients: string;
}

export const emptyTaskForm: NewTaskForm = {
  name: '',
  action: '',
  frequency: 'diaria',
  weekday: 'mon',
  time: '08:00',
  monthDay: '',
  eventTrigger: '',
  autonomyAction: 'notificar',
  recipients: '',
};

export interface Profile {
  id: string;
  name: string;
  color: string;
}

export interface AppUser {
  id: number;
  name: string;
  email: string;
  company: string;
  profileIds: string[];
}

export interface NewUserForm {
  name: string;
  email: string;
  company: string;
  profileIds: string[];
}

export interface PermissionRow {
  id: string;
  label: string;
  profileIds: string[];
}

export type AutonomyLevel = 'consultar' | 'confirmar' | 'executar';

export interface DsQuery {
  id: string;
  rmName: string;
  description: string;
  sql: string;
  status: 'ready' | 'pending';
  usedBy: string[];
}

export interface NewQueryForm {
  rmName: string;
  description: string;
}

export interface SemanticField {
  field: string;
  meaning: string;
  pending: boolean;
}

export interface DsForm {
  host: string;
  port: string;
  user: string;
  systemCode: string;
  companyCode: string;
  branch: string;
  scope: string;
}

export type DsConnectionState = 'unconfigured' | 'saved_untested' | 'testing' | 'connected' | 'error';
export type WaConnectionState = 'disconnected' | 'testing' | 'connected';

export interface WaForm {
  apiUrl: string;
  instanceName: string;
  phone: string;
}

export interface TestMessage {
  role: 'user' | 'agent';
  text: string;
  skill?: string;
  sources?: string;
  time?: string;
}

export interface Attachment {
  name: string;
}

export interface Alert {
  id: number;
  text: string;
  module: string;
  view: ViewId;
  bg: string;
  color: string;
}

export interface Approval {
  id: number;
  title: string;
  subtitle: string;
  view: ViewId;
}

export interface AgentWorking {
  id: number;
  name: string;
  status: string;
}

export interface OverviewQnA {
  module: string;
  agent: string;
  question: string;
  answer: string;
  tagBg: string;
  tagColor: string;
}

export type WizardAgentTab =
  | 'identity'
  | 'instructions'
  | 'skills'
  | 'skill-editor'
  | 'tools'
  | 'tasks'
  | 'autonomy'
  | 'test';

export interface Tool {
  name: string;
  active: boolean;
  scope: string;
}

export interface DataSourceSummary {
  name: string;
  type: string;
  status: string;
  updated: string;
}

export interface NovoAgenteForm {
  nome: string;
  funcao: string;
  objetivo: string;
}

export const emptyNovoAgenteForm: NovoAgenteForm = { nome: '', funcao: '', objetivo: '' };

export interface NovaFonteForm {
  tipo: string;
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export const emptyNovaFonteForm: NovaFonteForm = {
  tipo: '',
  nome: '',
  serverUrl: '',
  username: '',
  senha: '',
  codSistema: '',
  codColigada: '',
};

export interface EditFonteForm {
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export const emptyEditFonteForm: EditFonteForm = {
  nome: '',
  serverUrl: '',
  username: '',
  senha: '',
  codSistema: '',
  codColigada: '',
};

export interface ParametroConsultaForm {
  chave: string;
  valor: string;
}

export interface NovaConsultaForm {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametros: ParametroConsultaForm[];
  camposFiltro: import('./agentes/types').CampoSaida[];
}

export function emptyNovaConsultaForm(): NovaConsultaForm {
  return { fonteDeDadosId: '', nome: '', codSentenca: '', parametros: [{ chave: '', valor: '' }], camposFiltro: [] };
}
