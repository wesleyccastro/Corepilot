import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { GearIcon } from '../../icons';
import { colors } from '../../styles';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../../components/chat/MessageBubble';
import { ModuleChatSidebar } from '../../components/chat/ModuleChatSidebar';
import { KanbanBoard } from './KanbanBoard';
import { CardDetailDrawer } from './CardDetailDrawer';
import { ComprasSeedContent } from './ComprasSeedContent';
import type { MutableRefObject } from 'react';

interface ComprasViewProps {
  state: CorePilotState;
  actions: CorePilotActions;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
}

export function ComprasView({ state, actions, scrollRef }: ComprasViewProps) {
  const isBoard = state.comprasView === 'board';
  const visibleChats = state.comprasChats.filter((c) => !c.hidden);
  const effectiveChatId = visibleChats.some((c) => c.id === state.activeComprasChatId) ? state.activeComprasChatId : visibleChats[0]?.id;
  const activeChat = state.comprasChats.find((c) => c.id === effectiveChatId);
  const thread = effectiveChatId ? state.comprasThreadsByChat[effectiveChatId] || [] : [];

  return (
    <div style={{ margin: 0, padding: '24px 16px 16px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 6, flexShrink: 0 }}>Compras / Cotação de peças</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: 0 }}>Central de Cotações</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: colors.chipBg, borderRadius: 8, padding: 3 }}>
            <span onClick={actions.setComprasBoard} style={{ cursor: 'pointer', padding: '6px 13px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: isBoard ? '#fff' : 'transparent', color: isBoard ? colors.navy : colors.textMuted }}>Interação</span>
            <span onClick={actions.setComprasChat} style={{ cursor: 'pointer', padding: '6px 13px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: !isBoard ? '#fff' : 'transparent', color: !isBoard ? colors.navy : colors.textMuted }}>Chat</span>
          </div>
        </div>
        <span onClick={actions.editComprasModule} title="Configurar módulo" style={{ cursor: 'pointer', width: 34, height: 34, border: `1px solid ${colors.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <GearIcon />
        </span>
      </div>

      {isBoard ? (
        <KanbanBoard state={state} actions={actions} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
          <ModuleChatSidebar module="compras" state={state} actions={actions} />
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 16 }}>
              {activeChat && <ComprasSeedContent kind={activeChat.seedKind} />}
              {thread.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} agentLabel="Agente de Compras" />
              ))}
              {state.comprasThinking && <ThinkingBubble label="Agente de Compras está analisando…" />}
            </div>
            <div style={{ marginTop: 16, flexShrink: 0 }}>
              <ChatComposer
                variant="module"
                placeholder="Pergunte algo sobre compras…"
                value={state.comprasDraft}
                onChange={actions.updateDraft('comprasDraft')}
                onKeyDown={actions.handleEnterSend(actions.sendComprasMessage)}
                onSend={actions.sendComprasMessage}
                attachments={state.comprasAttachments.map((a, i) => ({ ...a, onRemove: () => actions.removeAttachment('comprasAttachments', i) }))}
                onAttach={actions.onAttachFiles('comprasAttachments')}
              />
            </div>
          </div>
        </div>
      )}

      <CardDetailDrawer state={state} actions={actions} />
    </div>
  );
}
