import { useEffect, useState } from 'react';
import { listarSkills } from './api';
import { CriarSkillForm } from './CriarSkillForm';
import type { Skill } from './types';

interface SkillsListProps {
  accessToken: string;
  agenteId: string;
  onAbrirSkill: (skill: Skill) => void;
}

export function SkillsList({ accessToken, agenteId, onAbrirSkill }: SkillsListProps) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  useEffect(() => {
    listarSkills(accessToken, agenteId)
      .then(setSkills)
      .catch((err: Error) => setErro(err.message));
  }, [accessToken, agenteId]);

  if (erro) return <div style={{ color: 'crimson' }}>{erro}</div>;
  if (!skills) return <div>Carregando skills…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h4>Skills</h4>
      {skills.length === 0 && <div>Nenhuma skill ainda.</div>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {skills.map((skill) => (
          <li key={skill.id}>
            <button onClick={() => onAbrirSkill(skill)} style={{ width: '100%', textAlign: 'left' }}>
              <strong>{skill.nome}</strong> — {skill.objetivo}
            </button>
          </li>
        ))}
      </ul>
      {mostrandoForm ? (
        <CriarSkillForm
          accessToken={accessToken}
          agenteId={agenteId}
          onCriado={(skill) => {
            setMostrandoForm(false);
            setSkills((atual) => [skill, ...(atual ?? [])]);
          }}
          onCancelar={() => setMostrandoForm(false)}
        />
      ) : (
        <button onClick={() => setMostrandoForm(true)}>+ Criar skill</button>
      )}
    </div>
  );
}
