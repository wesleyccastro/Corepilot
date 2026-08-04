import { useState } from 'react';
import { colors, btnGhostSm, inputSm } from '../styles';

interface GerarRascunhoButtonProps {
  onGerar: (brief: string) => Promise<void>;
}

export function GerarRascunhoButton({ onGerar }: GerarRascunhoButtonProps) {
  const [aberto, setAberto] = useState(false);
  const [brief, setBrief] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setErro(null);
    setGerando(true);
    try {
      await onGerar(brief);
      setAberto(false);
      setBrief('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar rascunho');
    } finally {
      setGerando(false);
    }
  };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} style={btnGhostSm}>
        ✨ Gerar rascunho com IA
      </button>
    );
  }

  return (
    <div style={{ background: colors.bg, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, marginBottom: 8 }}>
      <textarea
        rows={2}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Descreva em poucas palavras o que você precisa (opcional)"
        style={{ ...inputSm, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void gerar()} disabled={gerando} style={btnGhostSm}>
          {gerando ? 'Gerando…' : 'Gerar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} disabled={gerando} style={btnGhostSm}>
          Cancelar
        </button>
      </div>
      {erro && <div style={{ fontSize: 12, color: colors.danger, fontWeight: 600 }}>{erro}</div>}
    </div>
  );
}
