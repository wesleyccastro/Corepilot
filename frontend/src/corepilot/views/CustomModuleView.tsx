import { useEffect, useRef, useState } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { GearIcon, LayersIcon } from '../icons';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../components/chat/MessageBubble';

export function CustomModuleView({ module, state, actions }: { module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void actions.carregarConversaDoModulo(module.id);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

  const ultimaMensagem = state.moduloMensagens[state.moduloMensagens.length - 1];
  const aguardandoPrimeiroToken =
    state.moduloChatEnviando && ultimaMensagem?.papel === 'agente' && ultimaMensagem.conteudo === '';
  const mensagensVisiveis = aguardandoPrimeiroToken ? state.moduloMensagens.slice(0, -1) : state.moduloMensagens;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.moduloMensagens, aguardandoPrimeiroToken]);

  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  useEffect(() => {
    if (!aguardandoPrimeiroToken) {
      setSegundosDecorridos(0);
      return;
    }
    const inicio = Date.now();
    const intervalo = window.setInterval(() => setSegundosDecorridos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => window.clearInterval(intervalo);
  }, [aguardandoPrimeiroToken]);

  const rotuloEspera = state.moduloChatStatus ?? `${module.nome} está pensando…`;
  const rotuloComTempo = segundosDecorridos >= 8 ? `${rotuloEspera} (${segundosDecorridos}s)` : rotuloEspera;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 24px', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <span
        onClick={actions.editActiveModule}
        title="Configurar módulo"
        style={{ position: 'absolute', top: 0, right: 24, cursor: 'pointer', width: 34, height: 34, border: `1px solid ${colors.border}`, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <GearIcon />
      </span>
      <div style={{ textAlign: 'center', marginBottom: 24, flexShrink: 0 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: module.cor ?? colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <LayersIcon />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{module.nome}</h1>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>{module.objetivo}</p>
      </div>

      {state.moduloChatErro && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12, flexShrink: 0 }}>{state.moduloChatErro}</div>}

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
        {mensagensVisiveis.map((mensagem) => (
          <MessageBubble
            key={mensagem.id}
            msg={{ id: 0, isUser: mensagem.papel === 'usuario', isAi: mensagem.papel === 'agente', text: mensagem.conteudo }}
            agentLabel={module.nome}
          />
        ))}
        {aguardandoPrimeiroToken && (
          <>
            <ThinkingBubble label={rotuloComTempo} />
            {segundosDecorridos >= 20 && (
              <div style={{ fontSize: 11.5, color: colors.textFaint, margin: '6px 0 0 38px' }}>
                Perguntas que cruzam muitos dados podem levar até 1 minuto.
              </div>
            )}
          </>
        )}
        <div ref={scrollRef} />
      </div>

      <div style={{ flexShrink: 0 }}>
        <ChatComposer
          variant="module"
          placeholder={`Pergunte algo sobre ${module.nome.toLowerCase()}…`}
          value={state.moduloChatDraft}
          onChange={actions.updateModuloChatDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void actions.enviarMensagemModuloReal();
            }
          }}
          onSend={() => void actions.enviarMensagemModuloReal()}
          attachments={[]}
          onAttach={() => {}}
          disabled={state.moduloChatEnviando}
        />
      </div>
    </div>
  );
}
