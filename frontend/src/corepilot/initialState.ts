import { emptyKnowledgeForm, emptyTaskForm } from './types';
import type {
  AgentForm,
  AgentTask,
  AppUser,
  AutonomyLevel,
  DsForm,
  DsQuery,
  KanbanColumn,
  KnowledgeFormState,
  KnowledgeSource,
  ModuleChat,
  ModuleForm,
  NewQueryForm,
  NewTaskForm,
  NewUserForm,
  PermissionRow,
  Profile,
  SemanticField,
  Skill,
  TestMessage,
  Tool,
  ViewId,
  WaForm,
  WizardAgentTab,
} from './types';
import { initialGeneralKnowledgeSources, initialKnowledgeSources } from './seedData';
import type { Agente, CampoSaida, Skill as SkillReal } from './agentes/types';
import type { FonteDeDados } from './fontes-de-dados/types';
import type { Consulta, ResultadoTeste } from './consultas/types';
import type { Mensagem, Modulo } from './modulos/types';
import {
  emptyNovaConsultaForm,
  emptyNovaFonteForm,
  emptyNovoAgenteForm,
  type NovaConsultaForm,
  type NovaFonteForm,
  type NovoAgenteForm,
} from './types';

export interface CorePilotState {
  view: ViewId;
  previousView: ViewId;
  userMenuOpen: boolean;
  toast: string | null;
  publishedModules: Modulo[];
  modulesLoading: boolean;
  modulesError: string | null;
  editingModule: ViewId | null;

  kanban: KanbanColumn[];
  comprasCard: string | null;
  comprasView: 'board' | 'chat';

  wizardStep: number;
  moduleForm: ModuleForm;
  agentForm: AgentForm;
  instructions: string;
  agentTab: WizardAgentTab;
  editingSkill: Skill | null;
  skills: Skill[];
  tools: Tool[];
  autonomy: AutonomyLevel;
  agentTasks: AgentTask[];
  showNewTask: boolean;
  editingTaskId: string | null;
  taskMenuOpenId: string | null;
  newTaskForm: NewTaskForm;
  testMessages: TestMessage[];
  testResult: string | null;

  knowledgeSources: KnowledgeSource[];
  showNewKnowledge: boolean;
  editingKnowledgeId: string | null;
  knowledgeMenuOpenId: string | null;
  newKnowledgeForm: KnowledgeFormState;

  dsExpanded: boolean;
  dsMenuOpen: boolean;
  dsConnectionState: 'unconfigured' | 'saved_untested' | 'testing' | 'connected' | 'error';
  dsLastTestMsg: string;
  dsLastTestTime: string;
  dsForm: DsForm;
  dsChangingPassword: boolean;
  dsNewPassword: string;
  semanticFields: SemanticField[];
  semanticExpanded: boolean;
  queriesExpanded: boolean;
  dsQueries: DsQuery[];
  expandedQueryIds: string[];
  queryMenuOpenId: string | null;
  showNewQuery: boolean;
  newQueryForm: NewQueryForm;

  permissionRows: PermissionRow[];
  profiles: Profile[];
  users: AppUser[];

  adminTab: 'profiles' | 'users';
  showNewProfile: boolean;
  newProfileName: string;
  showNewUser: boolean;
  newUserForm: NewUserForm;

  adminSettingsTab: 'integrations' | 'knowledge';
  waConnectionState: 'disconnected' | 'testing' | 'connected';
  waExpanded: boolean;
  waChangingKey: boolean;
  waNewKey: string;
  waLastTestMsg: string;
  waNotifyTasks: boolean;
  waForm: WaForm;

  generalKnowledgeSources: KnowledgeSource[];
  showNewGeneralKnowledge: boolean;
  editingGeneralKnowledgeId: string | null;
  generalKnowledgeMenuOpenId: string | null;
  newGeneralKnowledgeForm: KnowledgeFormState;

