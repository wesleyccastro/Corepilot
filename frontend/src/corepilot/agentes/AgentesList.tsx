import { useEffect, useState } from 'react';
import { listarAgentes } from './api';
import { CriarAgenteForm } from './CriarAgenteForm';
import type { Agente } from './types';

interface AgentesListProps {
  accessToken: string;
  moduloId: string;
  onAbrirAgente: (agente: Agente) => void;
}

export function AgentesList({ accessToken, moduloId, onAbrirAgente }: AgentesListProps) {
  const [agentes, setAgentes] = useState<Agente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarAgentes(accessToken, moduloId)
      .then(setAgentes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, moduloId]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!agentes) return <div>Carregando agentes…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3>Agentes</h3>
      {agentes.length === 0 && <div>Nenhum agente ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agentes.map((agente) => (
          <li key={agente.id}>
            <button onClick={() => onAbrirAgente(agente)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{agente.nome}</strong> — {agente.funcao}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarAgenteForm
          accessToken={accessToken}
          moduloId={moduloId}
          onCriado={(agente) => {
            setMostrandoForm(false);
            setAgentes((atual) => [agente, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar agente</button>
      )}
    </div>
  );
}
