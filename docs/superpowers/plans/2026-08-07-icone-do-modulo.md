# Biblioteca de ícones (lucide-react) no cadastro de módulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o seletor de ícone do módulo (hoje 5 quadrados fixos que renderizam todos o mesmo `LayersIcon` genérico) por um seletor de verdade sobre o catálogo completo do `lucide-react`, com busca por nome, e conectar o ícone escolhido nos dois lugares do app que listam módulos (Header e AdminModulos), que hoje ignoram `Modulo.icone`.

**Architecture:** `lucideIcons.ts` expõe o catálogo filtrado (nomes canônicos, sem os aliases redundantes `NomeIcon`/`LucideNome`) e uma função `resolveModuleIcon(nome)` com fallback pra `Layers` e alias pras 5 chaves antigas. `IconPicker.tsx` é um componente de botão+popover reutilizável que usa esse catálogo. `Modulo.icone` continua sendo uma string livre no banco — zero mudança de schema/backend.

**Tech Stack:** React 19 + TypeScript, `lucide-react` (nova dependência), estilo inline com os tokens de `frontend/src/corepilot/styles.ts` (convenção já usada em todo `frontend/src/corepilot/`).

## Global Constraints

- `lucide-react` — sem pin de versão, segue a mesma convenção de faixa semver (`^`) dos demais deps do `frontend/package.json`. **Atualizado durante a execução (2026-08-07):** `npm install lucide-react` sem versão resolveu `^1.30.0` (a spec original citava `0.487.0`, do anexo de referência de outro projeto — biblioteca teve bump de major version desde então). Confirmado que a mesma lógica de filtro do catálogo (Task 2) funciona igual em `1.30.0` — só muda a extensão do entry point ESM instalado (`dist/esm/lucide-react.mjs`, não mais `.js`).
- Sem mudança de schema Prisma nem de DTO/controller do backend: `Modulo.icone` já é `String?` livre.
- Sem test runner no frontend — a verificação automatizada disponível em cada task é `npm run build` (`tsc -b && vite build`); lint (`npm run lint`, oxlint) roda como parte da verificação final (Task 7).
- Seguir a spec em `docs/superpowers/specs/2026-08-07-icone-do-modulo-design.md` — qualquer divergência precisa ser justificada, não silenciosa.

---

