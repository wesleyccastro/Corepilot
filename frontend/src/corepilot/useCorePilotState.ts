import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { createInitialState, type CorePilotState } from './initialState';
import { comprasReplies, financeiroReplies, overviewReplies, semanticMeanings } from './seedData';
import { emptyKnowledgeForm, emptyTaskForm } from './types';
import type {
  AutonomyLevel,
  ChatMessage,
  KnowledgeFormState,
  KnowledgeSourceType,
  ModuleChat,
  ModuleKey,
  Skill,
  SkillAutonomy,
  TaskAutonomyAction,
  TaskFrequency,
  ViewId,
} from './types';
import {
  criarAgente,
  atualizarAgente,
  criarSkill,
  atualizarSkill,
  anexarFerramenta,
  removerFerramenta,
  listarAgentes,
  listarSkills,
  executarSkill,
} from './agentes/api';
import { criarFonteDeDados, listarFontesDeDados } from './fontes-de-dados/api';
import { atualizarModulo, criarModulo, listarModulos } from './modulos/api';
import {
  atualizarSincronizacao,
  criarConsulta,
  listarConsultas,
  testarConsulta,
} from './consultas/api';
import { criarConversa, enviarMensagemStreaming, listarConversas, listarMensagens } from './modulos/chatStream';
import { emptyNovaConsultaForm, emptyNovaFonteForm, emptyNovoAgenteForm } from './types';
import type { CampoSaida, Skill as SkillReal } from './agentes/types';
import type { Consulta } from './consultas/types';

type Patch = Partial<CorePilotState> | ((s: CorePilotState) => Partial<CorePilotState> | null);
type ChatListKey = 'comprasChats' | 'financeiroChats';

function chatListKeyFor(module: ModuleKey): ChatListKey {
  return module === 'compras' ? 'comprasChats' : 'financeiroChats';
}

