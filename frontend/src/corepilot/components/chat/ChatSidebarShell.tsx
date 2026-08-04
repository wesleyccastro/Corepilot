import type { ChangeEvent } from 'react';
import { ArchiveIcon, DatabaseIcon, DotsIcon, GearIcon, PinIcon, SearchIcon, TagIcon } from '../../icons';
import { colors, overlayFixed } from '../../styles';

export interface ChatSidebarItem {
  id: string;
  title: string;
  subtitle: string;
  pinned: boolean;
  tagId: string | null;
}

export interface ChatSidebarTag {
  id: string;
  nome: string;
}

export interface ChatSidebarShellProps {
  newButtonLabel: string;
  onNewChat: () => void;
  basesLabel?: string;
  basesItems?: string[];
  basesOpen?: boolean;
  onToggleBases?: () => void;
  onCloseBases?: () => void;
  onConfigure?: () => void;
  search: string;
  onSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  activeTagId: string;
  onSetTag: (tagId: string) => void;
  tags: ChatSidebarTag[];
  tagsExpanded: boolean;
  onToggleTagsExpanded: () => void;
  showNewTagForm: boolean;
  newTagName: string;
  onToggleNewTagForm: () => void;
  onNewTagNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAddTag: () => void;
  onRemoveTag: (tagId: string) => (e: { stopPropagation: () => void }) => void;
  archiveView: boolean;
  onOpenArchive: () => void;
  onCloseArchive: () => void;
  visibleItems: ChatSidebarItem[];
  archivedItems: ChatSidebarItem[];
  activeItemId: string | undefined;
  onSelectItem: (id: string) => void;
  menuOpenId: string | null;
  onToggleItemMenu: (id: string) => void;
  onCloseItemMenu: () => void;
  onTogglePin: (id: string) => void;
  onAssignTag: (id: string, tagId: string) => (e: { stopPropagation: () => void }) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}