  comprasChats: ModuleChat[];
  financeiroChats: ModuleChat[];
  comprasSearch: string;
  financeiroSearch: string;
  comprasActiveTag: string;
  financeiroActiveTag: string;
  comprasTagsList: string[];
  financeiroTagsList: string[];
  comprasTagsExpanded: boolean;
  financeiroTagsExpanded: boolean;
  comprasShowNewTag: boolean;
  comprasNewTagName: string;
  financeiroShowNewTag: boolean;
  financeiroNewTagName: string;
  comprasArchiveView: boolean;
  financeiroArchiveView: boolean;
  comprasAttachments: { name: string }[];
  financeiroAttachments: { name: string }[];
  overviewAttachments: { name: string }[];
  activeComprasChatId: string;
  activeFinanceiroChatId: string;
  comprasThreadsByChat: Record<string, import('./types').ChatMessage[]>;
  financeiroThreadsByChat: Record<string, import('./types').ChatMessage[]>;
  overviewThread: import('./types').ChatMessage[];
  comprasDraft: string;
  financeiroDraft: string;
  overviewDraft: string;
  comprasThinking: boolean;
  financeiroThinking: boolean;
  overviewThinking: boolean;
  comprasBasesOpen: boolean;
  financeiroBasesOpen: boolean;
  chatMenuOpenId: string | null;

  // --- Estado real (Wizard / módulo aberto) ---
  currentModuloId: string | null;
  wizardSaving: boolean;
  wizardError: string | null;

  moduloAgentes: Agente[];
  agentesLoading: boolean;
  selectedAgenteId: string | null;
  novoAgenteForm: NovoAgenteForm;
  showNovoAgenteForm: boolean;

  agenteSkills: SkillReal[];
  skillsLoading: boolean;
  editingSkillReal: SkillReal | null;
  skillFormNome: string;
  skillFormObjetivo: string;
  skillFormCampos: CampoSaida[];
  skillFerramentasSelecionadas: string[];

  moduloFontesDeDados: FonteDeDados[];
  fontesLoading: boolean;
  novaFonteForm: NovaFonteForm;
  showNovaFonteForm: boolean;

  moduloConsultas: Consulta[];
  consultasLoading: boolean;
  novaConsultaForm: NovaConsultaForm;
  showNovaConsultaForm: boolean;
  testandoConsultaId: string | null;
  resultadosTesteConsulta: Record<string, ResultadoTeste>;

  skillTestSelecionadaId: string | null;
  skillTestEntrada: string;
  skillTestando: boolean;
  skillTestResultado: { saida: Record<string, unknown>; tokensEntrada: number | null; tokensSaida: number | null } | null;
  skillTestErro: string | null;

  moduloConversaId: string | null;
  moduloMensagens: Mensagem[];
  moduloChatDraft: string;
  moduloChatEnviando: boolean;
  moduloChatErro: string | null;
}