export function useCorePilotState(accessToken: string) {
  const [state, setState] = useState<CorePilotState>(createInitialState);
  const toastTimer = useRef<number | undefined>(undefined);
  const moduleTimers = useRef<Record<string, number | undefined>>({});
  const knowledgeIndexTimer = useRef<number | undefined>(undefined);
  const generalKnowledgeIndexTimer = useRef<number | undefined>(undefined);
  const waTestTimer = useRef<number | undefined>(undefined);
  const dsTestTimer = useRef<number | undefined>(undefined);

  const comprasScrollRef = useRef<HTMLDivElement>(null);
  const financeiroScrollRef = useRef<HTMLDivElement>(null);
  const overviewScrollRef = useRef<HTMLDivElement>(null);

  const update = (patch: Patch) => {
    setState((s) => {
      const delta = typeof patch === 'function' ? patch(s) : patch;
      return delta ? { ...s, ...delta } : s;
    });
  };

  useEffect(() => {
    let cancelado = false;
    listarModulos(accessToken)
      .then((modulos) => {
        if (!cancelado) update({ publishedModules: modulos, modulesLoading: false });
      })
      .catch((err: Error) => {
        if (!cancelado) update({ modulesLoading: false, modulesError: err.message });
      });
    return () => {
      cancelado = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const showToast = (msg: string) => {
    window.clearTimeout(toastTimer.current);
    update({ toast: msg });
    toastTimer.current = window.setTimeout(() => update({ toast: null }), 3200);
  };

  const setView = (v: ViewId) => update({ view: v, comprasCard: null });
  const goStep = (n: number) => {
    const bloqueado = n > 1 && !state.currentModuloId && state.editingModule !== 'compras' && state.editingModule !== 'financeiro';
    if (bloqueado) return;
    update({ wizardStep: n });
  };
  const setAgentTab = (tab: CorePilotState['agentTab']) => update({ agentTab: tab, editingSkill: null });
  const selectCard = (id: string) => update({ comprasCard: id });
  const closeCard = () => update({ comprasCard: null });

  const approveCard = () => {
    update((s) => {
      const id = s.comprasCard;
      if (!id) return null;
      const card = s.kanban.flatMap((c) => c.cards).find((c) => c.id === id);
      const kanban = s.kanban.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== id) }));
      const fin = kanban.find((c) => c.id === 'finalizado');
      if (card && fin) fin.cards = [{ ...card, status: null, tag: card.tag + ' · Concluído' }, ...fin.cards];
      return { kanban, comprasCard: null };
    });
    showToast('Pedido de compra aprovado e gerado com sucesso.');
  };
  const rejectCard = () => { update({ comprasCard: null }); showToast('Cotação rejeitada. Nova rodada solicitada.'); };
  const requestChanges = () => { update({ comprasCard: null }); showToast('Ajustes solicitados ao Agente de Compras.'); };

  const updateModuleField = (field: keyof CorePilotState['moduleForm']) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    update((s) => ({ moduleForm: { ...s.moduleForm, [field]: val } }));
  };
  const selectIcon = (icon: string) => update((s) => ({ moduleForm: { ...s.moduleForm, icon } }));
  const selectColor = (color: string) => update((s) => ({ moduleForm: { ...s.moduleForm, color } }));
  const updateAgentField = (field: keyof CorePilotState['agentForm']) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    update((s) => ({ agentForm: { ...s.agentForm, [field]: val } }));
  };
  const selectModel = (model: string) => update((s) => ({ agentForm: { ...s.agentForm, model } }));
  const updateInstructions = (e: ChangeEvent<HTMLTextAreaElement>) => update({ instructions: e.target.value });
  const salvarInstrucoesReal = async () => {
    if (!state.currentModuloId) return;
    try {
      await atualizarModulo(accessToken, state.currentModuloId, { instrucoes: state.instructions });
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao salvar instruções' });
    }
  };

  const toggleTool = (idx: number) => update((s) => ({ tools: s.tools.map((t, i) => (i === idx ? { ...t, active: !t.active } : t)) }));

  const toggleNewTaskForm = () => update((s) => ({
    showNewTask: !s.showNewTask,
    editingTaskId: null,
    newTaskForm: { ...emptyTaskForm },
  }));
  const updateTaskField = (field: keyof CorePilotState['newTaskForm']) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const val = e.target.value;
    update((s) => ({ newTaskForm: { ...s.newTaskForm, [field]: val } }));
  };
  const setTaskFrequency = (freq: TaskFrequency) => update((s) => ({ newTaskForm: { ...s.newTaskForm, frequency: freq } }));
  const setTaskAutonomy = (level: TaskAutonomyAction) => update((s) => ({ newTaskForm: { ...s.newTaskForm, autonomyAction: level } }));
  const toggleTaskMenu = (id: string) => update((s) => ({ taskMenuOpenId: s.taskMenuOpenId === id ? null : id }));
  const closeTaskMenu = () => update({ taskMenuOpenId: null });
  const toggleTaskActive = (id: string) => update((s) => ({ agentTasks: s.agentTasks.map((t) => (t.id === id ? { ...t, active: !t.active } : t)) }));
  const editTask = (id: string) => {
    update((s) => {
      const t = s.agentTasks.find((x) => x.id === id);
      if (!t) return null;
      return {
        editingTaskId: id,
        showNewTask: true,
        taskMenuOpenId: null,
        newTaskForm: { name: t.name, action: t.action, frequency: t.frequency, weekday: t.weekday, time: t.time, monthDay: t.monthDay, eventTrigger: t.eventTrigger, autonomyAction: t.autonomyAction, recipients: t.recipients },
      };
    });
  };
  const removeTask = (id: string) => {
    update((s) => ({ agentTasks: s.agentTasks.filter((t) => t.id !== id), taskMenuOpenId: null }));
    showToast('Tarefa removida.');
  };
  const saveTask = () => {
    const f = state.newTaskForm;
    if (!f.name.trim()) return;
    if (state.editingTaskId) {
      const id = state.editingTaskId;
      update((s) => ({ agentTasks: s.agentTasks.map((t) => (t.id === id ? { ...t, ...f } : t)), showNewTask: false, editingTaskId: null }));
      showToast('Tarefa atualizada.');
      return;
    }
    const id = 't' + Date.now();
    update((s) => ({ agentTasks: [...s.agentTasks, { id, ...f, active: true }], showNewTask: false }));
    showToast('Tarefa criada.');
  };
  const setAutonomy = (level: AutonomyLevel) => update({ autonomy: level });

  const openNewSkill = () => update({ editingSkill: { id: 0, name: '', objective: '', trigger: '', autonomy: 'Consultar' }, agentTab: 'skill-editor' });
  const editSkill = (skill: Skill) => update({ editingSkill: { ...skill }, agentTab: 'skill-editor' });
  const duplicateSkill = (skill: Skill) => update((s) => ({ skills: [...s.skills, { ...skill, id: Date.now(), name: skill.name + ' (cópia)' }] }));
  const updateSkillField = (field: 'name' | 'objective' | 'trigger') => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    update((s) => (s.editingSkill ? { editingSkill: { ...s.editingSkill, [field]: val } } : null));
  };
  const setSkillAutonomy = (level: SkillAutonomy) => update((s) => (s.editingSkill ? { editingSkill: { ...s.editingSkill, autonomy: level } } : null));
  const saveSkill = () => {
    update((s) => {
      const es = s.editingSkill;
      if (!es) return null;
      const skills = es.id ? s.skills.map((sk) => (sk.id === es.id ? es : sk)) : [...s.skills, { ...es, id: Date.now() }];
      return { skills, editingSkill: null, agentTab: 'skills' };
    });
    showToast('Skill salva com sucesso.');
  };
  const cancelSkillEdit = () => update({ editingSkill: null, agentTab: 'skills' });

  const askSuggested = (question: string) => {
    update({
      testMessages: [
        { role: 'user', text: question },
        { role: 'agent', text: 'Consultei as fontes autorizadas do módulo e apliquei a skill "Analisar Orçado x Realizado Agrícola" para responder.', skill: 'Analisar Orçado x Realizado Agrícola', sources: 'TOTVS RM · Produção e Custos, Planejamento Safra 2026', time: '2,4s' },
      ],
      testResult: null,
    });
  };
  const setTestResult = (r: string) => update({ testResult: r });

  const publishModule = async () => {
    const isMockEdit = state.editingModule === 'compras' || state.editingModule === 'financeiro';
    if (!isMockEdit) {
      const ok = await salvarModuloReal();
      if (!ok) return;
    }
    if (state.editingModule) {
      const target = state.editingModule;
      update({ view: target, editingModule: null });
      showToast('Alterações salvas.');
      return;
    }
    update((s) => ({ view: `module:${s.currentModuloId}` as ViewId, editingModule: null }));
    showToast('Módulo publicado. Já está disponível na navegação.');
  };
  const saveDraft = () => showToast('Rascunho salvo.');
  const testModule = () => showToast('Abrindo ambiente de teste do módulo…');

  const salvarModuloReal = async (): Promise<boolean> => {
    if (state.wizardSaving) return false;
    const dto = {
      nome: state.moduleForm.name,
      objetivo: state.moduleForm.objective,
      instrucoes: state.instructions,
      descricao: state.moduleForm.description,
      responsavel: state.moduleForm.owner,
      areas: state.moduleForm.areas,
      icone: state.moduleForm.icon,
      cor: state.moduleForm.color,
    };
    if (!dto.nome.trim() || !dto.objetivo.trim()) {
      update({ wizardError: 'Nome e objetivo do módulo são obrigatórios.' });
      return false;
    }
    update({ wizardSaving: true, wizardError: null });
    try {
      if (state.currentModuloId) {
        const atualizado = await atualizarModulo(accessToken, state.currentModuloId, dto);
        update((s) => ({
          wizardSaving: false,
          publishedModules: s.publishedModules.map((m) => (m.id === atualizado.id ? atualizado : m)),
        }));
      } else {
        const criado = await criarModulo(accessToken, dto);
        update((s) => ({ wizardSaving: false, currentModuloId: criado.id, publishedModules: [criado, ...s.publishedModules] }));
      }
      return true;
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao salvar módulo' });
      return false;
    }
  };

  const nextStep = async () => {
    const precisaSalvar = state.wizardStep === 1 && state.editingModule !== 'compras' && state.editingModule !== 'financeiro';
    if (precisaSalvar) {
      const ok = await salvarModuloReal();
      if (!ok) return;
    }
    update((s) => ({ wizardStep: Math.min(6, s.wizardStep + 1) }));
  };
  const prevStep = () => update((s) => ({ wizardStep: Math.max(1, s.wizardStep - 1) }));
  const viewWizardNew = () => update({
    view: 'wizard', wizardStep: 1, editingModule: null, wizardError: null,
    currentModuloId: null,
    moduleForm: { name: '', description: '', objective: '', owner: '', areas: '', icon: 'leaf', color: '#0EA5A0' },
    instructions: '',
    moduloAgentes: [], selectedAgenteId: null, agenteSkills: [],
    moduloConsultas: [],
    agentTab: 'identity' as const,
  });
  const editModule = (viewName: ViewId) => {
    if (viewName === 'compras' || viewName === 'financeiro') {
      // moduleForm/instructions são compartilhados com o Wizard de módulos reais — "Criar
      // módulo" (viewWizardNew) os zera. Restaurar os valores mock aqui, sempre, protege esta
      // tela mock de qualquer reset anterior, sem depender de nunca ter sido tocada.
      update({
        view: 'wizard',
        wizardStep: 1,
        editingModule: viewName,
        previousView: viewName,
        moduleForm: {
          name: 'Operações Agrícolas',
          description: 'Ambiente para analisar planejamento, execução, produtividade e custos das operações agrícolas.',
          objective: 'Unificar dados de safra, fazendas e talhões para decisões mais rápidas e confiáveis.',
          owner: 'Marcos Silva',
          areas: 'Todas as fazendas · LFG Agro',
          icon: 'leaf',
          color: '#0EA5A0',
        },
        instructions:
          'Você é um analista agrícola corporativo. Utilize somente as fontes autorizadas no módulo. Sempre informe safra, empresa, fazenda, período e origem dos dados. Não presuma valores ausentes. Quando houver inconsistência, apresente o problema e solicite validação.',
      });
      return;
    }
    const moduloId = viewName.replace('module:', '');
    const modulo = state.publishedModules.find((m) => m.id === moduloId);
    if (!modulo) return;
    update({
      view: 'wizard', wizardStep: 1, editingModule: viewName, previousView: viewName, wizardError: null,
      currentModuloId: modulo.id,
      moduleForm: {
        name: modulo.nome,
        description: modulo.descricao ?? '',
        objective: modulo.objetivo,
        owner: modulo.responsavel ?? '',
        areas: modulo.areas ?? '',
        icon: modulo.icone ?? 'leaf',
        color: modulo.cor ?? '#0EA5A0',
      },
      instructions: modulo.instrucoes ?? '',
      selectedAgenteId: null,
      agenteSkills: [],
      agentTab: 'identity' as const,
    });
    void carregarAgentesDoModulo(modulo.id);
    void carregarConsultasDoModulo(modulo.id);
  };
  const editComprasModule = () => editModule('compras');
  const editFinanceiroModule = () => editModule('financeiro');
  const editActiveModule = () => editModule(state.view);
  const backFromWizardEdit = () => update((s) => ({ view: s.previousView || 'overview', editingModule: null }));

  const setComprasBoard = () => update({ comprasView: 'board' });
  const setComprasChat = () => update({ comprasView: 'chat' });
  const toggleComprasBases = () => update((s) => ({ comprasBasesOpen: !s.comprasBasesOpen, financeiroBasesOpen: false }));
  const toggleFinanceiroBases = () => update((s) => ({ financeiroBasesOpen: !s.financeiroBasesOpen, comprasBasesOpen: false }));
  const closeBasesMenus = () => update({ comprasBasesOpen: false, financeiroBasesOpen: false });
  const toggleChatMenu = (id: string) => update((s) => ({ chatMenuOpenId: s.chatMenuOpenId === id ? null : id }));
  const closeChatMenu = () => update({ chatMenuOpenId: null });

  const setChatList = (listKey: ChatListKey, updater: (list: ModuleChat[]) => ModuleChat[]) => {
    update((s) => (listKey === 'comprasChats' ? { comprasChats: updater(s.comprasChats) } : { financeiroChats: updater(s.financeiroChats) }));
  };

  const togglePinChat = (listKey: ChatListKey, id: string) => {
    const list = state[listKey];
    const target = list.find((c) => c.id === id);
    if (target && !target.pinned && list.filter((c) => c.pinned && !c.hidden).length >= 4) {
      showToast('Você já tem 4 conversas fixadas.');
      update({ chatMenuOpenId: null });
      return;
    }
    setChatList(listKey, (list) => list.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
    update({ chatMenuOpenId: null });
  };
  const hideChat = (listKey: ChatListKey, id: string) => {
    setChatList(listKey, (list) => list.map((c) => (c.id === id ? { ...c, hidden: true } : c)));
    update({ chatMenuOpenId: null });
    showToast('Conversa ocultada.');
  };
  const deleteChat = (listKey: ChatListKey, id: string) => {
    setChatList(listKey, (list) => list.filter((c) => c.id !== id));
    update({ chatMenuOpenId: null });
    showToast('Conversa excluída.');
  };
  const restoreChat = (listKey: ChatListKey, id: string) => {
    setChatList(listKey, (list) => list.map((c) => (c.id === id ? { ...c, hidden: false } : c)));
    showToast('Conversa reexibida.');
  };

  const updateComprasSearch = (e: ChangeEvent<HTMLInputElement>) => update({ comprasSearch: e.target.value });
  const updateFinanceiroSearch = (e: ChangeEvent<HTMLInputElement>) => update({ financeiroSearch: e.target.value });
  const setComprasTag = (tag: string) => update({ comprasActiveTag: tag });
  const setFinanceiroTag = (tag: string) => update({ financeiroActiveTag: tag });
  const toggleComprasTagsExpanded = () => update((s) => ({ comprasTagsExpanded: !s.comprasTagsExpanded }));
  const toggleFinanceiroTagsExpanded = () => update((s) => ({ financeiroTagsExpanded: !s.financeiroTagsExpanded }));

  const toggleNewTagForm = (module: ModuleKey) => {
    if (module === 'compras') update((s) => ({ comprasShowNewTag: !s.comprasShowNewTag, comprasNewTagName: '' }));
    else update((s) => ({ financeiroShowNewTag: !s.financeiroShowNewTag, financeiroNewTagName: '' }));
  };
  const updateNewTagName = (module: ModuleKey) => (e: ChangeEvent<HTMLInputElement>) => {
    if (module === 'compras') update({ comprasNewTagName: e.target.value });
    else update({ financeiroNewTagName: e.target.value });
  };
  const addTag = (module: ModuleKey) => () => {
    const name = (module === 'compras' ? state.comprasNewTagName : state.financeiroNewTagName).trim();
    if (!name) return;
    if (module === 'compras') {
      update((s) => ({
        comprasTagsList: s.comprasTagsList.includes(name) ? s.comprasTagsList : [...s.comprasTagsList, name],
        comprasShowNewTag: false, comprasNewTagName: '',
      }));
    } else {
      update((s) => ({
        financeiroTagsList: s.financeiroTagsList.includes(name) ? s.financeiroTagsList : [...s.financeiroTagsList, name],
        financeiroShowNewTag: false, financeiroNewTagName: '',
      }));
    }
  };
  const removeTag = (module: ModuleKey, tagName: string) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (module === 'compras') {
      update((s) => ({
        comprasTagsList: s.comprasTagsList.filter((t) => t !== tagName),
        comprasActiveTag: s.comprasActiveTag === tagName ? 'all' : s.comprasActiveTag,
      }));
    } else {
      update((s) => ({
        financeiroTagsList: s.financeiroTagsList.filter((t) => t !== tagName),
        financeiroActiveTag: s.financeiroActiveTag === tagName ? 'all' : s.financeiroActiveTag,
      }));
    }
  };
  const assignChatTag = (listKey: ChatListKey, chatId: string, tagName: string) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setChatList(listKey, (list) => list.map((c) => (c.id === chatId ? { ...c, tag: tagName } : c)));
    update({ chatMenuOpenId: null });
  };

  const openComprasArchive = () => update({ comprasArchiveView: true });
  const closeComprasArchive = () => update({ comprasArchiveView: false });
  const openFinanceiroArchive = () => update({ financeiroArchiveView: true });
  const closeFinanceiroArchive = () => update({ financeiroArchiveView: false });

  const autoGrowInput = (e: { target: HTMLTextAreaElement }) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  type AttachmentListKey = 'comprasAttachments' | 'financeiroAttachments' | 'overviewAttachments';
  const onAttachFiles = (listKey: AttachmentListKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    update((s) => ({ [listKey]: [...s[listKey], ...files.map((f) => ({ name: f.name }))] }) as Partial<CorePilotState>);
    e.target.value = '';
  };
  const removeAttachment = (listKey: AttachmentListKey, idx: number) => {
    update((s) => ({ [listKey]: s[listKey].filter((_, i) => i !== idx) }) as Partial<CorePilotState>);
  };

  type DraftKey = 'comprasDraft' | 'financeiroDraft' | 'overviewDraft';
  const updateDraft = (draftKey: DraftKey) => (e: ChangeEvent<HTMLTextAreaElement>) => {
    autoGrowInput(e);
    update({ [draftKey]: e.target.value } as Partial<CorePilotState>);
  };

  const selectComprasChat = (id: string) => update({ activeComprasChatId: id });
  const selectFinanceiroChat = (id: string) => update({ activeFinanceiroChatId: id });

  const scrollRefFor = (moduleKey: ModuleKey | 'overview') => ({ compras: comprasScrollRef, financeiro: financeiroScrollRef, overview: overviewScrollRef }[moduleKey]);
  const scrollThreadToBottom = (moduleKey: ModuleKey | 'overview') => {
    const ref = scrollRefFor(moduleKey);
    requestAnimationFrame(() => { if (ref && ref.current) ref.current.scrollTop = ref.current.scrollHeight; });
  };
  const appendToModuleThread = (moduleKey: ModuleKey | 'overview', msg: ChatMessage) => {
    if (moduleKey === 'overview') {
      update((s) => ({ overviewThread: [...s.overviewThread, msg] }));
      scrollThreadToBottom('overview');
      return;
    }
    const idKey = moduleKey === 'compras' ? 'activeComprasChatId' : 'activeFinanceiroChatId';
    const mapKey = moduleKey === 'compras' ? 'comprasThreadsByChat' : 'financeiroThreadsByChat';
    update((s) => {
      const activeId = s[idKey];
      const list = s[mapKey][activeId] || [];
      return { [mapKey]: { ...s[mapKey], [activeId]: [...list, msg] } } as Partial<CorePilotState>;
    });
    scrollThreadToBottom(moduleKey);
  };

  const makeQuickAction = (moduleKey: ModuleKey, thinkingKey: 'comprasThinking' | 'financeiroThinking', question: string, reply: string) => () => {
    appendToModuleThread(moduleKey, { id: Date.now(), isUser: true, isAi: false, text: question });
    update({ [thinkingKey]: true } as Partial<CorePilotState>);
    window.clearTimeout(moduleTimers.current[moduleKey]);
    moduleTimers.current[moduleKey] = window.setTimeout(() => {
      appendToModuleThread(moduleKey, { id: Date.now() + 1, isUser: false, isAi: true, text: reply });
      update({ [thinkingKey]: false } as Partial<CorePilotState>);
    }, 1400);
  };

  const makeSendHandler = (moduleKey: ModuleKey | 'overview', draftKey: DraftKey, thinkingKey: 'comprasThinking' | 'financeiroThinking' | 'overviewThinking', replies: string[]) => () => {
    const text = (state[draftKey] || '').trim();
    if (!text) return;
    appendToModuleThread(moduleKey, { id: Date.now(), isUser: true, isAi: false, text });
    update({ [draftKey]: '', [thinkingKey]: true } as Partial<CorePilotState>);
    window.clearTimeout(moduleTimers.current[moduleKey]);
    moduleTimers.current[moduleKey] = window.setTimeout(() => {
      const reply = replies[Math.floor(Math.random() * replies.length)];
      appendToModuleThread(moduleKey, { id: Date.now() + 1, isUser: false, isAi: true, text: reply });
      update({ [thinkingKey]: false } as Partial<CorePilotState>);
    }, 1400);
  };

  const sendComprasMessage = makeSendHandler('compras', 'comprasDraft', 'comprasThinking', comprasReplies);
  const sendFinanceiroMessage = makeSendHandler('financeiro', 'financeiroDraft', 'financeiroThinking', financeiroReplies);
  const sendOverviewMessage = makeSendHandler('overview', 'overviewDraft', 'overviewThinking', overviewReplies);
  const handleEnterSend = (send: () => void) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const goAdminUsers = () => update((s) => ({ view: 'admin-users', adminTab: 'profiles', previousView: s.view, userMenuOpen: false }));
  const goAdminSettings = () => update((s) => ({ view: 'admin-settings', previousView: s.view, userMenuOpen: false }));
  const openGeneralSettings = () => goAdminSettings();
  const openCompanySettings = () => update((s) => ({ view: 'admin-company', previousView: s.view, userMenuOpen: false }));
  const backFromAdmin = () => update((s) => ({ view: s.previousView || 'overview' }));
  const setAdminTab = (tab: 'profiles' | 'users') => update({ adminTab: tab });
  const toggleUserMenu = () => update((s) => ({ userMenuOpen: !s.userMenuOpen }));
  const closeUserMenu = () => update({ userMenuOpen: false });
  const openUsersFromMenu = () => goAdminUsers();

  const updateWaField = (field: keyof CorePilotState['waForm']) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    update((s) => ({ waForm: { ...s.waForm, [field]: val } }));
  };
  const toggleWaExpanded = () => update((s) => ({ waExpanded: !s.waExpanded }));
  const toggleChangeWaKey = () => update((s) => ({ waChangingKey: !s.waChangingKey, waNewKey: '' }));
  const updateWaNewKey = (e: ChangeEvent<HTMLInputElement>) => update({ waNewKey: e.target.value });
  const toggleWaNotifyTasks = () => update((s) => ({ waNotifyTasks: !s.waNotifyTasks }));
  const setAdminSettingsTab = (tab: 'integrations' | 'knowledge') => update({ adminSettingsTab: tab });

  const testWaConnection = () => {
    window.clearTimeout(waTestTimer.current);
    update({ waConnectionState: 'testing', waExpanded: true });
    waTestTimer.current = window.setTimeout(() => {
      update({ waConnectionState: 'connected', waLastTestMsg: 'Instância respondeu · sessão do WhatsApp ativa', waChangingKey: false });
      showToast('Conexão com o Evolution API estabelecida.');
    }, 1300);
  };

  const toggleDsExpanded = () => update((s) => ({ dsExpanded: !s.dsExpanded, dsMenuOpen: false }));
  const toggleDsMenu = () => update((s) => ({ dsMenuOpen: !s.dsMenuOpen }));
  const toggleQueriesSection = () => update((s) => ({ queriesExpanded: !s.queriesExpanded }));
  const toggleSemanticSection = () => update((s) => ({ semanticExpanded: !s.semanticExpanded }));
  const editConnectionFromMenu = () => update({ dsExpanded: true, dsMenuOpen: false });
  const updateDsField = (field: keyof CorePilotState['dsForm']) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    update((s) => ({ dsForm: { ...s.dsForm, [field]: val } }));
  };
  const toggleChangePassword = () => update((s) => ({ dsChangingPassword: !s.dsChangingPassword, dsNewPassword: '' }));
  const updateDsNewPassword = (e: ChangeEvent<HTMLInputElement>) => update({ dsNewPassword: e.target.value });
  const testConnection = () => {
    window.clearTimeout(dsTestTimer.current);
    update({ dsConnectionState: 'testing' });
    dsTestTimer.current = window.setTimeout(() => {
      update({ dsConnectionState: 'connected', dsLastTestMsg: '12.482 registros lidos · view VW_COPILOT_OPERACOES_AGRICOLAS', dsLastTestTime: 'agora', dsChangingPassword: false });
    }, 1300);
  };
  const toggleQueryExpand = (id: string) => update((s) => ({ expandedQueryIds: s.expandedQueryIds.includes(id) ? s.expandedQueryIds.filter((x) => x !== id) : [...s.expandedQueryIds, id] }));
  const toggleQueryMenu = (id: string) => update((s) => ({ queryMenuOpenId: s.queryMenuOpenId === id ? null : id }));
  const closeQueryMenu = () => update({ queryMenuOpenId: null });
  const testQuery = (id: string) => {
    update((s) => ({ dsQueries: s.dsQueries.map((q) => (q.id === id ? { ...q, status: 'ready' as const } : q)), queryMenuOpenId: null }));
    showToast('Consulta testada com sucesso.');
  };
  const removeQuery = (id: string) => {
    update((s) => ({ dsQueries: s.dsQueries.filter((q) => q.id !== id), queryMenuOpenId: null }));
    showToast('Consulta removida.');
  };
  const toggleNewQueryForm = () => update((s) => ({ showNewQuery: !s.showNewQuery, newQueryForm: { rmName: '', description: '' } }));
  const updateNewQueryField = (field: keyof CorePilotState['newQueryForm']) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    update((s) => ({ newQueryForm: { ...s.newQueryForm, [field]: val } }));
  };
  const saveNewQuery = () => {
    const f = state.newQueryForm;
    if (!f.rmName.trim()) return;
    const id = 'q' + Date.now();
    update((s) => ({
      dsQueries: [...s.dsQueries, { id, rmName: f.rmName.toUpperCase(), description: f.description, sql: '', status: 'pending' as const, usedBy: [] }],
      expandedQueryIds: [...s.expandedQueryIds, id], showNewQuery: false, newQueryForm: { rmName: '', description: '' },
    }));
  };
  const describeWithAI = () => {
    update((s) => ({
      semanticFields: s.semanticFields.map((f) => (f.pending ? { ...f, meaning: semanticMeanings[f.field] || 'Descrição sugerida pela IA', pending: false } : f)),
    }));
    showToast('IA sugeriu descrições — revise antes de publicar.');
  };

  type KnowledgeScope = 'module' | 'general';
  const knowledgeSourcesKey = (scope: KnowledgeScope): 'knowledgeSources' | 'generalKnowledgeSources' => (scope === 'module' ? 'knowledgeSources' : 'generalKnowledgeSources');
  const knowledgeFormKey = (scope: KnowledgeScope): 'newKnowledgeForm' | 'newGeneralKnowledgeForm' => (scope === 'module' ? 'newKnowledgeForm' : 'newGeneralKnowledgeForm');
  const knowledgeShowKey = (scope: KnowledgeScope): 'showNewKnowledge' | 'showNewGeneralKnowledge' => (scope === 'module' ? 'showNewKnowledge' : 'showNewGeneralKnowledge');
  const knowledgeEditingIdKey = (scope: KnowledgeScope): 'editingKnowledgeId' | 'editingGeneralKnowledgeId' => (scope === 'module' ? 'editingKnowledgeId' : 'editingGeneralKnowledgeId');
  const knowledgeMenuKey = (scope: KnowledgeScope): 'knowledgeMenuOpenId' | 'generalKnowledgeMenuOpenId' => (scope === 'module' ? 'knowledgeMenuOpenId' : 'generalKnowledgeMenuOpenId');

  const toggleNewKnowledgeForm = (scope: KnowledgeScope) => () => {
    const showKey = knowledgeShowKey(scope), formKey = knowledgeFormKey(scope), editIdKey = knowledgeEditingIdKey(scope);
    update((s) => ({ [showKey]: !s[showKey], [editIdKey]: null, [formKey]: { ...emptyKnowledgeForm } }) as Partial<CorePilotState>);
  };
  const setKnowledgeType = (scope: KnowledgeScope) => (type: KnowledgeSourceType) => {
    const formKey = knowledgeFormKey(scope);
    update((s) => ({ [formKey]: { ...s[formKey], sourceType: type } }) as Partial<CorePilotState>);
  };
  const onKnowledgeFileChange = (scope: KnowledgeScope) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const formKey = knowledgeFormKey(scope);
    update((s) => ({ [formKey]: { ...s[formKey], fileName: file.name } }) as Partial<CorePilotState>);
  };
  const toggleKnowledgeMenu = (scope: KnowledgeScope) => (id: string) => {
    const menuKey = knowledgeMenuKey(scope);
    update((s) => ({ [menuKey]: s[menuKey] === id ? null : id }) as Partial<CorePilotState>);
  };
  const closeKnowledgeMenu = (scope: KnowledgeScope) => () => update({ [knowledgeMenuKey(scope)]: null } as Partial<CorePilotState>);
  const updateKnowledgeField = (scope: KnowledgeScope) => (field: keyof KnowledgeFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    const formKey = knowledgeFormKey(scope);
    update((s) => ({ [formKey]: { ...s[formKey], [field]: val } }) as Partial<CorePilotState>);
  };
  const editKnowledgeSource = (scope: KnowledgeScope) => (id: string) => {
    const srcKey = knowledgeSourcesKey(scope), showKey = knowledgeShowKey(scope), formKey = knowledgeFormKey(scope), editIdKey = knowledgeEditingIdKey(scope), menuKey = knowledgeMenuKey(scope);
    update((s) => {
      const src = s[srcKey].find((k) => k.id === id);
      if (!src) return null;
      return {
        [editIdKey]: id, [showKey]: true, [menuKey]: null,
        [formKey]: {
          name: src.name, category: src.category, owner: src.owner, sourceType: src.sourceType || 'text',
          textContent: src.textContent || '', fileName: src.fileName || '', link: src.link || '', folderLink: src.folderLink || '',
        },
      } as Partial<CorePilotState>;
    });
  };
  const removeKnowledgeSource = (scope: KnowledgeScope) => (id: string) => {
    const srcKey = knowledgeSourcesKey(scope), menuKey = knowledgeMenuKey(scope);
    update((s) => ({ [srcKey]: s[srcKey].filter((k) => k.id !== id), [menuKey]: null }) as Partial<CorePilotState>);
    showToast(scope === 'module' ? 'Fonte removida da base de conhecimento.' : 'Fonte removida da base geral.');
  };
  const saveKnowledgeSource = (scope: KnowledgeScope) => () => {
    const srcKey = knowledgeSourcesKey(scope), showKey = knowledgeShowKey(scope), formKey = knowledgeFormKey(scope), editIdKey = knowledgeEditingIdKey(scope);
    const f = state[formKey];
    if (!f.name.trim()) return;
    const extra = { sourceType: f.sourceType, textContent: f.textContent, fileName: f.fileName, link: f.link, folderLink: f.folderLink };
    const editingId = state[editIdKey];
    if (editingId) {
      update((s) => ({
        [srcKey]: s[srcKey].map((k) => (k.id === editingId ? { ...k, name: f.name, category: f.category || 'Geral', owner: f.owner || '—', ...extra, updated: 'agora' } : k)),
        [showKey]: false, [editIdKey]: null,
      }) as Partial<CorePilotState>);
      showToast('Fonte atualizada.');
      return;
    }
    const id = (scope === 'module' ? 'k' : 'g') + Date.now();
    update((s) => ({
      [srcKey]: [...s[srcKey], { id, name: f.name, category: f.category || 'Geral', owner: f.owner || '—', updated: 'agora', status: 'processing' as const, ...extra }],
      [showKey]: false,
    }) as Partial<CorePilotState>);
    const timerRef = scope === 'module' ? knowledgeIndexTimer : generalKnowledgeIndexTimer;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      update((s) => ({ [srcKey]: s[srcKey].map((k) => (k.id === id ? { ...k, status: k.sourceType === 'folder' ? ('synced' as const) : ('indexed' as const) } : k)) }) as Partial<CorePilotState>);
      showToast('Fonte indexada com sucesso.');
    }, 1400);
  };

  const togglePermissionProfile = (rowId: string, profileId: string) => update((s) => ({
    permissionRows: s.permissionRows.map((r) => (r.id !== rowId ? r : { ...r, profileIds: r.profileIds.includes(profileId) ? r.profileIds.filter((p) => p !== profileId) : [...r.profileIds, profileId] })),
  }));

  const toggleNewProfileForm = () => update((s) => ({ showNewProfile: !s.showNewProfile, newProfileName: '' }));
  const updateNewProfileName = (e: ChangeEvent<HTMLInputElement>) => update({ newProfileName: e.target.value });
  const saveNewProfile = () => {
    const name = state.newProfileName.trim();
    if (!name) return;
    const palette = ['#0EA5A0', '#07364A', '#E8604C', '#D97706', '#1E9E6B', '#5B6B70'];
    update((s) => ({
      profiles: [...s.profiles, { id: 'perfil-' + Date.now(), name, color: palette[s.profiles.length % palette.length] }],
      showNewProfile: false, newProfileName: '',
    }));
  };
  const toggleNewUserForm = () => update((s) => ({ showNewUser: !s.showNewUser, newUserForm: { name: '', email: '', company: '', profileIds: [] } }));
  const updateNewUserField = (field: 'name' | 'email' | 'company') => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    update((s) => ({ newUserForm: { ...s.newUserForm, [field]: val } }));
  };
  const toggleNewUserProfile = (profileId: string) => update((s) => ({
    newUserForm: { ...s.newUserForm, profileIds: s.newUserForm.profileIds.includes(profileId) ? s.newUserForm.profileIds.filter((p) => p !== profileId) : [...s.newUserForm.profileIds, profileId] },
  }));
  const saveNewUser = () => {
    const f = state.newUserForm;
    if (!f.name.trim()) return;
    update((s) => ({
      users: [...s.users, { id: Date.now(), name: f.name, email: f.email, company: f.company, profileIds: f.profileIds }],
      showNewUser: false, newUserForm: { name: '', email: '', company: '', profileIds: [] },
    }));
  };

  // --- Agentes reais ---
  const carregarAgentesDoModulo = async (moduloId: string) => {
    update({ agentesLoading: true });
    try {
      const agentes = await listarAgentes(accessToken, moduloId);
      update({
        agentesLoading: false,
        moduloAgentes: agentes,
        selectedAgenteId: agentes[0]?.id ?? null,
      });
      if (agentes[0]) await carregarSkillsDoAgente(agentes[0].id);
    } catch (err) {
      update({ agentesLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar agentes' });
    }
  };
  const selecionarAgente = (agenteId: string) => {
    update({ selectedAgenteId: agenteId });
    void carregarSkillsDoAgente(agenteId);
  };
  const toggleNovoAgenteForm = () => update((s) => ({ showNovoAgenteForm: !s.showNovoAgenteForm, novoAgenteForm: { ...emptyNovoAgenteForm } }));
  const updateNovoAgenteField = (field: keyof CorePilotState['novoAgenteForm']) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    update((s) => ({ novoAgenteForm: { ...s.novoAgenteForm, [field]: val } }));
  };
  const criarNovoAgenteReal = async () => {
    const moduloId = state.currentModuloId;
    if (!moduloId || !state.novoAgenteForm.nome.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const agente = await criarAgente(accessToken, moduloId, state.novoAgenteForm);
      update((s) => ({
        wizardSaving: false,
        moduloAgentes: [agente, ...s.moduloAgentes],
        selectedAgenteId: agente.id,
        showNovoAgenteForm: false,
        novoAgenteForm: { ...emptyNovoAgenteForm },
        agenteSkills: [],
      }));
      showToast('Agente criado.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao criar agente' });
    }
  };
  const atualizarAgenteReal = async (campo: 'nome' | 'funcao' | 'objetivo', valor: string) => {
    const moduloId = state.currentModuloId;
    const agenteId = state.selectedAgenteId;
    if (!moduloId || !agenteId) return;
    try {
      const agente = await atualizarAgente(accessToken, moduloId, agenteId, { [campo]: valor });
      update((s) => ({ moduloAgentes: s.moduloAgentes.map((a) => (a.id === agenteId ? agente : a)) }));
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao atualizar agente' });
    }
  };

  // --- Skills reais ---
  const carregarSkillsDoAgente = async (agenteId: string) => {
    update({ skillsLoading: true });
    try {
      const skills = await listarSkills(accessToken, agenteId);
      update({ skillsLoading: false, agenteSkills: skills });
    } catch (err) {
      update({ skillsLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar skills' });
    }
  };
  const abrirNovaSkill = () => update({
    editingSkillReal: null,
    skillFormNome: '',
    skillFormObjetivo: '',
    skillFormCampos: [{ nome: '', tipo: 'string', descricao: '', obrigatorio: true }],
    skillFerramentasSelecionadas: [],
    agentTab: 'skill-editor',
  });
  const abrirEdicaoSkill = (skill: SkillReal) => update({
    editingSkillReal: skill,
    skillFormNome: skill.nome,
    skillFormObjetivo: skill.objetivo,
    skillFormCampos: skill.camposSaida.length ? skill.camposSaida : [{ nome: '', tipo: 'string', descricao: '', obrigatorio: true }],
    skillFerramentasSelecionadas: [],
    agentTab: 'skill-editor',
  });
  const cancelarEdicaoSkill = () => update({ editingSkillReal: null, agentTab: 'skills' });
  const updateSkillFormNome = (e: ChangeEvent<HTMLInputElement>) => update({ skillFormNome: e.target.value });
  const updateSkillFormObjetivo = (e: ChangeEvent<HTMLTextAreaElement>) => update({ skillFormObjetivo: e.target.value });
  const adicionarCampoSaida = () => update((s) => ({ skillFormCampos: [...s.skillFormCampos, { nome: '', tipo: 'string', descricao: '', obrigatorio: true }] }));
  const atualizarCampoSaida = (indice: number, parcial: Partial<CampoSaida>) => update((s) => ({ skillFormCampos: s.skillFormCampos.map((c, i) => (i === indice ? { ...c, ...parcial } : c)) }));
  const removerCampoSaida = (indice: number) => update((s) => ({ skillFormCampos: s.skillFormCampos.filter((_, i) => i !== indice) }));
  const toggleFerramentaSkill = (consultaId: string) => update((s) => ({
    skillFerramentasSelecionadas: s.skillFerramentasSelecionadas.includes(consultaId)
      ? s.skillFerramentasSelecionadas.filter((id) => id !== consultaId)
      : [...s.skillFerramentasSelecionadas, consultaId],
  }));
  const salvarSkillReal = async () => {
    const agenteId = state.selectedAgenteId;
    if (!agenteId || !state.skillFormNome.trim() || !state.skillFormObjetivo.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const camposSaida = state.skillFormCampos.filter((c) => c.nome.trim());
      const existente = state.editingSkillReal;
      const skill = existente
        ? await atualizarSkill(accessToken, agenteId, existente.id, { nome: state.skillFormNome, objetivo: state.skillFormObjetivo, camposSaida })
        : await criarSkill(accessToken, agenteId, { nome: state.skillFormNome, objetivo: state.skillFormObjetivo, camposSaida });

      const ferramentasAntes = new Set((existente as { ferramentas?: { id: string }[] } | null)?.ferramentas?.map((f) => f.id) ?? []);
      const ferramentasDepois = new Set(state.skillFerramentasSelecionadas);
      for (const id of ferramentasDepois) if (!ferramentasAntes.has(id)) await anexarFerramenta(accessToken, skill.id, id);
      for (const id of ferramentasAntes) if (!ferramentasDepois.has(id)) await removerFerramenta(accessToken, skill.id, id);

      update((s) => ({
        wizardSaving: false,
        agenteSkills: existente ? s.agenteSkills.map((sk) => (sk.id === skill.id ? skill : sk)) : [skill, ...s.agenteSkills],
        editingSkillReal: null,
        agentTab: 'skills',
      }));
      showToast('Skill salva com sucesso.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao salvar skill' });
    }
  };

  // --- Fontes de dados reais ---
  const carregarFontesDeDados = async () => {
    update({ fontesLoading: true });
    try {
      const fontes = await listarFontesDeDados(accessToken);
      update({ fontesLoading: false, moduloFontesDeDados: fontes });
    } catch (err) {
      update({ fontesLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar fontes de dados' });
    }
  };
  const toggleNovaFonteForm = () => update((s) => ({ showNovaFonteForm: !s.showNovaFonteForm, novaFonteForm: { ...emptyNovaFonteForm } }));
  const updateNovaFonteField = (field: keyof CorePilotState['novaFonteForm']) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    update((s) => ({ novaFonteForm: { ...s.novaFonteForm, [field]: val } }));
  };
  const salvarNovaFonteReal = async () => {
    const f = state.novaFonteForm;
    if (!f.tipo || !f.nome.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const fonte = await criarFonteDeDados(accessToken, f);
      update((s) => ({
        wizardSaving: false,
        moduloFontesDeDados: [fonte, ...s.moduloFontesDeDados],
        showNovaFonteForm: false,
        novaFonteForm: { ...emptyNovaFonteForm },
      }));
      showToast('Fonte de dados conectada.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao conectar fonte de dados' });
    }
  };

  // --- Consultas reais ---
  const carregarConsultasDoModulo = async (moduloId: string) => {
    update({ consultasLoading: true });
    try {
      const consultas = await listarConsultas(accessToken, moduloId);
      update({ consultasLoading: false, moduloConsultas: consultas });
    } catch (err) {
      update({ consultasLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar consultas' });
    }
  };
  const toggleNovaConsultaForm = () => update((s) => ({ showNovaConsultaForm: !s.showNovaConsultaForm, novaConsultaForm: emptyNovaConsultaForm() }));
  const updateNovaConsultaField = (field: 'fonteDeDadosId' | 'nome' | 'codSentenca') => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, [field]: val } }));
  };
  const adicionarParametroConsulta = () => update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, parametros: [...s.novaConsultaForm.parametros, { chave: '', valor: '' }] } }));
  const atualizarParametroConsulta = (indice: number, parcial: Partial<{ chave: string; valor: string }>) => update((s) => ({
    novaConsultaForm: { ...s.novaConsultaForm, parametros: s.novaConsultaForm.parametros.map((p, i) => (i === indice ? { ...p, ...parcial } : p)) },
  }));
  const adicionarCampoFiltroConsulta = () => update((s) => ({ novaConsultaForm: { ...s.novaConsultaForm, camposFiltro: [...s.novaConsultaForm.camposFiltro, { nome: '', tipo: 'string', descricao: '', obrigatorio: true }] } }));
  const atualizarCampoFiltroConsulta = (indice: number, parcial: Partial<CampoSaida>) => update((s) => ({
    novaConsultaForm: { ...s.novaConsultaForm, camposFiltro: s.novaConsultaForm.camposFiltro.map((c, i) => (i === indice ? { ...c, ...parcial } : c)) },
  }));
  const salvarNovaConsultaReal = async () => {
    const moduloId = state.currentModuloId;
    const f = state.novaConsultaForm;
    if (!moduloId || !f.fonteDeDadosId || !f.nome.trim() || !f.codSentenca.trim()) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      const parametrosSincronizacao = Object.fromEntries(f.parametros.filter((p) => p.chave.trim()).map((p) => [p.chave, p.valor]));
      const consulta = await criarConsulta(accessToken, moduloId, {
        fonteDeDadosId: f.fonteDeDadosId,
        nome: f.nome,
        codSentenca: f.codSentenca,
        parametrosSincronizacao,
        camposFiltro: f.camposFiltro.filter((c) => c.nome.trim()),
      });
      update((s) => ({
        wizardSaving: false,
        moduloConsultas: [consulta, ...s.moduloConsultas],
        showNovaConsultaForm: false,
        novaConsultaForm: emptyNovaConsultaForm(),
      }));
      showToast('Consulta criada.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao criar consulta' });
    }
  };
  const testarConsultaReal = async (consultaId: string) => {
    update({ testandoConsultaId: consultaId });
    try {
      const resultado = await testarConsulta(accessToken, consultaId);
      update((s) => ({ resultadosTesteConsulta: { ...s.resultadosTesteConsulta, [consultaId]: resultado } }));
      const moduloId = state.currentModuloId;
      if (moduloId) await carregarConsultasDoModulo(moduloId);
    } catch (err) {
      update((s) => ({
        resultadosTesteConsulta: { ...s.resultadosTesteConsulta, [consultaId]: { sucesso: false, erro: err instanceof Error ? err.message : 'Erro ao testar' } },
      }));
    } finally {
      update({ testandoConsultaId: null });
    }
  };
  const toggleSincronizacaoConsultaReal = async (consulta: Consulta) => {
    const atualizada = await atualizarSincronizacao(accessToken, consulta.id, !consulta.sincronizacaoAtiva, consulta.intervaloSincronizacaoMinutos ?? 60);
    update((s) => ({ moduloConsultas: s.moduloConsultas.map((c) => (c.id === atualizada.id ? atualizada : c)) }));
  };

  // --- Testar skill real ---
  const selecionarSkillParaTeste = (skillId: string) => update({ skillTestSelecionadaId: skillId, skillTestResultado: null, skillTestErro: null });
  const updateSkillTestEntrada = (e: ChangeEvent<HTMLTextAreaElement>) => update({ skillTestEntrada: e.target.value });
  const executarTesteSkillReal = async () => {
    const skillId = state.skillTestSelecionadaId;
    if (!skillId || !state.skillTestEntrada.trim()) return;
    update({ skillTestando: true, skillTestErro: null });
    try {
      const resultado = await executarSkill(accessToken, skillId, state.skillTestEntrada);
      update({ skillTestando: false, skillTestResultado: resultado });
    } catch (err) {
      update({ skillTestando: false, skillTestErro: err instanceof Error ? err.message : 'Erro ao executar skill' });
    }
  };

  // --- Chat real do módulo ---
  const carregarConversaDoModulo = async (moduloId: string) => {
    try {
      const conversas = await listarConversas(accessToken, moduloId);
      const conversa = conversas[0] ?? (await criarConversa(accessToken, moduloId));
      const mensagens = await listarMensagens(accessToken, conversa.id);
      update({ moduloConversaId: conversa.id, moduloMensagens: mensagens });
    } catch (err) {
      update({ moduloChatErro: err instanceof Error ? err.message : 'Erro ao carregar conversa' });
    }
  };
  const updateModuloChatDraft = (e: ChangeEvent<HTMLTextAreaElement>) => update({ moduloChatDraft: e.target.value });
  const enviarMensagemModuloReal = async () => {
    const conversaId = state.moduloConversaId;
    const texto = state.moduloChatDraft.trim();
    if (!conversaId || !texto || state.moduloChatEnviando) return;
    update({ moduloChatDraft: '', moduloChatEnviando: true, moduloChatErro: null });

    const idUsuario = 'local-' + Date.now();
    const idAgente = 'local-' + (Date.now() + 1);
    update((s) => ({
      moduloMensagens: [
        ...s.moduloMensagens,
        { id: idUsuario, conversaId, papel: 'usuario' as const, conteudo: texto, tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
        { id: idAgente, conversaId, papel: 'agente' as const, conteudo: '', tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
      ],
    }));

    let respostaAcumulada = '';
    await enviarMensagemStreaming(accessToken, conversaId, texto, {
      onDelta: (delta) => {
        respostaAcumulada += delta;
        update((s) => ({ moduloMensagens: s.moduloMensagens.map((m) => (m.id === idAgente ? { ...m, conteudo: respostaAcumulada } : m)) }));
      },
      onDone: () => update({ moduloChatEnviando: false }),
      onErro: (mensagem) => update({ moduloChatEnviando: false, moduloChatErro: mensagem }),
    });
  };

  const actions = {
    showToast, setView, goStep, setAgentTab, selectCard, closeCard, approveCard, rejectCard, requestChanges,
    updateModuleField, selectIcon, selectColor, updateAgentField, selectModel, updateInstructions, salvarInstrucoesReal,
    toggleTool, toggleNewTaskForm, updateTaskField, setTaskFrequency, setTaskAutonomy, toggleTaskMenu, closeTaskMenu,
    toggleTaskActive, editTask, removeTask, saveTask, setAutonomy,
    openNewSkill, editSkill, duplicateSkill, updateSkillField, setSkillAutonomy, saveSkill, cancelSkillEdit,
    askSuggested, setTestResult, publishModule, saveDraft, testModule, salvarModuloReal, nextStep, prevStep, viewWizardNew,
    editModule, editComprasModule, editFinanceiroModule, editActiveModule, backFromWizardEdit,
    setComprasBoard, setComprasChat, toggleComprasBases, toggleFinanceiroBases, closeBasesMenus,
    toggleChatMenu, closeChatMenu, togglePinChat, hideChat, deleteChat, restoreChat,
    updateComprasSearch, updateFinanceiroSearch, setComprasTag, setFinanceiroTag,
    toggleComprasTagsExpanded, toggleFinanceiroTagsExpanded, toggleNewTagForm, updateNewTagName, addTag, removeTag, assignChatTag,
    openComprasArchive, closeComprasArchive, openFinanceiroArchive, closeFinanceiroArchive, autoGrowInput,
    onAttachFiles, removeAttachment, updateDraft, selectComprasChat, selectFinanceiroChat,
    sendComprasMessage, sendFinanceiroMessage, sendOverviewMessage, handleEnterSend, makeQuickAction,
    goAdminUsers, goAdminSettings, openGeneralSettings, openCompanySettings, backFromAdmin, setAdminTab,
    toggleUserMenu, closeUserMenu, openUsersFromMenu,
    updateWaField, toggleWaExpanded, toggleChangeWaKey, updateWaNewKey, toggleWaNotifyTasks, setAdminSettingsTab, testWaConnection,
    toggleDsExpanded, toggleDsMenu, toggleQueriesSection, toggleSemanticSection, editConnectionFromMenu,
    updateDsField, toggleChangePassword, updateDsNewPassword, testConnection,
    toggleQueryExpand, toggleQueryMenu, closeQueryMenu, testQuery, removeQuery, toggleNewQueryForm, updateNewQueryField, saveNewQuery,
    describeWithAI,
    toggleNewKnowledgeForm, setKnowledgeType, onKnowledgeFileChange, toggleKnowledgeMenu, closeKnowledgeMenu,
    updateKnowledgeField, editKnowledgeSource, removeKnowledgeSource, saveKnowledgeSource,
    togglePermissionProfile, toggleNewProfileForm, updateNewProfileName, saveNewProfile,
    toggleNewUserForm, updateNewUserField, toggleNewUserProfile, saveNewUser,
    chatListKeyFor,

    carregarAgentesDoModulo, selecionarAgente, toggleNovoAgenteForm, updateNovoAgenteField, criarNovoAgenteReal, atualizarAgenteReal,
    carregarSkillsDoAgente, abrirNovaSkill, abrirEdicaoSkill, cancelarEdicaoSkill, updateSkillFormNome, updateSkillFormObjetivo,
    adicionarCampoSaida, atualizarCampoSaida, removerCampoSaida, toggleFerramentaSkill, salvarSkillReal,
    carregarFontesDeDados, toggleNovaFonteForm, updateNovaFonteField, salvarNovaFonteReal,
    carregarConsultasDoModulo, toggleNovaConsultaForm, updateNovaConsultaField, adicionarParametroConsulta, atualizarParametroConsulta,
    adicionarCampoFiltroConsulta, atualizarCampoFiltroConsulta, salvarNovaConsultaReal, testarConsultaReal, toggleSincronizacaoConsultaReal,
    selecionarSkillParaTeste, updateSkillTestEntrada, executarTesteSkillReal,
    carregarConversaDoModulo, updateModuloChatDraft, enviarMensagemModuloReal,
  };

  return {
    state,
    actions,
    refs: { comprasScrollRef, financeiroScrollRef, overviewScrollRef },
  };
}

export type CorePilotActions = ReturnType<typeof useCorePilotState>['actions'];