### Task 1: Adicionar a dependência `lucide-react`

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json` (gerado pelo `npm install`, não editar à mão)

**Interfaces:**
- Produces: pacote `lucide-react` instalado em `frontend/node_modules`, disponível para import em qualquer arquivo `.ts`/`.tsx` de `frontend/src/`.

- [ ] **Step 1: Instalar o pacote**

Run: `cd frontend && npm install lucide-react`
Expected: adiciona `"lucide-react": "^0.487.0"` (ou versão minor/patch mais recente compatível, ex. `^0.487.x`) em `dependencies` de `frontend/package.json`, e atualiza `frontend/package-lock.json`. Sem erros de peer dependency (lucide-react suporta React 16.5.1+, o projeto usa React 19.2.7).

- [ ] **Step 2: Confirmar que o build continua limpo**

Run: `cd frontend && npm run build`
Expected: compila sem erros (nada ainda importa `lucide-react`, só confirma que a instalação não quebrou a resolução de tipos/módulos).

- [ ] **Step 3: Commit**

```bash
cd frontend
git add package.json package-lock.json
git commit -m "chore(frontend): adiciona dependência lucide-react"
```

---

### Task 2: Catálogo de ícones e resolução de nome → componente

**Files:**
- Create: `frontend/src/corepilot/lucideIcons.ts`

**Interfaces:**
- Consumes: pacote `lucide-react` (Task 1).
- Produces:
  - `allLucideIcons: { nome: string; Icone: LucideIcon }[]` — catálogo completo, nomes canônicos, ordenado alfabeticamente. Usado pelo `IconPicker` (Task 3).
  - `resolveModuleIcon(nome: string | null | undefined): LucideIcon` — usado pelo `IconPicker` (Task 3), `Header.tsx` (Task 5) e `AdminModulos.tsx` (Task 6).

**Contexto importante para este task:** o barrel de exports do `lucide-react` dá 2-4 nomes pro mesmo ícone (ex.: `Wallet`, `WalletIcon`, `LucideWallet` — os três renderizam o ícone idêntico). Sem filtrar isso, o catálogo de busca mostraria o mesmo ícone várias vezes. O filtro abaixo (excluir prefixo `Lucide` e sufixo `Icon`, mais os 3 exports que não são ícones: `icons`, `createLucideIcon`, `Icon`) foi conferido contra o pacote real (`lucide-react@0.487.0`): reduz ~5300 exports totais pra 1768 nomes canônicos.

- [ ] **Step 1: Criar o arquivo**

```ts
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
```

- [ ] **Step 2: Confirmar que compila**

Run: `cd frontend && npm run build`
Expected: compila sem erros de tipo.

- [ ] **Step 3: Confirmar o tamanho do catálogo (checagem manual rápida)**

Run: `cd frontend && node --input-type=module -e "
import * as L from './node_modules/lucide-react/dist/esm/lucide-react.mjs';
const EXC = new Set(['icons','createLucideIcon','Icon']);
const nomes = Object.keys(L).filter(n => !EXC.has(n) && !n.startsWith('Lucide') && !n.endsWith('Icon'));
console.log('total:', nomes.length);
console.log('tem Leaf?', nomes.includes('Leaf'), 'tem ShoppingCart?', nomes.includes('ShoppingCart'));
"`
Expected (v1.30.0): `total: 2019`, `tem Leaf? true tem ShoppingCart? true`. Esse script é só uma checagem manual pontual, não faz parte do código do produto — não precisa ser mantido.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/corepilot/lucideIcons.ts
git commit -m "feat(frontend): catálogo de ícones lucide-react e resolveModuleIcon"
```

**Bug real encontrado na checagem visual manual (Task 7) e corrigido aqui:** o filtro só por
nome (Step 1 acima) deixava passar `useLucideContext` — um hook novo do barrel do
`lucide-react` v1.x que não existia na v0.487.0 usada como referência original, e que não bate
com nenhuma das exclusões por nome (não é `icons`/`createLucideIcon`/`Icon`, não começa com
`Lucide`, não termina em `Icon`). O `IconPicker` tentava renderizar esse hook como se fosse um
componente de ícone; como o hook retorna o valor de contexto (um objeto, não JSX), React
quebrava com "Objects are not valid as a React child (found: object with keys {})" assim que o
popover abria (a lista inteira, sem filtro de busca, é renderizada de cara). Fix: filtrar
também por **tipo real do export**, não só por nome — só aceitar valores que são
`React.forwardRef` de verdade (`valor.$$typeof === Symbol.for('react.forward_ref')`), tanto em
`allLucideIcons` quanto em `resolveModuleIcon`. Código final de `lucideIcons.ts`:

```ts
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const EXPORTS_NAO_ICONES = new Set(['icons', 'createLucideIcon', 'Icon']);

function isIconComponent(valor: unknown): valor is LucideIcon {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    (valor as { $$typeof?: symbol }).$$typeof === Symbol.for('react.forward_ref')
  );
}

