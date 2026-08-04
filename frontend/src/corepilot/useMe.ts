import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api/apiFetch';

export interface MeResponse {
  usuario: { id: string; nome: string; email: string };
  empresa: { id: string; nome: string; razaoSocial: string | null; logoDataUrl: string | null };
  perfil: string;
}

export function useMe(accessToken: string) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const buscarMe = useCallback(async () => {
    const response = await apiFetch('/me', accessToken);
    if (!response.ok) throw new Error(`GET /me falhou com status ${response.status}`);
    const data = (await response.json()) as MeResponse;
    setMe(data);
  }, [accessToken]);

  useEffect(() => {
    let cancelado = false;

    buscarMe().catch((err: Error) => {
      if (!cancelado) setErro(err.message);
    });

    return () => {
      cancelado = true;
    };
  }, [buscarMe]);

  return { me, erro, refetch: buscarMe };
}
