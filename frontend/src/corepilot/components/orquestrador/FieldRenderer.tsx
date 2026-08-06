import type { ChangeEvent } from 'react';
import type { CustomFieldEtapa, TableColumn } from '../../orquestrador/types';
import { colors, inputSm } from '../../styles';

export type ModoCampo = 'leitura' | 'edicao';

export interface FieldRendererProps {
  field: CustomFieldEtapa;
  valor: unknown;
  modo: ModoCampo;
  onChange?: (valor: unknown) => void;
}

function calcularColuna(col: TableColumn, linha: Record<string, unknown>): number {
  if (!col.calc) return 0;
  const a = Number(linha[col.calc.column1Id]) || 0;
  const b = Number(linha[col.calc.column2Id]) || 0;
  switch (col.calc.operation) {
    case 'multiply': return a * b;
    case 'add': return a + b;
    case 'subtract': return a - b;
    case 'divide': return b === 0 ? 0 : a / b;
  }
}

function TableField({ field, valor, modo, onChange }: FieldRendererProps) {
  const linhas = (valor as Record<string, unknown>[] | undefined) ?? [];
  const colunas = field.tableColumns ?? [];
  const editavel = modo === 'edicao' && !!onChange;

  const atualizarLinha = (indice: number, colunaId: string, novoValor: unknown) =>
    onChange?.(linhas.map((linha, i) => (i === indice ? { ...linha, [colunaId]: novoValor } : linha)));
  const adicionarLinha = () => onChange?.([...linhas, {}]);
  const removerLinha = (indice: number) => onChange?.(linhas.filter((_, i) => i !== indice));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {colunas.map((col) => (
              <th key={col.id} style={{ textAlign: 'left', padding: '6px 8px', color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>{col.label}</th>
            ))}
            {editavel && <th />}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i}>
              {colunas.map((col) => (
                <td key={col.id} style={{ padding: '4px 8px', borderBottom: `1px solid ${colors.borderLight}` }}>
                  {col.tipo === 'calculated' ? (
                    calcularColuna(col, linha)
                  ) : editavel ? (
                    <input
                      type={col.tipo === 'number' ? 'number' : col.tipo === 'date' || col.tipo === 'datetime' ? 'date' : 'text'}
                      value={(linha[col.id] as string | number) ?? ''}
                      onChange={(e) => atualizarLinha(i, col.id, col.tipo === 'number' ? Number(e.target.value) : e.target.value)}
                      style={{ ...inputSm, width: '100%' }}
                    />
                  ) : (
                    String(linha[col.id] ?? '')
                  )}
                </td>
              ))}
              {editavel && <td><span onClick={() => removerLinha(i)} style={{ cursor: 'pointer', color: colors.borderLight }}>×</span></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {editavel && (
        <button type="button" onClick={adicionarLinha} style={{ marginTop: 8, background: 'none', border: `1px dashed ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: colors.teal, cursor: 'pointer' }}>
          + Adicionar linha
        </button>
      )}
    </div>
  );
}

function campoInterno({ field, valor, modo, onChange }: FieldRendererProps) {
  const editavel = modo === 'edicao' && !!onChange;

  switch (field.tipo) {
    case 'text':
    case 'entity-reference':
      return editavel ? (
        <input type="text" placeholder={field.placeholder} value={(valor as string) ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)} style={{ ...inputSm, width: '100%' }} />
      ) : (
        <div style={{ fontSize: 13, color: colors.text }}>{String(valor ?? '—')}</div>
      );
    case 'number':
      return editavel ? (
        <input type="number" value={(valor as number) ?? ''} onChange={(e) => onChange?.(Number(e.target.value))} style={{ ...inputSm, width: '100%' }} />
      ) : (
        <div style={{ fontSize: 13, color: colors.text }}>{String(valor ?? '—')}</div>
      );
    case 'date':
      return editavel ? (
        <input type="date" value={(valor as string) ?? ''} onChange={(e) => onChange?.(e.target.value)} style={{ ...inputSm, width: '100%' }} />
      ) : (
        <div style={{ fontSize: 13, color: colors.text }}>{String(valor ?? '—')}</div>
      );
    case 'select':
      return editavel ? (
        <select value={(valor as string) ?? ''} onChange={(e) => onChange?.(e.target.value)} style={{ ...inputSm, width: '100%' }}>
          <option value="">Selecione…</option>
          {(field.options ?? []).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 13, color: colors.text }}>{(field.options ?? []).find((o) => o.value === valor)?.label ?? String(valor ?? '—')}</div>
      );
    case 'checkbox':
      return <input type="checkbox" checked={!!valor} disabled={!editavel} onChange={(e) => onChange?.(e.target.checked)} />;
    case 'attachment':
      return <div style={{ fontSize: 12, color: colors.textFaint }}>{Array.isArray(valor) ? `${valor.length} arquivo(s)` : 'Nenhum arquivo'}</div>;
    case 'table':
    case 'reference-table':
      return <TableField field={field} valor={valor} modo={modo} onChange={onChange} />;
    case 'summary':
      return <div style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>{String(valor ?? '—')}</div>;
  }
}

export function FieldRenderer(props: FieldRendererProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>
        {props.field.label}
        {props.field.required && <span style={{ color: colors.danger }}> *</span>}
      </label>
      {campoInterno(props)}
    </div>
  );
}
