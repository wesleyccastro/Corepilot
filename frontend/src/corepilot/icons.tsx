import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function SearchIcon({ size = 15, color = '#fff', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function BellIcon({ size = 18, color = '#fff', strokeWidth = 1.7, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 12, color = '#fff', strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, color = '#5B6B70', strokeWidth = 2.2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function UsersIcon({ size = 15, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function GearIcon({ size = 15, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function BuildingIcon({ size = 15, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
    </svg>
  );
}

export function LogoutIcon({ size = 15, color = '#E8604C', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function PlusIcon({ size = 14, color = '#fff', strokeWidth = 2.2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function SendIcon({ size = 16, color = '#fff', strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function PaperclipIcon({ size = 18, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function MessageSquareIcon({ size = 18, color = '#0EA5A0', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function DatabaseIcon({ size = 16, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function TagIcon({ size = 22, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.82z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}

export function ArchiveIcon({ size = 15, color = '#5B6B70', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

export function PinIcon({ size = 10, color = '#0EA5A0', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" style={style}>
      <path d="M16 3l5 5-1.5 1.5-1-.3-4 4 .7 4.3-1.2 1.2-4-4-4.5 4.5-1-1L9 13l-4-4 .3-1.2 4.3.7 4-4-.3-1z" />
    </svg>
  );
}

export function XIcon({ size = 18, color = '#5B6B70', strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CheckIcon({ size = 14, color = '#fff', strokeWidth = 3, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function FileIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function TextIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <line x1="17" y1="10" x2="3" y2="10" />
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="17" y1="18" x2="3" y2="18" />
    </svg>
  );
}

export function LinkIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function FolderIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function DotsIcon({ size = 15, color = '#8A9598', style }: IconProps) {
  return (
    <span style={{ cursor: 'pointer', padding: 4, color, fontSize: size, fontWeight: 800, lineHeight: 1, ...style }}>
      ⋯
    </span>
  );
}

export function SpinnerIcon({ size = 13, color = '#D97706' }: IconProps) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

export function CorePilotLogoIcon({ size = 22, color = '#0EA5A0', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
      <polygon points="12 6.5 17 9.3 17 14.7 12 17.5 7 14.7 7 9.3" />
    </svg>
  );
}

export function LayersIcon({ size = 24, color = '#fff', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function UploadIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.8, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </svg>
  );
}

export function WifiIcon({ size = 20, color = '#0EA5A0', strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <path d="M18.36 5.64a5 5 0 0 1 0 7.07l-2.12 2.12a5 5 0 0 1-7.07-7.07l1.06-1.06" />
      <path d="M5.64 18.36a5 5 0 0 1 0-7.07l2.12-2.12a5 5 0 0 1 7.07 7.07l-1.06 1.06" />
    </svg>
  );
}

export function ClockIcon({ size = 13, color = '#5B6B70', strokeWidth = 2.2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} style={style}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function ToggleSwitch({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        position: 'relative',
        cursor: 'pointer',
        background: active ? '#0EA5A0' : '#D8DEDD',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: 2,
          transition: 'transform .15s',
          transform: active ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </div>
  );
}
