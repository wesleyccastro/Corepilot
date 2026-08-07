import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Exports do barrel do lucide-react que não são componentes de ícone.
const EXPORTS_NAO_ICONES = new Set(['icons', 'createLucideIcon', 'Icon']);

// Cada ícone é exportado com 2-4 aliases (ex: Wallet, WalletIcon,
// LucideWallet, todos o mesmo componente). Filtra pro nome canônico — sem
// prefixo "Lucide", sem sufixo "Icon" — pra não listar o mesmo ícone várias
// vezes na busca do IconPicker.
export const allLucideIcons: { nome: string; Icone: LucideIcon }[] = Object.entries(LucideIcons)
  .filter(([nome]) => !EXPORTS_NAO_ICONES.has(nome) && !nome.startsWith('Lucide') && !nome.endsWith('Icon'))
  .map(([nome, Icone]) => ({ nome, Icone: Icone as LucideIcon }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

// As 5 chaves do seletor antigo (antes desta mudança), pra não quebrar o
// ícone de módulos reais já cadastrados com o sistema anterior.
const ALIAS_LEGADO: Record<string, string> = {
  leaf: 'Leaf',
  cart: 'ShoppingCart',
  wallet: 'Wallet',
  wrench: 'Wrench',
  users: 'Users',
};

export function resolveModuleIcon(nome: string | null | undefined): LucideIcon {
  if (!nome) return LucideIcons.Layers;
  const nomeResolvido = ALIAS_LEGADO[nome] ?? nome;
  return (LucideIcons as unknown as Record<string, LucideIcon>)[nomeResolvido] ?? LucideIcons.Layers;
}
