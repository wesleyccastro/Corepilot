import { useEffect, useState } from 'react';
import { listarModulos } from './api';
import { CriarModuloForm } from './CriarModuloForm';
import type { Modulo } from './types';

interface ModulosListProps {
  accessToken: string;
  onAbrirModulo: (modulo: Modulo) => void;
}

export function ModulosList({ accessToken, onAbrirModulo }: ModulosListProps) {
  const [modulos, setModulos] = useState<Modulo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarModulos(accessToken)
      .then(setModulos)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!modulos) return <div>Carregando módulos…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>Módulos</h2>
      {modulos.length === 0 && <div>Nenhum módulo ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modulos.map((modulo) => (
          <li key={modulo.id}>
            <button onClick={() => onAbrirModulo(modulo)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{modulo.nome}</strong> — {modulo.objetivo}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarModuloForm
          accessToken={accessToken}
          onCriado={(modulo) => {
            setMostrandoForm(false);
            setModulos((atual) => [modulo, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar módulo</button>
      )}
    </div>
  );
}
