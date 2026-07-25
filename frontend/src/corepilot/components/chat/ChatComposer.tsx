import type { ChangeEvent, KeyboardEvent } from 'react';
import { MessageSquareIcon, PaperclipIcon, SendIcon } from '../../icons';
import { colors } from '../../styles';
import type { Attachment } from '../../types';

interface ChatComposerProps {
  variant: 'overview' | 'module';
  placeholder: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  attachments: (Attachment & { onRemove: () => void })[];
  onAttach: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function ChatComposer({ variant, placeholder, value, onChange, onKeyDown, onSend, attachments, onAttach }: ChatComposerProps) {
  const isOverview = variant === 'overview';
  return (
    <div>
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {attachments.map((att, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 20, padding: '5px 10px 5px 12px', fontSize: 12, color: colors.navy, fontWeight: 600 }}>
              {att.name}
              <span onClick={att.onRemove} style={{ cursor: 'pointer', color: colors.textFaint, fontWeight: 800 }}>×</span>
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: isOverview ? 12 : 10,
          background: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: isOverview ? 14 : 12,
          padding: isOverview ? '8px 8px 8px 18px' : '12px 16px',
          boxShadow: isOverview ? '0 1px 2px rgba(7,54,74,.04)' : undefined,
        }}
      >
        {isOverview && <MessageSquareIcon style={{ flexShrink: 0, marginBottom: 10 }} />}
        <textarea
          placeholder={placeholder}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            border: 'none',
            fontSize: isOverview ? 15 : 14,
            background: 'transparent',
            padding: isOverview ? '10px 0' : 0,
            resize: 'none',
            maxHeight: 160,
            overflowY: 'auto',
            fontFamily: 'inherit',
            lineHeight: 1.4,
          }}
        />
        <label style={{ cursor: 'pointer', flexShrink: 0, marginBottom: isOverview ? 10 : 2 }} title="Anexar arquivo">
          <input type="file" multiple onChange={onAttach} style={{ display: 'none' }} />
          <PaperclipIcon />
        </label>
        {isOverview ? (
          <button onClick={onSend} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginBottom: 5 }}>
            <SendIcon />
          </button>
        ) : (
          <span onClick={onSend} style={{ cursor: 'pointer', flexShrink: 0, marginBottom: 2 }}>
            <SendIcon size={18} color={colors.teal} />
          </span>
        )}
      </div>
    </div>
  );
}
