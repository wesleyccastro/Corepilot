import { useEffect, useState } from 'react';
import { criarConversa, listarConversas } from './chatStream';
import type { Conversa } from './types';

interface ChatSidebarRealProps {
  accessToken: string;
  moduloId: string;
  conversaAtualId: string | null;
  onSelecionarConversa: (conversa: Conversa) => void;
}

export function ChatSidebarReal({
  accessToken,
  moduloId,
  conversaAtualId,
  onSelecionarConversa,
}: ChatSidebarRealProps) {
  const [conversas, setConversas] = useState<Conversa[]>([]);

  useEffect(() => {
    listarConversas(accessToken, moduloId).then(setConversas).catch(() => setConversas([]));
  }, [accessToken, moduloId]);

  async function handleNovaConversa() {
    const conversa = await criarConversa(accessToken, moduloId);
    setConversas((atual) => [conversa, ...atual]);
    onSelecionarConversa(conversa);
  }

  return (
    <div style={{ width: 220, borderRight: '1px solid #ddd', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={handleNovaConversa}>+ Nova conversa</button>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conversas.map((conversa) => (
          <li key={conversa.id}>
            <button
              onClick={() => onSelecionarConversa(conversa)}
              style={{
                width: '100%',
                textAlign: 'left',
                fontWeight: conversa.id === conversaAtualId ? 700 : 400,
              }}
            >
              {conversa.titulo ?? 'Nova conversa'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
