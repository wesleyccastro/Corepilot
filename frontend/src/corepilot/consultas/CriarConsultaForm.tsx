import { useEffect, useState, type FormEvent } from 'react';
import { criarConsulta } from './api';
import { listarFontesDeDados } from '../fontes-de-dados/api';
import type { FonteDeDados } from '../fontes-de-dados/types';
import type { CampoSaida, TipoCampoSaida } from '../agentes/types';
import type { Consulta } from './types';

interface CriarConsultaFormProps {
  accessToken: string;
  moduloId: string;
  onCriada: (consulta: Consulta) => void;
  onCancelar: () => void;
}

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

function novoCampo(): CampoSaida {
  return { nome: '', tipo: 'string', descricao: '', obrigatorio: true };
}

function novoParametro() {
  return { chave: '', valor: '' };
}

export function CriarConsultaForm({ accessToken, moduloId, onCriada, onCancelar }: CriarConsultaFormProps) {
  const [fontes, setFontes] = useState<FonteDeDados[]>([]);
  const [fonteDeDadosId, setFonteDeDadosId] = useState('');
  const [nome, setNome] = useState('');
  const [codSentenca, setCodSentenca] = useState('');
  const [parametros, setParametros] = useState([novoParametro()]);
  const [campos, setCampos] = useState<CampoSaida[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarFontesDeDados(accessToken)
      .then(setFontes)
      .catch(() => setFontes([]));
  }, [accessToken]);

  function atualizarParametro(indice: number, parcial: Partial<{ chave: string; valor: string }>) {
    setParametros((atual) => atual.map((p, i) => (i === indice ? { ...p, ...parcial } : p)));
  }

  function atualizarCampo(indice: number, parcial: Partial<CampoSaida>) {
    setCampos((atual) => atual.map((c, i) => (i === indice ? { ...c, ...parcial } : c)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const parametrosSincronizacao = Object.fromEntries(
        parametros.filter((p) => p.chave.trim()).map((p) => [p.chave, p.valor]),
      );

      const consulta = await criarConsulta(accessToken, moduloId, {
        fonteDeDadosId,
        nome,
        codSentenca,
        parametrosSincronizacao,
        camposFiltro: campos,
      });
      onCriada(consulta);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar consulta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <select value={fonteDeDadosId} onChange={(e) => setFonteDeDadosId(e.target.value)} required>
        <option value="">Selecione a fonte de dados</option>
        {fontes.map((fonte) => (
          <option key={fonte.id} value={fonte.id}>
            {fonte.nome}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Nome de exibição"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Nome da consulta cadastrada no RM (codSentenca)"
        value={codSentenca}
        onChange={(e) => setCodSentenca(e.target.value)}
        required
      />

      <div style={{ fontWeight: 600, marginTop: 8 }}>Parâmetros de sincronização (fixos)</div>
      {parametros.map((parametro, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="chave (ex: CODFILIAL)"
            value={parametro.chave}
            onChange={(e) => atualizarParametro(indice, { chave: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            placeholder="valor"
            value={parametro.valor}
            onChange={(e) => atualizarParametro(indice, { valor: e.target.value })}
            style={{ flex: 1 }}
          />
        </div>
      ))}
      <button type="button" onClick={() => setParametros((atual) => [...atual, novoParametro()])}>
        + Adicionar parâmetro
      </button>

      <div style={{ fontWeight: 600, marginTop: 8 }}>Campos de filtro (o que o agente pode informar)</div>
      {campos.map((campo, indice) => (
        <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="nome do campo"
            value={campo.nome}
            onChange={(e) => atualizarCampo(indice, { nome: e.target.value })}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={campo.obrigatorio}
              onChange={(e) => atualizarCampo(indice, { obrigatorio: e.target.checked })}
            />
            obrigatório
          </label>
          <button
            type="button"
            onClick={() => setCampos((atual) => atual.filter((_, i) => i !== indice))}
          >
            remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setCampos((atual) => [...atual, novoCampo()])}>
        + Adicionar campo de filtro
      </button>

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando || !fonteDeDadosId}>
          {enviando ? 'Criando...' : 'Criar consulta'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
