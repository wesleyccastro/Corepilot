import { useState, type FormEvent } from 'react';
import { criarSkill } from './api';
import type { CampoSaida, Skill, TipoCampoSaida } from './types';

interface CriarSkillFormProps {
  accessToken: string;
  agenteId: string;
  onCriado: (skill: Skill) => void;
  onCancelar: () => void;
}

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

function novoCampo(): CampoSaida {
  return { nome: '', tipo: 'string', descricao: '', obrigatorio: true };
}

export function CriarSkillForm({ accessToken, agenteId, onCriado, onCancelar }: CriarSkillFormProps) {
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [campos, setCampos] = useState<CampoSaida[]>([novoCampo()]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function atualizarCampo(indice: number, parcial: Partial<CampoSaida>) {
    setCampos((atual) => atual.map((campo, i) => (i === indice ? { ...campo, ...parcial } : campo)));
  }

  function removerCampo(indice: number) {
    setCampos((atual) => atual.filter((_, i) => i !== indice));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const skill = await criarSkill(accessToken, agenteId, {
        nome,
        objetivo,
        camposSaida: campos.map((campo) => ({
          ...campo,
          descricao: campo.descricao?.trim() ? campo.descricao : undefined,
        })),
      });
      onCriado(skill);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar skill');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <input
        type="text"
        placeholder="Nome da skill"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <textarea
        placeholder="Objetivo da skill"
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        required
        rows={3}
      />

      <div style={{ fontWeight: 600, marginTop: 8 }}>Campos de saída</div>
      {campos.map((campo, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="nome do campo"
            value={campo.nome}
            onChange={(e) => atualizarCampo(indice, { nome: e.target.value })}
            required
            style={{ flex: 1 }}
          />
          <select
            value={campo.tipo}
            onChange={(e) => atualizarCampo(indice, { tipo: e.target.value as TipoCampoSaida })}
          >
            {TIPOS_CAMPO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="descrição (opcional)"
            value={campo.descricao ?? ''}
            onChange={(e) => atualizarCampo(indice, { descricao: e.target.value })}
            style={{ flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={campo.obrigatorio}
              onChange={(e) => atualizarCampo(indice, { obrigatorio: e.target.checked })}
            />
            obrigatório
          </label>
          <button type="button" onClick={() => removerCampo(indice)} disabled={campos.length <= 1}>
            remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setCampos((atual) => [...atual, novoCampo()])}>
        + Adicionar campo
      </button>

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar skill'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
