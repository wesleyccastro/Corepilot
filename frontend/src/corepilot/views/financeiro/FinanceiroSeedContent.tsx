import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';
import type { ChatSeedKind } from '../../types';

function ProgressRow({ label, value, valueColor, pct, barColor }: { label: string; value: string; valueColor: string; pct: number; barColor: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: valueColor, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ background: '#EDEFEE', borderRadius: 5, height: 8 }}>
        <div style={{ width: `${pct}%`, height: 8, background: barColor, borderRadius: 5 }} />
      </div>
    </div>
  );
}

function QuickActions({ actions }: { actions: CorePilotActions }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={actions.makeQuickAction('financeiro', 'financeiroThinking', 'Comparar por fazenda.', 'Santa Rita concentra 38% do desvio (+R$ 357 mil), seguida por Boa Vista (+R$ 210 mil) e Água Limpa (+R$ 178 mil). As demais fazendas estão dentro do orçamento.')} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Comparar por fazenda</button>
      <button onClick={actions.makeQuickAction('financeiro', 'financeiroThinking', 'Ver lançamentos.', 'Os 5 maiores lançamentos do período: 2 ordens de manutenção de colheitadeiras (R$ 184 mil), 1 compra de fertilizante fora do contrato (R$ 96 mil) e 2 fretes emergenciais (R$ 61 mil).')} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Ver lançamentos</button>
      <button onClick={actions.makeQuickAction('financeiro', 'financeiroThinking', 'Gerar relatório executivo.', 'Relatório executivo gerado com o resumo do desvio, os 3 grupos mais impactados e recomendações. Vou disponibilizar o PDF para download e enviar por e-mail ao grupo financeiro.')} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Gerar relatório executivo</button>
    </div>
  );
}

export function FinanceiroSeedContent({ kind, actions }: { kind: ChatSeedKind; actions: CorePilotActions }) {
  if (kind === 'budget') {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{ background: colors.navy, color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '12px 18px', fontSize: 13.5, maxWidth: 480 }}>
            Compare o orçamento com o realizado até junho e explique os principais desvios.
          </div>
        </div>
        <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 10 }}>Agente Financeiro analisou 6.180 lançamentos em 3 empresas.</div>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Análise dos desvios orçamentários</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Janeiro a junho de 2026 · O realizado está R$ 940 mil acima do orçamento, desvio de 5,1%.</p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11.5, color: colors.textFaint }}>Orçado</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.navy }}>R$ 18,4 mi</div>
            </div>
            <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11.5, color: colors.textFaint }}>Realizado</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.navy }}>R$ 19,34 mi</div>
            </div>
            <div style={{ flex: 1, background: colors.dangerBg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11.5, color: colors.danger }}>Desvio</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.danger }}>+5,1%</div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 12 }}>Maiores desvios por grupo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <ProgressRow label="Manutenção" value="+R$ 310 mil" valueColor={colors.danger} pct={82} barColor={colors.teal} />
            <ProgressRow label="Insumos" value="+R$ 245 mil" valueColor={colors.danger} pct={70} barColor={colors.teal} />
            <ProgressRow label="Pessoal" value="-R$ 55 mil" valueColor={colors.success} pct={46} barColor={colors.teal} />
          </div>
          <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 8 }}>Leitura do CorePilot</div>
            <div style={{ fontSize: 12.5, color: colors.textBody, lineHeight: 1.6 }}>
              1. Manutenção cresceu 22%, concentrada em peças de colheitadeiras.<br />
              2. Insumos ficaram 6,8% acima, puxados pela Fazenda Santa Rita.<br />
              3. Pessoal ficou 3,4% abaixo, compensando parte do desvio.
            </div>
          </div>
          <QuickActions actions={actions} />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ background: colors.navy, color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '12px 18px', fontSize: 13.5, maxWidth: 480 }}>
          Qual a projeção de fluxo de caixa para os próximos 3 meses?
        </div>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 10 }}>Agente Financeiro projetou o caixa com base no histórico e nos compromissos já firmados.</div>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Projeção de fluxo de caixa</h3>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Julho a setembro de 2026 · saldo projetado permanece positivo, com aperto em agosto.</p>
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>Saldo atual</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: colors.navy }}>R$ 4,1 mi</div>
          </div>
          <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>Entradas previstas</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: colors.success }}>R$ 6,8 mi</div>
          </div>
          <div style={{ flex: 1, background: colors.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>Saídas previstas</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: colors.danger }}>R$ 7,3 mi</div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 12 }}>Saldo projetado por mês</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <ProgressRow label="Julho" value="R$ 3,6 mi" valueColor={colors.success} pct={78} barColor={colors.teal} />
          <ProgressRow label="Agosto" value="R$ 0,9 mi" valueColor={colors.warn} pct={20} barColor={colors.warn} />
          <ProgressRow label="Setembro" value="R$ 3,5 mi" valueColor={colors.success} pct={76} barColor={colors.teal} />
        </div>
        <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 8 }}>Leitura do CorePilot</div>
          <div style={{ fontSize: 12.5, color: colors.textBody, lineHeight: 1.6 }}>
            1. Agosto tem o menor saldo, pressionado por parcelas de maquinário.<br />
            2. Setembro recupera com a entrada da 2ª safra de soja.<br />
            3. Recomenda-se antecipar recebíveis se novos compromissos surgirem em agosto.
          </div>
        </div>
        <QuickActions actions={actions} />
      </div>
    </>
  );
}
