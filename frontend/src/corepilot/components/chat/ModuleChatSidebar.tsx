import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { ArchiveIcon, DatabaseIcon, DotsIcon, GearIcon, PinIcon, SearchIcon, TagIcon } from '../../icons';
import { colors, overlayFixed } from '../../styles';
import type { ModuleChat, ModuleKey } from '../../types';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button style={{ flex: 1, background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          {newButtonLabel[module]}
        </button>
        <div style={{ position: 'relative' }}>
          <span onClick={toggleBases} title="Bases conectadas" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DatabaseIcon />
          </span>
          {basesOpen && (
            <>
              <div style={overlayFixed} onClick={actions.closeBasesMenus} />
              <div style={{ position: 'absolute', top: 44, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 200, zIndex: 30, padding: '8px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>Bases conectadas</div>
                {basesByModule[module].map((b) => (
                  <div key={b} style={{ fontSize: 12.5, color: colors.text, padding: '6px 14px' }}>{b}</div>
                ))}
              </div>
            </>
          )}
        </div>
        {onConfigure && (
          <span onClick={onConfigure} title="Configurar módulo" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GearIcon />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
        <SearchIcon size={14} color={colors.textFaint} strokeWidth={2} />
        <input type="text" placeholder="Pesquisar conversas…" value={search} onChange={updateSearch} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0, position: 'relative' }}>
        {(() => {
          const active = activeTag === 'all';
          return (
            <span onClick={() => { setTag('all'); }} style={{ cursor: 'pointer', borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, border: `1px solid ${active ? colors.navy : colors.border}`, background: active ? colors.navy : '#fff', color: active ? '#fff' : colors.textMuted, whiteSpace: 'nowrap' }}>
              Tudo
            </span>
          );
        })()}
        <span onClick={toggleTagsExpanded} style={{ cursor: 'pointer', borderRadius: 10, width: 44, height: 44, flexShrink: 0, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TagIcon />
        </span>
        {tagsExpanded && (
          <>
            <div style={overlayFixed} onClick={toggleTagsExpanded} />
            <div style={{ position: 'absolute', top: 44, left: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 210, zIndex: 30, padding: '8px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>Tags</div>
              {['all', ...tagsList].map((t) => {
                const active = activeTag === t;
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 14px', background: active ? '#EAF6F5' : 'transparent' }}>
                    <span onClick={() => { setTag(t); toggleTagsExpanded(); }} style={{ cursor: 'pointer', fontSize: 13, fontWeight: active ? 800 : 600, color: active ? colors.navy : colors.text, flex: 1 }}>
                      {t === 'all' ? 'Tudo' : t}
                    </span>
                    {t !== 'all' && (
                      <span onClick={actions.removeTag(module, t)} style={{ cursor: 'pointer', color: colors.textFaint, fontWeight: 800 }}>×</span>
                    )}
                  </div>
                );
              })}
              {showNewTag ? (
                <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>
                  <input type="text" placeholder="Nome da tag" value={newTagName} onChange={actions.updateNewTagName(module)} style={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                  <button onClick={actions.addTag(module)} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Criar</button>
                </div>
              ) : (
                <div onClick={() => actions.toggleNewTagForm(module)} style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: colors.teal, padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>+ Nova tag</div>
              )}
            </div>
          </>
        )}
      </div>

      {!archiveView ? (
        <>
          <div onClick={openArchive} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 8 }}>
            <ArchiveIcon />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: colors.textMuted }}>Arquivadas</span>
            <span style={{ fontSize: 12, color: colors.textFaint }}>{hiddenChats.length}</span>
          </div>
          {visibleChats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} module={module} listKey={listKey} state={state} actions={actions} onSelect={() => selectChat(chat.id)} />
          ))}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span onClick={closeArchive} style={{ cursor: 'pointer', color: colors.textMuted, fontSize: 15, lineHeight: 1 }}>←</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Arquivadas</span>
          </div>
          {hiddenChats.map((hc) => (
            <div key={hc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hc.title}</div>
                <div style={{ fontSize: 11.5, color: colors.textFaint }}>{hc.agent}</div>
              </div>
              <span onClick={() => actions.restoreChat(listKey, hc.id)} style={{ fontSize: 12, fontWeight: 700, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Desarquivar</span>
            </div>
          ))}
          {hiddenChats.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '10px 0' }}>Nenhuma conversa arquivada.</div>}
        </>
      )}
    </div>
  );
}

function ChatRow({
  chat, active, module, listKey, state, actions, onSelect,
}: {
  chat: ModuleChat;
  active: boolean;
  module: ModuleKey;
  listKey: 'comprasChats' | 'financeiroChats';
  state: CorePilotState;
  actions: CorePilotActions;
  onSelect: () => void;
}) {
  const tagsList = module === 'compras' ? state.comprasTagsList : state.financeiroTagsList;
  const menuOpen = state.chatMenuOpenId === chat.id;
  const highlighted = chat.pinned || active;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '10px 12px', marginBottom: 4,
        background: highlighted ? (active ? '#EAF6F5' : '#fff') : 'transparent',
        border: highlighted ? `1px solid ${active ? colors.teal : colors.border}` : undefined,
      }}
    >
      <div onClick={onSelect} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {chat.pinned && <PinIcon />}
          <div style={{ fontSize: 13, fontWeight: highlighted ? 700 : 600, color: highlighted ? colors.navy : colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.title}</div>
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaint }}>{chat.tag || 'Sem tag'}</div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span onClick={(e) => { e.stopPropagation(); actions.toggleChatMenu(chat.id); }}>
          <DotsIcon />
        </span>
        {menuOpen && (
          <>
            <div style={overlayFixed} onClick={actions.closeChatMenu} />
            <div style={{ position: 'absolute', top: 22, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 150, zIndex: 30, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Tag</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {tagsList.map((t) => {
                    const isActiveTag = chat.tag === t;
                    return (
                      <span key={t} onClick={actions.assignChatTag(listKey, chat.id, t)} style={{ cursor: 'pointer', borderRadius: 14, padding: '3px 9px', fontSize: 11, fontWeight: 700, background: isActiveTag ? colors.navy : colors.chipBg, color: isActiveTag ? '#fff' : colors.textMuted }}>
                        {t}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div onClick={(e) => { e.stopPropagation(); actions.togglePinChat(listKey, chat.id); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                {chat.pinned ? 'Desafixar' : 'Fixar'}
              </div>
              <div onClick={(e) => { e.stopPropagation(); actions.hideChat(listKey, chat.id); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Arquivar
              </div>
              <div onClick={(e) => { e.stopPropagation(); actions.deleteChat(listKey, chat.id); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.danger, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Excluir
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
