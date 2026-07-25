import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { ChevronDownIcon, MessageSquareIcon, SpinnerIcon, ToggleSwitch } from '../../icons';
import { colors, inputSm, label } from '../../styles';

export function AdminSettings({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const isTesting = state.waConnectionState === 'testing';
  const badge = state.waConnectionState === 'connected'
    ? { label: 'Conectado', bg: colors.successBg, color: colors.success }
    : state.waConnectionState === 'testing'
      ? { label: 'Testando…', bg: colors.warnBg, color: colors.warn }
      : { label: 'Desconectado', bg: colors.chipBg, color: colors.textMuted };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Configurações Gerais</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>Integrações e canais compartilhados por todos os módulos.</p>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
          <MessageSquareIcon style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>WhatsApp · Evolution API</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>Usado para enviar mensagens e notificações de tarefas pelo WhatsApp</div>
          </div>
          {isTesting && <SpinnerIcon />}
          <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{badge.label}</span>
          <button onClick={actions.testWaConnection} disabled={isTesting} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Testar</button>
          <span onClick={actions.toggleWaExpanded} style={{ cursor: 'pointer', padding: 4, color: colors.textFaint }}>
            <ChevronDownIcon color={colors.textFaint} style={{ transform: state.waExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }} />
          </span>
        </div>

        {state.waExpanded && (
          <div style={{ borderTop: `1px solid ${colors.border}`, padding: 18, background: colors.bgAlt }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 12 }}>{state.waLastTestMsg}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
              <div>
                <label style={label}>URL da instância</label>
                <input type="text" value={state.waForm.apiUrl} onChange={actions.updateWaField('apiUrl')} placeholder="https://evolution.suaempresa.com" style={{ ...inputSm, width: '100%' }} />
              </div>
              <div>
                <label style={label}>Nome da instância</label>
                <input type="text" value={state.waForm.instanceName} onChange={actions.updateWaField('instanceName')} placeholder="lfgagro-corepilot" style={{ ...inputSm, width: '100%' }} />
              </div>
              <div>
                <label style={label}>Chave de API</label>
                {!state.waChangingKey ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="password" value="••••••••••••" disabled style={{ ...inputSm, flex: 1, background: colors.chipBg, color: colors.textFaint }} />
                    <span onClick={actions.toggleChangeWaKey} style={{ fontSize: 12, fontWeight: 600, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Trocar chave</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="password" value={state.waNewKey} onChange={actions.updateWaNewKey} placeholder="Nova chave de API" style={{ ...inputSm, flex: 1 }} />
                    <span onClick={actions.toggleChangeWaKey} style={{ fontSize: 12, fontWeight: 600, color: colors.textFaint, cursor: 'pointer', whiteSpace: 'nowrap' }}>Cancelar</span>
                  </div>
                )}
              </div>
              <div>
                <label style={label}>Número conectado</label>
                <input type="text" value={state.waForm.phone} onChange={actions.updateWaField('phone')} placeholder="+55 11 90000-0000" style={{ ...inputSm, width: '100%' }} />
              </div>
              <button onClick={actions.testWaConnection} style={{ alignSelf: 'flex-start', background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar e testar conexão</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Usar WhatsApp para notificações de tarefas</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>Tarefas agendadas com destinatário por telefone enviam pelo WhatsApp em vez de e-mail/chat.</div>
          </div>
          <ToggleSwitch active={state.waNotifyTasks} onClick={actions.toggleWaNotifyTasks} />
        </div>
      </div>
    </div>
  );
}
