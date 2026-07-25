import type { CSSProperties } from 'react';

export const colors = {
  navy: '#07364A',
  teal: '#0EA5A0',
  tealDark: '#0B8783',
  bg: '#F7F8F6',
  bgAlt: '#FAFBFA',
  card: '#fff',
  border: '#E4E7E5',
  borderLight: '#F0F2F1',
  text: '#1F2A2E',
  textBody: '#374349',
  textMuted: '#5B6B70',
  textFaint: '#8A9598',
  danger: '#E8604C',
  dangerBg: '#FDEDE9',
  warn: '#D97706',
  warnBg: '#FEF3E2',
  warnText: '#7A5205',
  success: '#1E9E6B',
  successBg: '#E9F7F1',
  chipBg: '#F0F2F1',
  teal400: '#7FE0D9',
};

export const card: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
};

export const panel: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
};

export const input: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13.5,
};

export const inputSm: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
};

export const label: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: colors.navy,
  display: 'block',
  marginBottom: 6,
};

export const btnPrimary: CSSProperties = {
  background: colors.teal,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 15px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const btnDark: CSSProperties = {
  background: colors.navy,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const btnSecondary: CSSProperties = {
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 15px',
  fontSize: 13,
  fontWeight: 600,
  color: colors.navy,
  cursor: 'pointer',
};

export const btnGhostSm: CSSProperties = {
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 7,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: colors.navy,
  cursor: 'pointer',
};

export function badgeStyle(bg: string, color: string): CSSProperties {
  return { background: bg, color, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' };
}

export function chipStyle(active: boolean, activeColor = colors.navy): CSSProperties {
  return {
    cursor: 'pointer',
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 12.5,
    fontWeight: 700,
    border: `1px solid ${active ? activeColor : colors.border}`,
    background: active ? activeColor : '#fff',
    color: active ? '#fff' : colors.textMuted,
    whiteSpace: 'nowrap',
  };
}

export const dropdownMenu: CSSProperties = {
  position: 'absolute',
  top: 26,
  right: 0,
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 9,
  boxShadow: '0 10px 24px rgba(7,54,74,.16)',
  minWidth: 150,
  zIndex: 30,
  overflow: 'hidden',
};

export const dropdownMenuItem: CSSProperties = {
  padding: '10px 14px',
  fontSize: 12.5,
  fontWeight: 600,
  color: colors.text,
  cursor: 'pointer',
};

export const overlayFixed: CSSProperties = { position: 'fixed', inset: 0, zIndex: 29 };