export function createInitialState(): CorePilotState {
  return {
    view: 'overview',
    previousView: 'overview',
    userMenuOpen: false,
    toast: null,
    publishedModules: [],
    modulesLoading: true,
    modulesError: null,
    editingModule: null,

    kanban: [
      {
        id: 'triagem', title: 'Triagem', dot: '#5B6B70', cards: [
          { id: 'COT-0272', title: 'Filtros e lubrificação', sub: 'Trator John Deere 7215J', tag: '6 itens · Urgente', status: 'Agente verificando' },
          { id: 'COT-0273', title: 'Correias e transmissão', sub: 'Colheitadeira Case 8250', tag: '4 itens', status: 'Agrupando família' },
        ],
      },
      {
        id: 'validacao', title: 'Validação Comprador', dot: '#D97706', cards: [
          { id: 'COT-0270', title: 'Componentes hidráulicos', sub: 'Pulverizador Stara Imperador', tag: '8 itens', status: 'Revisar especificações' },
        ],
      },
      {
        id: 'cotacao', title: 'Cotação', dot: '#0EA5A0', cards: [
          { id: 'COT-0268', title: 'Peças John Deere 7215J', sub: 'Trator John Deere 7215J', tag: '12 itens · 4/6 responderam', status: null },
        ],
      },
      {
        id: 'aprovacao', title: 'Aprovação Comprador', dot: '#E8604C', cards: [
          { id: 'COT-0266', title: 'Componentes elétricos', sub: 'Pulverizador Stara Imperador', tag: 'R$ 18.740 · Agro Peças Brasil', status: 'Aprovar compra' },
        ],
      },
      {
        id: 'finalizado', title: 'Finalizado', dot: '#1E9E6B', cards: [
          { id: 'COT-0264', title: 'Filtros Fleetguard', sub: 'Trator Fleetguard', tag: '6 itens · Concluído', status: null },
        ],
      },
    ],
    comprasCard: null,
    comprasView: 'chat',

    wizardStep: 1,
    moduleForm: {
      name: 'Operações Agrícolas',
      description: 'Ambiente para analisar planejamento, execução, produtividade e custos das operações agrícolas.',
      objective: 'Unificar dados de safra, fazendas e talhões para decisões mais rápidas e confiáveis.',
      owner: 'Marcos Silva',
      areas: 'Todas as fazendas · LFG Agro',
      icon: 'leaf',
      color: '#0EA5A0',
    },
    agentForm: {
      name: 'Analista de Operações Agrícolas',
      role: 'Analisar planejamento, execução, produtividade e custos das operações agrícolas.',
      objective: 'Transformar dados agrícolas e conhecimento interno em análises gerenciais confiáveis e ações recomendadas.',
      owner: 'Marcos Silva',
      model: 'Claude',
    },
    instructions:
      'Você é um analista agrícola corporativo. Utilize somente as fontes autorizadas no módulo. Sempre informe safra, empresa, fazenda, período e origem dos dados. Não presuma valores ausentes. Quando houver inconsistência, apresente o problema e solicite validação.',
    agentTab: 'identity',
    editingSkill: null,
    skills: [
      { id: 1, name: 'Analisar Orçado x Realizado Agrícola', objective: 'Comparar planejamento e execução financeira por safra, fazenda, cultura e talhão.', trigger: '"compare orçado e realizado", "quais os desvios da safra"', autonomy: 'Consultar' },
      { id: 2, name: 'Analisar produtividade por talhão', objective: 'Avaliar a produtividade realizada frente à estimativa por talhão.', trigger: '"produtividade por talhão", "produção abaixo do esperado"', autonomy: 'Consultar' },
    ],
    tools: [
      { name: 'Consultar banco de dados', active: true, scope: 'Fontes autorizadas do módulo' },
      { name: 'Pesquisar documentos', active: true, scope: 'Base de conhecimento do módulo' },
      { name: 'Gerar gráfico e tabela', active: true, scope: 'Respostas do chat' },
      { name: 'Gerar relatório (PDF)', active: true, scope: 'Sob demanda' },
      { name: 'Exportar Excel', active: true, scope: 'Sob demanda' },
      { name: 'Criar tarefa', active: false, scope: 'Requer confirmação' },
      { name: 'Atualizar sistema externo', active: false, scope: 'Bloqueado neste módulo' },
    ],
    autonomy: 'consultar',
    agentTasks: [
      { id: 't1', name: 'Relatório semanal de desvios', action: 'Executa a skill "Analisar Orçado x Realizado Agrícola" e envia o resumo.', frequency: 'semanal', weekday: 'mon', time: '08:00', monthDay: '', eventTrigger: '', autonomyAction: 'executar_notificar', recipients: 'Comprador responsável, canal do chat do módulo', active: true },
      { id: 't2', name: 'Alerta de fornecedor atrasado', action: 'Verifica cotações sem resposta há mais de 3 dias e notifica o comprador.', frequency: 'evento', weekday: '', time: '', monthDay: '', eventTrigger: 'Cotação sem resposta há 3 dias', autonomyAction: 'notificar', recipients: 'Comprador responsável', active: false },
    ],
    showNewTask: false,
    editingTaskId: null,
    taskMenuOpenId: null,
    newTaskForm: { ...emptyTaskForm },
    testMessages: [],
    testResult: null,

    knowledgeSources: initialKnowledgeSources,
    showNewKnowledge: false,
    editingKnowledgeId: null,
    knowledgeMenuOpenId: null,
    newKnowledgeForm: { ...emptyKnowledgeForm },

    dsExpanded: false,
    dsMenuOpen: false,
    dsConnectionState: 'connected',
    dsLastTestMsg: '12.482 registros lidos · view VW_COPILOT_OPERACOES_AGRICOLAS',
    dsLastTestTime: 'há 30 min',
    dsForm: { host: 'https://rm.lfgagro.com.br', port: '8051', user: 'svc_copilot_rm', systemCode: 'RM', companyCode: '12', branch: '01', scope: 'VW_COPILOT_OPERACOES_AGRICOLAS' },
    dsChangingPassword: false,
    dsNewPassword: '',
    semanticFields: [
      { field: 'SAFRA', meaning: 'Safra agrícola', pending: false },
      { field: 'FAZENDA', meaning: 'Unidade produtiva', pending: false },
      { field: 'TALHAO', meaning: 'Talhão ou pivô', pending: false },
      { field: 'AREA_HA', meaning: 'Área cultivada em hectares', pending: false },
      { field: 'PRODUCAO_TON', meaning: '', pending: true },
      { field: 'CUSTO_TOTAL', meaning: '', pending: true },
    ],
    semanticExpanded: true,
    queriesExpanded: true,
    dsQueries: [
      { id: 'q1', rmName: 'SAFRA_PRODUCAO_COPILOT', description: 'Produção e custos por safra · base principal das skills de análise agrícola.', sql: 'SELECT SAFRA, FAZENDA, TALHAO, CULTURA,\n       AREA_HA, PRODUCAO_TON, CUSTO_TOTAL\nFROM VW_COPILOT_OPERACOES_AGRICOLAS\nWHERE CODCOLIGADA IN (@EMPRESAS)\n  AND SAFRA = @SAFRA', status: 'ready', usedBy: ['Analisar Orçado x Realizado Agrícola', 'Analisar produtividade por talhão'] },
      { id: 'q2', rmName: 'CUSTO_HECTARE_TALHAO', description: 'Custo por hectare por talhão · apoio para comparativos de custo.', sql: 'SELECT FAZENDA, TALHAO,\n       CUSTO_TOTAL / NULLIF(AREA_HA,0) AS CUSTO_HA\nFROM VW_COPILOT_OPERACOES_AGRICOLAS\nWHERE CODCOLIGADA IN (@EMPRESAS)\n  AND SAFRA = @SAFRA', status: 'pending', usedBy: [] },
    ],
    expandedQueryIds: ['q1'],
    queryMenuOpenId: null,
    showNewQuery: false,
    newQueryForm: { rmName: '', description: '' },

    permissionRows: [
      { id: 'access', label: 'Acessar o módulo', profileIds: ['gestor', 'campo', 'engenheiro'] },
      { id: 'chat', label: 'Conversar com o agente', profileIds: ['gestor', 'engenheiro'] },
      { id: 'analyses', label: 'Criar análises e relatórios', profileIds: ['gestor', 'engenheiro'] },
      { id: 'approve', label: 'Aprovar ações do agente', profileIds: ['gestor'] },
      { id: 'publish', label: 'Publicar ou alterar configuração', profileIds: ['admin'] },
    ],
    profiles: [
      { id: 'admin', name: 'Administrador do CorePilot', color: '#E8604C' },
      { id: 'gestor', name: 'Gestor', color: '#07364A' },
      { id: 'comprador', name: 'Comprador', color: '#0EA5A0' },
      { id: 'engenheiro', name: 'Engenheiro Agrícola', color: '#1E9E6B' },
      { id: 'campo', name: 'Colaborador de Campo', color: '#5B6B70' },
    ],
    users: [
      { id: 1, name: 'Marcos Silva', email: 'marcos.silva@lfgagro.com.br', company: 'LFG Agro · Matriz', profileIds: ['admin', 'gestor'] },
      { id: 2, name: 'Ana Ferreira', email: 'ana.ferreira@lfgagro.com.br', company: 'Fazenda Santa Rita', profileIds: ['engenheiro'] },
      { id: 3, name: 'Carlos Mendes', email: 'carlos.mendes@lfgagro.com.br', company: 'Fazenda São José', profileIds: ['gestor', 'engenheiro'] },
      { id: 4, name: 'Beatriz Nunes', email: 'beatriz.nunes@lfgagro.com.br', company: 'LFG Agro · Matriz', profileIds: ['comprador'] },
      { id: 5, name: 'João Prado', email: 'joao.prado@lfgagro.com.br', company: 'Fazenda Bela Vista', profileIds: ['campo'] },
    ],

    adminTab: 'profiles',
    showNewProfile: false,
    newProfileName: '',
    showNewUser: false,
    newUserForm: { name: '', email: '', company: '', profileIds: [] },

    adminSettingsTab: 'integrations',
    waConnectionState: 'disconnected',
    waExpanded: false,
    waChangingKey: false,
    waNewKey: '',
    waLastTestMsg: '',
    waNotifyTasks: false,
    waForm: { apiUrl: '', instanceName: '', phone: '' },

    generalKnowledgeSources: initialGeneralKnowledgeSources,
    showNewGeneralKnowledge: false,
    editingGeneralKnowledgeId: null,
    generalKnowledgeMenuOpenId: null,
    newGeneralKnowledgeForm: { ...emptyKnowledgeForm },

    comprasChats: [
      { id: 'c1', title: 'Status das cotações em aberto', agent: 'Agente de Compras', tag: 'Cotações', seedKind: 'quotes', pinned: false, hidden: false, order: 2 },
      { id: 'c2', title: 'Fornecedores com atraso na entrega', agent: 'Agente de Compras', tag: 'Fornecedores', seedKind: 'suppliers', pinned: false, hidden: false, order: 1 },
    ],
    financeiroChats: [
      { id: 'f1', title: 'Orçado x realizado · 1º semestre', agent: 'Agente Financeiro', tag: 'Orçamento', seedKind: 'budget', pinned: false, hidden: false, order: 2 },
      { id: 'f2', title: 'Projeção de fluxo de caixa', agent: 'Agente Financeiro', tag: 'Fluxo de caixa', seedKind: 'cashflow', pinned: false, hidden: false, order: 1 },
    ],
    comprasSearch: '',
    financeiroSearch: '',
    comprasActiveTag: 'all',
    financeiroActiveTag: 'all',
    comprasTagsList: ['Cotações', 'Fornecedores'],
    financeiroTagsList: ['Orçamento', 'Fluxo de caixa'],
    comprasTagsExpanded: false,
    financeiroTagsExpanded: false,
    comprasShowNewTag: false,
    comprasNewTagName: '',
    financeiroShowNewTag: false,
    financeiroNewTagName: '',
    comprasArchiveView: false,
    financeiroArchiveView: false,
    comprasAttachments: [],
    financeiroAttachments: [],
    overviewAttachments: [],
    activeComprasChatId: 'c1',
    activeFinanceiroChatId: 'f1',
    comprasThreadsByChat: { c1: [], c2: [] },
    financeiroThreadsByChat: { f1: [], f2: [] },
    overviewThread: [],
    comprasDraft: '',
    financeiroDraft: '',
    overviewDraft: '',
    comprasThinking: false,
    financeiroThinking: false,
    overviewThinking: false,
    comprasBasesOpen: false,
    financeiroBasesOpen: false,
    chatMenuOpenId: null,

    currentModuloId: null,
    wizardSaving: false,
    wizardError: null,

    moduloAgentes: [],
    agentesLoading: false,
    selectedAgenteId: null,
    novoAgenteForm: { ...emptyNovoAgenteForm },
    showNovoAgenteForm: false,

    agenteSkills: [],
    skillsLoading: false,
    editingSkillReal: null,
    skillFormNome: '',
    skillFormObjetivo: '',
    skillFormCampos: [],
    skillFerramentasSelecionadas: [],

    moduloFontesDeDados: [],
    fontesLoading: false,
    novaFonteForm: { ...emptyNovaFonteForm },
    showNovaFonteForm: false,

    moduloConsultas: [],
    consultasLoading: false,
    novaConsultaForm: emptyNovaConsultaForm(),
    showNovaConsultaForm: false,
    testandoConsultaId: null,
    resultadosTesteConsulta: {},

    skillTestSelecionadaId: null,
    skillTestEntrada: '',
    skillTestando: false,
    skillTestResultado: null,
    skillTestErro: null,

    moduloConversaId: null,
    moduloMensagens: [],
    moduloChatDraft: '',
    moduloChatEnviando: false,
    moduloChatErro: null,
  };
}
