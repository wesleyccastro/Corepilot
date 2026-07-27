import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { GearIcon, LayersIcon, PaperclipIcon, MessageSquareIcon } from '../icons';
import { colors } from '../styles';
import type { Modulo } from '../modulos/types';

export function CustomModuleView({ module, actions }: { accessToken: string; module: Modulo; state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px', textAlign: 'center', position: 'relative' }}>
      <span onClick={actions.editActiveModule} title="Configurar módulo" style={{ position: 'absolute', top: 0, right: 24, cursor: 'pointer', width: 34, height: 34, border: `1px solid ${colors.border}`, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GearIcon />
      </span>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: module.cor ?? colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <LayersIcon />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{module.nome}</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 28px' }}>Módulo publicado agora · Agente conectado às bases de conhecimento e dados definidas na criação.</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 16px', textAlign: 'left' }}>
        <MessageSquareIcon style={{ flexShrink: 0, marginBottom: 2 }} />
        <textarea placeholder="Pergunte algo sobre este módulo…" rows={1} style={{ flex: 1, border: 'none', fontSize: 14, resize: 'none', maxHeight: 160, overflowY: 'auto', fontFamily: 'inherit', lineHeight: 1.4, padding: 0 }} onInput={(e) => actions.autoGrowInput({ target: e.currentTarget })} />
        <label style={{ cursor: 'pointer', flexShrink: 0, marginBottom: 2 }} title="Anexar arquivo">
          <input type="file" multiple style={{ display: 'none' }} />
          <PaperclipIcon />
        </label>
      </div>
    </div>
  );
}
