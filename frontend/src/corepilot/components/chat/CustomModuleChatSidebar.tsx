import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { Conversa } from '../../modulos/types';
import { ChatSidebarShell, type ChatSidebarItem, type ChatSidebarTag } from './ChatSidebarShell';

interface CustomModuleChatSidebarProps {
  moduloId: string;
  state: CorePilotState;
  actions: CorePilotActions;
  onConfigure?: () => void;
}

function toItem(conversa: Conversa, tags: ChatSidebarTag[]): ChatSidebarItem {
  const tagNome = tags.find((t) => t.id === conversa.tagId)?.nome;
  return {
    id: conversa.id,
    title: conversa.titulo || 'Nova conversa',
    subtitle: tagNome || 'Sem tag',
    pinned: conversa.fixada,
    tagId: conversa.tagId,
  };
}

export function CustomModuleChatSidebar({ moduloId, state, actions, onConfigure }: CustomModuleChatSidebarProps) {
  const tags: ChatSidebarTag[] = state.moduloTags.map((t) => ({ id: t.id, nome: t.nome }));
  const q = state.moduloConversasSearch.trim().toLowerCase();
  const visibleConversas = state.moduloConversas
    .filter((c) => !c.arquivada && (state.moduloActiveTagId === 'all' || c.tagId === state.moduloActiveTagId) && (!q || (c.titulo ?? '').toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => Number(b.fixada) - Number(a.fixada) || new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
  const archivedConversas = state.moduloConversas.filter((c) => c.arquivada);

  return (
    <ChatSidebarShell
      newButtonLabel="+ Nova conversa"
      onNewChat={() => void actions.criarConversaModulo(moduloId)}
      basesLabel="Bases conectadas"
      basesItems={state.moduloBasesConectadas}
      basesOpen={state.moduloBasesOpen}
      onToggleBases={actions.toggleBasesModulo}
      onCloseBases={actions.toggleBasesModulo}
      onConfigure={onConfigure}
      search={state.moduloConversasSearch}
      onSearchChange={actions.atualizarBuscaConversasModulo}
      activeTagId={state.moduloActiveTagId}
      onSetTag={actions.definirTagAtivaModulo}
      tags={tags}
      tagsExpanded={state.moduloTagsExpanded}
      onToggleTagsExpanded={actions.toggleTagsExpandedModulo}
      showNewTagForm={state.moduloShowNewTagForm}
      newTagName={state.moduloNewTagName}
      onToggleNewTagForm={actions.toggleNewTagFormModulo}
      onNewTagNameChange={actions.updateNewTagNameModulo}
      onAddTag={() => void actions.criarTagModulo(moduloId)}
      onRemoveTag={(tagId) => (e) => { e.stopPropagation(); void actions.removerTagModulo(moduloId, tagId); }}
      archiveView={state.moduloArchiveView}
      onOpenArchive={actions.abrirArquivadasModulo}
      onCloseArchive={actions.fecharArquivadasModulo}
      visibleItems={visibleConversas.map((c) => toItem(c, tags))}
      archivedItems={archivedConversas.map((c) => toItem(c, tags))}
      activeItemId={state.moduloConversaId ?? undefined}
      onSelectItem={(id) => void actions.selecionarConversaModulo(id)}
      menuOpenId={state.chatMenuOpenId}
      onToggleItemMenu={actions.toggleChatMenu}
      onCloseItemMenu={actions.closeChatMenu}
      onTogglePin={(id) => void actions.fixarConversaModulo(moduloId, id)}
      onAssignTag={(id, tagId) => actions.atribuirTagConversaModulo(moduloId, id, tagId)}
      onArchive={(id) => void actions.arquivarConversaModulo(moduloId, id)}
      onDelete={(id) =>
        actions.abrirConfirmacao({
          titulo: 'Excluir conversa',
          mensagem: 'Essa conversa será excluída permanentemente. Essa ação não pode ser desfeita.',
          confirmarLabel: 'Excluir',
          perigo: true,
          onConfirmar: () => void actions.excluirConversaModulo(moduloId, id),
        })
      }
      onRestore={(id) => void actions.desarquivarConversaModulo(moduloId, id)}
    />
  );
}
