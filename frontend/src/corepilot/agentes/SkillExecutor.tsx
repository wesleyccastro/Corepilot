import { useEffect, useState } from 'react';
import { executarSkill, listarExecucoes } from './api';
import type { Skill, SkillExecucao } from './types';

interface SkillExecutorProps {
  accessToken: string;
  skill: Skill;
  onVoltar: () => void;
}

export function SkillExecutor({ accessToken, skill, onVoltar }: SkillExecutorProps) {
  const [entrada, setEntrada] = useState('');
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<SkillExecucao[]>([]);

  useEffect(() => {
    listarExecucoes(accessToken, skill.id)
      .then(setExecucoes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, skill.id]);

  async function handleExecutar() {
    if (!entrada.trim() || executando) return;
    setExecutando(true);
    setErro(null);

    try {
      const resultado = await executarSkill(accessToken, skill.id, entrada);
      setEntrada('');
      const execucoesAtualizadas = await listarExecucoes(accessToken, skill.id);
      setExecucoes(execucoesAtualizadas);
      void resultado;
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao executar skill');
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h4>{skill.nome}</h4>
        <button onClick={onVoltar}>Voltar</button>
      </div>
      <textarea
        placeholder="Entrada para esta skill (texto livre)"
        value={entrada}
        onChange={(e) => setEntrada(e.target.value)}
        rows={4}
      />
      <button onClick={() => void handleExecutar()} disabled={executando || !entrada.trim()}>
        {executando ? 'Executando...' : 'Executar'}
      </button>
      {erro && <div style={{ color: 'crimson' }}>{erro}</div>}

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Execuções anteriores</div>
        {execucoes.length === 0 && <div>Nenhuma execução ainda.</div>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {execucoes.map((execucao) => (
            <li key={execucao.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{execucao.entrada}</div>
              {skill.camposSaida.map((campo) => (
                <div key={campo.nome} style={{ fontSize: 13 }}>
                  <strong>{campo.nome}:</strong> {JSON.stringify(execucao.saida[campo.nome])}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
