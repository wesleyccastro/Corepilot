import { useState, type FormEvent } from 'react';
import { criarModulo } from './api';
import type { Modulo } from './types';

interface CriarModuloFormProps {
  accessToken: string;
  onCriado: (modulo: Modulo) => void;
  onCancelar: () => void;
}

export function CriarModuloForm({ accessToken, onCriado, onCancelar }: CriarModuloFormProps) {
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const modulo = await criarModulo(accessToken, {
        nome,
        objetivo,
        instrucoes: instrucoes.trim() ? instrucoes : undefined,
      });
      onCriado(modulo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar módulo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <input
        type="text"
        placeholder="Nome do módulo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo do módulo"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />
      <textarea
        placeholder="Instruções adicionais (opcional)"
        value={instrucoes}
        onChange={(e) => setInstrucoes(e.target.value)}
        rows={3}
      />
      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar módulo'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
