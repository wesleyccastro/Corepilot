import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase/client';
import { apiFetch } from '../api/apiFetch';
import { CorePilotApp } from '../CorePilotApp';

interface MeResponse {
  usuario: { id: string; nome: string; email: string };
  empresa: { id: string; nome: string };
  perfil: string;
}

export function FundacaoStatus({ session }: { session: Session }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrototype, setShowPrototype] = useState(false);

  useEffect(() => {
    let cancelado = false;

    apiFetch('/me', session.access_token)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`GET /me falhou com status ${response.status}`);
        }
        const data = (await response.json()) as MeResponse;
        if (!cancelado) setMe(data);
      })
      .catch((err: Error) => {
        if (!cancelado) setError(err.message);
      });

    return () => {
      cancelado = true;
    };
  }, [session.access_token]);

  if (showPrototype) {
    return <CorePilotApp />;
  }

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>CorePilot — Fundação</h1>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!error && !me && <div>Carregando /me…</div>}
      {me && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <div>
            <strong>Usuário:</strong> {me.usuario.nome} ({me.usuario.email})
          </div>
          <div>
            <strong>Empresa:</strong> {me.empresa.nome}
          </div>
          <div>
            <strong>Perfil:</strong> {me.perfil}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setShowPrototype(true)}>Ver protótipo (mock)</button>
        <button onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
    </div>
  );
}
