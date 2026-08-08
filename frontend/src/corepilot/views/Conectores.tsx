import { useEffect, useState } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { apiFetch } from '../api/apiFetch';
import { colors } from '../styles';
import { LinkIcon } from '../icons';

interface ConectorConexao {
  id: string;
  provider: string;
  contaExterna: string | null;
  escopos: string[];
  ultimoTesteSucesso: boolean | null;
  criadoEm: string;
}

const PROVEDORES_DISPONIVEIS = [
  {
    id: 'google',
    nome: 'Google',
    descricao: 'Drive, Planilhas, Calendário e Gmail (somente leitura).',
  },
];

interface ConectoresProps {
  state: CorePilotState;
  actions: CorePilotActions;
  accessToken: string;
}

export function Conectores({ actions, accessToken }: ConectoresProps) {
  const [conexoes, setConexoes] = useState<ConectorConexao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState<string | null>(null);

  const carregar = () => {
    setCarregando(true);
    apiFetch('/conectores', accessToken)
      .then((r) => r.json() as Promise<ConectorConexao[]>)
      .then(setConexoes)
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = (provider: string) => {
    setConectando(provider);
    apiFetch(`/conectores/${provider}/iniciar`, accessToken)
      .then((r) => r.json() as Promise<{ url: string }>)
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch(() => setConectando(null));
  };

  const desconectar = (provider: string) => {
    apiFetch(`/conectores/${provider}`, accessToken, { method: 'DELETE' })
      .then(() => {
        actions.showToast('Conector desconectado.');
        carregar();
      })
      .catch(() => actions.showToast('Não foi possível desconectar. Tente de novo.'));
  };

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Conectores</h2>
      <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 20px' }}>
        Conecte suas contas pessoais para os agentes usarem como contexto.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PROVEDORES_DISPONIVEIS.map((p) => {
          const conexao = conexoes.find((c) => c.provider === p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <LinkIcon />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.nome}</div>
                <div style={{ fontSize: 12, color: colors.textFaint }}>
                  {conexao ? `Conectado como ${conexao.contaExterna ?? '—'}` : p.descricao}
                </div>
              </div>
              {conexao ? (
                <button onClick={() => desconectar(p.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: colors.danger, cursor: 'pointer' }}>
                  Desconectar
                </button>
              ) : (
                <button onClick={() => conectar(p.id)} disabled={conectando === p.id} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: conectando === p.id ? 'default' : 'pointer', opacity: conectando === p.id ? 0.7 : 1 }}>
                  {conectando === p.id ? 'Abrindo…' : 'Conectar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {carregando && conexoes.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 12 }}>Carregando…</div>}
    </div>
  );
}
