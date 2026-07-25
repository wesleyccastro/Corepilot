import type {
  Alert,
  Approval,
  AgentWorking,
  CardDetailExtra,
  DataSourceSummary,
  KnowledgeSource,
  OverviewQnA,
} from './types';

export const cardDetails: Record<string, CardDetailExtra> = {
  'COT-0266': {
    equipment: 'Pulverizador Stara Imperador',
    timeline: [
      { t: '09:20', label: 'Solicitação recebida', dotColor: '#0EA5A0' },
      { t: '09:22', label: 'IA identificou peças e agrupou por família', dotColor: '#0EA5A0' },
      { t: '09:40', label: 'Cotação enviada a 4 fornecedores', dotColor: '#0EA5A0' },
      { t: '14:10', label: '3 propostas recebidas', dotColor: '#0EA5A0' },
      { t: 'Agora', label: 'Aguardando aprovação do comprador', dotColor: '#D97706' },
    ],
    quotes: [
      { supplier: 'Agro Peças Brasil', value: 'R$ 18.740', days: '5 dias', best: true, borderColor: '#0EA5A0' },
      { supplier: 'Mineira Máquinas', value: 'R$ 19.980', days: '3 dias', best: false, borderColor: '#E4E7E5' },
      { supplier: 'Tratorpeças Noroeste', value: 'R$ 21.150', days: '7 dias', best: false, borderColor: '#E4E7E5' },
    ],
  },
  'COT-0268': {
    equipment: 'Trator John Deere 7215J',
    timeline: [
      { t: 'Ontem', label: 'Solicitação recebida', dotColor: '#0EA5A0' },
      { t: 'Ontem', label: 'IA identificou peças e agrupou por família', dotColor: '#0EA5A0' },
      { t: 'Ontem', label: 'Cotação enviada a 6 fornecedores', dotColor: '#0EA5A0' },
      { t: 'Hoje', label: '4 de 6 fornecedores responderam', dotColor: '#0EA5A0' },
      { t: 'Em andamento', label: 'Aguardando demais propostas', dotColor: '#D97706' },
    ],
    quotes: [
      { supplier: 'Agro Peças Brasil', value: 'R$ 24.300', days: '6 dias', best: true, borderColor: '#0EA5A0' },
      { supplier: 'Mineira Máquinas', value: 'R$ 25.900', days: '4 dias', best: false, borderColor: '#E4E7E5' },
    ],
  },
};

export const overviewQnA: OverviewQnA[] = [
  {
    module: 'Compras',
    agent: 'Agente de Compras',
    question: 'Quais cotações estão paradas há mais tempo aguardando fornecedor?',
    answer:
      'COT-0268 (Peças John Deere 7215J) aguarda 4 de 6 fornecedores há 2 dias · COT-0273 está agrupando família de itens há 1 dia.',
    tagBg: '#FEF3E2',
    tagColor: '#D97706',
  },
  {
    module: 'Financeiro',
    agent: 'Agente Financeiro',
    question: 'Compare o orçamento com o realizado até junho e explique os principais desvios.',
    answer:
      'O realizado está R$ 940 mil acima do orçado (+5,1%), puxado por Manutenção (+R$ 310 mil) e Insumos (+R$ 245 mil).',
    tagBg: '#E9F7F1',
    tagColor: '#1E9E6B',
  },
  {
    module: 'Compras',
    agent: 'Agente de Compras',
    question: 'Quais fornecedores estão com entregas atrasadas?',
    answer:
      '3 fornecedores estão com entregas atrasadas: Tratorpeças Noroeste, Mineira Máquinas e Agro Peças Brasil, todos vinculados a cotações em andamento.',
    tagBg: '#FEF3E2',
    tagColor: '#D97706',
  },
];

export const alerts: Alert[] = [
  { id: 1, text: 'Orçado x realizado 8,4% acima do previsto no 1º semestre.', module: 'Financeiro', view: 'financeiro', bg: '#FDEDE9', color: '#E8604C' },
  { id: 2, text: 'R$ 284 mil em compras aguardando aprovação.', module: 'Compras', view: 'compras', bg: '#FEF3E2', color: '#D97706' },
  { id: 3, text: '3 fornecedores estão com entregas atrasadas.', module: 'Compras', view: 'compras', bg: '#FDEDE9', color: '#E8604C' },
];

