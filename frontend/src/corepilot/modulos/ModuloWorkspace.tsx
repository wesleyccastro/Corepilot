import { useState } from 'react';
import { ChatView } from './ChatView';
import { AgentesList } from '../agentes/AgentesList';
import { SkillsList } from '../agentes/SkillsList';
import { SkillExecutor } from '../agentes/SkillExecutor';
import type { Modulo } from './types';
import type { Agente, Skill } from '../agentes/types';

interface ModuloWorkspaceProps {
  accessToken: string;
  modulo: Modulo;
  onVoltar: () => void;
}

type Aba = 'chat' | 'agentes';

export function ModuloWorkspace({ accessToken, modulo, onVoltar }: ModuloWorkspaceProps) {
  const [aba, setAba] = useState<Aba>('chat');
  const [agenteSelecionado, setAgenteSelecionado] = useState<Agente | null>(null);
  const [skillSelecionada, setSkillSelecionada] = useState<Skill | null>(null);

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>{modulo.nome}</h2>
        <button onClick={onVoltar}>Voltar aos módulos</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setAba('chat')} style={{ fontWeight: aba === 'chat' ? 700 : 400 }}>
          Chat
        </button>
        <button onClick={() => setAba('agentes')} style={{ fontWeight: aba === 'agentes' ? 700 : 400 }}>
          Agentes
        </button>
      </div>

      {aba === 'chat' && (
        <ChatView accessToken={accessToken} modulo={modulo} onVoltar={onVoltar} />
      )}

      {aba === 'agentes' && !agenteSelecionado && (
        <AgentesList accessToken={accessToken} moduloId={modulo.id} onAbrirAgente={setAgenteSelecionado} />
      )}

      {aba === 'agentes' && agenteSelecionado && !skillSelecionada && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setAgenteSelecionado(null)}>← Agentes</button>
          <SkillsList
            accessToken={accessToken}
            agenteId={agenteSelecionado.id}
            onAbrirSkill={setSkillSelecionada}
          />
        </div>
      )}

      {aba === 'agentes' && agenteSelecionado && skillSelecionada && (
        <SkillExecutor
          accessToken={accessToken}
          skill={skillSelecionada}
          onVoltar={() => setSkillSelecionada(null)}
        />
      )}
    </div>
  );
}
