import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { ModuleChat, ModuleKey } from '../../types';
import { ChatSidebarShell, type ChatSidebarItem, type ChatSidebarTag } from './ChatSidebarShell';

interface ModuleChatSidebarProps {
  module: ModuleKey;
  state: CorePilotState;
  actions: CorePilotActions;
  onConfigure?: () => void;
}

const basesByModule: Record<ModuleKey, string[]> = {
  compras: ['Cadastro de fornecedores', 'Histórico de compras', 'Catálogo de peças'],
  financeiro: ['Orçamento 2026', 'ERP Financeiro', 'Plano de contas'],
};

const newButtonLabel: Record<ModuleKey, string> = { compras: '+ Nova consulta', financeiro: '+ Nova análise' };

function toItem(chat: ModuleChat): ChatSidebarItem {
  return { id: chat.id, title: chat.title, subtitle: chat.tag || 'Sem tag', pinned: chat.pinned, tagId: chat.tag || null };
}

// Archived rows show the chat's agent (matching the original inline archive list, which rendered
// `hc.agent` — not the tag, which is what the active-list rows show via `toItem` above).
function toArchivedItem(chat: ModuleChat): ChatSidebarItem {
  return { id: chat.id, title: chat.title, subtitle: chat.agent, pinned: chat.pinned, tagId: chat.tag || null };
}

export function ModuleChatSidebar({ module, state, actions, onConfigure }: ModuleChatSidebarProps) {
  const isCompras = module === 'compras';
  const chats = isCompras ? state.comprasChats : state.financeiroChats;
  const search = isCompras ? state.comprasSearch : state.financeiroSearch;
  const activeTag = isCompras ? state.comprasActiveTag : state.financeiroActiveTag;
  const tagsList = isCompras ? state.comprasTagsList : state.financeiroTagsList;
  const tagsExpanded = isCompras ? state.comprasTagsExpanded : state.financeiroTagsExpanded;
  const showNewTag = isCompras ? state.comprasShowNewTag : state.financeiroShowNewTag;
  const newTagName = isCompras ? state.comprasNewTagName : state.financeiroNewTagName;
  const archiveView = isCompras ? state.comprasArchiveView : state.financeiroArchiveView;
  const basesOpen = isCompras ? state.comprasBasesOpen : state.financeiroBasesOpen;
  const activeChatId = isCompras ? state.activeComprasChatId : state.activeFinanceiroChatId;
  const listKey = actions.chatListKeyFor(module);

  const toggleBases = isCompras ? actions.toggleComprasBases : actions.toggleFinanceiroBases;
  const updateSearch = isCompras ? actions.updateComprasSearch : actions.updateFinanceiroSearch;
  const setTag = isCompras ? actions.setComprasTag : actions.setFinanceiroTag;
  const toggleTagsExpanded = isCompras ? actions.toggleComprasTagsExpanded : actions.toggleFinanceiroTagsExpanded;
  const selectChat = isCompras ? actions.selectComprasChat : actions.selectFinanceiroChat;
  const openArchive = isCompras ? actions.openComprasArchive : actions.openFinanceiroArchive;
  const closeArchive = isCompras ? actions.closeComprasArchive : actions.closeFinanceiroArchive;

  const q = search.trim().toLowerCase();
  const visibleChats = chats
    .filter((c) => !c.hidden && (activeTag === 'all' || c.tag === activeTag) && (!q || c.title.toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.order - a.order);
  const hiddenChats = chats.filter((c) => c.hidden);
  const tags: ChatSidebarTag[] = tagsList.map((name) => ({ id: name, nome: name }));

  return (
    <ChatSidebarShell
      newButtonLabel={newButtonLabel[module]}
      onNewChat={() => {}}
      basesLabel="Bases conectadas"
      basesItems={basesByModule[module]}
      basesOpen={basesOpen}
      onToggleBases={toggleBases}
      onCloseBases={actions.closeBasesMenus}
      onConfigure={onConfigure}
      search={search}
      onSearchChange={updateSearch}
      activeTagId={activeTag}
      onSetTag={setTag}
      tags={tags}
      tagsExpanded={tagsExpanded}
      onToggleTagsExpanded={toggleTagsExpanded}
      showNewTagForm={showNewTag}
      newTagName={newTagName}
      onToggleNewTagForm={() => actions.toggleNewTagForm(module)}
      onNewTagNameChange={actions.updateNewTagName(module)}
      onAddTag={actions.addTag(module)}
      onRemoveTag={(tagId) => actions.removeTag(module, tagId)}
      archiveView={archiveView}
      onOpenArchive={openArchive}
      onCloseArchive={closeArchive}
      visibleItems={visibleChats.map(toItem)}
      archivedItems={hiddenChats.map(toArchivedItem)}
      activeItemId={activeChatId}
      onSelectItem={selectChat}
      menuOpenId={state.chatMenuOpenId}
      onToggleItemMenu={actions.toggleChatMenu}
      onCloseItemMenu={actions.closeChatMenu}
      onTogglePin={(id) => actions.togglePinChat(listKey, id)}
      onAssignTag={(id, tagId) => actions.assignChatTag(listKey, id, tagId)}
      onArchive={(id) => actions.hideChat(listKey, id)}
      onRename={(id, titulo) => actions.renameChat(listKey, id, titulo)}
      onDelete={(id) =>
        actions.abrirConfirmacao({
          titulo: 'Excluir conversa',
          mensagem: 'Essa conversa será excluída permanentemente. Essa ação não pode ser desfeita.',
          confirmarLabel: 'Excluir',
          perigo: true,
          onConfirmar: () => actions.deleteChat(listKey, id),
        })
      }
      onRestore={(id) => actions.restoreChat(listKey, id)}
    />
  );
}
