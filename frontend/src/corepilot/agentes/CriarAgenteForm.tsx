import { useState, type FormEvent } from 'react';
import { criarAgente } from './api';
import type { Agente } from './types';

interface CriarAgenteFormProps {
  accessToken: string;
  moduloId: string;
  onCriado: (agente: Agente) => void;
  onCancelar: () => void;
}

export function CriarAgenteForm({ accessToken, moduloId, onCriado, onCancelar }: CriarAgenteFormProps) {
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const agente = await criarAgente(accessToken, moduloId, { nome, funcao, objetivo });
      onCriado(agente);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar agente');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <input
        type="text"
        placeholder="Nome do agente"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Função (ex: Analista de compras)"
        value={funcao}
        onChange={(e) => setFuncao(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo do agente"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />
      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar agente'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
