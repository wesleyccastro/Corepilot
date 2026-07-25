import { colors } from '../../styles';
import type { ChatMessage } from '../../types';

export function MessageBubble({ msg, agentLabel }: { msg: ChatMessage; agentLabel: string }) {
  if (msg.isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <div style={{ background: colors.navy, color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '12px 18px', fontSize: 13.5, maxWidth: 480 }}>
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px', marginTop: 16 }}>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 6 }}>{agentLabel}</div>
      <div style={{ fontSize: 13.5, color: colors.textBody, lineHeight: 1.55 }}>{msg.text}</div>
    </div>
  );
}

export function ThinkingBubble({ label }: { label: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 20px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.teal, animation: 'pulse 1s infinite' }} />
      <span style={{ fontSize: 12.5, color: colors.textFaint }}>{label}</span>
    </div>
  );
}
