import { useEffect, useState } from 'react';
import { listarFontesDeDados } from './api';
import { CriarFonteDeDadosForm } from './CriarFonteDeDadosForm';
import type { FonteDeDados } from './types';

interface FontesDeDadosListProps {
  accessToken: string;
}

function badge(fonte: FonteDeDados): { texto: string; cor: string } {
  if (fonte.ultimoTesteSucesso === true) {
    return { texto: `Conectada · ${fonte.ultimoTesteEm}`, cor: 'green' };
  }
  if (fonte.ultimoTesteSucesso === false) {
    return { texto: `Erro: ${fonte.ultimaMensagemErro}`, cor: 'crimson' };
  }
  return { texto: 'Salva, não testada', cor: '#b8860b' };
}

export function FontesDeDadosList({ accessToken }: FontesDeDadosListProps) {
  const [fontes, setFontes] = useState<FonteDeDados[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarFontesDeDados(accessToken)
      .then(setFontes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!fontes) return <div>Carregando fontes de dados…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3>Fontes de dados</h3>
      {fontes.length === 0 && <div>Nenhuma fonte de dados ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fontes.map((fonte) => {
          const { texto, cor } = badge(fonte);
          return (
            <li key={fonte.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <strong>{fonte.nome}</strong> ({fonte.tipo})
              <div style={{ fontSize: 12, color: cor }}>{texto}</div>
            </li>
          );
        })}
      </ul>
      {mostrandoForm ? (
        <CriarFonteDeDadosForm
          accessToken={accessToken}
          onCriada={(fonte) => {
            setMostrandoForm(false);
            setFontes((atual) => [fonte, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Conectar fonte de dados</button>
      )}
    </div>
  );
}
