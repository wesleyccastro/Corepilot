import { colors } from '../styles';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: colors.navy,
        color: '#fff',
        padding: '12px 22px',
        borderRadius: 10,
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(7,54,74,.3)',
        zIndex: 100,
      }}
    >
      {message}
    </div>
  );
}
