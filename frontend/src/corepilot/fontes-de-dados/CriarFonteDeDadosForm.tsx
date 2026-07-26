import { useState, type FormEvent } from 'react';
import { criarFonteDeDados } from './api';
import type { FonteDeDados } from './types';

interface CriarFonteDeDadosFormProps {
  accessToken: string;
  onCriada: (fonte: FonteDeDados) => void;
  onCancelar: () => void;
}

export function CriarFonteDeDadosForm({ accessToken, onCriada, onCancelar }: CriarFonteDeDadosFormProps) {
  const [tipo, setTipo] = useState('');
  const [nome, setNome] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [codSistema, setCodSistema] = useState('');
  const [codColigada, setCodColigada] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const fonte = await criarFonteDeDados(accessToken, {
        tipo,
        nome,
        serverUrl,
        username,
        senha,
        codSistema,
        codColigada,
      });
      onCriada(fonte);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar fonte de dados');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <div
        style={{
          background: '#fff8e1',
          border: '1px solid #f0d060',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12,
        }}
      >
        Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco
      </div>
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} required>
        <option value="">Selecione o tipo de fonte</option>
        <option value="totvs_rm">TOTVS RM</option>
      </select>

      {tipo && (
        <>
          <input
            type="text"
            placeholder="Nome da conexão"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Servidor (ex: http://servidor:8051)"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Código do sistema"
            value={codSistema}
            onChange={(e) => setCodSistema(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Código da coligada"
            value={codColigada}
            onChange={(e) => setCodColigada(e.target.value)}
            required
          />
        </>
      )}

      {erro && <div style={{ color: 'crimson', fontSize: 13 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={enviando || !tipo}>
          {enviando ? 'Salvando...' : 'Conectar'}
        </button>
        <button type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
