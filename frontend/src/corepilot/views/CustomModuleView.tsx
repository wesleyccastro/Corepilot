import { useEffect, useRef, useState } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble, ThinkingBubble } from '../components/chat/MessageBubble';
import { CustomModuleChatSidebar } from '../components/chat/CustomModuleChatSidebar';
import { ModuloKanban } from '../components/orquestrador/ModuloKanban';
import { TelaDeInteracao } from '../components/orquestrador/TelaDeInteracao';

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, padding: '0 24px', flexShrink: 0 }}>
        {(['chat', 'interacao'] as const).map((tab) => (
          <div key={tab} onClick={() => actions.setModuloWorkspaceTab(tab)} style={{ padding: '12px 14px', cursor: 'pointer', position: 'relative' }}>
            <span style={{ fontSize: 13, fontWeight: state.moduloWorkspaceTab === tab ? 700 : 500, color: state.moduloWorkspaceTab === tab ? colors.teal : colors.textMuted }}>
              {tab === 'chat' ? 'Chat' : 'Interação'}
            </span>
            {state.moduloWorkspaceTab === tab && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
          </div>
        ))}
      </div>

      {state.moduloWorkspaceTab === 'interacao' ? (
        <ModuloKanban moduloId={module.id} state={state} actions={actions} />
      ) : (
        <div style={{ margin: 0, padding: '24px 16px 16px 24px', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
          <CustomModuleChatSidebar moduloId={module.id} state={state} actions={actions} onConfigure={actions.editActiveModule} />
          <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {state.moduloChatErro && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12, flexShrink: 0 }}>{state.moduloChatErro}</div>}

            {!state.moduloConversaId && !state.moduloConversasLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>Nenhuma conversa ainda.</p>
                <button
                  onClick={() => void actions.criarConversaModulo(module.id)}
                  style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '11px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Nova conversa
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
      <TelaDeInteracao state={state} actions={actions} />
    </div>
  );
}
