export function decodificarXml(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extrairResultados(
  xmlDecodificado: string,
): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  const padraoLinha = /<Resultado>([\s\S]*?)<\/Resultado>/g;

  for (const match of xmlDecodificado.matchAll(padraoLinha)) {
    const conteudoLinha = match[1];
    const linha: Record<string, string> = {};
    const padraoCampo = /<([A-Za-z0-9_]+)>(.*?)<\/\1>/g;

    for (const campoMatch of conteudoLinha.matchAll(padraoCampo)) {
      linha[campoMatch[1]] = campoMatch[2].trim();
    }

    linhas.push(linha);
  }

  return linhas;
}

export function extrairMensagemErro(xml: string): string | null {
  const padroes = [
    /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i,
    /<Message[^>]*>([\s\S]*?)<\/Message>/i,
    /<Mensagem[^>]*>([\s\S]*?)<\/Mensagem>/i,
  ];

  for (const padrao of padroes) {
    const match = xml.match(padrao);
    if (match) return match[1].trim();
  }

  return null;
}
