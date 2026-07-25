import { colors } from '../../styles';
import type { ChatSeedKind } from '../../types';

export function ComprasSeedContent({ kind }: { kind: ChatSeedKind }) {
  if (kind === 'quotes') {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{ background: colors.navy, color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '12px 18px', fontSize: 13.5, maxWidth: 480 }}>
            Quais cotações estão paradas há mais tempo aguardando fornecedor?
          </div>
        </div>
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 10 }}>Agente de Compras verificou 12 solicitações em triagem e cotação.</div>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Cotações com maior tempo de espera</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>COT-0268 (Peças John Deere 7215J) aguarda 4 de 6 fornecedores há 2 dias · COT-0273 está agrupando família de itens há 1 dia.</p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11.5, color: colors.textFaint }}>Cotações abertas</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.navy }}>7</div>
            </div>
            <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11.5, color: colors.textFaint }}>Tempo médio de resposta</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.navy }}>2,4 dias</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: colors.textMuted }}>
            Sugestão: cobrar Mineira Máquinas e Tratorpeças Noroeste sobre a COT-0268.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ background: colors.navy, color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '12px 18px', fontSize: 13.5, maxWidth: 480 }}>
          Quais fornecedores estão com entregas atrasadas?
        </div>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 10 }}>Agente de Compras cruzou pedidos em aberto com prazos combinados.</div>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Fornecedores com atraso na entrega</h3>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>3 fornecedores estão com entregas atrasadas, vinculados a cotações em andamento.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {[
            { name: 'Tratorpeças Noroeste', delay: '5 dias de atraso' },
            { name: 'Mineira Máquinas', delay: '3 dias de atraso' },
            { name: 'Agro Peças Brasil', delay: '1 dia de atraso' },
          ].map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.bg, borderRadius: 10, padding: '12px 14px' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.danger }}>{s.delay}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.bg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: colors.textMuted }}>
          Sugestão: abrir chamado com Tratorpeças Noroeste — maior atraso e histórico recorrente.
        </div>
      </div>
    </>
  );
}
