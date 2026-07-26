import { useEffect, useRef, useState } from 'react';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatSidebarReal } from './ChatSidebarReal';
import { criarConversa, enviarMensagemStreaming, listarMensagens } from './chatStream';
import type { Conversa, Mensagem, Modulo } from './types';

interface ChatViewProps {
  accessToken: string;
  modulo: Modulo;
  onVoltar: () => void;
}

let proximoIdLocal = 1;

export function ChatView({ accessToken, modulo, onVoltar }: ChatViewProps) {
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [draft, setDraft] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const respostaEmAndamentoRef = useRef<string>('');

  useEffect(() => {
    // Depende só de modulo.id, não de accessToken: o token do Supabase é
    // renovado periodicamente, e reagir a ele aqui criaria uma conversa nova
    // a cada renovação — o efeito deve rodar só quando o módulo muda.
    criarConversa(accessToken, modulo.id).then(setConversa).catch((err: Error) => setErro(err.message));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [modulo.id]);

  function carregarMensagens(conversaId: string) {
    listarMensagens(accessToken, conversaId)
      .then(setMensagens)
      .catch((err: Error) => setErro(err.message));
  }

  function handleSelecionarConversa(novaConversa: Conversa) {
    setConversa(novaConversa);
    carregarMensagens(novaConversa.id);
  }

  async function handleEnviar() {
    if (!conversa || !draft.trim() || enviando) return;

    const texto = draft;
    setDraft('');
    setEnviando(true);
    setErro(null);
    respostaEmAndamentoRef.current = '';

    const idUsuario = `local-${proximoIdLocal++}`;
    const idAgente = `local-${proximoIdLocal++}`;

    setMensagens((atual) => [
      ...atual,
      { id: idUsuario, conversaId: conversa.id, papel: 'usuario', conteudo: texto, tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
      { id: idAgente, conversaId: conversa.id, papel: 'agente', conteudo: '', tokensEntrada: null, tokensSaida: null, criadoEm: new Date().toISOString() },
    ]);

    await enviarMensagemStreaming(accessToken, conversa.id, texto, {
      onDelta: (delta) => {
        respostaEmAndamentoRef.current += delta;
        setMensagens((atual) =>
          atual.map((m) => (m.id === idAgente ? { ...m, conteudo: respostaEmAndamentoRef.current } : m)),
        );
      },
      onDone: () => {
        setEnviando(false);
      },
      onErro: (mensagemErro) => {
        setErro(mensagemErro);
        setEnviando(false);
      },
    });
  }

  return (
    <div style={{ display: 'flex', height: '70vh' }}>
      <ChatSidebarReal
        accessToken={accessToken}
        moduloId={modulo.id}
        conversaAtualId={conversa?.id ?? null}
        onSelecionarConversa={handleSelecionarConversa}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2>{modulo.nome}</h2>
          <button onClick={onVoltar}>Voltar</button>
        </div>
        {erro && <div style={{ color: 'crimson' }}>{erro}</div>}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mensagens.map((mensagem, indice) => (
            <MessageBubble
              key={mensagem.id}
              msg={{
                id: indice,
                isUser: mensagem.papel === 'usuario',
                isAi: mensagem.papel === 'agente',
                text: mensagem.conteudo,
              }}
              agentLabel={modulo.nome}
            />
          ))}
        </div>
        <ChatComposer
          variant="module"
          placeholder={`Pergunte algo sobre ${modulo.nome.toLowerCase()}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleEnviar();
            }
          }}
          onSend={() => void handleEnviar()}
          attachments={[]}
          onAttach={() => {}}
        />
      </div>
    </div>
  );
}
