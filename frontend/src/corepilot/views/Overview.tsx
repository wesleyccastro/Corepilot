import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../components/chat/MessageBubble';
import { overviewQnA } from '../seedData';
import { colors } from '../styles';
import type { MeResponse } from '../useMe';
import type { MutableRefObject } from 'react';

interface OverviewProps {
  state: CorePilotState;
  actions: CorePilotActions;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  me: MeResponse | null;
}

export function Overview({ state, actions, scrollRef, me }: OverviewProps) {
  return (
    <div style={{ padding: '24px 24px 20px', height: '100%', display: 'flex', gap: 24 }}>
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ width: '100%', height: 140, borderRadius: 14, background: '#EAF1EF', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: colors.textFaint, fontWeight: 600, overflow: 'hidden' }}>
          {me?.empresa.logoDataUrl ? (
            <img src={me.empresa.logoDataUrl} alt={me.empresa.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            'Logo da empresa'
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxWidth: 1080 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: colors.navy, margin: '0 0 6px', flexShrink: 0 }}>Visão Geral</h1>
        <p style={{ fontSize: 14.5, color: colors.textMuted, margin: '0 0 20px', flexShrink: 0 }}>Grupo LFG Agro · atualizado há 8 minutos</p>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.navy, margin: '0 0 12px' }}>Perguntas recentes aos módulos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            {overviewQnA.map((qa, i) => (
              <div key={i} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ background: qa.tagBg, color: qa.tagColor, borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 700 }}>{qa.module}</span>
                  <span style={{ fontSize: 11.5, color: colors.textFaint }}>{qa.agent}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.text, marginBottom: 8 }}>{qa.question}</div>
                <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>{qa.answer}</div>
              </div>
            ))}
          </div>

          {state.overviewThread.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} agentLabel="CorePilot" />
          ))}
          {state.overviewThinking && <ThinkingBubble label="CorePilot está consultando os módulos…" />}
        </div>

        <div style={{ flexShrink: 0, paddingTop: 16 }}>
          <ChatComposer
            variant="overview"
            placeholder="Pergunte ao CorePilot sobre qualquer módulo…"
            value={state.overviewDraft}
            onChange={actions.updateDraft('overviewDraft')}
            onKeyDown={actions.handleEnterSend(actions.sendOverviewMessage)}
            onSend={actions.sendOverviewMessage}
            attachments={state.overviewAttachments.map((a, i) => ({ ...a, onRemove: () => actions.removeAttachment('overviewAttachments', i) }))}
            onAttach={actions.onAttachFiles('overviewAttachments')}
          />
        </div>
      </div>
    </div>
  );
}
