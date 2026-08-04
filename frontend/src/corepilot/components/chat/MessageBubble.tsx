import { colors } from '../../styles';
import { CorePilotLogoIcon } from '../../icons';
import type { ChatMessage } from '../../types';

function AssistantAvatar() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: colors.navy,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <CorePilotLogoIcon size={15} color="#fff" />
    </div>
  );
}

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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16 }}>
      <AssistantAvatar />
      <div style={{ flex: 1, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: '2px 14px 14px 14px', padding: '14px 18px', minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 6 }}>{agentLabel}</div>
        <div style={{ fontSize: 13.5, color: colors.textBody, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
      </div>
    </div>
  );
}

export function ThinkingBubble({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
      <AssistantAvatar />
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: '2px 14px 14px 14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: colors.teal,
                animation: 'pulse 1s infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
        <span style={{ fontSize: 12.5, color: colors.textFaint }}>{label}</span>
      </div>
    </div>
  );
}
