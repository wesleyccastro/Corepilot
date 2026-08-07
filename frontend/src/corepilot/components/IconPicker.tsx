import { useState } from 'react';
import { allLucideIcons, resolveModuleIcon } from '../lucideIcons';
import { colors, overlayFixed, inputSm } from '../styles';

interface IconPickerProps {
  value: string;
  onChange: (nome: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const IconeAtual = resolveModuleIcon(value);

  const fechar = () => {
    setAberto(false);
    setBusca('');
  };

  const resultados = busca.trim()
    ? allLucideIcons.filter(({ nome }) => nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : allLucideIcons;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        onClick={() => setAberto((a) => !a)}
        title={value}
        style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${aberto ? colors.teal : colors.border}`, background: aberto ? colors.successBg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <IconeAtual size={18} color={aberto ? colors.teal : colors.textMuted} />
      </div>
      {aberto && (
        <>
          <div style={overlayFixed} onClick={fechar} />
          <div style={{ position: 'absolute', top: 52, left: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(7,54,74,.18)', width: 300, zIndex: 50, padding: 10 }}>
            <input
              type="text"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ícone…"
              style={{ ...inputSm, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {resultados.map(({ nome, Icone }) => (
                <div
                  key={nome}
                  onClick={() => { onChange(nome); fechar(); }}
                  title={nome}
                  style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${value === nome ? colors.teal : 'transparent'}`, background: value === nome ? colors.successBg : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Icone size={16} color={colors.textMuted} />
                </div>
              ))}
              {resultados.length === 0 && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: colors.textFaint, textAlign: 'center', padding: '12px 0' }}>
                  Nenhum ícone encontrado.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