export const allLucideIcons: { nome: string; Icone: LucideIcon }[] = Object.entries(LucideIcons)
  .filter(
    ([nome, valor]) =>
      !EXPORTS_NAO_ICONES.has(nome) && !nome.startsWith('Lucide') && !nome.endsWith('Icon') && isIconComponent(valor),
  )
  .map(([nome, Icone]) => ({ nome, Icone: Icone as LucideIcon }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

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
  const candidato = (LucideIcons as unknown as Record<string, unknown>)[nomeResolvido];
  return isIconComponent(candidato) ? candidato : LucideIcons.Layers;
}
```

---

### Task 3: Componente `IconPicker`

**Files:**
- Create: `frontend/src/corepilot/components/IconPicker.tsx`

**Interfaces:**
- Consumes: `allLucideIcons`, `resolveModuleIcon` de `../lucideIcons` (Task 2); `colors`, `overlayFixed`, `inputSm` de `../styles`.
- Produces: `IconPicker({ value: string; onChange: (nome: string) => void })` — componente React. Usado por `Step1Identity.tsx` (Task 4).

- [ ] **Step 1: Criar o componente**

**Revisado durante a checagem visual manual (Task 7):** a versão original abaixo era um popover
estreito (300px) ancorado no botão. Depois de ver rodando, decisão foi trocar por um modal
centralizado (mesmo padrão do `ConfirmDialog.tsx`), com ícones maiores (44×44/22px em vez de
30×30/16px) e fluxo de seleção em duas etapas (clicar na grade só destaca; só "Aplicar" chama
`onChange`). Código final:

```tsx
import { useState } from 'react';
import { allLucideIcons, resolveModuleIcon } from '../lucideIcons';
import { colors, inputSm } from '../styles';

interface IconPickerProps {
  value: string;
  onChange: (nome: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(value);
  const IconeAtual = resolveModuleIcon(value);
  const IconeSelecionado = resolveModuleIcon(selecionado);

  const abrir = () => {
    setSelecionado(value);
    setBusca('');
    setAberto(true);
  };
  const fechar = () => setAberto(false);
  const aplicar = () => {
    onChange(selecionado);
    fechar();
  };

  const resultados = busca.trim()
    ? allLucideIcons.filter(({ nome }) => nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : allLucideIcons;

  return (
    <>
      <div
        onClick={abrir}
        title={value}
        style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <IconeAtual size={18} color={colors.textMuted} />
      </div>
      {aberto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,54,74,.32)' }} onClick={fechar} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: 24, width: 520, maxWidth: '90vw', boxShadow: '0 20px 48px rgba(7,54,74,.28)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${colors.teal}`, background: colors.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconeSelecionado size={22} color={colors.teal} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: colors.navy, margin: 0 }}>Escolher ícone</h2>
                <p style={{ fontSize: 12, color: colors.textFaint, margin: 0 }}>{selecionado}</p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ícone…"
              style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 360, overflowY: 'auto', padding: 2 }}>
              {resultados.map(({ nome, Icone }) => (
                <div
                  key={nome}
                  onClick={() => setSelecionado(nome)}
                  title={nome}
                  style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, border: `1.5px solid ${selecionado === nome ? colors.teal : colors.border}`, background: selecionado === nome ? colors.successBg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Icone size={22} color={selecionado === nome ? colors.teal : colors.textMuted} />
                </div>
              ))}
              {resultados.length === 0 && (
                <div style={{ width: '100%', fontSize: 12, color: colors.textFaint, textAlign: 'center', padding: '20px 0' }}>
                  Nenhum ícone encontrado.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={fechar}
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={aplicar}
                style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Confirmar que compila**

Run: `cd frontend && npm run build`
Expected: compila sem erros (o componente ainda não é usado por ninguém — Task 4 conecta).

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/corepilot/components/IconPicker.tsx
git commit -m "feat(frontend): componente IconPicker (botão + popover de busca)"
```

---

### Task 4: Conectar o `IconPicker` no Wizard (identidade do módulo)

**Files:**
- Modify: `frontend/src/corepilot/views/wizard/Step1Identity.tsx`
- Modify: `frontend/src/corepilot/initialState.ts:303`

**Interfaces:**
- Consumes: `IconPicker` (Task 3). `actions.selectIcon: (icon: string) => void` já existe em `frontend/src/corepilot/useCorePilotState.ts:139` — assinatura já compatível com `IconPicker`'s `onChange`, sem mudança nele.

- [ ] **Step 1: Trocar o seletor antigo pelo `IconPicker`**

Em `frontend/src/corepilot/views/wizard/Step1Identity.tsx`, o topo do arquivo (linhas 1-13) é hoje:

```tsx
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { CheckIcon, LayersIcon } from '../../icons';
import { card, colors, input, label } from '../../styles';

const iconChoices = [
  { key: 'leaf', label: 'Agro' },
  { key: 'cart', label: 'Compras' },
  { key: 'wallet', label: 'Financeiro' },
  { key: 'wrench', label: 'Manutenção' },
  { key: 'users', label: 'Pessoas' },
];
const colorHexes = ['#0EA5A0', '#07364A', '#E8604C', '#D97706', '#1E9E6B'];
```

Substituir por (remove `iconChoices` e a importação de `LayersIcon`, que deixam de ser usados; adiciona a importação do `IconPicker`):

```tsx
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { CheckIcon } from '../../icons';
import { IconPicker } from '../../components/IconPicker';
import { card, colors, input, label } from '../../styles';

const colorHexes = ['#0EA5A0', '#07364A', '#E8604C', '#D97706', '#1E9E6B'];
```

Mais abaixo, o bloco do campo "Ícone" (hoje):

```tsx
        <div>
          <label style={{ ...label, marginBottom: 8 }}>Ícone</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {iconChoices.map((ic) => {
              const active = f.icon === ic.key;
              return (
                <div key={ic.key} onClick={() => actions.selectIcon(ic.key)} title={ic.label} style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${active ? colors.teal : colors.border}`, background: active ? colors.successBg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
                  <LayersIcon size={18} color={active ? colors.teal : colors.textMuted} />
                </div>
              );
            })}
          </div>
        </div>
```

Substituir por:

```tsx
        <div>
          <label style={{ ...label, marginBottom: 8 }}>Ícone</label>
          <IconPicker value={f.icon} onChange={actions.selectIcon} />
        </div>
```

- [ ] **Step 2: Ajustar o default do formulário**

Em `frontend/src/corepilot/initialState.ts:303`, trocar:

```ts
      icon: 'leaf',
```

por:

```ts
      icon: 'Leaf',
```

(nome canônico do lucide-react, em vez da chave antiga — só afeta módulos novos; `resolveModuleIcon` já cobre `'leaf'` via `ALIAS_LEGADO` pra módulos existentes que ainda tiverem a chave antiga salva).

- [ ] **Step 3: Confirmar que compila**

Run: `cd frontend && npm run build`
Expected: compila sem erros. Se sobrar erro de `LayersIcon`/`iconChoices` não usados, confirme que os dois foram removidos do arquivo (Step 1).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/corepilot/views/wizard/Step1Identity.tsx src/corepilot/initialState.ts
git commit -m "feat(frontend): usa IconPicker no cadastro de identidade do módulo"
```

---

### Task 5: Exibir o ícone do módulo nas abas de navegação (`Header`)

**Files:**
- Modify: `frontend/src/corepilot/components/Header.tsx`

**Interfaces:**
- Consumes: `resolveModuleIcon` de `../lucideIcons` (Task 2).

- [ ] **Step 1: Importar `resolveModuleIcon`**

Em `frontend/src/corepilot/components/Header.tsx:4`, logo abaixo da importação existente de ícones:

```tsx
import type { LucideIcon } from 'lucide-react';
import { BellIcon, BuildingIcon, ChevronDownIcon, GearIcon, LayersIcon, LogoutIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons';
import { resolveModuleIcon } from '../lucideIcons';
```

- [ ] **Step 2: Montar o mapa de ícone por aba de módulo**

Logo depois do fechamento do array `navTabs` (depois da linha `];` em `frontend/src/corepilot/components/Header.tsx:34`), adicionar:

```tsx
  const iconePorTab = new Map<string, LucideIcon>(
    state.publishedModules.map((m) => [`module:${m.id}`, resolveModuleIcon(m.icone)]),
  );
```

**Nota (confirmado na execução):** a anotação explícita `Map<string, LucideIcon>` é necessária — sem ela, TS infere a chave do Map como o tipo literal `` `module:${string}` `` (só a partir dos pares realmente inseridos), e `tab.id` (que também pode ser `'overview'`/`'compras'`/`'financeiro'`) não é atribuível a esse tipo mais estreito no `.get()` do Step 3 abaixo.

(Só as abas de módulo publicado têm ícone — "Visão Geral"/"Compras"/"Financeiro" continuam sem ícone, são abas fixas do app, não `Modulo.icone`.)

- [ ] **Step 3: Renderizar o ícone na aba**

O loop de render das abas (`frontend/src/corepilot/components/Header.tsx:104-113`) hoje é:

```tsx
        {navTabs.map((tab) => {
          const active = tab.id === state.view;
          return (
            <div key={tab.id} onClick={() => actions.setView(tab.id)} style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative' }}>
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? colors.navy : colors.textMuted }}>{tab.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
```

Substituir por:

```tsx
        {navTabs.map((tab) => {
          const active = tab.id === state.view;
          const IconeTab = iconePorTab.get(tab.id);
          return (
            <div key={tab.id} onClick={() => actions.setView(tab.id)} style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              {IconeTab && <IconeTab size={14} color={active ? colors.navy : colors.textMuted} />}
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? colors.navy : colors.textMuted }}>{tab.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
```

- [ ] **Step 4: Confirmar que compila**

Run: `cd frontend && npm run build`
Expected: compila sem erros.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/corepilot/components/Header.tsx
git commit -m "feat(frontend): exibe o ícone do módulo nas abas de navegação"
```

---

### Task 6: Exibir o ícone do módulo na lista de administração (`AdminModulos`)

**Files:**
- Modify: `frontend/src/corepilot/views/admin/AdminModulos.tsx`

**Interfaces:**
- Consumes: `resolveModuleIcon` de `../../lucideIcons` (Task 2).

- [ ] **Step 1: Importar `resolveModuleIcon`**

Em `frontend/src/corepilot/views/admin/AdminModulos.tsx:4`, logo abaixo da importação de `colors`:

```tsx
import { colors } from '../../styles';
import { resolveModuleIcon } from '../../lucideIcons';
import { ExcluirModuloDialog } from '../../components/ExcluirModuloDialog';
```

- [ ] **Step 2: Renderizar o ícone em cada linha**

O `.map` da lista (`frontend/src/corepilot/views/admin/AdminModulos.tsx:26-78`) hoje começa com corpo em expressão (`=> ( ... )`). Trocar pra corpo em bloco pra poder resolver o ícone antes do JSX. O bloco completo hoje é:

```tsx
        {state.todosModulos.map((modulo) => (
          <div key={modulo.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '13px 16px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: modulo.ativo ? colors.success : colors.textFaint, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{modulo.nome}</div>
              <div style={{ fontSize: 12, color: colors.textFaint }}>{modulo.objetivo}</div>
            </div>
            <span
              style={{
                background: modulo.ativo ? colors.successBg : colors.chipBg,
                color: modulo.ativo ? colors.success : colors.textMuted,
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {modulo.ativo ? 'Ativo' : 'Inativo'}
            </span>
            {modulo.ativo ? (
              <button
                onClick={() =>
                  actions.abrirConfirmacao({
                    titulo: 'Desativar módulo',
                    mensagem: `"${modulo.nome}" vai sair da navegação principal. As conversas, agentes e consultas dele continuam guardados, e você pode reativar por aqui quando quiser.`,
                    confirmarLabel: 'Desativar',
                    perigo: true,
                    onConfirmar: () => void actions.alternarStatusModulo(modulo.id, false),
                  })
                }
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.danger, cursor: 'pointer' }}
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={() => void actions.alternarStatusModulo(modulo.id, true)}
                style={{ background: colors.teal, border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Ativar
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => actions.abrirExclusaoModulo(modulo)}
                style={{ background: '#fff', border: `1px solid ${colors.danger}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.danger, cursor: 'pointer' }}
              >
                Excluir
              </button>
            )}
          </div>
        ))}
```

Substituir por (só muda a assinatura do `.map` pra corpo em bloco, adiciona a resolução do ícone e o `<IconeModulo />`, resto idêntico):

```tsx
        {state.todosModulos.map((modulo) => {
          const IconeModulo = resolveModuleIcon(modulo.icone);
          return (
          <div key={modulo.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '13px 16px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: modulo.ativo ? colors.success : colors.textFaint, flexShrink: 0 }} />
            <IconeModulo size={18} color={colors.textMuted} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{modulo.nome}</div>
              <div style={{ fontSize: 12, color: colors.textFaint }}>{modulo.objetivo}</div>
            </div>
            <span
              style={{
                background: modulo.ativo ? colors.successBg : colors.chipBg,
                color: modulo.ativo ? colors.success : colors.textMuted,
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {modulo.ativo ? 'Ativo' : 'Inativo'}
            </span>
            {modulo.ativo ? (
              <button
                onClick={() =>
                  actions.abrirConfirmacao({
                    titulo: 'Desativar módulo',
                    mensagem: `"${modulo.nome}" vai sair da navegação principal. As conversas, agentes e consultas dele continuam guardados, e você pode reativar por aqui quando quiser.`,
                    confirmarLabel: 'Desativar',
                    perigo: true,
                    onConfirmar: () => void actions.alternarStatusModulo(modulo.id, false),
                  })
                }
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.danger, cursor: 'pointer' }}
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={() => void actions.alternarStatusModulo(modulo.id, true)}
                style={{ background: colors.teal, border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Ativar
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => actions.abrirExclusaoModulo(modulo)}
                style={{ background: '#fff', border: `1px solid ${colors.danger}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.danger, cursor: 'pointer' }}
              >
                Excluir
              </button>
            )}
          </div>
          );
        })}
```

- [ ] **Step 3: Confirmar que compila**

Run: `cd frontend && npm run build`
Expected: compila sem erros.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/corepilot/views/admin/AdminModulos.tsx
git commit -m "feat(frontend): exibe o ícone do módulo na lista de administração"
```

---

### Task 7: Verificação final

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Build e lint completos**

Run: `cd frontend && npm run build && npm run lint`
Expected: `tsc -b`, `vite build` e `oxlint` (`npm run lint`) sem erros.

- [ ] **Step 2: Checagem visual manual**

Run: `cd frontend && npm run dev` (e `cd backend && npm run start:dev` se for testar salvamento real de módulo, não só a UI do picker).

No navegador: abrir "Criar módulo" (Wizard), no campo "Ícone" clicar no botão — deve abrir o popover com busca. Digitar algo como "cart" — deve filtrar e mostrar `ShoppingCart` (entre outros resultados com "cart" no nome). Clicar num ícone — o popover fecha e o botão passa a mostrar o ícone escolhido. Se salvar o módulo (passo 1 do wizard, botão de avançar), o ícone escolhido deve aparecer na aba do módulo no `Header` (menu de navegação superior) e na lista de `AdminModulos` (menu do usuário → Módulos). Nenhum erro no console do navegador.

Esta sessão não tem ferramenta de automação de browser disponível — este step depende de quem estiver acompanhando a implementação clicar através da UI (subagent-driven-development: reportar como pendente de confirmação humana no review; inline: pedir para o usuário confirmar).

- [ ] **Step 3: Encerrar os servidores de teste (se subiu algum no Step 2)**

Identificar os PIDs de `node.exe` cuja `CommandLine` referencia `Corepilot\backend`/`Corepilot\frontend` (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` no PowerShell) e encerrar só esses.

- [ ] **Step 4: Commit final (se sobrar algo)**

```bash
cd /c/Git/Corepilot
git status --short
```

Se houver mudanças pendentes relacionadas a este plano, `git add` só os arquivos relevantes e commitar. Não commitar nada que não tenha sido tocado por este plano.