export const approvals: Approval[] = [
  { id: 1, title: 'COT-0266 · Componentes elétricos', subtitle: 'R$ 18.740 · Agro Peças Brasil', view: 'compras' },
  { id: 2, title: 'Contas a pagar · Julho', subtitle: 'R$ 412 mil pendentes', view: 'financeiro' },
];

export const agentsWorking: AgentWorking[] = [
  { id: 1, name: 'Agente de Compras', status: 'Triando 12 solicitações' },
  { id: 2, name: 'Agente Financeiro', status: 'Analisou 6.180 lançamentos em 3 empresas' },
];

export const initialGeneralKnowledgeSources: KnowledgeSource[] = [
  { id: 'g1', name: 'Código de Conduta LFG Agro', category: 'Políticas corporativas', owner: 'RH', updated: 'há 2 meses', status: 'indexed', sourceType: 'file', fileName: 'codigo-de-conduta.pdf' },
  { id: 'g2', name: 'Organograma e alçadas de aprovação', category: 'Estrutura', owner: 'Diretoria', updated: 'há 3 semanas', status: 'indexed', sourceType: 'text', textContent: 'Alçadas: compras acima de R$ 50 mil exigem aprovação da diretoria financeira...' },
];

export const initialKnowledgeSources: KnowledgeSource[] = [
  { id: 'k1', name: 'Procedimentos Agrícolas', category: 'Políticas e manuais', owner: 'Ana Ferreira', updated: 'há 3 dias', status: 'indexed', sourceType: 'file', fileName: 'procedimentos-agricolas.pdf' },
  { id: 'k2', name: 'Planejamento Safra 2026', category: 'Planejamento', owner: 'Carlos Mendes', updated: 'hoje', status: 'synced', sourceType: 'folder', folderLink: 'https://drive.google.com/drive/folders/planejamento-safra-2026' },
  { id: 'k3', name: 'Normas Técnicas ANDEF', category: 'Normas', owner: 'Jurídico', updated: 'há 1 mês', status: 'indexed', sourceType: 'link', link: 'https://drive.google.com/file/normas-tecnicas-andef' },
];

export const collections = ['Procedimentos', 'Políticas', 'Planejamento', 'Normas'];

export const dataSources: DataSourceSummary[] = [
  { name: 'TOTVS RM · Produção e Custos', type: 'SQL Server', status: 'Conectado', updated: 'Atualiza a cada 30 minutos' },
  { name: 'Clima e operações de campo', type: 'API REST', status: 'Ativa', updated: 'Última consulta: há 12 min' },
];

export const semanticMeanings: Record<string, string> = {
  PRODUCAO_TON: 'Produção realizada em toneladas',
  CUSTO_TOTAL: 'Custo agrícola realizado',
};

export const suggestedQuestionsBase = [
  'Compare a produtividade das fazendas na safra atual.',
  'Quais talhões estão com custo por hectare acima do orçamento?',
  'Explique os principais desvios da Fazenda São José.',
  'Gere um relatório executivo da safra.',
];

export const comprasReplies = [
  'Verifiquei as cotações em aberto: 2 aguardam resposta de fornecedor há mais de 2 dias. Quer que eu envie um lembrete automático?',
  'Com base no histórico de compras, os 3 fornecedores mais rápidos para essa categoria são Tratorpeças Noroeste, Mineira Máquinas e Agro Peças Brasil.',
  'Encontrei 1 cotação pendente de aprovação do comprador. Posso abrir o card para você revisar.',
];

export const financeiroReplies = [
  'Analisando o orçamento por fazenda: Santa Rita concentra 38% do desvio total do semestre.',
  'O maior componente do desvio segue sendo Manutenção, puxado por peças de colheitadeiras compradas fora do previsto.',
  'Posso gerar um relatório executivo com esse recorte e enviar para o grupo financeiro, se quiser.',
];

export const overviewReplies = [
  'Consultei os módulos de Compras e Financeiro: não há bloqueios críticos hoje, apenas 2 cotações aguardando fornecedor.',
  'O desvio orçamentário do semestre segue em 5,1% acima do previsto, com Manutenção como principal fator.',
  'Posso detalhar por módulo — me diga se quer focar em Compras, Financeiro ou visão consolidada.',
];
