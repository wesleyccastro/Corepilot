# CorePilot — Biblioteca de ícones (lucide-react) no cadastro de módulo (design)

## 0. Contexto

No Wizard de criação/edição de módulo (`frontend/src/corepilot/views/wizard/Step1Identity.tsx`),
o campo "Ícone" hoje é puramente cosmético: uma linha de 5 quadrados fixos
(`leaf`/`cart`/`wallet`/`wrench`/`users`) que só muda de borda/fundo ao ser
selecionado — todos renderizam o mesmo `LayersIcon` genérico, então nenhum dos 5
é visualmente distinguível dos outros. A string escolhida é salva em
`Modulo.icone` (coluna `String?` já existente, sem policy de valores), mas
nenhum outro lugar do app lê esse campo pra renderizar um ícone diferenciado —
nem o menu de módulos do `Header`, nem a lista de administração de módulos.

## 1. Objetivo

Trocar o seletor por um seletor de verdade sobre o catálogo completo do
`lucide-react` (mesma biblioteca e padrão de `name → componente` do exemplo de
referência fornecido), com busca por nome, e conectar o ícone escolhido nos
dois lugares do app onde módulos aparecem listados: as abas de navegação do
`Header` e a lista da tela de administração de módulos (`AdminModulos`).

## 2. Fora de escopo

- Migração de dados: módulos reais existentes com as 5 chaves antigas
  continuam funcionando via mapa de alias (seção 3), não via UPDATE no banco.
- Ícone da empresa/logo (`Empresa.logoDataUrl`) — campo e fluxo totalmente
  diferentes, não mexido aqui.
- Categorias/tags de busca semântica sobre os ícones (ex: sinônimos) — a busca
  é substring simples sobre o nome do componente lucide.
- Virtualização da grade de resultados do popover — se ~1500 ícones sem filtro
  causar problema de performance perceptível na prática, revisita depois.
- Aplicar em Compras/Financeiro (módulos de referência com dados mock, sem
  cadastro real).

## 3. Resolução de nome → ícone

Novo arquivo `frontend/src/corepilot/lucideIcons.ts`:

```ts
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Filtra os exports que são de fato componentes de ícone (exclui helpers
// como createLucideIcon, o componente genérico Icon, etc.)
export const allLucideIcons: { nome: string; Icone: LucideIcon }[] = ...;

// Alias das 5 chaves do seletor antigo -> nome real do lucide-react, pra não
// quebrar o ícone de módulos reais já cadastrados antes desta mudança.
const aliasLegado: Record<string, string> = {
  leaf: 'Leaf',
  cart: 'ShoppingCart',
  wallet: 'Wallet',
  wrench: 'Wrench',
  users: 'Users',
};

export function resolveModuleIcon(nome: string | null | undefined): LucideIcon {
  if (!nome) return LucideIcons.Layers;
  const nomeResolvido = aliasLegado[nome] ?? nome;
  return (LucideIcons as Record<string, LucideIcon>)[nomeResolvido] ?? LucideIcons.Layers;
}
```

Sem mudança de schema/backend: `Modulo.icone` já é uma string livre.
`moduleForm.icon` no `initialState.ts` passa a ter default `'Leaf'` (nome real
lucide) em vez de `'leaf'` — só afeta módulos novos; o fallback de
`editModule()` (`modulo.icone ?? 'leaf'`) fica como está porque
`resolveModuleIcon`/o alias já cobre o valor antigo.

## 4. Componente `IconPicker`

Novo `frontend/src/corepilot/components/IconPicker.tsx`, reutilizável:

- Props: `{ value: string; onChange: (nome: string) => void }` — `ModuleForm.icon`
  (`frontend/src/corepilot/types.ts`) já é `string` não-opcional, nunca `null`
  dentro do formulário do Wizard.
- Botão 44×44 (mesmo tamanho dos quadrados atuais) mostrando
  `resolveModuleIcon(value)`.
- Ao clicar, abre um **modal centralizado** (mesmo padrão visual do
  `ConfirmDialog.tsx` já usado no app: overlay `rgba(7,54,74,.32)`, card branco
  `borderRadius: 14`, `boxShadow: '0 20px 48px rgba(7,54,74,.28)'`) — não um
  popover ancorado (revisado durante a checagem visual manual: ícones maiores
  pedem mais espaço do que um popover estreito comporta). Dentro: preview do
  ícone selecionado + nome, campo de busca com autofoco, grade de ícones
  44×44 (maiores que a v1: 22px em vez de 16px), e rodapé com "Cancelar"/
  "Aplicar".
- Seleção em duas etapas: clicar num ícone da grade só destaca/staging
  (`selecionado` no estado local do componente, inicializado com `value` toda
  vez que o modal abre); só o clique em "Aplicar" chama `onChange(selecionado)`
  e fecha. "Cancelar" ou clique no overlay fecha sem aplicar.
- Filtro: substring case-insensitive sobre `nome` (de `allLucideIcons`); busca
  vazia mostra o catálogo completo sem paginação.

`Step1Identity.tsx` troca a linha de 5 quadrados por
`<IconPicker value={f.icon} onChange={actions.selectIcon} />` — `selectIcon`
já existe em `useCorePilotState.ts`, sem mudança de assinatura.

## 5. Exibição do ícone escolhido

Dois pontos de conexão, ambos só leitura de `modulo.icone` (já vem na API, tipo
`Modulo` do frontend já tem o campo):

- **`Header.tsx`**, `navTabs`: ícone de 14-15px antes do nome de cada módulo
  publicado (`state.publishedModules`), resolvido via `resolveModuleIcon`.
- **`AdminModulos.tsx`**: ícone antes do nome/objetivo de cada linha da lista
  (`state.todosModulos`), ao lado da bolinha de status ativo/inativo.

## 6. Verificação

- `cd frontend && npm run build && npm run lint` (tsc + vite build + oxlint) —
  sem test runner configurado no frontend, então essa é a checagem
  automatizada disponível.
- Checagem visual manual (clique-through no Wizard: abrir popover, buscar um
  ícone, selecionar, salvar módulo, conferir que aparece certo no Header e no
  AdminModulos) — sem ferramenta de automação de browser disponível nesta
  sessão, então essa parte depende de quem estiver acompanhando a
  implementação clicar através da UI.
