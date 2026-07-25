import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../../components/chat/MessageBubble';
import { ModuleChatSidebar } from '../../components/chat/ModuleChatSidebar';
import { FinanceiroSeedContent } from './FinanceiroSeedContent';
import type { MutableRefObject } from 'react';

interface FinanceiroViewProps {
  state: CorePilotState;
  actions: CorePilotActions;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
}

export function FinanceiroView({ state, actions, scrollRef }: FinanceiroViewProps) {
  const visibleChats = state.financeiroChats.filter((c) => !c.hidden);
  const effectiveChatId = visibleChats.some((c) => c.id === state.activeFinanceiroChatId) ? state.activeFinanceiroChatId : visibleChats[0]?.id;
  const activeChat = state.financeiroChats.find((c) => c.id === effectiveChatId);
  const thread = effectiveChatId ? state.financeiroThreadsByChat[effectiveChatId] || [] : [];

  return (
    <div style={{ margin: 0, padding: '24px 16px 16px 24px', height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <ModuleChatSidebar module="financeiro" state={state} actions={actions} onConfigure={actions.editFinanceiroModule} />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 16 }}>
          {activeChat && <FinanceiroSeedContent kind={activeChat.seedKind} actions={actions} />}
          {thread.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} agentLabel="Agente Financeiro" />
          ))}
          {state.financeiroThinking && <ThinkingBubble label="Agente Financeiro está analisando…" />}
        </div>
        <div style={{ flexShrink: 0, paddingTop: 16 }}>
          <ChatComposer
            variant="module"
            placeholder="Pergunte sobre os dados ou peça uma nova análise…"
            value={state.financeiroDraft}
            onChange={actions.updateDraft('financeiroDraft')}
            onKeyDown={actions.handleEnterSend(actions.sendFinanceiroMessage)}
            onSend={actions.sendFinanceiroMessage}
            attachments={state.financeiroAttachments.map((a, i) => ({ ...a, onRemove: () => actions.removeAttachment('financeiroAttachments', i) }))}
            onAttach={actions.onAttachFiles('financeiroAttachments')}
          />
        </div>
      </div>
    </div>
  );
}
