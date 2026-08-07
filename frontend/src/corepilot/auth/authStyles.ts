import type { CSSProperties } from 'react';
import { colors } from '../styles';

export const fieldLabelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: colors.textBody, display: 'block', marginBottom: 6 };
export const fieldInputStyle: CSSProperties = { width: '100%', border: `1px solid ${colors.border}`, borderRadius: 9, padding: '12px 14px', fontSize: 13.5, background: '#fff', color: colors.text };
