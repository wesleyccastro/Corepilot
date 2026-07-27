import { useEffect } from 'react';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { GearIcon, LayersIcon } from '../icons';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageBubble } from '../components/chat/MessageBubble';

export function CustomModuleView({ module, state, actions }: { module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    void actions.carregarConversaDoModulo(module.id);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

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
        {state.moduloMensagens.map((mensagem) => (
          <MessageBubble
            key={mensagem.id}
            msg={{ id: 0, isUser: mensagem.papel === 'usuario', isAi: mensagem.papel === 'agente', text: mensagem.conteudo }}
            agentLabel={module.nome}
          />
        ))}
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
        />
      </div>
    </div>
  );
}
