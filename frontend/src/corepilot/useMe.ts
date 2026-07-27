import { useEffect, useState } from 'react';
import { apiFetch } from './api/apiFetch';

export interface MeResponse {
  usuario: { id: string; nome: string; email: string };
  empresa: { id: string; nome: string };
  perfil: string;
}

export function useMe(accessToken: string) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    apiFetch('/me', accessToken)
      .then(async (response) => {
        if (!response.ok) throw new Error(`GET /me falhou com status ${response.status}`);
        const data = (await response.json()) as MeResponse;
        if (!cancelado) setMe(data);
      })
      .catch((err: Error) => {
        if (!cancelado) setErro(err.message);
      });

    return () => {
      cancelado = true;
    };
  }, [accessToken]);

  return { me, erro };
}
