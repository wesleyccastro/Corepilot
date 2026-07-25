import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { DotsIcon, ToggleSwitch } from '../../../icons';
import { btnPrimary, chipStyle, colors, dropdownMenu, dropdownMenuItem, inputSm, label, overlayFixed } from '../../../styles';
import type { TaskAutonomyAction, TaskFrequency } from '../../../types';

const freqLabels: Record<TaskFrequency, string> = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', evento: 'Sob evento' };
const autonomyLabels: Record<TaskAutonomyAction, string> = { notificar: 'Apenas notificar', executar_notificar: 'Executar e notificar', executar_aprovar: 'Executar com aprovação' };
const weekdayLabels: Record<string, string> = { mon: 'segunda-feira', tue: 'terça-feira', wed: 'quarta-feira', thu: 'quinta-feira', fri: 'sexta-feira' };

function scheduleLabelFor(t: { frequency: TaskFrequency; time: string; weekday: string; monthDay: string; eventTrigger: string }) {
  if (t.frequency === 'diaria') return 'Todos os dias às ' + (t.time || '--:--');
  if (t.frequency === 'semanal') return 'Toda ' + (weekdayLabels[t.weekday] || 'segunda-feira') + ' às ' + (t.time || '--:--');
  if (t.frequency === 'mensal') return 'Todo dia ' + (t.monthDay || '1') + ' às ' + (t.time || '--:--');
  return 'Quando: ' + (t.eventTrigger || '—');
}

export function AgentTasksTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const f = state.newTaskForm;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, color: colors.textMuted, maxWidth: 520 }}>Tarefas que o agente executa sozinho, em um horário ou evento definido — sem que alguém precise perguntar.</div>
        <button onClick={actions.toggleNewTaskForm} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>+ Nova tarefa</button>
      </div>

      {state.showNewTask && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy }}>{state.editingTaskId ? 'Editar tarefa' : 'Nova tarefa'}</div>
          <input type="text" placeholder="Nome da tarefa · ex.: Relatório semanal de desvios" value={f.name} onChange={actions.updateTaskField('name')} style={inputSm} />
          <textarea placeholder="O que a tarefa deve fazer quando disparar (skill ou instrução)…" value={f.action} onChange={actions.updateTaskField('action')} rows={2} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />

          <div>
            <label style={{ ...label, fontSize: 12 }}>Frequência</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['diaria', 'semanal', 'mensal', 'evento'] as TaskFrequency[]).map((freq) => (
                <span key={freq} onClick={() => actions.setTaskFrequency(freq)} style={chipStyle(f.frequency === freq)}>{freqLabels[freq]}</span>
              ))}
            </div>
          </div>

          {f.frequency === 'semanal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={f.weekday} onChange={actions.updateTaskField('weekday')} style={inputSm}>
                <option value="mon">Segunda-feira</option><option value="tue">Terça-feira</option><option value="wed">Quarta-feira</option>
                <option value="thu">Quinta-feira</option><option value="fri">Sexta-feira</option>
              </select>
              <input type="time" value={f.time} onChange={actions.updateTaskField('time')} style={inputSm} />
            </div>
          )}
          {f.frequency === 'diaria' && (
            <input type="time" value={f.time} onChange={actions.updateTaskField('time')} style={{ ...inputSm, maxWidth: 160 }} />
          )}
          {f.frequency === 'mensal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" min={1} max={28} placeholder="Dia do mês (1–28)" value={f.monthDay} onChange={actions.updateTaskField('monthDay')} style={inputSm} />
              <input type="time" value={f.time} onChange={actions.updateTaskField('time')} style={inputSm} />
            </div>
          )}
          {f.frequency === 'evento' && (
            <input type="text" placeholder="Evento que dispara a tarefa · ex.: nova cotação aprovada" value={f.eventTrigger} onChange={actions.updateTaskField('eventTrigger')} style={inputSm} />
          )}

          <div>
            <label style={{ ...label, fontSize: 12 }}>Ao disparar</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['notificar', 'executar_notificar', 'executar_aprovar'] as TaskAutonomyAction[]).map((level) => (
                <span key={level} onClick={() => actions.setTaskAutonomy(level)} style={chipStyle(f.autonomyAction === level)}>{autonomyLabels[level]}</span>
              ))}
            </div>
          </div>

          <input type="text" placeholder="Destinatários · ex.: comprador@lfgagro.com, canal do chat do módulo" value={f.recipients} onChange={actions.updateTaskField('recipients')} style={inputSm} />

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={actions.saveTask} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {state.editingTaskId ? 'Salvar alterações' : 'Criar tarefa'}
            </button>
            <button onClick={actions.toggleNewTaskForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.textMuted, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {state.agentTasks.map((task) => (
          <div key={task.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{task.name}</div>
                <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 2 }}>{scheduleLabelFor(task)} · {autonomyLabels[task.autonomyAction]}</div>
                <div style={{ fontSize: 12, color: colors.textFaint }}>{task.recipients ? 'Para: ' + task.recipients : 'Sem destinatário definido'}</div>
              </div>
              <ToggleSwitch active={task.active} onClick={() => actions.toggleTaskActive(task.id)} />
              <div style={{ position: 'relative' }}>
                <span onClick={(e) => { e.stopPropagation(); actions.toggleTaskMenu(task.id); }}><DotsIcon /></span>
                {state.taskMenuOpenId === task.id && (
                  <>
                    <div style={overlayFixed} onClick={actions.closeTaskMenu} />
                    <div style={dropdownMenu}>
                      <div onClick={(e) => { e.stopPropagation(); actions.editTask(task.id); }} style={dropdownMenuItem}>Editar</div>
                      <div onClick={(e) => { e.stopPropagation(); actions.removeTask(task.id); }} style={{ ...dropdownMenuItem, color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>Remover</div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.borderLight}` }}>{task.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
