import type { PrismaService } from '../prisma/prisma.service';
import type { FerramentaTool } from '../chat/anthropic.service';
import { construirInputSchemaFerramenta } from './tool-schema-builder';
import type { CampoSaida } from '../skill/schema-builder';

export function nomeFerramentaConsulta(consultaId: string): string {
  return `consulta_${consultaId}`;
}

export function consultaIdDaFerramenta(nomeFerramenta: string): string {
  return nomeFerramenta.replace('consulta_', '');
}

export function montarFerramentasDeConsultas(
  consultas: { id: string; nome: string; camposFiltro: unknown }[],
): FerramentaTool[] {
  return consultas.map((consulta) => ({
    name: nomeFerramentaConsulta(consulta.id),
    description: `Consulta "${consulta.nome}" com dados sincronizados do TOTVS RM.`,
    input_schema: construirInputSchemaFerramenta(
      consulta.camposFiltro as CampoSaida[],
    ),
  }));
}

const MAX_LINHAS_SINCRONIZADAS = 1000;
const MAX_LINHAS_DEVOLVIDAS_AO_MODELO = 300;

function valorBate(valorLinha: unknown, valorFiltro: unknown): boolean {
  if (typeof valorLinha === 'string' && typeof valorFiltro === 'string') {
    return valorLinha.toLowerCase().includes(valorFiltro.toLowerCase());
  }
  return valorLinha === valorFiltro;
}

/**
 * Devolve os dados sincronizados de uma consulta para o modelo interpretar.
 *
 * Propositalmente NÃO faz match exato: o objetivo é que o modelo leia e raciocine sobre os
 * dados como faria com qualquer texto (nomes comerciais como "FOXXPRO" vs a pergunta do
 * usuário sobre "Fox" não batem por igualdade estrita) — filtro aqui é só uma redução de
 * volume quando o agente já sabe o que procura, não a fonte da correção da resposta.
 */
export async function buscarDadosLocaisConsulta(
  prisma: PrismaService,
  consultaId: string,
  filtro: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const linhas = await prisma.consultaResultado.findMany({
    where: { consultaParametrizadaId: consultaId },
    take: MAX_LINHAS_SINCRONIZADAS,
  });

  const dados = linhas.map((linha) => linha.dados as Record<string, unknown>);
  const chavesFiltro = Object.entries(filtro).filter(
    ([, valor]) => valor !== undefined && valor !== '',
  );

  // Sem filtro: devolve tudo que foi sincronizado (já limitado pelo take acima) — é o próprio
  // modelo que precisa varrer e interpretar, não um corte arbitrário do nosso lado que pode
  // esconder justo a linha que responderia a pergunta.
  if (chavesFiltro.length === 0) {
    return dados;
  }

  return dados
    .filter((linha) =>
      chavesFiltro.every(([chave, valor]) => valorBate(linha[chave], valor)),
    )
    .slice(0, MAX_LINHAS_DEVOLVIDAS_AO_MODELO);
}
