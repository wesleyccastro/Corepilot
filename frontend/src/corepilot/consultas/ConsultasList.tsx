import { useEffect, useState } from 'react';
import { atualizarSincronizacao, listarConsultas, testarConsulta } from './api';
import { CriarConsultaForm } from './CriarConsultaForm';
import type { Consulta, ResultadoTeste } from './types';

interface ConsultasListProps {
  accessToken: string;
  moduloId: string;
}

export function ConsultasList({ accessToken, moduloId }: ConsultasListProps) {
  const [consultas, setConsultas] = useState<Consulta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [resultadosTeste, setResultadosTeste] = useState<Record<string, ResultadoTeste>>({});
  const [testando, setTestando] = useState<string | null>(null);

  useEffect(() => {
    listarConsultas(accessToken, moduloId)
      .then(setConsultas)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, moduloId]);

  async function handleTestar(consultaId: string) {
    setTestando(consultaId);
    try {
      const resultado = await testarConsulta(accessToken, consultaId);
      setResultadosTeste((atual) => ({ ...atual, [consultaId]: resultado }));
      const atualizadas = await listarConsultas(accessToken, moduloId);
      setConsultas(atualizadas);
    } catch (err) {
      setResultadosTeste((atual) => ({
        ...atual,
        [consultaId]: { sucesso: false, erro: err instanceof Error ? err.message : 'Erro ao testar' },
      }));
    } finally {
      setTestando(null);
    }
  }

  async function handleToggleSync(consulta: Consulta) {
    const atualizada = await atualizarSincronizacao(
      accessToken,
      consulta.id,
      !consulta.sincronizacaoAtiva,
      consulta.intervaloSincronizacaoMinutos ?? 60,
    );
    setConsultas((atual) => (atual ?? []).map((c) => (c.id === atualizada.id ? atualizada : c)));
  }

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!consultas) return <div>Carregando consultas…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h4>Consultas parametrizadas</h4>
      {consultas.length === 0 && <div>Nenhuma consulta ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {consultas.map((consulta) => {
          const resultado = resultadosTeste[consulta.id];
          return (
            <li key={consulta.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{consulta.nome}</strong>
                <button onClick={() => void handleTestar(consulta.id)} disabled={testando === consulta.id}>
                  {testando === consulta.id ? 'Testando...' : 'Testar consulta'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: consulta.testada ? 'green' : '#b8860b' }}>
                {consulta.testada ? 'Testada' : 'Ainda não testada'}
              </div>
              {resultado && (
                <div style={{ fontSize: 12, color: resultado.sucesso ? 'green' : 'crimson' }}>
                  {resultado.sucesso ? `${resultado.linhasLidas} linhas lidas` : resultado.erro}
                </div>
              )}
              {consulta.colunas && consulta.colunas.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>Dicionário de campos</div>
                  {consulta.colunas.map((coluna) => (
                    <div key={coluna.nomeTecnico} style={{ fontSize: 12 }}>
                      <code>{coluna.nomeTecnico}</code> — {coluna.descricao ?? <em>sem descrição</em>}
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={consulta.sincronizacaoAtiva}
                  disabled={!consulta.testada}
                  onChange={() => void handleToggleSync(consulta)}
                />
                Sincronização ativa
                {consulta.ultimaSincronizacaoEm && ` (última: ${consulta.ultimaSincronizacaoEm})`}
              </label>
            </li>
          );
        })}
      </ul>
      {mostrandoForm ? (
        <CriarConsultaForm
          accessToken={accessToken}
          moduloId={moduloId}
          onCriada={(consulta) => {
            setMostrandoForm(false);
            setConsultas((atual) => [consulta, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar consulta</button>
      )}
    </div>
  );
}
