import { useState } from 'react';
import { allLucideIcons, resolveModuleIcon } from '../lucideIcons';
import { colors, inputSm } from '../styles';

interface IconPickerProps {
  value: string;
  onChange: (nome: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(value);
  const IconeAtual = resolveModuleIcon(value);
  const IconeSelecionado = resolveModuleIcon(selecionado);

  const abrir = () => {
    setSelecionado(value);
    setBusca('');
    setAberto(true);
  };
  const fechar = () => setAberto(false);
  const aplicar = () => {
    onChange(selecionado);
    fechar();
  };

  const resultados = busca.trim()
    ? allLucideIcons.filter(({ nome }) => nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : allLucideIcons;

  return (
    <>
      <div
        onClick={abrir}
        title={value}
        style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <IconeAtual size={18} color={colors.textMuted} />
      </div>
      {aberto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,54,74,.32)' }} onClick={fechar} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: 24, width: 520, maxWidth: '90vw', boxShadow: '0 20px 48px rgba(7,54,74,.28)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${colors.teal}`, background: colors.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconeSelecionado size={22} color={colors.teal} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: colors.navy, margin: 0 }}>Escolher ícone</h2>
                <p style={{ fontSize: 12, color: colors.textFaint, margin: 0 }}>{selecionado}</p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ícone…"
              style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 360, overflowY: 'auto', padding: 2 }}>
              {resultados.map(({ nome, Icone }) => (
                <div
                  key={nome}
                  onClick={() => setSelecionado(nome)}
                  title={nome}
                  style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, border: `1.5px solid ${selecionado === nome ? colors.teal : colors.border}`, background: selecionado === nome ? colors.successBg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Icone size={22} color={selecionado === nome ? colors.teal : colors.textMuted} />
                </div>
              ))}
              {resultados.length === 0 && (
                <div style={{ width: '100%', fontSize: 12, color: colors.textFaint, textAlign: 'center', padding: '20px 0' }}>
                  Nenhum ícone encontrado.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={fechar}
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={aplicar}
                style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
