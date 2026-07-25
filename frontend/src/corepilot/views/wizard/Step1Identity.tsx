import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { CheckIcon, LayersIcon } from '../../icons';
import { card, colors, input, label } from '../../styles';

const iconChoices = [
  { key: 'leaf', label: 'Agro' },
  { key: 'cart', label: 'Compras' },
  { key: 'wallet', label: 'Financeiro' },
  { key: 'wrench', label: 'Manutenção' },
  { key: 'users', label: 'Pessoas' },
];
const colorHexes = ['#0EA5A0', '#07364A', '#E8604C', '#D97706', '#1E9E6B'];

export function Step1Identity({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const f = state.moduleForm;
  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Identidade do módulo</h2>
      <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 22px' }}>Este módulo será exibido dinamicamente na navegação para os usuários autorizados.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        <div>
          <label style={label}>Nome do módulo</label>
          <input type="text" value={f.name} onChange={actions.updateModuleField('name')} style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={label}>Descrição</label>
          <textarea rows={2} value={f.description} onChange={actions.updateModuleField('description')} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={f.objective} onChange={actions.updateModuleField('objective')} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={label}>Responsável</label>
            <input type="text" value={f.owner} onChange={actions.updateModuleField('owner')} style={{ ...input, width: '100%' }} />
          </div>
          <div>
            <label style={label}>Áreas ou empresas atendidas</label>
            <input type="text" value={f.areas} onChange={actions.updateModuleField('areas')} style={{ ...input, width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={{ ...label, marginBottom: 8 }}>Ícone</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {iconChoices.map((ic) => {
              const active = f.icon === ic.key;
              return (
                <div key={ic.key} onClick={() => actions.selectIcon(ic.key)} title={ic.label} style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${active ? colors.teal : colors.border}`, background: active ? colors.successBg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
                  <LayersIcon size={18} color={active ? colors.teal : colors.textMuted} />
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <label style={{ ...label, marginBottom: 8 }}>Cor de identificação</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {colorHexes.map((hex) => {
              const active = f.color === hex;
              return (
                <div key={hex} onClick={() => actions.selectColor(hex)} style={{ width: 28, height: 28, borderRadius: '50%', background: hex, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <CheckIcon />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