export function ChatSidebarShell(props: ChatSidebarShellProps) {
  const {
    newButtonLabel, onNewChat, basesLabel, basesItems, basesOpen, onToggleBases, onCloseBases, onConfigure,
    search, onSearchChange, activeTagId, onSetTag, tags, tagsExpanded, onToggleTagsExpanded,
    showNewTagForm, newTagName, onToggleNewTagForm, onNewTagNameChange, onAddTag, onRemoveTag,
    archiveView, onOpenArchive, onCloseArchive, visibleItems, archivedItems, activeItemId, onSelectItem,
    menuOpenId, onToggleItemMenu, onCloseItemMenu, onTogglePin, onAssignTag, onArchive, onDelete, onRestore,
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onNewChat} style={{ flex: 1, background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          {newButtonLabel}
        </button>
        {onToggleBases && (
          <div style={{ position: 'relative' }}>
            <span onClick={onToggleBases} title="Bases conectadas" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseIcon />
            </span>
            {basesOpen && (
              <>
                <div style={overlayFixed} onClick={onCloseBases} />
                <div style={{ position: 'absolute', top: 44, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 200, zIndex: 30, padding: '8px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>{basesLabel ?? 'Bases conectadas'}</div>
                  {(basesItems ?? []).map((b) => (
                    <div key={b} style={{ fontSize: 12.5, color: colors.text, padding: '6px 14px' }}>{b}</div>
                  ))}
                  {(basesItems ?? []).length === 0 && (
                    <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '6px 14px' }}>Nenhuma base conectada.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {onConfigure && (
          <span onClick={onConfigure} title="Configurar módulo" style={{ cursor: 'pointer', width: 38, height: 38, border: `1px solid ${colors.border}`, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GearIcon />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
        <SearchIcon size={14} color={colors.textFaint} strokeWidth={2} />
        <input type="text" placeholder="Pesquisar conversas…" value={search} onChange={onSearchChange} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0, position: 'relative' }}>
        {(() => {
          const active = activeTagId === 'all';
          return (
            <span onClick={() => onSetTag('all')} style={{ cursor: 'pointer', borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, border: `1px solid ${active ? colors.navy : colors.border}`, background: active ? colors.navy : '#fff', color: active ? '#fff' : colors.textMuted, whiteSpace: 'nowrap' }}>
              Tudo
            </span>
          );
        })()}
        <span onClick={onToggleTagsExpanded} style={{ cursor: 'pointer', borderRadius: 10, width: 44, height: 44, flexShrink: 0, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TagIcon />
        </span>
        {tagsExpanded && (
          <>
            <div style={overlayFixed} onClick={onToggleTagsExpanded} />
            <div style={{ position: 'absolute', top: 44, left: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 210, zIndex: 30, padding: '8px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 14px 6px' }}>Tags</div>
              {[{ id: 'all', nome: 'Tudo' }, ...tags].map((t) => {
                const active = activeTagId === t.id;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 14px', background: active ? '#EAF6F5' : 'transparent' }}>
                    <span onClick={() => { onSetTag(t.id); onToggleTagsExpanded(); }} style={{ cursor: 'pointer', fontSize: 13, fontWeight: active ? 800 : 600, color: active ? colors.navy : colors.text, flex: 1 }}>
                      {t.nome}
                    </span>
                    {t.id !== 'all' && (
                      <span onClick={onRemoveTag(t.id)} style={{ cursor: 'pointer', color: colors.textFaint, fontWeight: 800 }}>×</span>
                    )}
                  </div>
                );
              })}
              {showNewTagForm ? (
                <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>
                  <input type="text" placeholder="Nome da tag" value={newTagName} onChange={onNewTagNameChange} style={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                  <button onClick={onAddTag} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Criar</button>
                </div>
              ) : (
                <div onClick={onToggleNewTagForm} style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: colors.teal, padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}`, marginTop: 4 }}>+ Nova tag</div>
              )}
            </div>
          </>
        )}
      </div>

      {!archiveView ? (
        <>
          <div onClick={onOpenArchive} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 8 }}>
            <ArchiveIcon />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: colors.textMuted }}>Arquivadas</span>
            <span style={{ fontSize: 12, color: colors.textFaint }}>{archivedItems.length}</span>
          </div>
          {visibleItems.map((item) => (
            <ChatSidebarRow
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              tags={tags}
              menuOpen={menuOpenId === item.id}
              onSelect={() => onSelectItem(item.id)}
              onToggleMenu={() => onToggleItemMenu(item.id)}
              onCloseMenu={onCloseItemMenu}
              onTogglePin={() => onTogglePin(item.id)}
              onAssignTag={(tagId) => onAssignTag(item.id, tagId)}
              onArchive={() => onArchive(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
          {visibleItems.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '10px 0' }}>Nenhuma conversa ainda.</div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span onClick={onCloseArchive} style={{ cursor: 'pointer', color: colors.textMuted, fontSize: 15, lineHeight: 1 }}>←</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Arquivadas</span>
          </div>
          {archivedItems.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: colors.textFaint }}>{item.subtitle}</div>
              </div>
              <span onClick={() => onRestore(item.id)} style={{ fontSize: 12, fontWeight: 700, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Desarquivar</span>
            </div>
          ))}
          {archivedItems.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaint, padding: '10px 0' }}>Nenhuma conversa arquivada.</div>}
        </>
      )}
    </div>
  );
}

function ChatSidebarRow({
  item, active, tags, menuOpen, onSelect, onToggleMenu, onCloseMenu, onTogglePin, onAssignTag, onArchive, onDelete,
}: {
  item: ChatSidebarItem;
  active: boolean;
  tags: ChatSidebarTag[];
  menuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onTogglePin: () => void;
  onAssignTag: (tagId: string) => (e: { stopPropagation: () => void }) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const highlighted = item.pinned || active;
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
          {item.pinned && <PinIcon />}
          <div style={{ fontSize: 13, fontWeight: highlighted ? 700 : 600, color: highlighted ? colors.navy : colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaint }}>{item.subtitle}</div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}>
          <DotsIcon />
        </span>
        {menuOpen && (
          <>
            <div style={overlayFixed} onClick={onCloseMenu} />
            <div style={{ position: 'absolute', top: 22, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, boxShadow: '0 10px 24px rgba(7,54,74,.16)', minWidth: 150, zIndex: 30, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', borderTop: `1px solid ${colors.borderLight}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Tag</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {tags.map((t) => {
                    const isActiveTag = item.tagId === t.id;
                    return (
                      <span key={t.id} onClick={onAssignTag(t.id)} style={{ cursor: 'pointer', borderRadius: 14, padding: '3px 9px', fontSize: 11, fontWeight: 700, background: isActiveTag ? colors.navy : colors.chipBg, color: isActiveTag ? '#fff' : colors.textMuted }}>
                        {t.nome}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div onClick={(e) => { e.stopPropagation(); onTogglePin(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                {item.pinned ? 'Desafixar' : 'Fixar'}
              </div>
              <div onClick={(e) => { e.stopPropagation(); onArchive(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.text, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Arquivar
              </div>
              <div onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.danger, cursor: 'pointer', borderTop: `1px solid ${colors.borderLight}` }}>
                Excluir
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
