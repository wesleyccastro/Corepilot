import { useEffect, useState } from 'react';
import { anexarFerramenta, executarSkill, listarExecucoes, removerFerramenta } from './api';
import type { Skill, SkillExecucao } from './types';
import { listarConsultas } from '../consultas/api';
import type { Consulta } from '../consultas/types';

interface SkillExecutorProps {
  accessToken: string;
  moduloId: string;
  skill: Skill;
  onVoltar: () => void;
}

export function SkillExecutor({ accessToken, moduloId, skill, onVoltar }: SkillExecutorProps) {
  const [entrada, setEntrada] = useState('');
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<SkillExecucao[]>([]);
  const [consultasTestadas, setConsultasTestadas] = useState<Consulta[]>([]);

  useEffect(() => {
    listarExecucoes(accessToken, skill.id)
      .then(setExecucoes)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, skill.id]);

  useEffect(() => {
    listarConsultas(accessToken, moduloId)
      .then((consultas) => setConsultasTestadas(consultas.filter((c) => c.testada)))
      .catch(() => setConsultasTestadas([]));
  }, [accessToken, moduloId]);

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

      {consultasTestadas.length > 0 && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Ferramentas (consultas de dados)</div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {consultasTestadas.map((consulta) => (
              <li key={consulta.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{consulta.nome}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void anexarFerramenta(accessToken, skill.id, consulta.id)}>
                    Anexar
                  </button>
                  <button onClick={() => void removerFerramenta(accessToken, skill.id, consulta.id)}>
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
