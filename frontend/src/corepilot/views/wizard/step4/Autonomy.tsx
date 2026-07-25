import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors } from '../../../styles';
import type { AutonomyLevel } from '../../../types';

const levels: { key: AutonomyLevel; label: string; description: string }[] = [
  { key: 'consultar', label: 'Consultar', description: 'O agente apenas lê, analisa e recomenda.' },
  { key: 'confirmar', label: 'Confirmar', description: 'O agente prepara a ação e solicita aprovação humana.' },
  { key: 'executar', label: 'Executar', description: 'O agente pode executar ações previamente autorizadas.' },
];

export function AgentAutonomyTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ fontSize: 13.5, color: colors.textMuted, marginBottom: 16 }}>Nível geral de atuação do agente. Cada skill pode sobrepor este valor.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600 }}>
        {levels.map((lv) => {
          const active = state.autonomy === lv.key;
          return (
            <div key={lv.key} onClick={() => actions.setAutonomy(lv.key)} style={{ border: `1.5px solid ${active ? colors.teal : colors.border}`, background: active ? colors.successBg : '#fff', borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: active ? colors.navy : colors.text, marginBottom: 2 }}>{lv.label}</div>
              <div style={{ fontSize: 12.5, color: colors.textMuted }}>{lv.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
