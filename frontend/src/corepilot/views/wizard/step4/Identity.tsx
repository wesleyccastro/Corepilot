import { useEffect, useState } from 'react';
import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, input, label } from '../../../styles';

export function AgentIdentityTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const agente = state.moduloAgentes.find((a) => a.id === state.selectedAgenteId);
  const [nome, setNome] = useState(agente?.nome ?? '');
  const [funcao, setFuncao] = useState(agente?.funcao ?? '');
  const [objetivo, setObjetivo] = useState(agente?.objetivo ?? '');

  useEffect(() => {
    setNome(agente?.nome ?? '');
    setFuncao(agente?.funcao ?? '');
    setObjetivo(agente?.objetivo ?? '');
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [agente?.id]);

  if (!agente) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <label style={label}>Nome do agente</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome !== agente.nome && void actions.atualizarAgenteReal('nome', nome)}
          style={{ ...input, width: '100%' }}
        />
      </div>
      <div>
        <label style={label}>Função</label>
        <textarea
          rows={2}
          value={funcao}
          onChange={(e) => setFuncao(e.target.value)}
          onBlur={() => funcao !== agente.funcao && void actions.atualizarAgenteReal('funcao', funcao)}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Objetivo</label>
        <textarea
          rows={2}
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          onBlur={() => objetivo !== agente.objetivo && void actions.atualizarAgenteReal('objetivo', objetivo)}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={{ ...label, marginBottom: 8 }}>Modelo de IA</label>
        <div style={{ border: `1.5px solid ${colors.teal}`, background: colors.successBg, borderRadius: 9, padding: '10px 16px', display: 'inline-block' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Claude</div>
          <div style={{ fontSize: 10.5, color: colors.teal, fontWeight: 700 }}>Único suportado nesta versão</div>
        </div>
        <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 8 }}>O CorePilot é otimizado e roda exclusivamente com Claude.</div>
      </div>
    </div>
  );
}
