# CorePilot — Fase 5 (Orquestrador BPM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um motor de orquestração real para o CorePilot: cada módulo pode ter um `Fluxo`
(etapas, macroetapas, transições) desenhado pelo usuário no builder do Wizard (Step5,
portado do design fornecido), executado por uma máquina de estados com fila assíncrona
para etapas de agente/integração, operável por humanos através de uma tela de interação
genérica, e validado de ponta a ponta com o fluxo de Compras — desenhado pelo próprio
usuário no builder, com envio real de WhatsApp via Evolution API na etapa final.

**Architecture:** `Fluxo → Macroetapa[] + Etapa[]` (rascunho/publicado, versionado).
`InstanciaDeProcesso` referencia a versão publicada travada na criação. Etapas
automáticas/de agente/de integração avançam via `OrquestradorEngineService`
(síncrono para automáticas, assíncrono via `ExecucaoDeEtapa` pending + um worker
`@Interval()` para agente/integração — fila em Postgres, sem Redis). Etapas de
usuário/aprovação avançam só quando alguém chama `POST /instancias/:id/acoes`. O
frontend porta o design `CorePilot.dc.html` (Step5) para o builder, e ganha um
`FieldRenderer`/`TelaDeInteracao` genéricos (sem vocabulário de domínio no código) que
substituem o `CardDetailDrawer` mockado de Compras.

**Tech Stack:** NestJS 11, Prisma, `@anthropic-ai/sdk`, `zod`, `@nestjs/schedule`
(`@Interval`, já uma dependência via `@nestjs/schedule` da Fase 4), Node `crypto`
(AES-256-GCM, reaproveitado da Fase 4), React 19 + Vite. Sem Redis/BullMQ.

## Global Constraints

- Lógica de backend só em `backend/` — nunca em Supabase Edge Functions (CLAUDE.md).
- Sem Redis/BullMQ: a fila assíncrona é a própria tabela `ExecucaoDeEtapa`
  (`status = pending`), processada por um worker `@Interval()` in-process — mesmo
  espírito do `SyncCronService` da Fase 4, mas em intervalo curto em vez de cron.
- Executor é sempre derivado do Tipo de etapa (`EXECUTORES_POR_TIPO` em
  `tipo-executor.ts`) — nunca um campo livre. Validado tanto no builder (frontend)
  quanto no backend, antes de permitir publicar um Fluxo.
- Toda saída de agente usada pela engine é estruturada (schema da Skill), nunca texto
  livre interpretado — mesmo mecanismo de Structured Outputs (`messages.parse` +
  `zodOutputFormat`) já usado pela Fase 3, reaproveitado sem reescrever.
- Toda ação humana ou automática é auditável: ações humanas geram `AuditLog`
  (`acao: 'etapa_acao_executada'` / `'fluxo_publicado'`); execuções automáticas de
  agente/integração ficam registradas em `ExecucaoDeEtapa` (ator, input, output,
  timestamp) — mesmo raciocínio da Fase 4 para sincronizações automáticas.
- Chave da API da Anthropic e credenciais (Evolution API) vivem só no backend.
  `IntegracaoWhatsApp.apiKeyCriptografada` reaproveita `criptografar`/`descriptografar`
  de `backend/src/fonte-de-dados/crypto.ts` e a variável `ERP_ENCRYPTION_KEY` já
  existente — não criar uma segunda chave de criptografia.
- Idempotência obrigatória em qualquer `ExecucaoDeEtapa` com efeito externo (WhatsApp):
  `chaveIdempotencia = instanciaId:etapaId:numeroDaExecucao`, `@unique` no banco. Falha
  de uma etapa automática nunca conclui a instância silenciosamente — marca
  `InstanciaDeProcesso.status = 'erro'`, visível na Tela de Interação.
- Fluxo é versionado: `InstanciaDeProcesso.fluxoId` trava a versão na criação.
  Republicar nunca modifica as `Etapa`/`Macroetapa` de uma versão já publicada — o
  builder sempre edita um rascunho separado (ver Task 3).
- Toda tabela nova nasce com RLS habilitada e sem policies (regra permanente da Fase
  1). Usar `prisma migrate dev --create-only`, editar as linhas de RLS, e só então
  aplicar — evita o drift de checksum documentado em memória
  (`project_prisma_migration_checksum_drift.md`).
- `entity-reference` não aponta para um cadastro dedicado (o CorePilot não tem Master
  Data) — funciona com opções estáticas digitadas no builder OU uma
  `ConsultaParametrizada` já cadastrada (Fase 4). Sem tabela de cadastro nova nesta
  fase.
- `Wizard.tsx`, `ChatView`, os componentes de Agente/Skill/Fontes de Dados das fases
  anteriores são reaproveitados **sem modificação**, exceto onde este plano
  explicitamente instrui uma mudança (renumeração dos passos do Wizard, Task 14).
- Prettier do backend: aspas simples, trailing commas em tudo. Testes Jest colocados
  junto do código (`*.spec.ts`), e2e em `test/*.e2e-spec.ts` (hard-requer
  `.env.local`, chama a Anthropic real — mesmo padrão da Fase 3/4).
- Frontend não tem test runner configurado — verificação é manual (`npm run dev`,
  testar no navegador), como nas fases anteriores.

---

## Task 1: Prisma — schema do motor de orquestração e migração

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migração via `npm run prisma:migrate`

**Interfaces:**
- Produces: modelos `Fluxo`, `Macroetapa`, `Etapa`, `InstanciaDeProcesso`,
  `ExecucaoDeEtapa`, `IntegracaoWhatsApp`; enums `TipoEtapa`, `ExecutorEtapa`,
  `StatusInstancia`, `StatusExecucao`, `AtorExecucao`; back-relations
  `Modulo.fluxos`, `Empresa.integracaoWhatsapp`/`instanciasDeProcesso`,
  `Agente.etapas`, `Skill.etapas`; migração aplicada com RLS nas 6 tabelas novas.

- [ ] **Step 1: Editar `backend/prisma/schema.prisma`**

Adicionar `fluxos Fluxo[]` ao model `Modulo` (ao lado de `consultas`):

```prisma
model Modulo {
  // ...campos existentes sem mudança...

  empresa      Empresa                 @relation(fields: [empresaId], references: [id])
  conversas    Conversa[]
  agentes      Agente[]
  consultas    ConsultaParametrizada[]
  conversaTags ConversaTag[]
  fluxos       Fluxo[]
}
```

Adicionar `integracaoWhatsapp IntegracaoWhatsApp?` e
`instanciasDeProcesso InstanciaDeProcesso[]` ao model `Empresa`:

```prisma
model Empresa {
  // ...campos existentes sem mudança...

  usuarios             UsuarioEmpresa[]
  auditLogs            AuditLog[]
  modulos              Modulo[]
  conversas            Conversa[]
  agentes              Agente[]
  fontesDeDados        FonteDeDados[]
  conversaTags         ConversaTag[]
  integracaoWhatsapp   IntegracaoWhatsApp?
  instanciasDeProcesso InstanciaDeProcesso[]
}
```

Adicionar `etapas Etapa[]` ao model `Agente` e ao model `Skill`:

```prisma
model Agente {
  // ...campos existentes sem mudança...

  empresa Empresa @relation(fields: [empresaId], references: [id])
  modulo  Modulo  @relation(fields: [moduloId], references: [id])
  skills  Skill[]
  etapas  Etapa[]
}

model Skill {
  // ...campos existentes sem mudança...

  agente      Agente                  @relation(fields: [agenteId], references: [id])
  execucoes   SkillExecucao[]
  ferramentas ConsultaParametrizada[]
  etapas      Etapa[]
}
```

Adicionar os modelos e enums novos ao final do arquivo:

```prisma
model Fluxo {
  id        String   @id @default(uuid())
  moduloId  String
  versao    Int      @default(1)
  publicado Boolean  @default(false)
  criadoEm  DateTime @default(now())

  modulo      Modulo                @relation(fields: [moduloId], references: [id])
  macroetapas Macroetapa[]
  etapas      Etapa[]
  instancias  InstanciaDeProcesso[]
}

model Macroetapa {
  id      String @id @default(uuid())
  fluxoId String
  nome    String
  ordem   Int

  fluxo  Fluxo   @relation(fields: [fluxoId], references: [id])
  etapas Etapa[]
}

enum TipoEtapa {
  tarefa_agente
  interacao_usuario
  aprovacao
  decisao_automatica
  integracao
  espera
}

enum ExecutorEtapa {
  agente
  usuario
  agente_mais_usuario
  integracao
  agente_mais_integracao
  automatico
}

model Etapa {
  id              String        @id @default(uuid())
  fluxoId         String
  macroetapaId    String
  ordem           Int
  nome            String
  tipo            TipoEtapa
  executor        ExecutorEtapa
  prazoDias       Int?
  agenteId        String?
  skillId         String?
  autonomia       String?
  aprovadores     Json          @default("[]")
  loopParaEtapaId String?
  entradaRefs     Json          @default("[]")
  camposUsuario   Json          @default("[]")

  fluxo      Fluxo             @relation(fields: [fluxoId], references: [id])
  macroetapa Macroetapa        @relation(fields: [macroetapaId], references: [id])
  agente     Agente?           @relation(fields: [agenteId], references: [id])
  skill      Skill?            @relation(fields: [skillId], references: [id])
  execucoes  ExecucaoDeEtapa[]
}

enum StatusInstancia {
  em_andamento
  concluido
  erro
}

model InstanciaDeProcesso {
  id              String          @id @default(uuid())
  fluxoId         String
  moduloId        String
  empresaId       String
  etapaAtualId    String
  status          StatusInstancia @default(em_andamento)
  dadosAcumulados Json            @default("{}")
  criadoEm        DateTime        @default(now())
  atualizadoEm    DateTime        @updatedAt

  fluxo     Fluxo             @relation(fields: [fluxoId], references: [id])
  empresa   Empresa           @relation(fields: [empresaId], references: [id])
  execucoes ExecucaoDeEtapa[]
}

enum StatusExecucao {
  pending
  processing
  done
  failed
}

enum AtorExecucao {
  agente
  usuario
  integracao
  automatico
}

model ExecucaoDeEtapa {
  id                String         @id @default(uuid())
  instanciaId       String
  etapaId           String
  numeroDaExecucao  Int
  ator              AtorExecucao
  atorUsuarioId     String?
  input             Json
  output            Json?
  status            StatusExecucao @default(pending)
  chaveIdempotencia String?        @unique
  tokensEntrada     Int?
  tokensSaida       Int?
  mensagemErro      String?
  criadoEm          DateTime       @default(now())
  concluidoEm       DateTime?

  instancia InstanciaDeProcesso @relation(fields: [instanciaId], references: [id])
  etapa     Etapa                @relation(fields: [etapaId], references: [id])
  usuario   Usuario?             @relation(fields: [atorUsuarioId], references: [id])
}

model IntegracaoWhatsApp {
  id                  String    @id @default(uuid())
  empresaId           String    @unique
  apiUrl              String
  instanceName        String
  apiKeyCriptografada String
  phone               String?
  ultimoTesteEm       DateTime?
  ultimoTesteSucesso  Boolean?
  ultimaMensagemErro  String?
  criadoEm            DateTime  @default(now())

  empresa Empresa @relation(fields: [empresaId], references: [id])
}
```

Adicionar `skillExecucoes SkillExecucao[]` já existe em `Usuario` — só falta a
back-relation de `ExecucaoDeEtapa`, que já é coberta por `@relation` acima sem exigir
um array em `Usuario` (relação opcional 1:N sem necessidade de navegar no sentido
inverso agora).

- [ ] **Step 2: Criar a migração sem aplicar ainda**

Run: `npm run prisma:migrate -- --create-only --name orquestrador_bpm`

- [ ] **Step 3: Adicionar as linhas de RLS ao final do arquivo de migração gerado**

```sql
-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "Fluxo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Macroetapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Etapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstanciaDeProcesso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecucaoDeEtapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegracaoWhatsApp" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Aplicar a migração e regenerar o client**

Run: `npm run prisma:migrate`
Expected: aplica o DDL + RLS numa única execução, regenera `@prisma/client`.

- [ ] **Step 5: Verificar RLS (script temporário, apagar depois)**

Criar `backend/scratch-check-rls.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('Fluxo', 'Macroetapa', 'Etapa', 'InstanciaDeProcesso', 'ExecucaoDeEtapa', 'IntegracaoWhatsApp')
  `;
  console.log(rows);
}

main().finally(() => prisma.$disconnect());
```

Run: `npx dotenv -e .env.local -- npx tsx scratch-check-rls.ts`
Expected: 6 linhas com `relrowsecurity: true`. Depois, apagar `scratch-check-rls.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): schema Prisma do motor de orquestração (Fase 5) com RLS"
```

---

## Task 2: Utilitários puros do motor (Tipo×Executor, Ações, Idempotência)

**Files:**
- Create: `backend/src/orquestrador/tipo-executor.ts`
- Create: `backend/src/orquestrador/tipo-executor.spec.ts`
- Create: `backend/src/orquestrador/acoes.ts`
- Create: `backend/src/orquestrador/acoes.spec.ts`
- Create: `backend/src/orquestrador/idempotencia.ts`
- Create: `backend/src/orquestrador/idempotencia.spec.ts`
- Create: `backend/src/orquestrador/campos.ts`

**Interfaces:**
- Produces: `EXECUTORES_POR_TIPO`, `executorPadrao(tipo): ExecutorEtapa`,
  `executorValido(tipo, executor): boolean` (**usado pelas Tasks 4 e 5**);
  `calcularAcoes(etapa, proximaEtapaId): AcaoEtapa[]` (**usado pelas Tasks 6 e 7**);
  `chaveIdempotencia(instanciaId, etapaId, numeroDaExecucao): string` (**usado pelas
  Tasks 6, 8 e 10**); tipos `CustomFieldEtapa`/`TableColumn` (**usados pela Task 4 e
  pelo frontend, Task 15**).

Estes três arquivos não dependem de Nest/Prisma — são funções puras, testáveis
isoladamente, seguindo o mesmo padrão de `backend/src/consulta/sync-devida.ts`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `backend/src/orquestrador/tipo-executor.spec.ts`:

```typescript
import { executorPadrao, executorValido } from './tipo-executor';

describe('tipo-executor', () => {
  it('define um único executor válido pra tarefa_agente, decisao_automatica e espera', () => {
    expect(executorPadrao('tarefa_agente')).toBe('agente');
    expect(executorPadrao('decisao_automatica')).toBe('automatico');
    expect(executorPadrao('espera')).toBe('automatico');
  });

  it('define o executor padrão como o primeiro válido pra aprovacao e integracao', () => {
    expect(executorPadrao('aprovacao')).toBe('usuario');
    expect(executorPadrao('integracao')).toBe('integracao');
  });

  it('valida combinações permitidas', () => {
    expect(executorValido('aprovacao', 'usuario')).toBe(true);
    expect(executorValido('aprovacao', 'agente_mais_usuario')).toBe(true);
    expect(executorValido('integracao', 'agente_mais_integracao')).toBe(true);
  });

  it('rejeita combinações não permitidas', () => {
    expect(executorValido('interacao_usuario', 'automatico')).toBe(false);
    expect(executorValido('tarefa_agente', 'usuario')).toBe(false);
    expect(executorValido('decisao_automatica', 'agente')).toBe(false);
  });
});
```

Criar `backend/src/orquestrador/acoes.spec.ts`:

```typescript
import { calcularAcoes } from './acoes';

describe('calcularAcoes', () => {
  it('etapa de aprovação sem loop tem só a ação Aprovar', () => {
    const acoes = calcularAcoes({ tipo: 'aprovacao', loopParaEtapaId: null }, 'etapa-2');
    expect(acoes).toEqual([{ id: 'aprovar', label: 'Aprovar', etapaDestinoId: 'etapa-2', estilo: 'primario' }]);
  });

  it('etapa de aprovação com loop ganha a ação Solicitar ajustes, exigindo motivo_correcao', () => {
    const acoes = calcularAcoes({ tipo: 'aprovacao', loopParaEtapaId: 'etapa-1' }, 'etapa-2');
    expect(acoes).toHaveLength(2);
    expect(acoes[1]).toEqual({
      id: 'solicitar_ajustes',
      label: 'Solicitar ajustes',
      etapaDestinoId: 'etapa-1',
      exigeCampo: { key: 'motivo_correcao', label: 'Motivo da correção', obrigatorio: true },
      estilo: 'secundario',
    });
  });

  it('etapa de interação do usuário tem só a ação Concluir', () => {
    const acoes = calcularAcoes({ tipo: 'interacao_usuario', loopParaEtapaId: null }, 'etapa-3');
    expect(acoes).toEqual([{ id: 'concluir', label: 'Concluir', etapaDestinoId: 'etapa-3', estilo: 'primario' }]);
  });

  it('etapas automáticas/de agente/integração não têm ações (avançam sozinhas)', () => {
    expect(calcularAcoes({ tipo: 'tarefa_agente', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
    expect(calcularAcoes({ tipo: 'decisao_automatica', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
    expect(calcularAcoes({ tipo: 'integracao', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
  });

  it('última etapa (sem próxima) gera ação com etapaDestinoId null (conclui a instância)', () => {
    const acoes = calcularAcoes({ tipo: 'interacao_usuario', loopParaEtapaId: null }, null);
    expect(acoes[0].etapaDestinoId).toBeNull();
  });
});
```

Criar `backend/src/orquestrador/idempotencia.spec.ts`:

```typescript
import { chaveIdempotencia } from './idempotencia';

describe('chaveIdempotencia', () => {
  it('combina instância, etapa e número da execução', () => {
    expect(chaveIdempotencia('inst-1', 'etapa-1', 1)).toBe('inst-1:etapa-1:1');
  });

  it('gera chaves diferentes pra reexecuções da mesma etapa (loop)', () => {
    expect(chaveIdempotencia('inst-1', 'etapa-1', 1)).not.toBe(chaveIdempotencia('inst-1', 'etapa-1', 2));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- orquestrador`
Expected: FAIL com "Cannot find module './tipo-executor'" (e os outros dois módulos)

- [ ] **Step 3: Implementar `tipo-executor.ts`**

```typescript
import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';

export const EXECUTORES_POR_TIPO: Record<TipoEtapa, ExecutorEtapa[]> = {
  tarefa_agente: ['agente'],
  interacao_usuario: ['usuario'],
  aprovacao: ['usuario', 'agente_mais_usuario'],
  decisao_automatica: ['automatico'],
  integracao: ['integracao', 'agente_mais_integracao'],
  espera: ['automatico'],
};

export function executorPadrao(tipo: TipoEtapa): ExecutorEtapa {
  return EXECUTORES_POR_TIPO[tipo][0];
}

export function executorValido(tipo: TipoEtapa, executor: ExecutorEtapa): boolean {
  return EXECUTORES_POR_TIPO[tipo].includes(executor);
}
```

- [ ] **Step 4: Implementar `acoes.ts`**

```typescript
import type { TipoEtapa } from '@prisma/client';

export interface AcaoEtapa {
  id: string;
  label: string;
  etapaDestinoId: string | null;
  exigeCampo?: { key: string; label: string; obrigatorio: boolean };
  estilo: 'primario' | 'secundario' | 'perigo';
}

export interface EtapaParaAcoes {
  tipo: TipoEtapa;
  loopParaEtapaId: string | null;
}

export function calcularAcoes(etapa: EtapaParaAcoes, proximaEtapaId: string | null): AcaoEtapa[] {
  if (etapa.tipo === 'aprovacao') {
    const acoes: AcaoEtapa[] = [{ id: 'aprovar', label: 'Aprovar', etapaDestinoId: proximaEtapaId, estilo: 'primario' }];
    if (etapa.loopParaEtapaId) {
      acoes.push({
        id: 'solicitar_ajustes',
        label: 'Solicitar ajustes',
        etapaDestinoId: etapa.loopParaEtapaId,
        exigeCampo: { key: 'motivo_correcao', label: 'Motivo da correção', obrigatorio: true },
        estilo: 'secundario',
      });
    }
    return acoes;
  }
  if (etapa.tipo === 'interacao_usuario') {
    return [{ id: 'concluir', label: 'Concluir', etapaDestinoId: proximaEtapaId, estilo: 'primario' }];
  }
  return [];
}
```

- [ ] **Step 5: Implementar `idempotencia.ts`**

```typescript
export function chaveIdempotencia(instanciaId: string, etapaId: string, numeroDaExecucao: number): string {
  return `${instanciaId}:${etapaId}:${numeroDaExecucao}`;
}
```

- [ ] **Step 6: Criar `campos.ts` (tipos de `CustomField`, sem lógica — consumido pelas Tasks 4/15)**

```typescript
export type TipoCampoEtapa =
  | 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'attachment'
  | 'entity-reference' | 'table' | 'reference-table' | 'summary';

export interface TableColumn {
  id: string;
  label: string;
  tipo: 'text' | 'checkbox' | 'date' | 'datetime' | 'number' | 'select' | 'calculated';
  calc?: { operation: 'multiply' | 'add' | 'subtract' | 'divide'; column1Id: string; column2Id: string; format?: string };
}

export interface CustomFieldEtapa {
  id: string;
  label: string;
  required: boolean;
  tipo: TipoCampoEtapa;
  placeholder?: string;
  options?: { label: string; value: string }[];
  maxFiles?: number;
  acceptedTypes?: string;
  entityType?: string;
  consultaParametrizadaId?: string;
  tableColumns?: TableColumn[];
  referenceConfig?: {
    referenceStepId: string;
    referenceFieldId: string;
    allowMultiplePerItem: boolean;
    additionalColumns: TableColumn[];
  };
  summaryConfig?: {
    sourceTableFieldId: string;
    sourceColumnId: string;
    operation: 'sum' | 'average' | 'count' | 'min' | 'max';
    format?: string;
  };
}
```

- [ ] **Step 7: Rodar e confirmar que passam**

Run: `npm test -- orquestrador`
Expected: PASS (11 testes)

- [ ] **Step 8: Commit**

```bash
git add backend/src/orquestrador/tipo-executor.ts backend/src/orquestrador/tipo-executor.spec.ts \
  backend/src/orquestrador/acoes.ts backend/src/orquestrador/acoes.spec.ts \
  backend/src/orquestrador/idempotencia.ts backend/src/orquestrador/idempotencia.spec.ts \
  backend/src/orquestrador/campos.ts
git commit -m "feat(backend): utilitários puros do motor de orquestração (tipo×executor, ações, idempotência)"
```

---

## Task 3: `FluxoService`/`FluxoController` — rascunho do Fluxo + Macroetapa (CRUD)

**Files:**
- Create: `backend/src/orquestrador/dto/create-macroetapa.dto.ts`
- Create: `backend/src/orquestrador/dto/update-macroetapa.dto.ts`
- Create: `backend/src/orquestrador/fluxo.service.ts`
- Create: `backend/src/orquestrador/fluxo.service.spec.ts`
- Create: `backend/src/orquestrador/fluxo.controller.ts`
- Create: `backend/src/orquestrador/fluxo.controller.spec.ts`
- Create: `backend/src/orquestrador/orquestrador.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ModuloService.findByIdInEmpresa` (Fase 2), `PrismaService`.
- Produces: `FluxoService.getOrCreateRascunho(moduloId, empresaId): Promise<Fluxo & { macroetapas: Macroetapa[]; etapas: Etapa[] }>`
  (**usado pelas Tasks 4, 5 e 6**), `criarMacroetapa`/`atualizarMacroetapa`/`excluirMacroetapa`.
  Rotas `GET /modulos/:moduloId/fluxo`, `POST/PATCH/DELETE
  /modulos/:moduloId/fluxo/macroetapas[/:id]`.

O rascunho é sempre a versão **editável** de um Fluxo (`publicado = false`). Se não
existir um, `getOrCreateRascunho` cria um novo — vazio na primeira vez, ou clonado da
última versão publicada (etapas + macroetapas, com `loopParaEtapaId`/`entradaRefs`
remapeados pros IDs novos) nas vezes seguintes. Isso garante que editar depois de
publicar nunca modifica a versão que instâncias em andamento já referenciam (Global
Constraints, "Fluxo é versionado").

- [ ] **Step 1: Criar os DTOs**

Criar `backend/src/orquestrador/dto/create-macroetapa.dto.ts`:

```typescript
export interface CreateMacroetapaDto {
  nome: string;
}
```

Criar `backend/src/orquestrador/dto/update-macroetapa.dto.ts`:

```typescript
export interface UpdateMacroetapaDto {
  nome?: string;
}
```

- [ ] **Step 2: Escrever o teste do serviço (falha primeiro)**

Criar `backend/src/orquestrador/fluxo.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { FluxoService } from './fluxo.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ModuloService } from '../modulo/modulo.service';

describe('FluxoService', () => {
  function buildDeps() {
    const prisma = {
      fluxo: { findFirst: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
      macroetapa: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
      etapa: { create: jest.fn(), update: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as PrismaService;
    const moduloService = { findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }) } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria um rascunho vazio quando o módulo nunca teve um fluxo', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.fluxo.create as jest.Mock).mockResolvedValue({ id: 'fluxo-1', moduloId: 'modulo-1', versao: 1, publicado: false, macroetapas: [], etapas: [] });
    const service = new FluxoService(prisma, moduloService);

    const rascunho = await service.getOrCreateRascunho('modulo-1', 'empresa-1');

    expect(rascunho.versao).toBe(1);
    expect(prisma.fluxo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moduloId: 'modulo-1', versao: 1, publicado: false } }),
    );
  });

  it('devolve o rascunho existente sem criar um novo', async () => {
    const { prisma, moduloService } = buildDeps();
    const rascunhoExistente = { id: 'fluxo-2', publicado: false, macroetapas: [], etapas: [] };
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce(rascunhoExistente);
    const service = new FluxoService(prisma, moduloService);

    const resultado = await service.getOrCreateRascunho('modulo-1', 'empresa-1');

    expect(resultado).toBe(rascunhoExistente);
    expect(prisma.fluxo.create).not.toHaveBeenCalled();
  });

  it('clona a última versão publicada como novo rascunho quando não há rascunho aberto', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // sem rascunho
      .mockResolvedValueOnce({
        id: 'fluxo-1',
        moduloId: 'modulo-1',
        versao: 1,
        macroetapas: [{ id: 'me-1', nome: 'Triagem', ordem: 0 }],
        etapas: [{ id: 'e-1', macroetapaId: 'me-1', ordem: 0, nome: 'Solicitação recebida', tipo: 'decisao_automatica', executor: 'automatico', prazoDias: null, agenteId: null, skillId: null, autonomia: null, aprovadores: [], camposUsuario: [], loopParaEtapaId: null, entradaRefs: [] }],
      }); // última publicada
    (prisma.fluxo.create as jest.Mock).mockResolvedValue({ id: 'fluxo-2', moduloId: 'modulo-1', versao: 2 });
    (prisma.macroetapa.create as jest.Mock).mockResolvedValue({ id: 'me-2' });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-2' });
    (prisma.fluxo.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'fluxo-2', versao: 2, macroetapas: [{ id: 'me-2' }], etapas: [{ id: 'e-2' }] });
    const service = new FluxoService(prisma, moduloService);

    const rascunho = await service.getOrCreateRascunho('modulo-1', 'empresa-1');

    expect(prisma.fluxo.create).toHaveBeenCalledWith(expect.objectContaining({ data: { moduloId: 'modulo-1', versao: 2, publicado: false } }));
    expect(rascunho.versao).toBe(2);
  });

  it('cria uma macroetapa no fluxo em rascunho, na próxima posição', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'fluxo-1', macroetapas: [{ id: 'me-1' }], etapas: [] });
    (prisma.macroetapa.create as jest.Mock).mockResolvedValue({ id: 'me-2', nome: 'Cotação', ordem: 1 });
    const service = new FluxoService(prisma, moduloService);

    await service.criarMacroetapa('modulo-1', 'empresa-1', { nome: 'Cotação' });

    expect(prisma.macroetapa.create).toHaveBeenCalledWith({ data: { fluxoId: 'fluxo-1', nome: 'Cotação', ordem: 1 } });
  });

  it('rejeita excluir uma macroetapa que ainda tem etapas', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'fluxo-1', macroetapas: [], etapas: [] });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({ id: 'me-1', fluxoId: 'fluxo-1' });
    (prisma.etapa.count as jest.Mock).mockResolvedValue(2);
    const service = new FluxoService(prisma, moduloService);

    await expect(service.excluirMacroetapa('modulo-1', 'empresa-1', 'me-1')).rejects.toThrow(
      'Não é possível excluir uma coluna com etapas',
    );
  });

  it('lança NotFoundException ao editar uma macroetapa de outro fluxo', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'fluxo-1', macroetapas: [], etapas: [] });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new FluxoService(prisma, moduloService);

    await expect(service.atualizarMacroetapa('modulo-1', 'empresa-1', 'me-de-outro-fluxo', { nome: 'X' })).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- fluxo.service.spec.ts`
Expected: FAIL com "Cannot find module './fluxo.service'"

- [ ] **Step 4: Implementar `fluxo.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Etapa, Fluxo, Macroetapa, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';
import type { CreateMacroetapaDto } from './dto/create-macroetapa.dto';
import type { UpdateMacroetapaDto } from './dto/update-macroetapa.dto';

type FluxoComRelacoes = Fluxo & { macroetapas: Macroetapa[]; etapas: Etapa[] };

@Injectable()
export class FluxoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async getOrCreateRascunho(moduloId: string, empresaId: string): Promise<FluxoComRelacoes> {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    const incluir = {
      macroetapas: { orderBy: { ordem: 'asc' as const } },
      etapas: { orderBy: { ordem: 'asc' as const } },
    };

    const rascunho = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: false },
      orderBy: { versao: 'desc' },
      include: incluir,
    });
    if (rascunho) return rascunho as FluxoComRelacoes;

    const ultimoPublicado = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: true },
      orderBy: { versao: 'desc' },
      include: incluir,
    });

    if (!ultimoPublicado) {
      const criado = await this.prisma.fluxo.create({ data: { moduloId, versao: 1, publicado: false } });
      return { ...criado, macroetapas: [], etapas: [] };
    }

    return this.clonarComoRascunho(ultimoPublicado as FluxoComRelacoes);
  }

  private async clonarComoRascunho(origem: FluxoComRelacoes): Promise<FluxoComRelacoes> {
    return this.prisma.$transaction(async (tx) => {
      const novoFluxo = await tx.fluxo.create({
        data: { moduloId: origem.moduloId, versao: origem.versao + 1, publicado: false },
      });

      const mapaMacroetapas = new Map<string, string>();
      for (const macroetapa of origem.macroetapas) {
        const nova = await tx.macroetapa.create({
          data: { fluxoId: novoFluxo.id, nome: macroetapa.nome, ordem: macroetapa.ordem },
        });
        mapaMacroetapas.set(macroetapa.id, nova.id);
      }

      const mapaEtapas = new Map<string, string>();
      for (const etapa of origem.etapas) {
        const nova = await tx.etapa.create({
          data: {
            fluxoId: novoFluxo.id,
            macroetapaId: mapaMacroetapas.get(etapa.macroetapaId)!,
            ordem: etapa.ordem,
            nome: etapa.nome,
            tipo: etapa.tipo,
            executor: etapa.executor,
            prazoDias: etapa.prazoDias,
            agenteId: etapa.agenteId,
            skillId: etapa.skillId,
            autonomia: etapa.autonomia,
            aprovadores: etapa.aprovadores as Prisma.InputJsonValue,
            camposUsuario: etapa.camposUsuario as Prisma.InputJsonValue,
            entradaRefs: [],
          },
        });
        mapaEtapas.set(etapa.id, nova.id);
      }

      // Segunda passada: loopParaEtapaId/entradaRefs só podem ser remapeados depois
      // que todas as etapas clonadas já existem (podem apontar pra frente na lista).
      for (const etapa of origem.etapas) {
        const novaId = mapaEtapas.get(etapa.id)!;
        const entradaRefsAntigas = etapa.entradaRefs as unknown as string[];
        await tx.etapa.update({
          where: { id: novaId },
          data: {
            loopParaEtapaId: etapa.loopParaEtapaId ? (mapaEtapas.get(etapa.loopParaEtapaId) ?? null) : null,
            entradaRefs: entradaRefsAntigas
              .map((id) => mapaEtapas.get(id))
              .filter((id): id is string => !!id) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return tx.fluxo.findUniqueOrThrow({
        where: { id: novoFluxo.id },
        include: {
          macroetapas: { orderBy: { ordem: 'asc' } },
          etapas: { orderBy: { ordem: 'asc' } },
        },
      }) as unknown as Promise<FluxoComRelacoes>;
    });
  }

  async criarMacroetapa(moduloId: string, empresaId: string, dto: CreateMacroetapaDto) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    return this.prisma.macroetapa.create({
      data: { fluxoId: fluxo.id, nome: dto.nome, ordem: fluxo.macroetapas.length },
    });
  }

  async atualizarMacroetapa(moduloId: string, empresaId: string, macroetapaId: string, dto: UpdateMacroetapaDto) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, macroetapaId);
    return this.prisma.macroetapa.update({ where: { id: macroetapaId }, data: { nome: dto.nome } });
  }

  async excluirMacroetapa(moduloId: string, empresaId: string, macroetapaId: string): Promise<void> {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, macroetapaId);
    const emUso = await this.prisma.etapa.count({ where: { macroetapaId } });
    if (emUso > 0) {
      throw new BadRequestException('Não é possível excluir uma coluna com etapas — mova as etapas antes');
    }
    await this.prisma.macroetapa.delete({ where: { id: macroetapaId } });
  }

  private async garantirMacroetapaDoFluxo(fluxoId: string, macroetapaId: string): Promise<void> {
    const macroetapa = await this.prisma.macroetapa.findFirst({ where: { id: macroetapaId, fluxoId } });
    if (!macroetapa) {
      throw new NotFoundException('Coluna do Kanban não encontrada neste fluxo');
    }
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- fluxo.service.spec.ts`
Expected: PASS (6 testes)

- [ ] **Step 6: Escrever o teste do controller e implementar**

Criar `backend/src/orquestrador/fluxo.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { FluxoController } from './fluxo.controller';
import type { FluxoService } from './fluxo.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FluxoController', () => {
  function buildTenantContext(): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('devolve o rascunho do fluxo do módulo', async () => {
    const service = { getOrCreateRascunho: jest.fn().mockResolvedValue({ id: 'fluxo-1' }) } as unknown as FluxoService;
    const controller = new FluxoController(service, buildTenantContext());

    const resultado = await controller.obterRascunho('modulo-1');

    expect(service.getOrCreateRascunho).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(resultado).toEqual({ id: 'fluxo-1' });
  });

  it('rejeita criar macroetapa sem nome', async () => {
    const service = { criarMacroetapa: jest.fn() } as unknown as FluxoService;
    const controller = new FluxoController(service, buildTenantContext());

    await expect(controller.criarMacroetapa('modulo-1', { nome: '  ' })).rejects.toThrow(BadRequestException);
    expect(service.criarMacroetapa).not.toHaveBeenCalled();
  });
});
```

Criar `backend/src/orquestrador/fluxo.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { FluxoService } from './fluxo.service';
import type { CreateMacroetapaDto } from './dto/create-macroetapa.dto';
import type { UpdateMacroetapaDto } from './dto/update-macroetapa.dto';

@Controller('modulos/:moduloId/fluxo')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FluxoController {
  constructor(
    private readonly fluxoService: FluxoService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async obterRascunho(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.getOrCreateRascunho(moduloId, empresaId);
  }

  @Post('macroetapas')
  async criarMacroetapa(@Param('moduloId') moduloId: string, @Body() body: CreateMacroetapaDto) {
    if (!body.nome?.trim()) throw new BadRequestException('nome é obrigatório');
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.criarMacroetapa(moduloId, empresaId, body);
  }

  @Patch('macroetapas/:macroetapaId')
  async atualizarMacroetapa(
    @Param('moduloId') moduloId: string,
    @Param('macroetapaId') macroetapaId: string,
    @Body() body: UpdateMacroetapaDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.atualizarMacroetapa(moduloId, empresaId, macroetapaId, body);
  }

  @Delete('macroetapas/:macroetapaId')
  async excluirMacroetapa(@Param('moduloId') moduloId: string, @Param('macroetapaId') macroetapaId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.fluxoService.excluirMacroetapa(moduloId, empresaId, macroetapaId);
  }
}
```

Run: `npm test -- fluxo.controller.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 7: Criar o módulo e registrar no `AppModule`**

Criar `backend/src/orquestrador/orquestrador.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ModuloModule } from '../modulo/modulo.module';
import { FluxoService } from './fluxo.service';
import { FluxoController } from './fluxo.controller';

@Module({
  imports: [AuthModule, AuditModule, ModuloModule],
  controllers: [FluxoController],
  providers: [FluxoService],
  exports: [FluxoService],
})
export class OrquestradorModule {}
```

Editar `backend/src/app.module.ts` — importar e adicionar `OrquestradorModule` à lista
de `imports` (ao lado de `FerramentaModule`).

- [ ] **Step 8: Rodar a suíte completa e o build**

Run: `npm test`
Expected: todos os testes passam (os já existentes + os novos desta task)
Run: `npm run build`
Expected: sem erros

- [ ] **Step 9: Commit**

```bash
git add backend/src/orquestrador backend/src/app.module.ts
git commit -m "feat(backend): rascunho do Fluxo + CRUD de Macroetapa"
```

---

## Task 4: `FluxoService`/`FluxoController` — CRUD de Etapa (Tipo×Executor)

**Files:**
- Create: `backend/src/orquestrador/dto/create-etapa.dto.ts`
- Create: `backend/src/orquestrador/dto/update-etapa.dto.ts`
- Modify: `backend/src/orquestrador/fluxo.service.ts`
- Modify: `backend/src/orquestrador/fluxo.service.spec.ts`
- Modify: `backend/src/orquestrador/fluxo.controller.ts`
- Modify: `backend/src/orquestrador/fluxo.controller.spec.ts`

**Interfaces:**
- Consumes: `executorValido`/`executorPadrao` (Task 2).
- Produces: `FluxoService.criarEtapa/atualizarEtapa/excluirEtapa` (**usadas pela Task
  5, que valida antes de publicar**). Rotas `POST/PATCH/DELETE
  /modulos/:moduloId/fluxo/etapas[/:id]`.

- [ ] **Step 1: Criar os DTOs**

Criar `backend/src/orquestrador/dto/create-etapa.dto.ts`:

```typescript
import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';

export interface CreateEtapaDto {
  nome: string;
  tipo: TipoEtapa;
  macroetapaId: string;
  executor?: ExecutorEtapa;
}
```

Criar `backend/src/orquestrador/dto/update-etapa.dto.ts`:

```typescript
import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';
import type { CustomFieldEtapa } from '../campos';

export interface UpdateEtapaDto {
  nome?: string;
  tipo?: TipoEtapa;
  executor?: ExecutorEtapa;
  macroetapaId?: string;
  prazoDias?: number | null;
  agenteId?: string | null;
  skillId?: string | null;
  autonomia?: string | null;
  aprovadores?: string[];
  loopParaEtapaId?: string | null;
  entradaRefs?: string[];
  camposUsuario?: CustomFieldEtapa[];
}
```

- [ ] **Step 2: Adicionar os testes (falhando) ao final de `fluxo.service.spec.ts`**

```typescript
describe('FluxoService — Etapa', () => {
  function buildDeps() {
    const prisma = {
      fluxo: { findFirst: jest.fn(), create: jest.fn() },
      macroetapa: { findFirst: jest.fn() },
      etapa: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    } as unknown as PrismaService;
    const moduloService = { findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }) } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  it('cria uma etapa com o executor padrão do tipo, quando nenhum é informado', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', macroetapas: [{ id: 'me-1' }], etapas: [] });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({ id: 'me-1', fluxoId: 'fluxo-1' });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.criarEtapa('modulo-1', 'empresa-1', { nome: 'Comprador valida', tipo: 'aprovacao', macroetapaId: 'me-1' });

    expect(prisma.etapa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ executor: 'usuario' }) }),
    );
  });

  it('ignora um executor informado que não é válido pro tipo, usando o padrão', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', macroetapas: [], etapas: [] });
    (prisma.macroetapa.findFirst as jest.Mock).mockResolvedValue({ id: 'me-1', fluxoId: 'fluxo-1' });
    (prisma.etapa.create as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.criarEtapa('modulo-1', 'empresa-1', { nome: 'X', tipo: 'decisao_automatica', macroetapaId: 'me-1', executor: 'agente' });

    expect(prisma.etapa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ executor: 'automatico' }) }),
    );
  });

  it('trocar o tipo reseta o executor pro padrão do novo tipo, se o atual não for mais válido', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', macroetapas: [], etapas: [] });
    (prisma.etapa.findFirst as jest.Mock).mockResolvedValue({ id: 'e-1', fluxoId: 'fluxo-1', tipo: 'aprovacao', executor: 'usuario', nome: 'X', macroetapaId: 'me-1', prazoDias: null, agenteId: null, skillId: null, autonomia: null, aprovadores: [], loopParaEtapaId: null, entradaRefs: [], camposUsuario: [] });
    (prisma.etapa.update as jest.Mock).mockResolvedValue({ id: 'e-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.atualizarEtapa('modulo-1', 'empresa-1', 'e-1', { tipo: 'tarefa_agente' });

    expect(prisma.etapa.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'tarefa_agente', executor: 'agente' }) }),
    );
  });

  it('excluir uma etapa limpa o loopParaEtapaId de quem apontava pra ela', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', macroetapas: [], etapas: [] });
    (prisma.etapa.findFirst as jest.Mock).mockResolvedValue({ id: 'e-1', fluxoId: 'fluxo-1' });
    const service = new FluxoService(prisma, moduloService);

    await service.excluirEtapa('modulo-1', 'empresa-1', 'e-1');

    expect(prisma.etapa.updateMany).toHaveBeenCalledWith({ where: { fluxoId: 'fluxo-1', loopParaEtapaId: 'e-1' }, data: { loopParaEtapaId: null } });
    expect(prisma.etapa.delete).toHaveBeenCalledWith({ where: { id: 'e-1' } });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falham**

Run: `npm test -- fluxo.service.spec.ts`
Expected: FAIL (`criarEtapa`/`atualizarEtapa`/`excluirEtapa` ainda não existem)

- [ ] **Step 4: Adicionar os métodos a `fluxo.service.ts`**

Adicionar os imports no topo:

```typescript
import { executorPadrao, executorValido } from './tipo-executor';
import type { CreateEtapaDto } from './dto/create-etapa.dto';
import type { UpdateEtapaDto } from './dto/update-etapa.dto';
```

Adicionar os métodos à classe `FluxoService` (depois de `excluirMacroetapa`):

```typescript
  async criarEtapa(moduloId: string, empresaId: string, dto: CreateEtapaDto) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirMacroetapaDoFluxo(fluxo.id, dto.macroetapaId);
    const executor = dto.executor && executorValido(dto.tipo, dto.executor) ? dto.executor : executorPadrao(dto.tipo);

    return this.prisma.etapa.create({
      data: {
        fluxoId: fluxo.id,
        macroetapaId: dto.macroetapaId,
        ordem: fluxo.etapas.length,
        nome: dto.nome,
        tipo: dto.tipo,
        executor,
        aprovadores: [],
        entradaRefs: [],
        camposUsuario: [],
      },
    });
  }

  async atualizarEtapa(moduloId: string, empresaId: string, etapaId: string, dto: UpdateEtapaDto) {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    const etapaAtual = await this.garantirEtapaDoFluxo(fluxo.id, etapaId);
    if (dto.macroetapaId) await this.garantirMacroetapaDoFluxo(fluxo.id, dto.macroetapaId);

    const tipo = dto.tipo ?? etapaAtual.tipo;
    let executor = dto.executor ?? etapaAtual.executor;
    if (!executorValido(tipo, executor)) executor = executorPadrao(tipo);

    return this.prisma.etapa.update({
      where: { id: etapaId },
      data: {
        nome: dto.nome ?? etapaAtual.nome,
        tipo,
        executor,
        macroetapaId: dto.macroetapaId ?? etapaAtual.macroetapaId,
        prazoDias: dto.prazoDias === undefined ? etapaAtual.prazoDias : dto.prazoDias,
        agenteId: dto.agenteId === undefined ? etapaAtual.agenteId : dto.agenteId,
        skillId: dto.skillId === undefined ? etapaAtual.skillId : dto.skillId,
        autonomia: dto.autonomia === undefined ? etapaAtual.autonomia : dto.autonomia,
        aprovadores:
          dto.aprovadores === undefined
            ? (etapaAtual.aprovadores as Prisma.InputJsonValue)
            : (dto.aprovadores as unknown as Prisma.InputJsonValue),
        loopParaEtapaId: dto.loopParaEtapaId === undefined ? etapaAtual.loopParaEtapaId : dto.loopParaEtapaId,
        entradaRefs:
          dto.entradaRefs === undefined
            ? (etapaAtual.entradaRefs as Prisma.InputJsonValue)
            : (dto.entradaRefs as unknown as Prisma.InputJsonValue),
        camposUsuario:
          dto.camposUsuario === undefined
            ? (etapaAtual.camposUsuario as Prisma.InputJsonValue)
            : (dto.camposUsuario as unknown as Prisma.InputJsonValue),
      },
    });
  }

  async excluirEtapa(moduloId: string, empresaId: string, etapaId: string): Promise<void> {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    await this.garantirEtapaDoFluxo(fluxo.id, etapaId);
    await this.prisma.etapa.updateMany({
      where: { fluxoId: fluxo.id, loopParaEtapaId: etapaId },
      data: { loopParaEtapaId: null },
    });
    await this.prisma.etapa.delete({ where: { id: etapaId } });
  }

  private async garantirEtapaDoFluxo(fluxoId: string, etapaId: string) {
    const etapa = await this.prisma.etapa.findFirst({ where: { id: etapaId, fluxoId } });
    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada neste fluxo');
    }
    return etapa;
  }
```

- [ ] **Step 5: Rodar e confirmar que passam**

Run: `npm test -- fluxo.service.spec.ts`
Expected: PASS (10 testes)

- [ ] **Step 6: Adicionar rotas ao controller (e testes)**

Adicionar ao final de `fluxo.controller.spec.ts`:

```typescript
describe('FluxoController — Etapa', () => {
  it('rejeita criar etapa sem tipo ou macroetapaId', async () => {
    const service = { criarEtapa: jest.fn() } as unknown as FluxoService;
    const controller = new FluxoController(service, buildTenantContext());

    await expect(
      controller.criarEtapa('modulo-1', { nome: 'X', tipo: undefined as never, macroetapaId: 'me-1' }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

Adicionar os imports e métodos a `fluxo.controller.ts`:

```typescript
import type { CreateEtapaDto } from './dto/create-etapa.dto';
import type { UpdateEtapaDto } from './dto/update-etapa.dto';
```

```typescript
  @Post('etapas')
  async criarEtapa(@Param('moduloId') moduloId: string, @Body() body: CreateEtapaDto) {
    if (!body.nome?.trim() || !body.tipo || !body.macroetapaId) {
      throw new BadRequestException('nome, tipo e macroetapaId são obrigatórios');
    }
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.criarEtapa(moduloId, empresaId, body);
  }

  @Patch('etapas/:etapaId')
  async atualizarEtapa(
    @Param('moduloId') moduloId: string,
    @Param('etapaId') etapaId: string,
    @Body() body: UpdateEtapaDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.atualizarEtapa(moduloId, empresaId, etapaId, body);
  }

  @Delete('etapas/:etapaId')
  async excluirEtapa(@Param('moduloId') moduloId: string, @Param('etapaId') etapaId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.fluxoService.excluirEtapa(moduloId, empresaId, etapaId);
  }
```

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa, sem erros

- [ ] **Step 8: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): CRUD de Etapa com validação de Tipo×Executor"
```

---

## Task 5: Publicar o Fluxo (validação completa + versionamento + auditoria)

**Files:**
- Modify: `backend/src/orquestrador/fluxo.service.ts`
- Modify: `backend/src/orquestrador/fluxo.service.spec.ts`
- Modify: `backend/src/orquestrador/fluxo.controller.ts`
- Modify: `backend/src/orquestrador/fluxo.controller.spec.ts`

**Interfaces:**
- Produces: `FluxoService.publicar(moduloId, empresaId): Promise<Fluxo>` (lança
  `UnprocessableEntityException` se inválido). Rota `POST
  /modulos/:moduloId/fluxo/publicar` (**consumida pela Task 18, verificação manual, e
  pela Task 11, e2e**).

Depois de publicado, `getOrCreateRascunho` (Task 3) passa a clonar esta versão como
próximo rascunho automaticamente — nenhuma mudança adicional necessária ali.

- [ ] **Step 1: Adicionar os testes (falhando) ao final de `fluxo.service.spec.ts`**

```typescript
describe('FluxoService — publicar', () => {
  function buildDeps() {
    const prisma = {
      fluxo: { findFirst: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const moduloService = { findByIdInEmpresa: jest.fn().mockResolvedValue({ id: 'modulo-1' }) } as unknown as ModuloService;
    return { prisma, moduloService };
  }

  const etapaValida = {
    id: 'e-1', nome: 'IA confere', tipo: 'tarefa_agente' as const, executor: 'agente' as const,
    agenteId: 'agente-1', skillId: 'skill-1', aprovadores: [],
  };

  it('rejeita publicar um fluxo sem etapas', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', etapas: [] });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow('pelo menos uma etapa');
  });

  it('rejeita publicar uma etapa de agente sem skill selecionada', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', etapas: [{ ...etapaValida, skillId: null }] });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow('precisa de um agente e uma skill');
  });

  it('rejeita publicar uma etapa de aprovação sem aprovadores', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [{ id: 'e-2', nome: 'Comprador valida', tipo: 'aprovacao', executor: 'usuario', aprovadores: [] }],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow('pelo menos um aprovador');
  });

  it('rejeita publicar uma combinação Tipo×Executor inválida', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({
      id: 'fluxo-1',
      etapas: [{ id: 'e-3', nome: 'X', tipo: 'interacao_usuario', executor: 'automatico', aprovadores: [] }],
    });
    const service = new FluxoService(prisma, moduloService);

    await expect(service.publicar('modulo-1', 'empresa-1')).rejects.toThrow('combinação de tipo e executor inválida');
  });

  it('publica um fluxo válido', async () => {
    const { prisma, moduloService } = buildDeps();
    (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', etapas: [etapaValida] });
    (prisma.fluxo.update as jest.Mock).mockResolvedValue({ id: 'fluxo-1', publicado: true });
    const service = new FluxoService(prisma, moduloService);

    const resultado = await service.publicar('modulo-1', 'empresa-1');

    expect(prisma.fluxo.update).toHaveBeenCalledWith({ where: { id: 'fluxo-1' }, data: { publicado: true } });
    expect(resultado.publicado).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- fluxo.service.spec.ts`
Expected: FAIL (`publicar` ainda não existe)

- [ ] **Step 3: Implementar `publicar` em `fluxo.service.ts`**

Adicionar o import `UnprocessableEntityException` de `@nestjs/common`, e o método à
classe:

```typescript
  async publicar(moduloId: string, empresaId: string): Promise<Fluxo> {
    const fluxo = await this.getOrCreateRascunho(moduloId, empresaId);
    if (fluxo.etapas.length === 0) {
      throw new UnprocessableEntityException('O fluxo precisa de pelo menos uma etapa para ser publicado');
    }

    for (const etapa of fluxo.etapas) {
      if (!executorValido(etapa.tipo, etapa.executor)) {
        throw new UnprocessableEntityException(`Etapa "${etapa.nome}": combinação de tipo e executor inválida`);
      }
      if (etapa.tipo === 'tarefa_agente' && (!etapa.agenteId || !etapa.skillId)) {
        throw new UnprocessableEntityException(`Etapa "${etapa.nome}": precisa de um agente e uma skill selecionados`);
      }
      if (etapa.tipo === 'aprovacao' && (etapa.aprovadores as unknown as string[]).length === 0) {
        throw new UnprocessableEntityException(`Etapa "${etapa.nome}": precisa de pelo menos um aprovador`);
      }
    }

    return this.prisma.fluxo.update({ where: { id: fluxo.id }, data: { publicado: true } });
  }
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- fluxo.service.spec.ts`
Expected: PASS (15 testes)

- [ ] **Step 5: Adicionar a rota, com auditoria**

Adicionar ao final de `fluxo.controller.spec.ts`:

```typescript
describe('FluxoController — publicar', () => {
  it('publica e audita', async () => {
    const service = { publicar: jest.fn().mockResolvedValue({ id: 'fluxo-1', publicado: true }) } as unknown as FluxoService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new FluxoController(service, buildTenantContext(), audit);

    await controller.publicar('modulo-1');

    expect(service.publicar).toHaveBeenCalledWith('modulo-1', 'empresa-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresa-1', atorUsuarioId: 'usuario-1', acao: 'fluxo_publicado' }),
    );
  });
});
```

Ajustar `fluxo.controller.ts`: importar `AuditService` e `type { Prisma } from
'@prisma/client'`, injetar no construtor, e adicionar a rota:

```typescript
  @Post('publicar')
  async publicar(@Param('moduloId') moduloId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const fluxo = await this.fluxoService.publicar(moduloId, empresaId);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'fluxo_publicado',
      dadosDepois: { fluxoId: fluxo.id, moduloId, versao: fluxo.versao } as unknown as Prisma.InputJsonValue,
    });
    return fluxo;
  }
```

(Atualizar as chamadas de `new FluxoController(...)` nos outros testes do arquivo pra
passar um terceiro argumento `buildAudit()`, com `{ record: jest.fn() } as unknown as
AuditService` — mesmo padrão de `fonte-de-dados.controller.spec.ts`.)

- [ ] **Step 6: Registrar `AuditModule` como dependência do controller (já importado no módulo, Task 3) e rodar tudo**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 7: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): publicar Fluxo com validação completa e auditoria"
```

---

## Task 6: `OrquestradorEngineService` — motor de estado (isolado, sem fila/HTTP)

**Files:**
- Create: `backend/src/orquestrador/orquestrador-engine.service.ts`
- Create: `backend/src/orquestrador/orquestrador-engine.service.spec.ts`
- Modify: `backend/src/orquestrador/orquestrador.module.ts`

**Interfaces:**
- Consumes: `calcularAcoes` (Task 2), `chaveIdempotencia` (Task 2), `PrismaService`.
- Produces: `criarInstancia(moduloId, empresaId, dadosIniciais):
  Promise<InstanciaDeProcesso>`, `avancar(instanciaId, etapaOrigemId): Promise<void>`
  (**usado pela Task 8, worker de agente, e pela Task 10, worker de integração**),
  `executarAcao(instanciaId, empresaId, acaoId, dadosFormulario, atorUsuarioId):
  Promise<InstanciaDeProcesso>`, `detalhar(instanciaId, empresaId): Promise<{
  instancia, etapaAtual, acoes, historico }>`, `listar(moduloId, empresaId):
  Promise<InstanciaDeProcesso[]>` (**todas usadas pela Task 7, InstanciaController**).

Este é o "módulo isolado e testável, sem depender da UI" que o guia principal pede
explicitamente (seção 12) — nenhum destes métodos toca em HTTP, fila ou Anthropic;
`avancar` só decide a **próxima etapa** e, se ela for automática, marca a execução
correspondente como `done`. Quem efetivamente chama a Messages API/Evolution API é o
worker (Tasks 8 e 10), que depois chama `avancar` de volta.

Regra de negócio central: etapas com executor `usuario`/`agente_mais_usuario` ficam
paradas esperando `executarAcao`; todas as outras (`automatico`, `agente`,
`integracao`, `agente_mais_integracao`) geram uma `ExecucaoDeEtapa` — `done` na hora
para `decisao_automatica`/`espera` (nenhum requisito desta fase pede uma avaliação de
condição real além de "chegou dado" — guia §6 trata prazo só como alerta, não
bloqueio), `pending` para `agente`/`integracao` (processadas pelas Tasks 8/10).

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `backend/src/orquestrador/orquestrador-engine.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('OrquestradorEngineService', () => {
  function buildPrisma() {
    return {
      fluxo: { findFirst: jest.fn() },
      etapa: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn() },
      instanciaDeProcesso: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
      execucaoDeEtapa: { create: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn() },
    } as unknown as PrismaService;
  }

  const etapaAutomatica = { id: 'e-1', fluxoId: 'fluxo-1', ordem: 0, tipo: 'decisao_automatica' as const, executor: 'automatico' as const };
  const etapaAgente = { id: 'e-2', fluxoId: 'fluxo-1', ordem: 1, tipo: 'tarefa_agente' as const, executor: 'agente' as const };
  const etapaAprovacao = { id: 'e-3', fluxoId: 'fluxo-1', ordem: 2, tipo: 'aprovacao' as const, executor: 'usuario' as const, loopParaEtapaId: 'e-2', aprovadores: ['Comprador'] };

  describe('criarInstancia', () => {
    it('lança NotFoundException se o módulo não tem fluxo publicado', async () => {
      const prisma = buildPrisma();
      (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(service.criarInstancia('modulo-1', 'empresa-1', {})).rejects.toThrow(NotFoundException);
    });

    it('cria a instância na primeira etapa e, sendo automática, avança sozinha até a próxima etapa parada', async () => {
      const prisma = buildPrisma();
      (prisma.fluxo.findFirst as jest.Mock).mockResolvedValue({ id: 'fluxo-1', etapas: [etapaAutomatica, etapaAgente] });
      (prisma.instanciaDeProcesso.create as jest.Mock).mockResolvedValue({ id: 'inst-1', etapaAtualId: 'e-1', dadosAcumulados: {} });
      (prisma.etapa.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(etapaAutomatica) // entrarNaEtapa(e-1)
        .mockResolvedValueOnce(etapaAutomatica); // avancar() lê a etapa de origem
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(etapaAgente); // próxima etapa (ordem 1)
      (prisma.instanciaDeProcesso.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'inst-1', etapaAtualId: 'e-2' });
      const service = new OrquestradorEngineService(prisma);

      await service.criarInstancia('modulo-1', 'empresa-1', { origem: 'teste' });

      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ etapaId: 'e-1', status: 'done' }) }),
      );
      // avançou pra e-2 (agente) e criou a execução pending correspondente, sem concluir de novo
      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ etapaAtualId: 'e-2' }) }),
      );
      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ etapaId: 'e-2', status: 'pending', ator: 'agente' }) }),
      );
    });
  });

  describe('avancar', () => {
    it('marca a instância como concluído quando não há próxima etapa', async () => {
      const prisma = buildPrisma();
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(etapaAprovacao);
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await service.avancar('inst-1', 'e-3');

      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({ where: { id: 'inst-1' }, data: { status: 'concluido' } });
    });
  });

  describe('executarAcao', () => {
    it('rejeita uma ação que não existe pra etapa atual', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({ id: 'inst-1', empresaId: 'empresa-1', etapaAtualId: 'e-3', dadosAcumulados: {} });
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(etapaAprovacao);
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(service.executarAcao('inst-1', 'empresa-1', 'acao-inexistente', {}, 'usuario-1')).rejects.toThrow(BadRequestException);
    });

    it('rejeita "solicitar_ajustes" sem o campo motivo_correcao', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({ id: 'inst-1', empresaId: 'empresa-1', etapaAtualId: 'e-3', dadosAcumulados: {} });
      (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(etapaAprovacao);
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new OrquestradorEngineService(prisma);

      await expect(service.executarAcao('inst-1', 'empresa-1', 'solicitar_ajustes', {}, 'usuario-1')).rejects.toThrow(BadRequestException);
    });

    it('"solicitar_ajustes" com motivo volta pra etapa de loop e reexecuta com um novo número de execução', async () => {
      const prisma = buildPrisma();
      (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({ id: 'inst-1', empresaId: 'empresa-1', etapaAtualId: 'e-3', dadosAcumulados: {} });
      (prisma.etapa.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(etapaAprovacao) // etapa atual, dentro de executarAcao
        .mockResolvedValueOnce(etapaAgente); // entrarNaEtapa(e-2), etapa de destino do loop
      (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(null); // sem próxima depois de e-3 (não usado neste caminho)
      (prisma.execucaoDeEtapa.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(1); // 2ª execução de e-3, e já havia 1 de e-2
      (prisma.instanciaDeProcesso.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'inst-1', etapaAtualId: 'e-2' });
      const service = new OrquestradorEngineService(prisma);

      await service.executarAcao('inst-1', 'empresa-1', 'solicitar_ajustes', { motivo_correcao: 'preço alto' }, 'usuario-1');

      expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ etapaAtualId: 'e-2' }) }),
      );
      expect(prisma.execucaoDeEtapa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ etapaId: 'e-2', numeroDaExecucao: 2, status: 'pending' }) }),
      );
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- orquestrador-engine.service.spec.ts`
Expected: FAIL com "Cannot find module './orquestrador-engine.service'"

- [ ] **Step 3: Implementar `orquestrador-engine.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AtorExecucao, InstanciaDeProcesso, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calcularAcoes } from './acoes';
import { chaveIdempotencia } from './idempotencia';

function atorParaExecutor(executor: string): AtorExecucao {
  if (executor === 'agente') return 'agente';
  if (executor === 'automatico') return 'automatico';
  return 'integracao'; // integracao | agente_mais_integracao
}

@Injectable()
export class OrquestradorEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async criarInstancia(
    moduloId: string,
    empresaId: string,
    dadosIniciais: Record<string, unknown>,
  ): Promise<InstanciaDeProcesso> {
    const fluxo = await this.prisma.fluxo.findFirst({
      where: { moduloId, publicado: true },
      orderBy: { versao: 'desc' },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
    if (!fluxo) throw new NotFoundException('Módulo não tem um fluxo publicado');

    const primeiraEtapa = fluxo.etapas[0];
    if (!primeiraEtapa) throw new UnprocessableEntityException('Fluxo publicado não tem etapas');

    const instancia = await this.prisma.instanciaDeProcesso.create({
      data: {
        fluxoId: fluxo.id,
        moduloId,
        empresaId,
        etapaAtualId: primeiraEtapa.id,
        dadosAcumulados: dadosIniciais as Prisma.InputJsonValue,
      },
    });

    await this.entrarNaEtapa(instancia.id, primeiraEtapa.id);
    return instancia;
  }

  async listar(moduloId: string, empresaId: string): Promise<InstanciaDeProcesso[]> {
    return this.prisma.instanciaDeProcesso.findMany({
      where: { moduloId, empresaId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async detalhar(instanciaId: string, empresaId: string) {
    const instancia = await this.prisma.instanciaDeProcesso.findFirst({ where: { id: instanciaId, empresaId } });
    if (!instancia) throw new NotFoundException('Instância não encontrada');

    const etapaAtual = await this.prisma.etapa.findUniqueOrThrow({ where: { id: instancia.etapaAtualId } });
    const proxima = await this.prisma.etapa.findFirst({ where: { fluxoId: etapaAtual.fluxoId, ordem: etapaAtual.ordem + 1 } });
    const historico = await this.prisma.execucaoDeEtapa.findMany({
      where: { instanciaId },
      orderBy: { criadoEm: 'asc' },
    });

    return {
      instancia,
      etapaAtual,
      acoes: calcularAcoes(etapaAtual, proxima?.id ?? null),
      historico,
    };
  }

  private async entrarNaEtapa(instanciaId: string, etapaId: string): Promise<void> {
    const etapa = await this.prisma.etapa.findUniqueOrThrow({ where: { id: etapaId } });
    if (etapa.executor === 'usuario' || etapa.executor === 'agente_mais_usuario') {
      return; // aguarda executarAcao
    }

    const numeroDaExecucao = (await this.prisma.execucaoDeEtapa.count({ where: { instanciaId, etapaId } })) + 1;
    const concluiImediatamente = etapa.tipo === 'decisao_automatica' || etapa.tipo === 'espera';

    await this.prisma.execucaoDeEtapa.create({
      data: {
        instanciaId,
        etapaId,
        numeroDaExecucao,
        ator: atorParaExecutor(etapa.executor),
        input: {},
        status: concluiImediatamente ? 'done' : 'pending',
        chaveIdempotencia: chaveIdempotencia(instanciaId, etapaId, numeroDaExecucao),
        concluidoEm: concluiImediatamente ? new Date() : null,
      },
    });

    if (concluiImediatamente) {
      await this.avancar(instanciaId, etapaId);
    }
    // etapas de agente/integração ficam pending — processadas pelas Tasks 8/10 (worker)
  }

  async avancar(instanciaId: string, etapaOrigemId: string): Promise<void> {
    const etapaOrigem = await this.prisma.etapa.findUniqueOrThrow({ where: { id: etapaOrigemId } });
    const proxima = await this.prisma.etapa.findFirst({
      where: { fluxoId: etapaOrigem.fluxoId, ordem: etapaOrigem.ordem + 1 },
    });

    if (!proxima) {
      await this.prisma.instanciaDeProcesso.update({ where: { id: instanciaId }, data: { status: 'concluido' } });
      return;
    }

    await this.prisma.instanciaDeProcesso.update({ where: { id: instanciaId }, data: { etapaAtualId: proxima.id } });
    await this.entrarNaEtapa(instanciaId, proxima.id);
  }

  async executarAcao(
    instanciaId: string,
    empresaId: string,
    acaoId: string,
    dadosFormulario: Record<string, unknown>,
    atorUsuarioId: string,
  ): Promise<InstanciaDeProcesso> {
    const instancia = await this.prisma.instanciaDeProcesso.findFirst({ where: { id: instanciaId, empresaId } });
    if (!instancia) throw new NotFoundException('Instância não encontrada');

    const etapaAtual = await this.prisma.etapa.findUniqueOrThrow({ where: { id: instancia.etapaAtualId } });
    const proxima = await this.prisma.etapa.findFirst({
      where: { fluxoId: etapaAtual.fluxoId, ordem: etapaAtual.ordem + 1 },
    });
    const acao = calcularAcoes(etapaAtual, proxima?.id ?? null).find((a) => a.id === acaoId);
    if (!acao) throw new BadRequestException('Ação inválida para a etapa atual');
    if (acao.exigeCampo?.obrigatorio && !dadosFormulario[acao.exigeCampo.key]) {
      throw new BadRequestException(`Campo obrigatório: ${acao.exigeCampo.label}`);
    }

    const numeroDaExecucao = (await this.prisma.execucaoDeEtapa.count({ where: { instanciaId, etapaId: etapaAtual.id } })) + 1;
    await this.prisma.execucaoDeEtapa.create({
      data: {
        instanciaId,
        etapaId: etapaAtual.id,
        numeroDaExecucao,
        ator: 'usuario',
        atorUsuarioId,
        input: dadosFormulario as Prisma.InputJsonValue,
        output: dadosFormulario as Prisma.InputJsonValue,
        status: 'done',
        concluidoEm: new Date(),
        chaveIdempotencia: chaveIdempotencia(instanciaId, etapaAtual.id, numeroDaExecucao),
      },
    });

    const dadosAcumulados = { ...(instancia.dadosAcumulados as Record<string, unknown>), [etapaAtual.id]: dadosFormulario };
    await this.prisma.instanciaDeProcesso.update({
      where: { id: instanciaId },
      data: { dadosAcumulados: dadosAcumulados as Prisma.InputJsonValue },
    });

    if (acao.etapaDestinoId) {
      await this.prisma.instanciaDeProcesso.update({ where: { id: instanciaId }, data: { etapaAtualId: acao.etapaDestinoId } });
      await this.entrarNaEtapa(instanciaId, acao.etapaDestinoId);
    } else {
      await this.prisma.instanciaDeProcesso.update({ where: { id: instanciaId }, data: { status: 'concluido' } });
    }

    return this.prisma.instanciaDeProcesso.findUniqueOrThrow({ where: { id: instanciaId } });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- orquestrador-engine.service.spec.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Registrar no módulo**

Editar `backend/src/orquestrador/orquestrador.module.ts` — adicionar
`OrquestradorEngineService` a `providers` e `exports`:

```typescript
import { OrquestradorEngineService } from './orquestrador-engine.service';
// ...
@Module({
  imports: [AuthModule, AuditModule, ModuloModule],
  controllers: [FluxoController],
  providers: [FluxoService, OrquestradorEngineService],
  exports: [FluxoService, OrquestradorEngineService],
})
export class OrquestradorModule {}
```

- [ ] **Step 6: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 7: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): motor de estado do Orquestrador (isolado, sem fila/HTTP)"
```

---

## Task 7: `InstanciaController`/`InstanciaAcaoController` — endpoints de execução

**Files:**
- Create: `backend/src/orquestrador/dto/criar-instancia.dto.ts`
- Create: `backend/src/orquestrador/dto/executar-acao.dto.ts`
- Create: `backend/src/orquestrador/instancia.controller.ts`
- Create: `backend/src/orquestrador/instancia.controller.spec.ts`
- Create: `backend/src/orquestrador/instancia-acao.controller.ts`
- Create: `backend/src/orquestrador/instancia-acao.controller.spec.ts`
- Modify: `backend/src/orquestrador/orquestrador.module.ts`

**Interfaces:**
- Consumes: `OrquestradorEngineService` (Task 6), `AuditService` (Fase 1).
- Produces: `POST /modulos/:moduloId/fluxo/instancias`, `GET
  /modulos/:moduloId/fluxo/instancias`, `GET /instancias/:id`, `POST
  /instancias/:id/acoes` (**consumidas pela Task 13, frontend, e pela Task 11, e2e**).

- [ ] **Step 1: Criar os DTOs**

Criar `backend/src/orquestrador/dto/criar-instancia.dto.ts`:

```typescript
export interface CriarInstanciaDto {
  dadosIniciais?: Record<string, unknown>;
}
```

Criar `backend/src/orquestrador/dto/executar-acao.dto.ts`:

```typescript
export interface ExecutarAcaoDto {
  acaoId: string;
  dados?: Record<string, unknown>;
}
```

- [ ] **Step 2: Escrever os testes (falham primeiro)**

Criar `backend/src/orquestrador/instancia.controller.spec.ts`:

```typescript
import { InstanciaController } from './instancia.controller';
import type { OrquestradorEngineService } from './orquestrador-engine.service';
import type { TenantContext } from '../auth/tenant-context';

describe('InstanciaController', () => {
  function buildTenantContext(): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('cria uma instância com os dados iniciais informados', async () => {
    const engine = { criarInstancia: jest.fn().mockResolvedValue({ id: 'inst-1' }) } as unknown as OrquestradorEngineService;
    const controller = new InstanciaController(engine, buildTenantContext());

    await controller.criar('modulo-1', { dadosIniciais: { origem: 'teste' } });

    expect(engine.criarInstancia).toHaveBeenCalledWith('modulo-1', 'empresa-1', { origem: 'teste' });
  });

  it('lista as instâncias do módulo na empresa do tenant', async () => {
    const engine = { listar: jest.fn().mockResolvedValue([]) } as unknown as OrquestradorEngineService;
    const controller = new InstanciaController(engine, buildTenantContext());

    await controller.listar('modulo-1');

    expect(engine.listar).toHaveBeenCalledWith('modulo-1', 'empresa-1');
  });
});
```

Criar `backend/src/orquestrador/instancia-acao.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { InstanciaAcaoController } from './instancia-acao.controller';
import type { OrquestradorEngineService } from './orquestrador-engine.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('InstanciaAcaoController', () => {
  function buildTenantContext(): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('detalha uma instância', async () => {
    const engine = { detalhar: jest.fn().mockResolvedValue({ instancia: {}, etapaAtual: {}, acoes: [], historico: [] }) } as unknown as OrquestradorEngineService;
    const controller = new InstanciaAcaoController(engine, { record: jest.fn() } as unknown as AuditService, buildTenantContext());

    await controller.detalhar('inst-1');

    expect(engine.detalhar).toHaveBeenCalledWith('inst-1', 'empresa-1');
  });

  it('rejeita executar ação sem acaoId', async () => {
    const engine = { executarAcao: jest.fn() } as unknown as OrquestradorEngineService;
    const controller = new InstanciaAcaoController(engine, { record: jest.fn() } as unknown as AuditService, buildTenantContext());

    await expect(controller.executarAcao('inst-1', { acaoId: '' })).rejects.toThrow(BadRequestException);
  });

  it('executa a ação e audita', async () => {
    const engine = { executarAcao: jest.fn().mockResolvedValue({ id: 'inst-1', status: 'em_andamento' }) } as unknown as OrquestradorEngineService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const controller = new InstanciaAcaoController(engine, audit, buildTenantContext());

    await controller.executarAcao('inst-1', { acaoId: 'aprovar', dados: {} });

    expect(engine.executarAcao).toHaveBeenCalledWith('inst-1', 'empresa-1', 'aprovar', {}, 'usuario-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresa-1', atorUsuarioId: 'usuario-1', acao: 'etapa_acao_executada' }),
    );
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falham**

Run: `npm test -- instancia`
Expected: FAIL — módulos ainda não existem

- [ ] **Step 4: Implementar os controllers**

Criar `backend/src/orquestrador/instancia.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { CriarInstanciaDto } from './dto/criar-instancia.dto';

@Controller('modulos/:moduloId/fluxo/instancias')
@UseGuards(JwtAuthGuard, TenantGuard)
export class InstanciaController {
  constructor(
    private readonly engine: OrquestradorEngineService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string, @Body() body: CriarInstanciaDto) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.criarInstancia(moduloId, empresaId, body.dadosIniciais ?? {});
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.listar(moduloId, empresaId);
  }
}
```

Criar `backend/src/orquestrador/instancia-acao.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { ExecutarAcaoDto } from './dto/executar-acao.dto';

@Controller('instancias')
@UseGuards(JwtAuthGuard, TenantGuard)
export class InstanciaAcaoController {
  constructor(
    private readonly engine: OrquestradorEngineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get(':id')
  async detalhar(@Param('id') id: string) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.detalhar(id, empresaId);
  }

  @Post(':id/acoes')
  async executarAcao(@Param('id') id: string, @Body() body: ExecutarAcaoDto) {
    if (!body.acaoId) throw new BadRequestException('acaoId é obrigatório');
    const { usuarioId, empresaId } = this.tenantContext.get();
    const instancia = await this.engine.executarAcao(id, empresaId, body.acaoId, body.dados ?? {}, usuarioId);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'etapa_acao_executada',
      dadosDepois: { instanciaId: id, acaoId: body.acaoId, dados: body.dados ?? {} } as unknown as Prisma.InputJsonValue,
    });
    return instancia;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passam**

Run: `npm test -- instancia`
Expected: PASS (5 testes)

- [ ] **Step 6: Registrar no módulo**

Editar `backend/src/orquestrador/orquestrador.module.ts`:

```typescript
import { InstanciaController } from './instancia.controller';
import { InstanciaAcaoController } from './instancia-acao.controller';
// ...
@Module({
  imports: [AuthModule, AuditModule, ModuloModule],
  controllers: [FluxoController, InstanciaController, InstanciaAcaoController],
  providers: [FluxoService, OrquestradorEngineService],
  exports: [FluxoService, OrquestradorEngineService],
})
export class OrquestradorModule {}
```

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 8: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): endpoints de execução de instância (criar/listar/detalhar/ações)"
```

---

## Task 8: `OrquestradorFilaWorker` — fila em Postgres para etapas de agente

**Files:**
- Create: `backend/src/orquestrador/orquestrador-fila.worker.ts`
- Create: `backend/src/orquestrador/orquestrador-fila.worker.spec.ts`
- Modify: `backend/src/orquestrador/orquestrador.module.ts`

**Interfaces:**
- Consumes: `AnthropicService.parseStructured` (Fase 3), `construirSchemaSaida`/
  `CampoSaida` de `../skill/schema-builder` (Fase 3), `OrquestradorEngineService.avancar`
  (Task 6).
- Produces: `processarFilaAgentes(): Promise<void>` — roda a cada 5s via `@Interval`,
  processa `ExecucaoDeEtapa` `pending` com `ator = 'agente'` (**Task 10 adiciona o
  equivalente para `ator = 'integracao'` neste mesmo arquivo**).

`@Interval()` funciona automaticamente assim que `ScheduleModule.forRoot()` já estiver
registrado em algum lugar da árvore de módulos — e já está, via `SyncCronModule`
(Fase 4, importado no `AppModule`). **Não chamar `ScheduleModule.forRoot()` de novo
aqui** — registrar duas vezes causa conflito de `SchedulerRegistry`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `backend/src/orquestrador/orquestrador-fila.worker.spec.ts`:

```typescript
import { OrquestradorFilaWorker } from './orquestrador-fila.worker';
import type { PrismaService } from '../prisma/prisma.service';
import type { AnthropicService } from '../chat/anthropic.service';
import type { OrquestradorEngineService } from './orquestrador-engine.service';

describe('OrquestradorFilaWorker — processarFilaAgentes', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: { findMany: jest.fn(), update: jest.fn() },
      instanciaDeProcesso: { update: jest.fn() },
    } as unknown as PrismaService;
    const anthropicService = { parseStructured: jest.fn() } as unknown as AnthropicService;
    const engine = { avancar: jest.fn() } as unknown as OrquestradorEngineService;
    return { prisma, anthropicService, engine };
  }

  const execucaoPendente = {
    id: 'exec-1',
    instanciaId: 'inst-1',
    etapaId: 'e-2',
    instancia: { id: 'inst-1', dadosAcumulados: { 'e-1': { itens: ['parafuso'] } } },
    etapa: {
      id: 'e-2',
      entradaRefs: ['e-1'],
      agente: { nome: 'Agente de Compras', funcao: 'Comprador IA', objetivo: 'Agrupar solicitações', guardrails: null, regraEscalonamento: null, modeloIA: 'claude-sonnet-5' },
      skill: { objetivo: 'Agrupar itens por família', camposSaida: [{ nome: 'grupos', tipo: 'string[]', obrigatorio: true }] },
    },
  };

  it('processa uma execução de agente pendente, grava a saída e avança', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoPendente]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({
      parsed_output: { grupos: ['parafusos'] },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exec-1' }, data: expect.objectContaining({ status: 'processing' }) }),
    );
    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'done', output: { grupos: ['parafusos'] } }),
      }),
    );
    expect(engine.avancar).toHaveBeenCalledWith('inst-1', 'e-2');
  });

  it('filtra a entrada da Skill pelas entradaRefs da etapa', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    const execucaoComMaisDados = {
      ...execucaoPendente,
      instancia: { id: 'inst-1', dadosAcumulados: { 'e-1': { itens: ['parafuso'] }, 'outra-etapa': { irrelevante: true } } },
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoComMaisDados]);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({ parsed_output: { grupos: [] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    const mensagemEnviada = (anthropicService.parseStructured as jest.Mock).mock.calls[0][0].mensagem as string;
    expect(mensagemEnviada).toContain('itens');
    expect(mensagemEnviada).not.toContain('irrelevante');
  });

  it('marca a execução e a instância como falha quando a Anthropic lança erro', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoPendente]);
    (anthropicService.parseStructured as jest.Mock).mockRejectedValue(new Error('timeout'));
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    expect(prisma.execucaoDeEtapa.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'exec-1' }, data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({ where: { id: 'inst-1' }, data: { status: 'erro' } });
    expect(engine.avancar).not.toHaveBeenCalled();
  });

  it('continua para a próxima execução mesmo se uma falhar', async () => {
    const { prisma, anthropicService, engine } = buildDeps();
    const segunda = { ...execucaoPendente, id: 'exec-2', instanciaId: 'inst-2' };
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoPendente, segunda]);
    (anthropicService.parseStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ parsed_output: { grupos: [] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine);

    await worker.processarFilaAgentes();

    expect(engine.avancar).toHaveBeenCalledWith('inst-2', 'e-2');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- orquestrador-fila.worker.spec.ts`
Expected: FAIL com "Cannot find module './orquestrador-fila.worker'"

- [ ] **Step 3: Implementar `orquestrador-fila.worker.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Agente, Etapa, ExecucaoDeEtapa, InstanciaDeProcesso, Prisma, Skill } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from '../skill/schema-builder';
import { OrquestradorEngineService } from './orquestrador-engine.service';

type ExecucaoDeAgente = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null; skill: Skill | null };
};

function montarSystemPromptDaEtapa(agente: Agente, skill: Skill): string {
  const partes = [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a etapa "${skill.objetivo}" de um processo automatizado.`,
  ];
  if (agente.guardrails?.trim()) partes.push(`RESTRIÇÕES (nunca viole):\n${agente.guardrails.trim()}`);
  if (agente.regraEscalonamento?.trim()) partes.push(`ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`);
  return partes.join('\n\n');
}

@Injectable()
export class OrquestradorFilaWorker {
  private readonly logger = new Logger(OrquestradorFilaWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicService: AnthropicService,
    private readonly engine: OrquestradorEngineService,
  ) {}

  @Interval(5000)
  async processarFilaAgentes(): Promise<void> {
    const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
      where: { status: 'pending', ator: 'agente' },
      orderBy: { criadoEm: 'asc' },
      take: 5,
      include: { instancia: true, etapa: { include: { agente: true, skill: true } } },
    })) as ExecucaoDeAgente[];

    for (const execucao of pendentes) {
      try {
        await this.processarExecucaoDeAgente(execucao);
      } catch (erro) {
        this.logger.error(`Falha ao processar execução de agente ${execucao.id}`, erro);
        await this.prisma.execucaoDeEtapa.update({
          where: { id: execucao.id },
          data: { status: 'failed', mensagemErro: String(erro), concluidoEm: new Date() },
        });
        await this.prisma.instanciaDeProcesso.update({
          where: { id: execucao.instanciaId },
          data: { status: 'erro' },
        });
      }
    }
  }

  private async processarExecucaoDeAgente(execucao: ExecucaoDeAgente): Promise<void> {
    await this.prisma.execucaoDeEtapa.update({ where: { id: execucao.id }, data: { status: 'processing' } });

    const { etapa, instancia } = execucao;
    if (!etapa.agente || !etapa.skill) {
      throw new Error(`Etapa "${etapa.nome}" está marcada como tarefa_agente mas não tem agente/skill configurados`);
    }

    const entrada = this.montarEntrada(instancia, etapa);
    const schema = construirSchemaSaida(etapa.skill.camposSaida as unknown as CampoSaida[]);
    const response = await this.anthropicService.parseStructured({
      system: montarSystemPromptDaEtapa(etapa.agente, etapa.skill),
      mensagem: JSON.stringify(entrada),
      model: etapa.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });

    if (!response.parsed_output) {
      throw new Error('A saída do agente não pôde ser validada contra o schema da skill');
    }

    await this.prisma.execucaoDeEtapa.update({
      where: { id: execucao.id },
      data: {
        status: 'done',
        output: response.parsed_output as Prisma.InputJsonValue,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
        concluidoEm: new Date(),
      },
    });

    const dadosAcumulados = { ...(instancia.dadosAcumulados as Record<string, unknown>), [etapa.id]: response.parsed_output };
    await this.prisma.instanciaDeProcesso.update({
      where: { id: instancia.id },
      data: { dadosAcumulados: dadosAcumulados as Prisma.InputJsonValue },
    });

    await this.engine.avancar(instancia.id, etapa.id);
  }

  private montarEntrada(instancia: InstanciaDeProcesso, etapa: Etapa): Record<string, unknown> {
    const refs = etapa.entradaRefs as unknown as string[];
    const dados = instancia.dadosAcumulados as Record<string, unknown>;
    if (!refs.length) return dados;
    return Object.fromEntries(refs.filter((id) => id in dados).map((id) => [id, dados[id]]));
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- orquestrador-fila.worker.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Registrar no módulo**

Editar `backend/src/orquestrador/orquestrador.module.ts` — importar `ChatModule`
(onde `AnthropicService` é provido — confirmar o nome exato do módulo em
`backend/src/chat/chat.module.ts`; se `AnthropicService` estiver num módulo
`AnthropicModule` separado, como o `ModuloModule` já faz — Global Constraints do
plano `2026-08-04-rascunho-ia-builder.md` — importar esse em vez de `ChatModule`) e
adicionar `OrquestradorFilaWorker`:

```typescript
import { AnthropicModule } from '../chat/anthropic.module';
import { OrquestradorFilaWorker } from './orquestrador-fila.worker';
// ...
@Module({
  imports: [AuthModule, AuditModule, ModuloModule, AnthropicModule],
  controllers: [FluxoController, InstanciaController, InstanciaAcaoController],
  providers: [FluxoService, OrquestradorEngineService, OrquestradorFilaWorker],
  exports: [FluxoService, OrquestradorEngineService],
})
export class OrquestradorModule {}
```

- [ ] **Step 6: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 7: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): fila em Postgres para etapas de agente (worker @Interval)"
```

---

## Task 9: `IntegracaoWhatsAppModule` — conexão Evolution API por empresa

**Files:**
- Create: `backend/src/integracao-whatsapp/evolution-api-adapter.service.ts`
- Create: `backend/src/integracao-whatsapp/evolution-api-adapter.service.spec.ts`
- Create: `backend/src/integracao-whatsapp/dto/salvar-integracao-whatsapp.dto.ts`
- Create: `backend/src/integracao-whatsapp/integracao-whatsapp.service.ts`
- Create: `backend/src/integracao-whatsapp/integracao-whatsapp.service.spec.ts`
- Create: `backend/src/integracao-whatsapp/integracao-whatsapp.controller.ts`
- Create: `backend/src/integracao-whatsapp/integracao-whatsapp.controller.spec.ts`
- Create: `backend/src/integracao-whatsapp/integracao-whatsapp.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `criptografar`/`descriptografar` de `../fonte-de-dados/crypto` (Fase 4,
  reaproveitado sem duplicar), `ERP_ENCRYPTION_KEY` (mesma variável da Fase 4).
- Produces: `EvolutionApiAdapterService.testarConexao(conexao):
  Promise<{conectado, estado}>`, `.enviarMensagem(conexao, telefone, texto):
  Promise<{messageId}>` (**ambos usados pela Task 10**). Rotas `GET/POST
  /empresas/atual/integracao-whatsapp`, `POST
  /empresas/atual/integracao-whatsapp/testar` — nunca devolvem
  `apiKeyCriptografada`.

A tela "WhatsApp · Evolution API" já existe mockada em
`frontend/src/corepilot/views/admin/AdminSettings.tsx` (`apiUrl`, `instanceName`,
`apiKey`, `phone`) — a Task 17 conecta essa tela a esta API real.

- [ ] **Step 1: Escrever o teste do adapter (falha primeiro)**

Criar `backend/src/integracao-whatsapp/evolution-api-adapter.service.spec.ts`:

```typescript
import { EvolutionApiAdapterService } from './evolution-api-adapter.service';

describe('EvolutionApiAdapterService', () => {
  const conexao = { apiUrl: 'https://evolution.exemplo.com', instanceName: 'corepilot', apiKey: 'chave-123' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('testarConexao reporta conectado quando o estado é "open"', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instance: { state: 'open' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.testarConexao(conexao);

    expect(resultado).toEqual({ conectado: true, estado: 'open' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evolution.exemplo.com/instance/connectionState/corepilot',
      expect.objectContaining({ headers: { apikey: 'chave-123' } }),
    );
  });

  it('testarConexao reporta não conectado pra qualquer estado diferente de "open"', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instance: { state: 'close' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.testarConexao(conexao);

    expect(resultado.conectado).toBe(false);
  });

  it('lança erro descritivo quando o servidor está inacessível', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new EvolutionApiAdapterService();

    await expect(adapter.testarConexao(conexao)).rejects.toThrow('Evolution API inacessível');
  });

  it('enviarMensagem envia number/text e devolve o messageId', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: { id: 'msg-abc' } }),
    } as Response);
    const adapter = new EvolutionApiAdapterService();

    const resultado = await adapter.enviarMensagem(conexao, '+5511999999999', 'Olá!');

    expect(resultado).toEqual({ messageId: 'msg-abc' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evolution.exemplo.com/message/sendText/corepilot',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'chave-123' },
        body: JSON.stringify({ number: '+5511999999999', text: 'Olá!' }),
      }),
    );
  });

  it('enviarMensagem lança erro quando a Evolution API rejeita o envio', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('número inválido') } as Response);
    const adapter = new EvolutionApiAdapterService();

    await expect(adapter.enviarMensagem(conexao, 'x', 'y')).rejects.toThrow('Evolution API rejeitou o envio');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- evolution-api-adapter.service.spec.ts`
Expected: FAIL com "Cannot find module './evolution-api-adapter.service'"

- [ ] **Step 3: Implementar `evolution-api-adapter.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';

export interface EvolutionApiConexao {
  apiUrl: string;
  instanceName: string;
  apiKey: string;
}

@Injectable()
export class EvolutionApiAdapterService {
  async testarConexao(conexao: EvolutionApiConexao): Promise<{ conectado: boolean; estado: string }> {
    let resposta: Response;
    try {
      resposta = await fetch(`${conexao.apiUrl}/instance/connectionState/${conexao.instanceName}`, {
        headers: { apikey: conexao.apiKey },
      });
    } catch (erro) {
      throw new Error(`Evolution API inacessível — confira a URL da instância: ${String(erro)}`);
    }
    if (!resposta.ok) {
      throw new Error(`Evolution API respondeu com erro (status ${resposta.status}): ${await resposta.text()}`);
    }
    const dados = (await resposta.json()) as { instance?: { state?: string } };
    const estado = dados.instance?.state ?? 'desconhecido';
    return { conectado: estado === 'open', estado };
  }

  async enviarMensagem(conexao: EvolutionApiConexao, telefone: string, texto: string): Promise<{ messageId: string }> {
    let resposta: Response;
    try {
      resposta = await fetch(`${conexao.apiUrl}/message/sendText/${conexao.instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: conexao.apiKey },
        body: JSON.stringify({ number: telefone, text: texto }),
      });
    } catch (erro) {
      throw new Error(`Evolution API inacessível ao enviar mensagem: ${String(erro)}`);
    }
    if (!resposta.ok) {
      throw new Error(`Evolution API rejeitou o envio (status ${resposta.status}): ${await resposta.text()}`);
    }
    const dados = (await resposta.json()) as { key?: { id?: string } };
    return { messageId: dados.key?.id ?? '' };
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- evolution-api-adapter.service.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: DTO, `IntegracaoWhatsAppService` e testes**

Criar `backend/src/integracao-whatsapp/dto/salvar-integracao-whatsapp.dto.ts`:

```typescript
export interface SalvarIntegracaoWhatsAppDto {
  apiUrl: string;
  instanceName: string;
  apiKey?: string;
  phone?: string;
}
```

Criar `backend/src/integracao-whatsapp/integracao-whatsapp.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import { descriptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { EvolutionApiAdapterService } from './evolution-api-adapter.service';

describe('IntegracaoWhatsAppService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      integracaoWhatsApp: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const config = { getOrThrow: jest.fn().mockReturnValue(CHAVE) } as unknown as ConfigService;
    const evolutionApi = { testarConexao: jest.fn() } as unknown as EvolutionApiAdapterService;
    return { prisma, config, evolutionApi };
  }

  it('salva a integração com a apiKey criptografada, nunca em texto plano', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.integracaoWhatsApp.upsert as jest.Mock).mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ id: 'wa-1', ...create }),
    );
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    const resultado = await service.salvar('empresa-1', { apiUrl: 'https://x.com', instanceName: 'corepilot', apiKey: 'segredo' });

    expect(resultado.apiKeyCriptografada).not.toBe('segredo');
    expect(descriptografar(resultado.apiKeyCriptografada as string, CHAVE)).toBe('segredo');
  });

  it('rejeita salvar sem apiKey quando ainda não existe configuração', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await expect(service.salvar('empresa-1', { apiUrl: 'https://x.com', instanceName: 'corepilot' })).rejects.toThrow(BadRequestException);
  });

  it('testar lança NotFoundException se a integração ainda não foi configurada', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await expect(service.testar('empresa-1')).rejects.toThrow(NotFoundException);
  });

  it('testar grava sucesso quando a Evolution API confirma conexão', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue({ empresaId: 'empresa-1', apiUrl: 'https://x.com', instanceName: 'corepilot', apiKeyCriptografada: 'xxx' });
    (evolutionApi.testarConexao as jest.Mock).mockResolvedValue({ conectado: true, estado: 'open' });
    (prisma.integracaoWhatsApp.update as jest.Mock).mockResolvedValue({ ultimoTesteSucesso: true });
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await service.testar('empresa-1');

    expect(prisma.integracaoWhatsApp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ultimoTesteSucesso: true, ultimaMensagemErro: null }) }),
    );
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha, depois implementar**

Run: `npm test -- integracao-whatsapp.service.spec.ts`
Expected: FAIL

Criar `backend/src/integracao-whatsapp/integracao-whatsapp.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar, descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from './evolution-api-adapter.service';
import type { SalvarIntegracaoWhatsAppDto } from './dto/salvar-integracao-whatsapp.dto';

@Injectable()
export class IntegracaoWhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly evolutionApi: EvolutionApiAdapterService,
  ) {}

  async buscar(empresaId: string) {
    return this.prisma.integracaoWhatsApp.findUnique({ where: { empresaId } });
  }

  async salvar(empresaId: string, dto: SalvarIntegracaoWhatsAppDto) {
    const existente = await this.prisma.integracaoWhatsApp.findUnique({ where: { empresaId } });
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const apiKeyCriptografada = dto.apiKey ? criptografar(dto.apiKey, chave) : existente?.apiKeyCriptografada;
    if (!apiKeyCriptografada) {
      throw new BadRequestException('apiKey é obrigatória na primeira configuração');
    }

    return this.prisma.integracaoWhatsApp.upsert({
      where: { empresaId },
      create: { empresaId, apiUrl: dto.apiUrl, instanceName: dto.instanceName, apiKeyCriptografada, phone: dto.phone ?? null },
      update: {
        apiUrl: dto.apiUrl,
        instanceName: dto.instanceName,
        apiKeyCriptografada,
        phone: dto.phone ?? null,
        ultimoTesteEm: null,
        ultimoTesteSucesso: null,
        ultimaMensagemErro: null,
      },
    });
  }

  async testar(empresaId: string) {
    const integracao = await this.prisma.integracaoWhatsApp.findUnique({ where: { empresaId } });
    if (!integracao) throw new NotFoundException('Integração de WhatsApp ainda não configurada');

    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    try {
      const resultado = await this.evolutionApi.testarConexao({
        apiUrl: integracao.apiUrl,
        instanceName: integracao.instanceName,
        apiKey: descriptografar(integracao.apiKeyCriptografada, chave),
      });
      return this.prisma.integracaoWhatsApp.update({
        where: { empresaId },
        data: {
          ultimoTesteEm: new Date(),
          ultimoTesteSucesso: resultado.conectado,
          ultimaMensagemErro: resultado.conectado ? null : `Instância não está conectada (estado: ${resultado.estado})`,
        },
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.integracaoWhatsApp.update({
        where: { empresaId },
        data: { ultimoTesteEm: new Date(), ultimoTesteSucesso: false, ultimaMensagemErro: mensagem },
      });
      throw new UnprocessableEntityException(mensagem);
    }
  }
}
```

Run: `npm test -- integracao-whatsapp.service.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 7: Controller, módulo e registro no `AppModule`**

Criar `backend/src/integracao-whatsapp/integracao-whatsapp.controller.spec.ts`:

```typescript
import { IntegracaoWhatsAppController } from './integracao-whatsapp.controller';
import type { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import type { TenantContext } from '../auth/tenant-context';

describe('IntegracaoWhatsAppController', () => {
  function buildTenantContext(): TenantContext {
    return { get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }) } as unknown as TenantContext;
  }

  it('nunca devolve apiKeyCriptografada ao buscar', async () => {
    const service = {
      buscar: jest.fn().mockResolvedValue({ id: 'wa-1', apiUrl: 'x', instanceName: 'y', apiKeyCriptografada: 'zzz', phone: null }),
    } as unknown as IntegracaoWhatsAppService;
    const controller = new IntegracaoWhatsAppController(service, buildTenantContext());

    const resultado = await controller.buscar();

    expect(resultado).not.toHaveProperty('apiKeyCriptografada');
  });
});
```

Criar `backend/src/integracao-whatsapp/integracao-whatsapp.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import type { SalvarIntegracaoWhatsAppDto } from './dto/salvar-integracao-whatsapp.dto';

function sanitizar<T extends { apiKeyCriptografada: string }>(integracao: T) {
  const { apiKeyCriptografada: _apiKeyCriptografada, ...resto } = integracao;
  return resto;
}

@Controller('empresas/atual/integracao-whatsapp')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegracaoWhatsAppController {
  constructor(
    private readonly service: IntegracaoWhatsAppService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async buscar() {
    const { empresaId } = this.tenantContext.get();
    const integracao = await this.service.buscar(empresaId);
    return integracao ? sanitizar(integracao) : null;
  }

  @Post()
  async salvar(@Body() body: SalvarIntegracaoWhatsAppDto) {
    if (!body.apiUrl?.trim() || !body.instanceName?.trim()) {
      throw new BadRequestException('apiUrl e instanceName são obrigatórios');
    }
    const { empresaId } = this.tenantContext.get();
    return sanitizar(await this.service.salvar(empresaId, body));
  }

  @Post('testar')
  async testar() {
    const { empresaId } = this.tenantContext.get();
    return sanitizar(await this.service.testar(empresaId));
  }
}
```

Criar `backend/src/integracao-whatsapp/integracao-whatsapp.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EvolutionApiAdapterService } from './evolution-api-adapter.service';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import { IntegracaoWhatsAppController } from './integracao-whatsapp.controller';

@Module({
  imports: [AuthModule],
  controllers: [IntegracaoWhatsAppController],
  providers: [EvolutionApiAdapterService, IntegracaoWhatsAppService],
  exports: [EvolutionApiAdapterService],
})
export class IntegracaoWhatsAppModule {}
```

Editar `backend/src/app.module.ts` — importar e adicionar `IntegracaoWhatsAppModule`
à lista de `imports`.

- [ ] **Step 8: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 9: Commit**

```bash
git add backend/src/integracao-whatsapp backend/src/app.module.ts
git commit -m "feat(backend): integração WhatsApp real via Evolution API"
```

---

## Task 10: Etapa de Integração no worker (envio WhatsApp + idempotência)

**Files:**
- Modify: `backend/src/orquestrador/orquestrador-fila.worker.ts`
- Modify: `backend/src/orquestrador/orquestrador-fila.worker.spec.ts`
- Modify: `backend/src/orquestrador/orquestrador.module.ts`

**Interfaces:**
- Consumes: `EvolutionApiAdapterService`/`descriptografar` (Task 9),
  `chaveIdempotencia` (Task 2).
- Produces: `processarFilaIntegracoes(): Promise<void>` — roda a cada 5s, processa
  `ExecucaoDeEtapa` `pending` com `ator = 'integracao'` (cobre `executor = integracao`
  **e** `agente_mais_integracao`).

Etapa `agente_mais_integracao` redige a mensagem via Messages API antes de enviar
(usa `etapa.agente`); etapa `integracao` pura usa um texto padrão. O telefone de
destino vem de `dadosAcumulados.telefone` (preenchido por uma etapa anterior, ex. a
etapa de Triagem que recebeu a solicitação) ou, na ausência dele, do `phone` cadastrado
na própria integração.

- [ ] **Step 1: Adicionar os testes (falhando) ao final de `orquestrador-fila.worker.spec.ts`**

```typescript
describe('OrquestradorFilaWorker — processarFilaIntegracoes', () => {
  function buildDeps() {
    const prisma = {
      execucaoDeEtapa: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      instanciaDeProcesso: { update: jest.fn() },
      integracaoWhatsApp: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const anthropicService = { parseStructured: jest.fn() } as unknown as AnthropicService;
    const engine = { avancar: jest.fn() } as unknown as OrquestradorEngineService;
    const evolutionApi = { enviarMensagem: jest.fn() } as unknown as EvolutionApiAdapterService;
    const config = { getOrThrow: jest.fn().mockReturnValue('a'.repeat(64)) } as unknown as ConfigService;
    return { prisma, anthropicService, engine, evolutionApi, config };
  }

  const integracaoSalva = {
    empresaId: 'empresa-1',
    apiUrl: 'https://evolution.exemplo.com',
    instanceName: 'corepilot',
    apiKeyCriptografada: criptografar('chave-123', 'a'.repeat(64)),
    phone: '+5511900000000',
  };

  const execucaoIntegracaoPura = {
    id: 'exec-3',
    instanciaId: 'inst-1',
    etapaId: 'e-6',
    chaveIdempotencia: 'inst-1:e-6:1',
    instancia: { id: 'inst-1', empresaId: 'empresa-1', dadosAcumulados: {} },
    etapa: { id: 'e-6', executor: 'integracao', agente: null },
  };

  it('envia via Evolution API com o texto padrão numa etapa de integração pura, e avança', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoIntegracaoPura]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(integracaoSalva);
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({ messageId: 'msg-1' });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine, evolutionApi, config);

    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: 'https://evolution.exemplo.com', instanceName: 'corepilot', apiKey: 'chave-123' }),
      '+5511900000000',
      expect.any(String),
    );
    expect(engine.avancar).toHaveBeenCalledWith('inst-1', 'e-6');
  });

  it('numa etapa agente_mais_integracao, redige a mensagem com a Anthropic antes de enviar', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } = buildDeps();
    const execucaoComAgente = {
      ...execucaoIntegracaoPura,
      etapa: { id: 'e-6', executor: 'agente_mais_integracao', agente: { nome: 'Agente de Compras', modeloIA: 'claude-sonnet-5' } },
    };
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoComAgente]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(integracaoSalva);
    (anthropicService.parseStructured as jest.Mock).mockResolvedValue({ parsed_output: { mensagem: 'Seu pedido foi aprovado!' } });
    (evolutionApi.enviarMensagem as jest.Mock).mockResolvedValue({ messageId: 'msg-2' });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine, evolutionApi, config);

    await worker.processarFilaIntegracoes();

    expect(anthropicService.parseStructured).toHaveBeenCalled();
    expect(evolutionApi.enviarMensagem).toHaveBeenCalledWith(expect.anything(), '+5511900000000', 'Seu pedido foi aprovado!');
  });

  it('não reenvia quando já existe uma execução done com a mesma chave de idempotência', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoIntegracaoPura]);
    (prisma.execucaoDeEtapa.findFirst as jest.Mock).mockResolvedValue({ id: 'exec-antiga', output: { texto: 'x', messageId: 'msg-0' } });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine, evolutionApi, config);

    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).not.toHaveBeenCalled();
    expect(engine.avancar).toHaveBeenCalledWith('inst-1', 'e-6');
  });

  it('marca falha e instância em erro quando não há telefone de destino nem na instância nem na integração', async () => {
    const { prisma, anthropicService, engine, evolutionApi, config } = buildDeps();
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([execucaoIntegracaoPura]);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue({ ...integracaoSalva, phone: null });
    const worker = new OrquestradorFilaWorker(prisma, anthropicService, engine, evolutionApi, config);

    await worker.processarFilaIntegracoes();

    expect(evolutionApi.enviarMensagem).not.toHaveBeenCalled();
    expect(prisma.instanciaDeProcesso.update).toHaveBeenCalledWith({ where: { id: 'inst-1' }, data: { status: 'erro' } });
  });
});
```

Adicionar os imports necessários ao topo do arquivo de teste:

```typescript
import type { ConfigService } from '@nestjs/config';
import { criptografar } from '../fonte-de-dados/crypto';
import type { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- orquestrador-fila.worker.spec.ts`
Expected: FAIL — `processarFilaIntegracoes` ainda não existe, construtor com aridade errada

- [ ] **Step 3: Adicionar `processarFilaIntegracoes` a `orquestrador-fila.worker.ts`**

Ajustar os imports e o construtor no topo do arquivo:

```typescript
import { ConfigService } from '@nestjs/config';
import { descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';
import { z } from 'zod';
```

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicService: AnthropicService,
    private readonly engine: OrquestradorEngineService,
    private readonly evolutionApi: EvolutionApiAdapterService,
    private readonly config: ConfigService,
  ) {}
```

Adicionar o tipo e os métodos (depois de `processarExecucaoDeAgente`/`montarEntrada`):

```typescript
type ExecucaoDeIntegracao = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null };
};
```

```typescript
  @Interval(5000)
  async processarFilaIntegracoes(): Promise<void> {
    const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
      where: { status: 'pending', ator: 'integracao' },
      orderBy: { criadoEm: 'asc' },
      take: 5,
      include: { instancia: true, etapa: { include: { agente: true } } },
    })) as ExecucaoDeIntegracao[];

    for (const execucao of pendentes) {
      try {
        await this.processarExecucaoDeIntegracao(execucao);
      } catch (erro) {
        this.logger.error(`Falha ao processar execução de integração ${execucao.id}`, erro);
        await this.prisma.execucaoDeEtapa.update({
          where: { id: execucao.id },
          data: { status: 'failed', mensagemErro: String(erro), concluidoEm: new Date() },
        });
        await this.prisma.instanciaDeProcesso.update({
          where: { id: execucao.instanciaId },
          data: { status: 'erro' },
        });
      }
    }
  }

  private async processarExecucaoDeIntegracao(execucao: ExecucaoDeIntegracao): Promise<void> {
    await this.prisma.execucaoDeEtapa.update({ where: { id: execucao.id }, data: { status: 'processing' } });

    const jaEnviada = await this.prisma.execucaoDeEtapa.findFirst({
      where: { chaveIdempotencia: execucao.chaveIdempotencia, status: 'done', id: { not: execucao.id } },
    });
    if (jaEnviada) {
      await this.prisma.execucaoDeEtapa.update({
        where: { id: execucao.id },
        data: { status: 'done', output: jaEnviada.output as Prisma.InputJsonValue, concluidoEm: new Date() },
      });
      await this.engine.avancar(execucao.instanciaId, execucao.etapaId);
      return;
    }

    const { etapa, instancia } = execucao;
    const integracao = await this.prisma.integracaoWhatsApp.findUnique({ where: { empresaId: instancia.empresaId } });
    if (!integracao) throw new Error('Empresa não tem integração de WhatsApp configurada');

    const texto = await this.montarTextoDaMensagem(etapa, instancia);
    const telefone = ((instancia.dadosAcumulados as Record<string, unknown>).telefone as string | undefined) ?? integracao.phone;
    if (!telefone) throw new Error('Nenhum telefone de destino disponível (nem em dadosAcumulados.telefone, nem na integração)');

    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const resultado = await this.evolutionApi.enviarMensagem(
      { apiUrl: integracao.apiUrl, instanceName: integracao.instanceName, apiKey: descriptografar(integracao.apiKeyCriptografada, chave) },
      telefone,
      texto,
    );

    await this.prisma.execucaoDeEtapa.update({
      where: { id: execucao.id },
      data: { status: 'done', output: { texto, messageId: resultado.messageId } as Prisma.InputJsonValue, concluidoEm: new Date() },
    });
    await this.engine.avancar(instancia.id, etapa.id);
  }

  private async montarTextoDaMensagem(etapa: Etapa & { agente: Agente | null }, instancia: InstanciaDeProcesso): Promise<string> {
    if (etapa.executor !== 'agente_mais_integracao' || !etapa.agente) {
      return 'Atualização do seu processo no CorePilot.';
    }
    const resposta = await this.anthropicService.parseStructured({
      system: `Você é o agente "${etapa.agente.nome}". Redija uma mensagem de WhatsApp curta e objetiva pro destinatário, com base nos dados do processo.`,
      mensagem: JSON.stringify(instancia.dadosAcumulados),
      model: etapa.agente.modeloIA,
      maxTokens: 1024,
      schema: z.object({ mensagem: z.string() }),
    });
    return resposta.parsed_output?.mensagem ?? 'Atualização do seu processo no CorePilot.';
  }
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- orquestrador-fila.worker.spec.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Registrar `IntegracaoWhatsAppModule` como dependência**

Editar `backend/src/orquestrador/orquestrador.module.ts`:

```typescript
import { IntegracaoWhatsAppModule } from '../integracao-whatsapp/integracao-whatsapp.module';
// ...
@Module({
  imports: [AuthModule, AuditModule, ModuloModule, AnthropicModule, IntegracaoWhatsAppModule],
  // ...resto sem mudança
})
export class OrquestradorModule {}
```

- [ ] **Step 6: Rodar a suíte completa e o build**

Run: `npm test`
Run: `npm run build`
Expected: tudo passa

- [ ] **Step 7: Commit**

```bash
git add backend/src/orquestrador
git commit -m "feat(backend): etapa de integração no worker (envio WhatsApp + idempotência)"
```

---

## Task 11: e2e do motor completo (backend, sem UI)

**Files:**
- Create: `backend/test/orquestrador.e2e-spec.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: todas as rotas das Tasks 3–10, `createTestUser`/`deleteTestUser`/
  `signInTestUser`/`provisionUsuarioParaEmpresa` (helpers já existentes das Fases
  1/4).

Segue exatamente o padrão de `backend/test/fonte-de-dados.e2e-spec.ts`: hard-requer
`.env.local` (DB real, `ANTHROPIC_API_KEY` real), cria empresas/usuários throwaway via
Supabase Admin API, e limpa tudo em `afterAll`. O bloco que testa o envio real de
WhatsApp só roda se `EVOLUTION_TEST_*` estiver configurado — mesmo padrão do TOTVS RM
da Fase 4 (`TEM_CREDENCIAIS_RM_DE_TESTE`).

Como o worker roda em `@Interval(5000)`, este teste precisa de um `jest.setTimeout`
maior e de um polling helper que aguarda a instância chegar numa etapa esperada.

- [ ] **Step 1: Adicionar as variáveis opcionais a `backend/.env.example`**

```
# Opcional — só necessário para o bloco do e2e da Fase 5 que testa o envio real de
# WhatsApp via Evolution API (backend/test/orquestrador.e2e-spec.ts). Sem essas
# variáveis, esse bloco do teste pula automaticamente (mesmo padrão do TOTVS RM da
# Fase 4).
# EVOLUTION_TEST_API_URL=https://evolution.suaempresa.com
# EVOLUTION_TEST_INSTANCE_NAME=corepilot-teste
# EVOLUTION_TEST_API_KEY=chave-de-teste
# EVOLUTION_TEST_PHONE=+5511999999999
```

- [ ] **Step 2: Escrever o teste**

Criar `backend/test/orquestrador.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestUser, deleteTestUser, signInTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(60000);

const TEM_CREDENCIAIS_EVOLUTION_DE_TESTE = Boolean(
  process.env.EVOLUTION_TEST_API_URL &&
    process.env.EVOLUTION_TEST_INSTANCE_NAME &&
    process.env.EVOLUTION_TEST_API_KEY &&
    process.env.EVOLUTION_TEST_PHONE,
);

describe('Orquestrador BPM (motor de ponta a ponta + isolamento entre tenants)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const authUserIdsParaLimpar: string[] = [];
  const empresaIdsParaLimpar: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma.execucaoDeEtapa.deleteMany({ where: { instancia: { empresaId: { in: empresaIdsParaLimpar } } } });
      await prisma.instanciaDeProcesso.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
      await prisma.etapa.deleteMany({ where: { fluxo: { modulo: { empresaId: { in: empresaIdsParaLimpar } } } } });
      await prisma.macroetapa.deleteMany({ where: { fluxo: { modulo: { empresaId: { in: empresaIdsParaLimpar } } } } });
      await prisma.fluxo.deleteMany({ where: { modulo: { empresaId: { in: empresaIdsParaLimpar } } } });
      await prisma.integracaoWhatsApp.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
      await prisma.skill.deleteMany({ where: { agente: { empresaId: { in: empresaIdsParaLimpar } } } });
      await prisma.agente.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
      await prisma.modulo.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
      await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
      await prisma.usuario.deleteMany({ where: { supabaseUserId: { in: authUserIdsParaLimpar } } });
      await prisma.empresa.deleteMany({ where: { id: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar dados de teste', erro);
    }
    await Promise.allSettled(authUserIdsParaLimpar.map((userId) => deleteTestUser(userId)));
    await app.close();
  });

  async function criarEmpresaComUsuarioLogado(nomeEmpresa: string, email: string) {
    const empresa = await prisma.empresa.create({ data: { nome: nomeEmpresa } });
    empresaIdsParaLimpar.push(empresa.id);
    const password = 'TesteFase5!23';
    const authUser = await createTestUser(email, password);
    authUserIdsParaLimpar.push(authUser.id);
    await provisionUsuarioParaEmpresa(prisma, {
      supabaseUserId: authUser.id, nome: email.split('@')[0], email, empresaId: empresa.id, perfil: 'admin',
    });
    const accessToken = await signInTestUser(email, password);
    return { empresa, accessToken };
  }

  async function aguardarEtapaAtual(accessToken: string, instanciaId: string, etapaEsperadaId: string, timeoutMs = 20000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const resposta = await request(app.getHttpServer())
        .get(`/instancias/${instanciaId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (resposta.body.instancia?.etapaAtualId === etapaEsperadaId) return resposta.body;
      if (resposta.body.instancia?.status === 'erro') {
        throw new Error(`Instância entrou em erro esperando etapa ${etapaEsperadaId}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Timeout esperando a instância chegar na etapa ${etapaEsperadaId}`);
  }

  it('roda o fluxo de Compras simplificado de ponta a ponta: automático → agente → aprovação com loop', async () => {
    const sufixo = Date.now();
    const { empresa, accessToken } = await criarEmpresaComUsuarioLogado('E2E Orquestrador', `e2e-orq-${sufixo}@corepilot.dev`);

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos').set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Compras E2E', objetivo: 'Validar o motor de orquestração' }).expect(201);
    const moduloId = moduloResposta.body.id as string;

    const agenteResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/agentes`).set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Agente de Compras', funcao: 'Comprador IA', objetivo: 'Agrupar solicitações de compra' }).expect(201);
    const agenteId = agenteResposta.body.id as string;

    const skillResposta = await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`).set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Agrupar solicitações', objetivo: 'Agrupa itens por família a partir da lista recebida', camposSaida: [{ nome: 'resumo', tipo: 'string', obrigatorio: true }] })
      .expect(201);
    const skillId = skillResposta.body.id as string;

    const fluxoResposta = await request(app.getHttpServer())
      .get(`/modulos/${moduloId}/fluxo`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    const fluxoId = fluxoResposta.body.id as string;
    const macroetapaId = fluxoResposta.body.macroetapas[0]?.id
      ?? (await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/macroetapas`).set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Em andamento' }).expect(201)).body.id as string;

    const etapa1 = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`).set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Solicitação recebida', tipo: 'decisao_automatica', macroetapaId }).expect(201);
    const etapa2 = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`).set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'IA confere e agrupa', tipo: 'tarefa_agente', macroetapaId }).expect(201);
    await request(app.getHttpServer())
      .patch(`/modulos/${moduloId}/fluxo/etapas/${etapa2.body.id}`).set('Authorization', `Bearer ${accessToken}`)
      .send({ agenteId, skillId }).expect(200);
    const etapa3 = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`).set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Comprador aprova', tipo: 'aprovacao', macroetapaId }).expect(201);
    await request(app.getHttpServer())
      .patch(`/modulos/${moduloId}/fluxo/etapas/${etapa3.body.id}`).set('Authorization', `Bearer ${accessToken}`)
      .send({ aprovadores: ['Comprador'], loopParaEtapaId: etapa2.body.id }).expect(200);

    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/publicar`).set('Authorization', `Bearer ${accessToken}`).expect(201);

    const auditoriaPublicacao = await prisma.auditLog.findFirst({ where: { empresaId: empresa.id, acao: 'fluxo_publicado' } });
    expect(auditoriaPublicacao).not.toBeNull();

    const instanciaResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/instancias`).set('Authorization', `Bearer ${accessToken}`)
      .send({ dadosIniciais: { itens: ['parafuso M6', 'porca M6'] } }).expect(201);
    const instanciaId = instanciaResposta.body.id as string;

    // Etapa 1 (automática) conclui na hora, etapa 2 (agente) processa no próximo ciclo do worker.
    await aguardarEtapaAtual(accessToken, instanciaId, etapa3.body.id);

    // Loop: solicitar ajustes volta pra etapa 2, que reprocessa (novo numeroDaExecucao) e volta pra etapa 3.
    await request(app.getHttpServer())
      .post(`/instancias/${instanciaId}/acoes`).set('Authorization', `Bearer ${accessToken}`)
      .send({ acaoId: 'solicitar_ajustes', dados: { motivo_correcao: 'agrupar por fornecedor também' } }).expect(201);
    await aguardarEtapaAtual(accessToken, instanciaId, etapa3.body.id);

    const execucoesDaEtapa2 = await prisma.execucaoDeEtapa.findMany({ where: { etapaId: etapa2.body.id }, orderBy: { numeroDaExecucao: 'asc' } });
    expect(execucoesDaEtapa2).toHaveLength(2);
    expect(execucoesDaEtapa2[1].chaveIdempotencia).not.toBe(execucoesDaEtapa2[0].chaveIdempotencia);

    const finalResposta = await request(app.getHttpServer())
      .post(`/instancias/${instanciaId}/acoes`).set('Authorization', `Bearer ${accessToken}`)
      .send({ acaoId: 'aprovar' }).expect(201);
    expect(finalResposta.body.status).toBe('concluido');

    const auditoriaAcao = await prisma.auditLog.findFirst({ where: { empresaId: empresa.id, acao: 'etapa_acao_executada' } });
    expect(auditoriaAcao).not.toBeNull();

    // Isolamento: outra empresa não consegue ver a instância desta.
    const outra = await criarEmpresaComUsuarioLogado('E2E Orquestrador Outra Empresa', `e2e-orq-outra-${sufixo}@corepilot.dev`);
    await request(app.getHttpServer())
      .get(`/instancias/${instanciaId}`).set('Authorization', `Bearer ${outra.accessToken}`).expect(404);
  });

  (TEM_CREDENCIAIS_EVOLUTION_DE_TESTE ? it : it.skip)(
    'envia uma mensagem WhatsApp real via Evolution API numa etapa de integração, sem reenviar em caso de reprocessamento',
    async () => {
      const sufixo = Date.now();
      const { empresa, accessToken } = await criarEmpresaComUsuarioLogado('E2E Orquestrador WhatsApp', `e2e-orq-wa-${sufixo}@corepilot.dev`);

      await request(app.getHttpServer())
        .post('/empresas/atual/integracao-whatsapp').set('Authorization', `Bearer ${accessToken}`)
        .send({
          apiUrl: process.env.EVOLUTION_TEST_API_URL,
          instanceName: process.env.EVOLUTION_TEST_INSTANCE_NAME,
          apiKey: process.env.EVOLUTION_TEST_API_KEY,
          phone: process.env.EVOLUTION_TEST_PHONE,
        }).expect(201);

      const moduloResposta = await request(app.getHttpServer())
        .post('/modulos').set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Notificações E2E', objetivo: 'Validar envio de WhatsApp' }).expect(201);
      const moduloId = moduloResposta.body.id as string;

      const fluxoResposta = await request(app.getHttpServer())
        .get(`/modulos/${moduloId}/fluxo`).set('Authorization', `Bearer ${accessToken}`).expect(200);
      const macroetapaId = (await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/macroetapas`).set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Único' }).expect(201)).body.id as string;
      void fluxoResposta;

      await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/etapas`).set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Início', tipo: 'decisao_automatica', macroetapaId }).expect(201);
      const etapaIntegracao = await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/etapas`).set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Notificar', tipo: 'integracao', macroetapaId }).expect(201);

      await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/publicar`).set('Authorization', `Bearer ${accessToken}`).expect(201);

      const instanciaResposta = await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/instancias`).set('Authorization', `Bearer ${accessToken}`)
        .send({ dadosIniciais: {} }).expect(201);
      const instanciaId = instanciaResposta.body.id as string;

      await new Promise((r) => setTimeout(r, 15000)); // dois ciclos do worker (etapa automática + integração)

      const execucaoIntegracao = await prisma.execucaoDeEtapa.findFirst({ where: { etapaId: etapaIntegracao.body.id } });
      expect(execucaoIntegracao?.status).toBe('done');
      expect((execucaoIntegracao?.output as { messageId?: string } | null)?.messageId).toBeTruthy();

      void empresa;
    },
  );
});
```

- [ ] **Step 3: Rodar o e2e**

Run: `npm run test:e2e -- orquestrador.e2e-spec.ts`
Expected: PASS no primeiro teste (motor completo); o segundo (WhatsApp) pula
automaticamente sem `EVOLUTION_TEST_*` configurado no `.env.local`, ou passa se
estiver.

- [ ] **Step 4: Commit**

```bash
git add backend/test/orquestrador.e2e-spec.ts backend/.env.example
git commit -m "test(backend): e2e do motor de orquestração de ponta a ponta com isolamento de tenant"
```

---

## Task 12: Frontend — types e `orquestrador/api.ts`

**Files:**
- Create: `frontend/src/corepilot/orquestrador/types.ts`
- Create: `frontend/src/corepilot/orquestrador/api.ts`

**Interfaces:**
- Produces: tipos `Fluxo`/`Macroetapa`/`Etapa`/`InstanciaDeProcesso`/
  `ExecucaoDeEtapa`/`AcaoEtapa`/`InstanciaDetalhe`/`IntegracaoWhatsApp`/
  `CustomFieldEtapa`/`TableColumn`; funções `obterFluxo`, `criarMacroetapa`,
  `atualizarMacroetapa`, `excluirMacroetapa`, `criarEtapa`, `atualizarEtapa`,
  `excluirEtapa`, `publicarFluxo`, `criarInstancia`, `listarInstancias`,
  `detalharInstancia`, `executarAcao`, `obterIntegracaoWhatsApp`,
  `salvarIntegracaoWhatsApp`, `testarIntegracaoWhatsApp` (**todas usadas pelas Tasks
  13, 16 e 17**). Espelha exatamente o formato de resposta dos endpoints das Tasks
  3–10 — sem `apiKeyCriptografada` em `IntegracaoWhatsApp` (nunca devolvida pelo
  backend).

- [ ] **Step 1: Criar `types.ts`**

```typescript
export type TipoEtapa = 'tarefa_agente' | 'interacao_usuario' | 'aprovacao' | 'decisao_automatica' | 'integracao' | 'espera';
export type ExecutorEtapa = 'agente' | 'usuario' | 'agente_mais_usuario' | 'integracao' | 'agente_mais_integracao' | 'automatico';

export type TipoCampoEtapa =
  | 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'attachment'
  | 'entity-reference' | 'table' | 'reference-table' | 'summary';

export interface TableColumn {
  id: string;
  label: string;
  tipo: 'text' | 'checkbox' | 'date' | 'datetime' | 'number' | 'select' | 'calculated';
  calc?: { operation: 'multiply' | 'add' | 'subtract' | 'divide'; column1Id: string; column2Id: string; format?: string };
}

export interface CustomFieldEtapa {
  id: string;
  label: string;
  required: boolean;
  tipo: TipoCampoEtapa;
  placeholder?: string;
  options?: { label: string; value: string }[];
  maxFiles?: number;
  acceptedTypes?: string;
  entityType?: string;
  consultaParametrizadaId?: string;
  tableColumns?: TableColumn[];
  referenceConfig?: { referenceStepId: string; referenceFieldId: string; allowMultiplePerItem: boolean; additionalColumns: TableColumn[] };
  summaryConfig?: { sourceTableFieldId: string; sourceColumnId: string; operation: 'sum' | 'average' | 'count' | 'min' | 'max'; format?: string };
}

export interface Macroetapa {
  id: string;
  fluxoId: string;
  nome: string;
  ordem: number;
}

export interface Etapa {
  id: string;
  fluxoId: string;
  macroetapaId: string;
  ordem: number;
  nome: string;
  tipo: TipoEtapa;
  executor: ExecutorEtapa;
  prazoDias: number | null;
  agenteId: string | null;
  skillId: string | null;
  autonomia: string | null;
  aprovadores: string[];
  loopParaEtapaId: string | null;
  entradaRefs: string[];
  camposUsuario: CustomFieldEtapa[];
}

export interface Fluxo {
  id: string;
  moduloId: string;
  versao: number;
  publicado: boolean;
  macroetapas: Macroetapa[];
  etapas: Etapa[];
}

export type StatusInstancia = 'em_andamento' | 'concluido' | 'erro';

export interface InstanciaDeProcesso {
  id: string;
  fluxoId: string;
  moduloId: string;
  empresaId: string;
  etapaAtualId: string;
  status: StatusInstancia;
  dadosAcumulados: Record<string, unknown>;
  criadoEm: string;
  atualizadoEm: string;
}

export type StatusExecucao = 'pending' | 'processing' | 'done' | 'failed';
export type AtorExecucao = 'agente' | 'usuario' | 'integracao' | 'automatico';

export interface ExecucaoDeEtapa {
  id: string;
  instanciaId: string;
  etapaId: string;
  numeroDaExecucao: number;
  ator: AtorExecucao;
  atorUsuarioId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: StatusExecucao;
  mensagemErro: string | null;
  criadoEm: string;
  concluidoEm: string | null;
}

export interface AcaoEtapa {
  id: string;
  label: string;
  etapaDestinoId: string | null;
  exigeCampo?: { key: string; label: string; obrigatorio: boolean };
  estilo: 'primario' | 'secundario' | 'perigo';
}

export interface InstanciaDetalhe {
  instancia: InstanciaDeProcesso;
  etapaAtual: Etapa;
  acoes: AcaoEtapa[];
  historico: ExecucaoDeEtapa[];
}

export interface IntegracaoWhatsApp {
  id: string;
  empresaId: string;
  apiUrl: string;
  instanceName: string;
  phone: string | null;
  ultimoTesteEm: string | null;
  ultimoTesteSucesso: boolean | null;
  ultimaMensagemErro: string | null;
}
```

- [ ] **Step 2: Criar `api.ts`**

```typescript
import { apiFetch } from '../api/apiFetch';
import type {
  AcaoEtapa, CustomFieldEtapa, Etapa, ExecutorEtapa, Fluxo, InstanciaDeProcesso,
  InstanciaDetalhe, IntegracaoWhatsApp, Macroetapa, TipoEtapa,
} from './types';

export async function obterFluxo(accessToken: string, moduloId: string): Promise<Fluxo> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo`, accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar o fluxo (status ${response.status})`);
  return (await response.json()) as Fluxo;
}

export async function criarMacroetapa(accessToken: string, moduloId: string, nome: string): Promise<Macroetapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao criar coluna (status ${response.status})`);
  return (await response.json()) as Macroetapa;
}

export async function atualizarMacroetapa(accessToken: string, moduloId: string, macroetapaId: string, nome: string): Promise<Macroetapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas/${macroetapaId}`, accessToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao renomear coluna (status ${response.status})`);
  return (await response.json()) as Macroetapa;
}

export async function excluirMacroetapa(accessToken: string, moduloId: string, macroetapaId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas/${macroetapaId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao excluir coluna (status ${response.status})`);
}

export interface CriarEtapaDto {
  nome: string;
  tipo: TipoEtapa;
  macroetapaId: string;
  executor?: ExecutorEtapa;
}

export async function criarEtapa(accessToken: string, moduloId: string, dto: CriarEtapaDto): Promise<Etapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar etapa (status ${response.status})`);
  return (await response.json()) as Etapa;
}

export interface AtualizarEtapaDto {
  nome?: string;
  tipo?: TipoEtapa;
  executor?: ExecutorEtapa;
  macroetapaId?: string;
  prazoDias?: number | null;
  agenteId?: string | null;
  skillId?: string | null;
  autonomia?: string | null;
  aprovadores?: string[];
  loopParaEtapaId?: string | null;
  entradaRefs?: string[];
  camposUsuario?: CustomFieldEtapa[];
}

export async function atualizarEtapa(accessToken: string, moduloId: string, etapaId: string, dto: AtualizarEtapaDto): Promise<Etapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas/${etapaId}`, accessToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar etapa (status ${response.status})`);
  return (await response.json()) as Etapa;
}

export async function excluirEtapa(accessToken: string, moduloId: string, etapaId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas/${etapaId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao excluir etapa (status ${response.status})`);
}

export async function publicarFluxo(accessToken: string, moduloId: string): Promise<Fluxo> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/publicar`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao publicar o fluxo (status ${response.status})`);
  return (await response.json()) as Fluxo;
}

export async function criarInstancia(accessToken: string, moduloId: string, dadosIniciais: Record<string, unknown>): Promise<InstanciaDeProcesso> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/instancias`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dadosIniciais }),
  });
  if (!response.ok) throw new Error(`Falha ao criar instância (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso;
}

export async function listarInstancias(accessToken: string, moduloId: string): Promise<InstanciaDeProcesso[]> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/instancias`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar instâncias (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso[];
}

export async function detalharInstancia(accessToken: string, instanciaId: string): Promise<InstanciaDetalhe> {
  const response = await apiFetch(`/instancias/${instanciaId}`, accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar instância (status ${response.status})`);
  return (await response.json()) as InstanciaDetalhe;
}

export async function executarAcao(
  accessToken: string,
  instanciaId: string,
  acaoId: string,
  dados: Record<string, unknown> = {},
): Promise<InstanciaDeProcesso> {
  const response = await apiFetch(`/instancias/${instanciaId}/acoes`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acaoId, dados }),
  });
  if (!response.ok) throw new Error(`Falha ao executar ação (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso;
}

export async function obterIntegracaoWhatsApp(accessToken: string): Promise<IntegracaoWhatsApp | null> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp', accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp | null;
}

export interface SalvarIntegracaoWhatsAppDto {
  apiUrl: string;
  instanceName: string;
  apiKey?: string;
  phone?: string;
}

export async function salvarIntegracaoWhatsApp(accessToken: string, dto: SalvarIntegracaoWhatsAppDto): Promise<IntegracaoWhatsApp> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp', accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao salvar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp;
}

export async function testarIntegracaoWhatsApp(accessToken: string): Promise<IntegracaoWhatsApp> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp/testar', accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao testar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp;
}

export type { AcaoEtapa };
```

- [ ] **Step 3: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros (arquivos ainda não são importados por nada, mas precisam
compilar isoladamente)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/corepilot/orquestrador
git commit -m "feat(frontend): types e cliente de API do Orquestrador"
```

---

## Task 13: Frontend — `useCorePilotState` wiring real do builder

**Files:**
- Modify: `frontend/src/corepilot/initialState.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`

**Interfaces:**
- Consumes: tudo de `orquestrador/api.ts` e `orquestrador/types.ts` (Task 12).
- Produces: campos de estado `moduloFluxo`, `fluxoLoading`,
  `orchestratorSelectedEtapaId`, `orchestratorNovaMacroetapaAberta/Nome`,
  `orchestratorNewApprover`, `orchestratorNewFieldLabel/Type/Required`,
  `moduloInstancias`, `instanciasLoading`, `instanciaDetalhe`,
  `instanciaDetalheLoading`, `cardActionPrompt`, `integracaoWhatsApp`; actions
  `carregarFluxoDoModulo`, `selecionarEtapaOrquestrador`, `fecharPainelOrquestrador`,
  `toggleNovaMacroetapaForm`, `updateNovaMacroetapaNome`, `criarMacroetapaReal`,
  `criarEtapaOrquestradorReal`, `atualizarEtapaOrquestradorReal`,
  `excluirEtapaOrquestradorSelecionada`, `adicionarAprovadorSelecionado`,
  `removerAprovadorSelecionado`, `adicionarCampoUsuarioSelecionado`,
  `removerCampoUsuarioSelecionado`, `toggleEntradaRefSelecionada`,
  `publicarFluxoReal` (**todas usadas pela Task 14, `Step5Orchestrator`**), mais
  `carregarInstanciasDoModulo`, `carregarDetalheInstancia`, `abrirCardInstancia`,
  `fecharCardInstancia`, `iniciarAcaoInstancia`, `confirmarAcaoInstancia`,
  `cancelarAcaoInstancia` (**usadas pelas Tasks 16/17**).

- [ ] **Step 1: Adicionar os campos de estado a `initialState.ts`**

Adicionar o import no topo:

```typescript
import type { AcaoEtapa, Fluxo, InstanciaDeProcesso, InstanciaDetalhe, IntegracaoWhatsApp, TipoCampoEtapa } from './orquestrador/types';
```

Adicionar à interface `CorePilotState`, depois do bloco `moduloConsultas`/`resultadosTesteConsulta` (Fase 4):

```typescript
  moduloFluxo: Fluxo | null;
  fluxoLoading: boolean;
  orchestratorSelectedEtapaId: string | null;
  orchestratorNovaMacroetapaAberta: boolean;
  orchestratorNovaMacroetapaNome: string;
  orchestratorNewApprover: string;
  orchestratorNewFieldLabel: string;
  orchestratorNewFieldType: TipoCampoEtapa;
  orchestratorNewFieldRequired: boolean;

  moduloInstancias: InstanciaDeProcesso[];
  instanciasLoading: boolean;
  instanciaDetalhe: InstanciaDetalhe | null;
  instanciaDetalheLoading: boolean;
  cardActionPrompt: { acao: AcaoEtapa; valor: string } | null;

  integracaoWhatsApp: IntegracaoWhatsApp | null;
```

Adicionar a `createInitialState()`, no mesmo ponto relativo:

```typescript
    moduloFluxo: null,
    fluxoLoading: false,
    orchestratorSelectedEtapaId: null,
    orchestratorNovaMacroetapaAberta: false,
    orchestratorNovaMacroetapaNome: '',
    orchestratorNewApprover: '',
    orchestratorNewFieldLabel: '',
    orchestratorNewFieldType: 'text',
    orchestratorNewFieldRequired: false,

    moduloInstancias: [],
    instanciasLoading: false,
    instanciaDetalhe: null,
    instanciaDetalheLoading: false,
    cardActionPrompt: null,

    integracaoWhatsApp: null,
```

- [ ] **Step 2: Adicionar as actions a `useCorePilotState.ts`**

Adicionar os imports:

```typescript
import {
  obterFluxo, criarMacroetapa, atualizarMacroetapa as atualizarMacroetapaApi, excluirMacroetapa as excluirMacroetapaApi,
  criarEtapa, atualizarEtapa as atualizarEtapaApi, excluirEtapa as excluirEtapaApi, publicarFluxo,
  listarInstancias, detalharInstancia, executarAcao as executarAcaoApi,
  obterIntegracaoWhatsApp, salvarIntegracaoWhatsApp as salvarIntegracaoWhatsAppApi, testarIntegracaoWhatsApp as testarIntegracaoWhatsAppApi,
  type AtualizarEtapaDto,
} from './orquestrador/api';
import type { CustomFieldEtapa, TipoCampoEtapa } from './orquestrador/types';
```

Adicionar o bloco de actions (logo depois de `carregarConsultasDoModulo` e suas
vizinhas — seção "Consultas reais" — antes do bloco de chat de módulo):

```typescript
  // --- Orquestrador (Fluxo/Etapa/Instâncias) reais ---
  const carregarFluxoDoModulo = async (moduloId: string) => {
    update({ fluxoLoading: true });
    try {
      const fluxo = await obterFluxo(accessToken, moduloId);
      update({ fluxoLoading: false, moduloFluxo: fluxo });
    } catch (err) {
      update({ fluxoLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar o fluxo' });
    }
  };

  const selecionarEtapaOrquestrador = (etapaId: string) => update({ orchestratorSelectedEtapaId: etapaId });
  const fecharPainelOrquestrador = () => update({ orchestratorSelectedEtapaId: null });

  const toggleNovaMacroetapaForm = () => update((s) => ({
    orchestratorNovaMacroetapaAberta: !s.orchestratorNovaMacroetapaAberta,
    orchestratorNovaMacroetapaNome: '',
  }));
  const updateNovaMacroetapaNome = (e: ChangeEvent<HTMLInputElement>) => update({ orchestratorNovaMacroetapaNome: e.target.value });
  const criarMacroetapaReal = async (): Promise<string | null> => {
    const moduloId = state.currentModuloId;
    const nome = state.orchestratorNovaMacroetapaNome.trim();
    if (!moduloId || !nome || !state.moduloFluxo) return null;
    try {
      const macroetapa = await criarMacroetapa(accessToken, moduloId, nome);
      update((s) => ({
        moduloFluxo: s.moduloFluxo ? { ...s.moduloFluxo, macroetapas: [...s.moduloFluxo.macroetapas, macroetapa] } : s.moduloFluxo,
        orchestratorNovaMacroetapaAberta: false,
        orchestratorNovaMacroetapaNome: '',
      }));
      return macroetapa.id;
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao criar coluna' });
      return null;
    }
  };

  const criarEtapaOrquestradorReal = async () => {
    const moduloId = state.currentModuloId;
    const fluxo = state.moduloFluxo;
    if (!moduloId || !fluxo) return;
    const macroetapaId = fluxo.macroetapas[0]?.id;
    if (!macroetapaId) {
      update({ wizardError: 'Crie pelo menos uma coluna do Kanban antes de adicionar uma etapa.' });
      return;
    }
    try {
      const etapa = await criarEtapa(accessToken, moduloId, { nome: 'Nova etapa', tipo: 'tarefa_agente', macroetapaId });
      update((s) => ({
        moduloFluxo: s.moduloFluxo ? { ...s.moduloFluxo, etapas: [...s.moduloFluxo.etapas, etapa] } : s.moduloFluxo,
        orchestratorSelectedEtapaId: etapa.id,
      }));
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao criar etapa' });
    }
  };

  const atualizarEtapaOrquestradorReal = async (etapaId: string, patch: AtualizarEtapaDto) => {
    const moduloId = state.currentModuloId;
    if (!moduloId) return;
    try {
      const etapa = await atualizarEtapaApi(accessToken, moduloId, etapaId, patch);
      update((s) => ({
        moduloFluxo: s.moduloFluxo
          ? { ...s.moduloFluxo, etapas: s.moduloFluxo.etapas.map((e) => (e.id === etapaId ? etapa : e)) }
          : s.moduloFluxo,
      }));
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao atualizar etapa' });
    }
  };

  const excluirEtapaOrquestradorReal = async (etapaId: string) => {
    const moduloId = state.currentModuloId;
    if (!moduloId) return;
    try {
      await excluirEtapaApi(accessToken, moduloId, etapaId);
      update((s) => ({
        moduloFluxo: s.moduloFluxo
          ? {
              ...s.moduloFluxo,
              etapas: s.moduloFluxo.etapas
                .filter((e) => e.id !== etapaId)
                .map((e) => (e.loopParaEtapaId === etapaId ? { ...e, loopParaEtapaId: null } : e)),
            }
          : s.moduloFluxo,
        orchestratorSelectedEtapaId: s.orchestratorSelectedEtapaId === etapaId ? null : s.orchestratorSelectedEtapaId,
      }));
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao excluir etapa' });
    }
  };
  const excluirEtapaOrquestradorSelecionada = () => {
    if (state.orchestratorSelectedEtapaId) void excluirEtapaOrquestradorReal(state.orchestratorSelectedEtapaId);
  };

  const updateOrchestratorNewApprover = (e: ChangeEvent<HTMLInputElement>) => update({ orchestratorNewApprover: e.target.value });
  const adicionarAprovadorSelecionado = () => {
    const etapaId = state.orchestratorSelectedEtapaId;
    const etapa = state.moduloFluxo?.etapas.find((e) => e.id === etapaId);
    const nome = state.orchestratorNewApprover.trim();
    if (!etapaId || !etapa || !nome) return;
    void atualizarEtapaOrquestradorReal(etapaId, { aprovadores: [...etapa.aprovadores, nome] });
    update({ orchestratorNewApprover: '' });
  };
  const removerAprovadorSelecionado = (nome: string) => {
    const etapaId = state.orchestratorSelectedEtapaId;
    const etapa = state.moduloFluxo?.etapas.find((e) => e.id === etapaId);
    if (!etapaId || !etapa) return;
    void atualizarEtapaOrquestradorReal(etapaId, { aprovadores: etapa.aprovadores.filter((a) => a !== nome) });
  };

  const updateOrchestratorNewFieldLabel = (e: ChangeEvent<HTMLInputElement>) => update({ orchestratorNewFieldLabel: e.target.value });
  const updateOrchestratorNewFieldType = (e: ChangeEvent<HTMLSelectElement>) =>
    update({ orchestratorNewFieldType: e.target.value as TipoCampoEtapa });
  const toggleOrchestratorNewFieldRequired = () => update((s) => ({ orchestratorNewFieldRequired: !s.orchestratorNewFieldRequired }));
  const adicionarCampoUsuarioSelecionado = () => {
    const etapaId = state.orchestratorSelectedEtapaId;
    const etapa = state.moduloFluxo?.etapas.find((e) => e.id === etapaId);
    const label = state.orchestratorNewFieldLabel.trim();
    if (!etapaId || !etapa || !label) return;
    const campo: CustomFieldEtapa = {
      id: 'campo-' + Date.now(),
      label,
      required: state.orchestratorNewFieldRequired,
      tipo: state.orchestratorNewFieldType,
    };
    void atualizarEtapaOrquestradorReal(etapaId, { camposUsuario: [...etapa.camposUsuario, campo] });
    update({ orchestratorNewFieldLabel: '', orchestratorNewFieldType: 'text', orchestratorNewFieldRequired: false });
  };
  const removerCampoUsuarioSelecionado = (campoId: string) => {
    const etapaId = state.orchestratorSelectedEtapaId;
    const etapa = state.moduloFluxo?.etapas.find((e) => e.id === etapaId);
    if (!etapaId || !etapa) return;
    void atualizarEtapaOrquestradorReal(etapaId, { camposUsuario: etapa.camposUsuario.filter((c) => c.id !== campoId) });
  };
  const toggleEntradaRefSelecionada = (refEtapaId: string) => {
    const etapaId = state.orchestratorSelectedEtapaId;
    const etapa = state.moduloFluxo?.etapas.find((e) => e.id === etapaId);
    if (!etapaId || !etapa) return;
    const refs = etapa.entradaRefs.includes(refEtapaId)
      ? etapa.entradaRefs.filter((id) => id !== refEtapaId)
      : [...etapa.entradaRefs, refEtapaId];
    void atualizarEtapaOrquestradorReal(etapaId, { entradaRefs: refs });
  };

  const publicarFluxoReal = async () => {
    const moduloId = state.currentModuloId;
    if (!moduloId) return;
    update({ wizardSaving: true, wizardError: null });
    try {
      await publicarFluxo(accessToken, moduloId);
      await carregarFluxoDoModulo(moduloId);
      update({ wizardSaving: false });
      showToast('Fluxo publicado com sucesso.');
    } catch (err) {
      update({ wizardSaving: false, wizardError: err instanceof Error ? err.message : 'Erro ao publicar o fluxo' });
    }
  };

  // --- Instâncias reais (Interação/Kanban) ---
  const carregarInstanciasDoModulo = async (moduloId: string) => {
    update({ instanciasLoading: true });
    try {
      const instancias = await listarInstancias(accessToken, moduloId);
      update({ instanciasLoading: false, moduloInstancias: instancias });
    } catch (err) {
      update({ instanciasLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar instâncias' });
    }
  };

  const carregarDetalheInstancia = async (instanciaId: string) => {
    update({ instanciaDetalheLoading: true });
    try {
      const detalhe = await detalharInstancia(accessToken, instanciaId);
      update({ instanciaDetalheLoading: false, instanciaDetalhe: detalhe });
    } catch (err) {
      update({ instanciaDetalheLoading: false, wizardError: err instanceof Error ? err.message : 'Erro ao carregar instância' });
    }
  };

  const abrirCardInstancia = (instanciaId: string) => {
    update({ comprasCard: instanciaId });
    void carregarDetalheInstancia(instanciaId);
  };
  const fecharCardInstancia = () => update({ comprasCard: null, instanciaDetalhe: null, cardActionPrompt: null });

  const iniciarAcaoInstancia = (acao: AcaoEtapa) => {
    if (acao.exigeCampo) {
      update({ cardActionPrompt: { acao, valor: '' } });
      return;
    }
    void confirmarAcaoInstancia(acao, {});
  };
  const updateCardActionPromptValor = (e: ChangeEvent<HTMLTextAreaElement>) =>
    update((s) => (s.cardActionPrompt ? { cardActionPrompt: { ...s.cardActionPrompt, valor: e.target.value } } : null));
  const cancelarAcaoInstancia = () => update({ cardActionPrompt: null });
  const confirmarAcaoInstancia = async (acao: AcaoEtapa, dados: Record<string, unknown>) => {
    const instanciaId = state.comprasCard;
    if (!instanciaId) return;
    try {
      await executarAcaoApi(accessToken, instanciaId, acao.id, dados);
      update({ cardActionPrompt: null });
      await carregarDetalheInstancia(instanciaId);
      if (state.currentModuloId) await carregarInstanciasDoModulo(state.currentModuloId);
      showToast(`Ação "${acao.label}" executada.`);
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao executar ação' });
    }
  };
  const confirmarCardActionPrompt = () => {
    const prompt = state.cardActionPrompt;
    if (!prompt) return;
    if (prompt.acao.exigeCampo?.obrigatorio && !prompt.valor.trim()) return;
    void confirmarAcaoInstancia(prompt.acao, prompt.acao.exigeCampo ? { [prompt.acao.exigeCampo.key]: prompt.valor } : {});
  };

  // --- Integração WhatsApp real ---
  const carregarIntegracaoWhatsApp = async () => {
    try {
      const integracao = await obterIntegracaoWhatsApp(accessToken);
      update({ integracaoWhatsApp: integracao });
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao carregar integração de WhatsApp' });
    }
  };
  const salvarIntegracaoWhatsAppReal = async () => {
    const f = state.waForm;
    if (!f.apiUrl.trim() || !f.instanceName.trim()) return;
    try {
      const integracao = await salvarIntegracaoWhatsAppApi(accessToken, {
        apiUrl: f.apiUrl,
        instanceName: f.instanceName,
        phone: f.phone,
        ...(state.waNewKey.trim() ? { apiKey: state.waNewKey } : {}),
      });
      update({ integracaoWhatsApp: integracao, waChangingKey: false, waNewKey: '' });
      showToast('Integração de WhatsApp salva.');
    } catch (err) {
      update({ wizardError: err instanceof Error ? err.message : 'Erro ao salvar integração de WhatsApp' });
    }
  };
  const testarIntegracaoWhatsAppReal = async () => {
    update({ waConnectionState: 'testing' });
    try {
      const integracao = await testarIntegracaoWhatsAppApi(accessToken);
      update({
        integracaoWhatsApp: integracao,
        waConnectionState: integracao.ultimoTesteSucesso ? 'connected' : 'disconnected',
        waLastTestMsg: integracao.ultimoTesteSucesso ? 'Conectado com sucesso.' : (integracao.ultimaMensagemErro ?? 'Falha ao conectar.'),
      });
    } catch (err) {
      update({ waConnectionState: 'disconnected', waLastTestMsg: err instanceof Error ? err.message : 'Erro ao testar conexão' });
    }
  };
```

- [ ] **Step 3: Exportar as novas actions e resetar estado do Orquestrador em `viewWizardNew`/`editModule`**

Em `viewWizardNew`, adicionar ao objeto de `update`:

```typescript
    moduloFluxo: null, orchestratorSelectedEtapaId: null,
```

Em `editModule` (branch de módulo real, depois de `void carregarConsultasDoModulo(modulo.id);`), adicionar:

```typescript
    void carregarFluxoDoModulo(modulo.id);
```

No objeto `actions` (final do arquivo), adicionar:

```typescript
    carregarFluxoDoModulo, selecionarEtapaOrquestrador, fecharPainelOrquestrador,
    toggleNovaMacroetapaForm, updateNovaMacroetapaNome, criarMacroetapaReal,
    criarEtapaOrquestradorReal, atualizarEtapaOrquestradorReal, excluirEtapaOrquestradorSelecionada,
    updateOrchestratorNewApprover, adicionarAprovadorSelecionado, removerAprovadorSelecionado,
    updateOrchestratorNewFieldLabel, updateOrchestratorNewFieldType, toggleOrchestratorNewFieldRequired,
    adicionarCampoUsuarioSelecionado, removerCampoUsuarioSelecionado, toggleEntradaRefSelecionada,
    publicarFluxoReal,
    carregarInstanciasDoModulo, carregarDetalheInstancia, abrirCardInstancia, fecharCardInstancia,
    iniciarAcaoInstancia, updateCardActionPromptValor, cancelarAcaoInstancia, confirmarCardActionPrompt,
    carregarIntegracaoWhatsApp, salvarIntegracaoWhatsAppReal, testarIntegracaoWhatsAppReal,
```

- [ ] **Step 4: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/src/corepilot/initialState.ts frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): wiring real do estado do Orquestrador (Fluxo/Etapa/Instâncias/WhatsApp)"
```

---

## Task 14: Frontend — `Step5Orchestrator` (porta o design, renumera o Wizard)

**Files:**
- Create: `frontend/src/corepilot/views/wizard/Step5Orchestrator.tsx`
- Modify: `frontend/src/corepilot/views/wizard/Step5Permissions.tsx` → renomear para
  `Step6Permissions.tsx` (renomeando o componente `Step5Permissions` → `Step6Permissions`)
- Modify: `frontend/src/corepilot/views/wizard/Step6Review.tsx` → renomear para
  `Step7Review.tsx` (renomeando o componente `Step6Review` → `Step7Review`)
- Modify: `frontend/src/corepilot/views/wizard/Wizard.tsx`
- Modify: `frontend/src/corepilot/useCorePilotState.ts` (`nextStep`, cap de 6 → 7)

**Interfaces:**
- Consumes: tudo da Task 13 (`state.moduloFluxo`, `state.orchestratorSelectedEtapaId`,
  actions do Orquestrador), `state.moduloAgentes` (Fase 3, já carregado por
  `editModule`).

Porta o comportamento exato do `CorePilot.dc.html` (Step5): lista vertical linear
(Início → cards → Fim), painel lateral de edição, Tipo×Executor travado/filtrado, e
os quatro modos de campo por Executor (`free` / `agent_plus_free` / `agent_readonly` /
`none`) do `COREPILOT_ADENDO_CAMPOS_PERSONALIZADOS.md` — usando os componentes de
estilo já existentes (`card`, `colors`, `inputSm`, `btnDark`, `btnSecondary`,
`chipStyle`) em vez de repetir o CSS inline do arquivo `.dc.html`.

- [ ] **Step 1: Renomear os dois Steps existentes**

```bash
cd frontend/src/corepilot/views/wizard
git mv Step5Permissions.tsx Step6Permissions.tsx
git mv Step6Review.tsx Step7Review.tsx
cd ../../../../../..
```

Em `Step6Permissions.tsx`, renomear a função exportada `Step5Permissions` →
`Step6Permissions` (só a assinatura da função — corpo sem mudança).

Em `Step7Review.tsx`, renomear a função exportada `Step6Review` → `Step7Review` (só a
assinatura da função — corpo sem mudança).

- [ ] **Step 2: Criar `Step5Orchestrator.tsx`**

```typescript
import type { ChangeEvent } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { Etapa, ExecutorEtapa, TipoCampoEtapa, TipoEtapa } from '../../orquestrador/types';
import { btnDark, btnSecondary, card, chipStyle, colors, inputSm } from '../../styles';

const TYPE_EXECUTOR_MAP: Record<TipoEtapa, ExecutorEtapa[]> = {
  tarefa_agente: ['agente'],
  interacao_usuario: ['usuario'],
  aprovacao: ['usuario', 'agente_mais_usuario'],
  decisao_automatica: ['automatico'],
  integracao: ['integracao', 'agente_mais_integracao'],
  espera: ['automatico'],
};

const NODE_TYPE_META: Record<TipoEtapa, { label: string; color: string; bg: string }> = {
  tarefa_agente: { label: 'Tarefa do agente', color: '#0EA5A0', bg: '#E6F7F6' },
  interacao_usuario: { label: 'Interação do usuário', color: '#2F6FED', bg: '#EAF1FE' },
  aprovacao: { label: 'Aprovação', color: '#D97706', bg: '#FEF3E2' },
  decisao_automatica: { label: 'Decisão automática', color: '#7C4DFF', bg: '#F1ECFE' },
  integracao: { label: 'Integração', color: '#5B5FEF', bg: '#ECEDFE' },
  espera: { label: 'Espera / SLA', color: '#8A9598', bg: '#F0F2F1' },
};

const EXECUTOR_LABELS: Record<ExecutorEtapa, string> = {
  agente: 'Agente de IA',
  usuario: 'Usuário',
  agente_mais_usuario: 'Agente + usuário',
  integracao: 'Integração',
  agente_mais_integracao: 'Agente + integração',
  automatico: 'Automático',
};

const FIELD_TYPE_LABELS: Record<TipoCampoEtapa, string> = {
  text: 'Texto', number: 'Número', date: 'Data', select: 'Lista (select)', checkbox: 'Checkbox',
  attachment: 'Anexo', 'entity-reference': 'Referência a cadastro', table: 'Tabela',
  'reference-table': 'Tabela referenciada', summary: 'Resumo (calculado)',
};

function executorFieldMode(executor: ExecutorEtapa): 'free' | 'agent_plus_free' | 'agent_readonly' | 'none' {
  if (executor === 'usuario') return 'free';
  if (executor === 'agente_mais_usuario') return 'agent_plus_free';
  if (executor === 'agente') return 'agent_readonly';
  return 'none';
}

export function Step5Orchestrator({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const fluxo = state.moduloFluxo;
  const etapas = fluxo?.etapas ?? [];
  const macroetapas = fluxo?.macroetapas ?? [];
  const selecionada = etapas.find((e) => e.id === state.orchestratorSelectedEtapaId) ?? null;
  const indiceSelecionada = selecionada ? etapas.findIndex((e) => e.id === selecionada.id) : -1;
  const etapasAnteriores = indiceSelecionada > 0 ? etapas.slice(0, indiceSelecionada) : [];

  const atualizarSelecionada = (patch: Partial<Etapa>) => {
    if (!selecionada) return;
    void actions.atualizarEtapaOrquestradorReal(selecionada.id, patch);
  };

  return (
    <div style={{ ...card, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Orquestrador</h2>
          <p style={{ fontSize: 13, color: colors.textFaint, margin: 0, maxWidth: 540 }}>
            Desenhe o fluxo BPM do módulo: etapas executadas por agentes, interações do usuário, aprovações e
            integrações — em sequência, com desvios de correção quando necessário.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <span style={{ alignSelf: 'center', fontSize: 11.5, fontWeight: 700, color: fluxo?.publicado ? colors.success : colors.textFaint }}>
            {fluxo?.publicado ? `Publicado · v${fluxo.versao}` : 'Rascunho não publicado'}
          </span>
          <button onClick={() => void actions.publicarFluxoReal()} disabled={state.wizardSaving || etapas.length === 0} style={btnSecondary}>
            Publicar fluxo
          </button>
          <button onClick={() => void actions.criarEtapaOrquestradorReal()} style={btnDark}>+ Nova etapa</button>
        </div>
      </div>

      {state.wizardError && <div style={{ color: colors.danger, fontSize: 13, margin: '10px 0' }}>{state.wizardError}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '18px 0 22px', padding: '12px 14px', background: colors.bg, borderRadius: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Colunas do Kanban
        </span>
        {macroetapas.map((me) => (
          <span key={me.id} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: colors.text }}>
            {me.nome}
          </span>
        ))}
        {state.orchestratorNovaMacroetapaAberta ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <input
              type="text" placeholder="Nome da coluna" value={state.orchestratorNovaMacroetapaNome}
              onChange={actions.updateNovaMacroetapaNome} style={{ ...inputSm, width: 160 }}
            />
            <button onClick={() => void actions.criarMacroetapaReal()} style={btnDark}>Criar</button>
            <button onClick={actions.toggleNovaMacroetapaForm} style={btnSecondary}>Cancelar</button>
          </span>
        ) : (
          <span onClick={actions.toggleNovaMacroetapaForm} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: colors.teal }}>
            + Nova coluna
          </span>
        )}
      </div>

      {state.fluxoLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando fluxo…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selecionada ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E9F9F1', border: '2px solid #1E9E6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#1E9E6B' }}>
            Início
          </div>
          <div style={{ width: 2, height: 20, background: colors.border }} />

          {etapas.map((etapa, i) => {
            const meta = NODE_TYPE_META[etapa.tipo];
            const macroetapa = macroetapas.find((me) => me.id === etapa.macroetapaId);
            const loopAlvo = etapa.loopParaEtapaId ? etapas.find((e) => e.id === etapa.loopParaEtapaId) : null;
            const selecionadaAtual = etapa.id === state.orchestratorSelectedEtapaId;
            return (
              <div key={etapa.id} style={{ width: '100%', maxWidth: 460 }}>
                <div
                  onClick={() => actions.selecionarEtapaOrquestrador(etapa.id)}
                  style={{ cursor: 'pointer', background: selecionadaAtual ? meta.bg : '#fff', border: `1.5px solid ${selecionadaAtual ? meta.color : colors.border}`, borderRadius: 12, padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{etapa.nome}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <span style={{ background: meta.bg, color: meta.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {meta.label} · {EXECUTOR_LABELS[etapa.executor]}
                        </span>
                        {macroetapa && (
                          <span style={{ background: colors.bg, color: colors.textMuted, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{macroetapa.nome}</span>
                        )}
                        {!!etapa.prazoDias && (
                          <span style={{ background: colors.bg, color: colors.textMuted, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{etapa.prazoDias}d de prazo</span>
                        )}
                      </div>
                    </div>
                    <span
                      onClick={(e) => { e.stopPropagation(); actions.selecionarEtapaOrquestrador(etapa.id); actions.excluirEtapaOrquestradorSelecionada(); }}
                      title="Excluir etapa" style={{ cursor: 'pointer', color: colors.borderLight, fontSize: 16 }}
                    >
                      ×
                    </span>
                  </div>
                  {etapa.tipo === 'aprovacao' && etapa.aprovadores.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.borderLight}`, fontSize: 12, color: colors.textMuted }}>
                      Aprovadores: <b style={{ color: colors.text }}>{etapa.aprovadores.join(', ')}</b>
                    </div>
                  )}
                  {loopAlvo && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: '#FDEDE9', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: '#B3452F', fontWeight: 600 }}>
                      ↺ Se reprovado, volta para &quot;{loopAlvo.nome}&quot;
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ width: 2, height: 20, background: colors.border }} /></div>
              </div>
            );
          })}

          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FDEDE9', border: '2px solid #E8604C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#E8604C' }}>
            Fim
          </div>
        </div>

        {selecionada && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 18, position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: colors.navy }}>Editar etapa</div>
              <span onClick={actions.fecharPainelOrquestrador} style={{ cursor: 'pointer', color: colors.textFaint, fontSize: 18 }}>×</span>
            </div>

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Nome da etapa</label>
            <input type="text" value={selecionada.nome} onChange={(e: ChangeEvent<HTMLInputElement>) => atualizarSelecionada({ nome: e.target.value })} style={{ ...inputSm, width: '100%', marginBottom: 14 }} />

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Tipo de etapa</label>
            <select
              value={selecionada.tipo} style={{ ...inputSm, width: '100%', marginBottom: 14 }}
              onChange={(e) => {
                const tipo = e.target.value as TipoEtapa;
                atualizarSelecionada({ tipo, executor: TYPE_EXECUTOR_MAP[tipo][0] });
              }}
            >
              {(Object.keys(NODE_TYPE_META) as TipoEtapa[]).map((tipo) => (
                <option key={tipo} value={tipo}>{NODE_TYPE_META[tipo].label}</option>
              ))}
            </select>

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Executor</label>
            <select
              value={selecionada.executor} disabled={TYPE_EXECUTOR_MAP[selecionada.tipo].length === 1}
              onChange={(e) => atualizarSelecionada({ executor: e.target.value as ExecutorEtapa })}
              style={{ ...inputSm, width: '100%', marginBottom: 14, background: TYPE_EXECUTOR_MAP[selecionada.tipo].length === 1 ? colors.bg : '#fff' }}
            >
              {TYPE_EXECUTOR_MAP[selecionada.tipo].map((ex) => (
                <option key={ex} value={ex}>{EXECUTOR_LABELS[ex]}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Coluna do Kanban</label>
                <select value={selecionada.macroetapaId} onChange={(e) => atualizarSelecionada({ macroetapaId: e.target.value })} style={{ ...inputSm, width: '100%' }}>
                  {macroetapas.map((me) => <option key={me.id} value={me.id}>{me.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Prazo (dias)</label>
                <input type="number" min={0} value={selecionada.prazoDias ?? 0} onChange={(e) => atualizarSelecionada({ prazoDias: parseInt(e.target.value, 10) || 0 })} style={{ ...inputSm, width: '100%' }} />
              </div>
            </div>

            {(selecionada.executor === 'agente' || selecionada.executor === 'agente_mais_usuario' || selecionada.executor === 'agente_mais_integracao') && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Agente responsável</label>
                <select value={selecionada.agenteId ?? ''} onChange={(e) => atualizarSelecionada({ agenteId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Selecione…</option>
                  {state.moduloAgentes.map((ag) => <option key={ag.id} value={ag.id}>{ag.nome}</option>)}
                </select>
              </>
            )}

            {selecionada.executor === 'agente' && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Skill</label>
                <select value={selecionada.skillId ?? ''} onChange={(e) => atualizarSelecionada({ skillId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Selecione…</option>
                  {state.agenteSkills.map((sk) => <option key={sk.id} value={sk.id}>{sk.nome}</option>)}
                </select>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Autonomia</label>
                <select value={selecionada.autonomia ?? 'Executar e notificar'} onChange={(e) => atualizarSelecionada({ autonomia: e.target.value })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  {['Apenas notificar', 'Executar e notificar', 'Executar com aprovação'].map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </>
            )}

            {selecionada.tipo === 'aprovacao' && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Aprovadores</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selecionada.aprovadores.map((nome) => (
                    <span key={nome} style={chipStyle(true)}>
                      {nome} <span onClick={() => actions.removerAprovadorSelecionado(nome)} style={{ cursor: 'pointer', fontWeight: 800, marginLeft: 4 }}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <input type="text" placeholder="Nome do aprovador" value={state.orchestratorNewApprover} onChange={actions.updateOrchestratorNewApprover} style={{ ...inputSm, flex: 1 }} />
                  <button onClick={actions.adicionarAprovadorSelecionado} style={btnDark}>+</button>
                </div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Se reprovado, voltar para</label>
                <select value={selecionada.loopParaEtapaId ?? ''} onChange={(e) => atualizarSelecionada({ loopParaEtapaId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Nenhum (segue em frente)</option>
                  {etapas.filter((e) => e.id !== selecionada.id).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </>
            )}

            <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: colors.navy, marginBottom: 10 }}>Campos da etapa</div>

              {executorFieldMode(selecionada.executor) === 'agent_readonly' || executorFieldMode(selecionada.executor) === 'agent_plus_free' ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Saída (schema da Skill) · somente leitura</div>
                  <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 14 }}>Gerado a partir da Skill selecionada acima — editar lá, não aqui.</div>
                  {etapasAnteriores.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Entrada · referência a etapas anteriores</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {etapasAnteriores.map((ea) => (
                          <label key={ea.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.text, cursor: 'pointer' }}>
                            <input type="checkbox" checked={selecionada.entradaRefs.includes(ea.id)} onChange={() => actions.toggleEntradaRefSelecionada(ea.id)} />
                            {ea.nome}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : null}

              {executorFieldMode(selecionada.executor) === 'free' || executorFieldMode(selecionada.executor) === 'agent_plus_free' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {selecionada.camposUsuario.map((cf) => (
                      <div key={cf.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: colors.bg, borderRadius: 8, padding: '8px 10px' }}>
                        <div>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{cf.label}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMuted, background: colors.borderLight, borderRadius: 5, padding: '2px 6px', marginLeft: 6 }}>{FIELD_TYPE_LABELS[cf.tipo]}</span>
                          {cf.required && <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.danger, marginLeft: 6 }}>obrigatório</span>}
                        </div>
                        <span onClick={() => actions.removerCampoUsuarioSelecionado(cf.id)} style={{ cursor: 'pointer', color: colors.borderLight, fontSize: 15 }}>×</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input type="text" placeholder="Nome do campo" value={state.orchestratorNewFieldLabel} onChange={actions.updateOrchestratorNewFieldLabel} style={{ ...inputSm, flex: 1 }} />
                    <select value={state.orchestratorNewFieldType} onChange={actions.updateOrchestratorNewFieldType} style={inputSm}>
                      {(Object.keys(FIELD_TYPE_LABELS) as TipoCampoEtapa[]).map((tipo) => <option key={tipo} value={tipo}>{FIELD_TYPE_LABELS[tipo]}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={state.orchestratorNewFieldRequired} onChange={actions.toggleOrchestratorNewFieldRequired} /> Obrigatório
                    </label>
                    <button onClick={actions.adicionarCampoUsuarioSelecionado} style={btnDark}>+ Adicionar campo</button>
                  </div>
                </>
              ) : null}

              {executorFieldMode(selecionada.executor) === 'none' && (
                <div style={{ fontSize: 12, color: colors.textFaint }}>Sem builder de campo pra este executor.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={actions.excluirEtapaOrquestradorSelecionada} style={{ flex: 1, background: '#fff', color: colors.danger, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Excluir etapa</button>
              <button onClick={actions.fecharPainelOrquestrador} style={{ ...btnDark, flex: 1 }}>Concluir</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Atualizar `Wizard.tsx`**

Ajustar os imports:

```typescript
import { Step1Identity } from './Step1Identity';
import { Step2Knowledge } from './Step2Knowledge';
import { Step3DataSources } from './Step3DataSources';
import { Step4Agent } from './Step4Agent';
import { Step5Orchestrator } from './Step5Orchestrator';
import { Step6Permissions } from './Step6Permissions';
import { Step7Review } from './Step7Review';
```

Ajustar a lista de passos:

```typescript
const steps = [
  { n: 1, label: 'Identidade' },
  { n: 2, label: 'Base de conhecimento' },
  { n: 3, label: 'Fontes de dados' },
  { n: 4, label: 'Agente e instruções' },
  { n: 5, label: 'Orquestrador' },
  { n: 6, label: 'Permissões' },
  { n: 7, label: 'Revisão e publicação' },
];
```

Ajustar o corpo (renderização condicional por `wizardStep`):

```typescript
{state.wizardStep === 1 && <Step1Identity state={state} actions={actions} />}
{state.wizardStep === 2 && <Step2Knowledge state={state} actions={actions} />}
{state.wizardStep === 3 && <Step3DataSources state={state} actions={actions} />}
{state.wizardStep === 4 && <Step4Agent state={state} actions={actions} />}
{state.wizardStep === 5 && <Step5Orchestrator state={state} actions={actions} />}
{state.wizardStep === 6 && <Step6Permissions state={state} actions={actions} />}
{state.wizardStep === 7 && <Step7Review state={state} actions={actions} />}
```

E o botão "Próximo"/rodapé, que hoje verifica `state.wizardStep < 6` pra mostrar
"Próximo" (e `=== 6` pra mostrar "Publicar módulo" ou similar) — trocar todo `6` por
`7` nessas comparações (conferir também a condição `state.wizardStep === 4 &&
agenteAtual` mencionada perto do rodapé — ela não muda).

- [ ] **Step 4: Ajustar o cap de `nextStep` em `useCorePilotState.ts`**

```typescript
const nextStep = async () => {
  const precisaSalvar = state.wizardStep === 1 && state.editingModule !== 'compras' && state.editingModule !== 'financeiro';
  if (precisaSalvar) {
    const ok = await salvarModuloReal();
    if (!ok) return;
  }
  update((s) => ({ wizardStep: Math.min(7, s.wizardStep + 1) }));
};
```

- [ ] **Step 5: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add frontend/src/corepilot/views/wizard frontend/src/corepilot/useCorePilotState.ts
git commit -m "feat(frontend): Step5Orchestrator — builder do fluxo BPM no Wizard (renumera pra 7 passos)"
```

---

## Task 15: Frontend — `FieldRenderer` (os 9 tipos de campo, genérico)

**Files:**
- Create: `frontend/src/corepilot/components/orquestrador/FieldRenderer.tsx`

**Interfaces:**
- Consumes: `CustomFieldEtapa`/`TableColumn` (Task 12).
- Produces: `<FieldRenderer field={CustomFieldEtapa} valor={unknown} modo={'leitura'|'edicao'} onChange={(valor) => void}? />`
  (**usado pela Task 16**). Nunca recebe nem sabe o nome do processo/domínio que está
  renderizando — só `field.tipo` decide o componente, exatamente como
  `COREPILOT_ADENDO_TELA_INTERACAO.md` §2 especifica.

- [ ] **Step 1: Criar o componente**

```typescript
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
```

- [ ] **Step 2: Build e lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add frontend/src/corepilot/components/orquestrador/FieldRenderer.tsx
git commit -m "feat(frontend): FieldRenderer genérico (9 tipos de campo)"
```

---

## Task 16: Frontend — `TelaDeInteracao` (shell genérico + motor de ações)

**Files:**
- Modify: `backend/src/orquestrador/orquestrador-engine.service.ts`
- Modify: `backend/src/orquestrador/orquestrador-engine.service.spec.ts`
- Modify: `frontend/src/corepilot/orquestrador/types.ts`
- Create: `frontend/src/corepilot/components/orquestrador/TelaDeInteracao.tsx`

**Interfaces:**
- Consumes: `FieldRenderer` (Task 15), `state.instanciaDetalhe`/`actions.iniciarAcaoInstancia`/
  `actions.confirmarCardActionPrompt`/`actions.cancelarAcaoInstancia`/
  `actions.fecharCardInstancia` (Task 13).
- Produces: `<TelaDeInteracao state actions />` (**usado pela Task 17**).

A trilha de progresso (`COREPILOT_ADENDO_TELA_INTERACAO.md` §3.1) precisa iterar
`Fluxo.etapas` na ordem, não só o histórico — o endpoint `detalhar` (Task 7) ainda não
devolve isso. Este task estende a resposta primeiro.

- [ ] **Step 1: Estender `detalhar` pra incluir as etapas do fluxo, ordenadas**

Em `backend/src/orquestrador/orquestrador-engine.service.spec.ts`, ajustar o teste de
`detalhar` já existente implicitamente pela Task 7 (se não houver um teste explícito
de `detalhar` ainda, adicionar um):

```typescript
describe('detalhar', () => {
  it('inclui as etapas do fluxo publicado, ordenadas, além da etapa atual/ações/histórico', async () => {
    const prisma = buildPrisma();
    (prisma.instanciaDeProcesso.findFirst as jest.Mock).mockResolvedValue({ id: 'inst-1', empresaId: 'empresa-1', etapaAtualId: 'e-2', fluxoId: 'fluxo-1' });
    (prisma.etapa.findUniqueOrThrow as jest.Mock).mockResolvedValue(etapaAgente);
    (prisma.etapa.findFirst as jest.Mock).mockResolvedValue(etapaAprovacao);
    (prisma.etapa.findMany as jest.Mock).mockResolvedValue([etapaAutomatica, etapaAgente, etapaAprovacao]);
    (prisma.execucaoDeEtapa.findMany as jest.Mock).mockResolvedValue([]);
    const service = new OrquestradorEngineService(prisma);

    const detalhe = await service.detalhar('inst-1', 'empresa-1');

    expect(detalhe.etapas).toEqual([etapaAutomatica, etapaAgente, etapaAprovacao]);
  });
});
```

(Adicionar `etapa: { findMany: jest.fn() }` ao mock de `prisma.etapa` em `buildPrisma()`.)

Em `orquestrador-engine.service.ts`, ajustar o método `detalhar`:

```typescript
  async detalhar(instanciaId: string, empresaId: string) {
    const instancia = await this.prisma.instanciaDeProcesso.findFirst({ where: { id: instanciaId, empresaId } });
    if (!instancia) throw new NotFoundException('Instância não encontrada');

    const etapaAtual = await this.prisma.etapa.findUniqueOrThrow({ where: { id: instancia.etapaAtualId } });
    const proxima = await this.prisma.etapa.findFirst({ where: { fluxoId: etapaAtual.fluxoId, ordem: etapaAtual.ordem + 1 } });
    const etapas = await this.prisma.etapa.findMany({ where: { fluxoId: instancia.fluxoId }, orderBy: { ordem: 'asc' } });
    const historico = await this.prisma.execucaoDeEtapa.findMany({ where: { instanciaId }, orderBy: { criadoEm: 'asc' } });

    return {
      instancia,
      etapaAtual,
      etapas,
      acoes: calcularAcoes(etapaAtual, proxima?.id ?? null),
      historico,
    };
  }
```

Run: `npm test -- orquestrador-engine.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Espelhar no tipo do frontend**

Em `frontend/src/corepilot/orquestrador/types.ts`, adicionar `etapas: Etapa[]` a
`InstanciaDetalhe`:

```typescript
export interface InstanciaDetalhe {
  instancia: InstanciaDeProcesso;
  etapaAtual: Etapa;
  etapas: Etapa[];
  acoes: AcaoEtapa[];
  historico: ExecucaoDeEtapa[];
}
```

- [ ] **Step 3: Criar `TelaDeInteracao.tsx`**

```typescript
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';
import { FieldRenderer } from './FieldRenderer';

export function TelaDeInteracao({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const detalhe = state.instanciaDetalhe;
  if (!state.comprasCard) return null;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,74,.35)', zIndex: 60 }} onClick={actions.fecharCardInstancia} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', zIndex: 61, boxShadow: '-8px 0 30px rgba(7,54,74,.15)', overflowY: 'auto', padding: 26 }}>
        {state.instanciaDetalheLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando…</div>}

        {detalhe && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.teal }}>#{detalhe.instancia.id.slice(0, 8)}</div>
              <span style={{ cursor: 'pointer', fontSize: 18, color: colors.textFaint }} onClick={actions.fecharCardInstancia}>×</span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: colors.navy, margin: '0 0 18px' }}>{detalhe.etapaAtual.nome}</h2>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Andamento do processo</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 22 }}>
              {detalhe.etapas.map((etapa) => {
                const execucao = [...detalhe.historico].reverse().find((h) => h.etapaId === etapa.id);
                const concluida = execucao?.status === 'done';
                const atual = etapa.id === detalhe.etapaAtual.id;
                return (
                  <div key={etapa.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: concluida ? colors.success : atual ? colors.teal : colors.borderLight, flexShrink: 0, marginTop: 4 }} />
                      <span style={{ width: 1, flex: 1, background: colors.border }} />
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: atual ? 700 : 500, color: atual ? colors.navy : colors.text }}>{etapa.nome}</div>
                      {execucao?.status === 'failed' && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 2 }}>Falha — {execucao.mensagemErro}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {detalhe.instancia.status === 'erro' && (
              <div style={{ background: '#FDEDE9', color: '#B3452F', borderRadius: 10, padding: 14, fontSize: 12.5, marginBottom: 20 }}>
                Esta instância está em estado de erro numa das etapas automáticas — verifique o histórico acima.
              </div>
            )}

            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Campos</div>
            {detalhe.etapaAtual.camposUsuario.map((campo) => (
              <FieldRenderer
                key={campo.id}
                field={campo}
                valor={(detalhe.instancia.dadosAcumulados[detalhe.etapaAtual.id] as Record<string, unknown> | undefined)?.[campo.id]}
                modo="edicao"
                onChange={() => {}}
              />
            ))}
            {detalhe.etapaAtual.camposUsuario.length === 0 && (
              <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 20 }}>Nenhum campo pra preencher nesta etapa.</div>
            )}

            {detalhe.acoes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                {detalhe.acoes.map((acao) => (
                  <button
                    key={acao.id}
                    onClick={() => actions.iniciarAcaoInstancia(acao)}
                    style={{
                      background: acao.estilo === 'primario' ? colors.teal : '#fff',
                      color: acao.estilo === 'primario' ? '#fff' : acao.estilo === 'perigo' ? colors.danger : colors.navy,
                      border: acao.estilo === 'primario' ? 'none' : `1px solid ${colors.border}`,
                      borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {acao.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {state.cardActionPrompt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,74,.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: 380 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: colors.navy, marginBottom: 12 }}>{state.cardActionPrompt.acao.exigeCampo?.label}</div>
              <textarea
                rows={3} placeholder="Descreva o motivo" value={state.cardActionPrompt.valor}
                onChange={actions.updateCardActionPromptValor}
                style={{ width: '100%', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 14 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={actions.confirmarCardActionPrompt}
                  disabled={!!state.cardActionPrompt.acao.exigeCampo?.obrigatorio && !state.cardActionPrompt.valor.trim()}
                  style={{ flex: 1, background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Confirmar
                </button>
                <button onClick={actions.cancelarAcaoInstancia} style={{ flex: 1, background: '#fff', color: colors.navy, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Rodar backend, build e lint do frontend**

Run: `cd backend && npm test`
Run: `cd frontend && npm run build && npm run lint`
Expected: tudo passa

- [ ] **Step 5: Commit**

```bash
git add backend/src/orquestrador frontend/src/corepilot/orquestrador/types.ts frontend/src/corepilot/components/orquestrador/TelaDeInteracao.tsx
git commit -m "feat: TelaDeInteracao genérica (shell + motor de ações), estende detalhar com as etapas do fluxo"
```

---

## Task 17: Kanban real no módulo + integração WhatsApp real na tela de Admin

**Files:**
- Modify: `backend/src/orquestrador/orquestrador-engine.service.ts`
- Modify: `backend/src/orquestrador/orquestrador-engine.service.spec.ts`
- Modify: `frontend/src/corepilot/orquestrador/types.ts`
- Modify: `frontend/src/corepilot/orquestrador/api.ts`
- Modify: `frontend/src/corepilot/initialState.ts`
- Modify: `frontend/src/corepilot/useCorePilotState.ts`
- Create: `frontend/src/corepilot/components/orquestrador/ModuloKanban.tsx`
- Modify: `frontend/src/corepilot/views/CustomModuleView.tsx`
- Modify: `frontend/src/corepilot/views/admin/AdminSettings.tsx`

**Interfaces:**
- Consumes: `TelaDeInteracao` (Task 16), `actions.abrirCardInstancia`/
  `carregarInstanciasDoModulo` (Task 13).
- Produces: uma aba "Interação" dentro do workspace real do módulo
  (`CustomModuleView`), ao lado de "Chat" — o guia principal (§1) já define essas
  como as duas áreas de trabalho do funcionário. Conexão real de WhatsApp na tela de
  Admin (`AdminSettings.tsx`), substituindo o mock `testWaConnection`.

`listar` (Task 6/7) devolve só `InstanciaDeProcesso` puro — sem nome da etapa/coluna
atual. Como cada instância trava numa **versão** do fluxo (Global Constraints), a
etapa atual de uma instância mais antiga pode não existir mais no rascunho corrente do
builder — resolver isso exige uma consulta própria a partir do `etapaAtualId` de cada
instância, não reaproveitar `state.moduloFluxo` (que é sempre o rascunho mais recente).

- [ ] **Step 1: Enriquecer `listar` com o nome da etapa/macroetapa atual**

Adicionar ao final de `orquestrador-engine.service.spec.ts`:

```typescript
describe('listar', () => {
  it('resolve o nome da etapa e da macroetapa atuais de cada instância, mesmo de versões antigas do fluxo', async () => {
    const prisma = buildPrisma();
    (prisma.instanciaDeProcesso.findMany as jest.Mock).mockResolvedValue([{ id: 'inst-1', etapaAtualId: 'e-2' }]);
    (prisma.etapa.findMany as jest.Mock).mockResolvedValue([
      { id: 'e-2', nome: 'IA confere e agrupa', macroetapaId: 'me-1', macroetapa: { id: 'me-1', nome: 'Triagem' } },
    ]);
    const service = new OrquestradorEngineService(prisma);

    const resultado = await service.listar('modulo-1', 'empresa-1');

    expect(resultado[0]).toEqual(
      expect.objectContaining({ etapaAtualNome: 'IA confere e agrupa', macroetapaAtualId: 'me-1', macroetapaAtualNome: 'Triagem' }),
    );
  });

  it('devolve lista vazia sem consultar etapas quando não há instâncias', async () => {
    const prisma = buildPrisma();
    (prisma.instanciaDeProcesso.findMany as jest.Mock).mockResolvedValue([]);
    const service = new OrquestradorEngineService(prisma);

    const resultado = await service.listar('modulo-1', 'empresa-1');

    expect(resultado).toEqual([]);
    expect(prisma.etapa.findMany).not.toHaveBeenCalled();
  });
});
```

(Adicionar `etapa: { ...(deps já existentes), findMany: jest.fn() }` a `buildPrisma()`
se ainda não tiver — já foi adicionado na Task 16.)

Ajustar `listar` em `orquestrador-engine.service.ts`:

```typescript
  async listar(moduloId: string, empresaId: string) {
    const instancias = await this.prisma.instanciaDeProcesso.findMany({
      where: { moduloId, empresaId },
      orderBy: { criadoEm: 'desc' },
    });
    if (instancias.length === 0) return [];

    const etapaIds = [...new Set(instancias.map((i) => i.etapaAtualId))];
    const etapas = await this.prisma.etapa.findMany({
      where: { id: { in: etapaIds } },
      include: { macroetapa: true },
    });
    const etapaPorId = new Map(etapas.map((e) => [e.id, e]));

    return instancias.map((instancia) => {
      const etapa = etapaPorId.get(instancia.etapaAtualId);
      return {
        ...instancia,
        etapaAtualNome: etapa?.nome ?? '—',
        macroetapaAtualId: etapa?.macroetapaId ?? '',
        macroetapaAtualNome: etapa?.macroetapa.nome ?? '—',
      };
    });
  }
```

Run: `npm test -- orquestrador-engine.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Espelhar no frontend**

Em `frontend/src/corepilot/orquestrador/types.ts`, adicionar:

```typescript
export interface InstanciaResumo extends InstanciaDeProcesso {
  etapaAtualNome: string;
  macroetapaAtualId: string;
  macroetapaAtualNome: string;
}
```

Em `frontend/src/corepilot/orquestrador/api.ts`, ajustar a assinatura de
`listarInstancias`:

```typescript
export async function listarInstancias(accessToken: string, moduloId: string): Promise<InstanciaResumo[]> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/instancias`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar instâncias (status ${response.status})`);
  return (await response.json()) as InstanciaResumo[];
}
```

(Ajustar o import de `InstanciaDeProcesso` para incluir `InstanciaResumo` também.)

Em `frontend/src/corepilot/initialState.ts`, trocar o tipo de `moduloInstancias` pra
`InstanciaResumo[]` (import ajustado de acordo).

- [ ] **Step 3: Criar `ModuloKanban.tsx`**

```typescript
import { useEffect } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';

export function ModuloKanban({ moduloId, state, actions }: { moduloId: string; state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    void actions.carregarInstanciasDoModulo(moduloId);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [moduloId]);

  const colunas: { nome: string; instancias: typeof state.moduloInstancias }[] = [];
  for (const instancia of state.moduloInstancias) {
    if (instancia.status !== 'em_andamento') continue;
    let coluna = colunas.find((c) => c.nome === instancia.macroetapaAtualNome);
    if (!coluna) {
      coluna = { nome: instancia.macroetapaAtualNome, instancias: [] };
      colunas.push(coluna);
    }
    coluna.instancias.push(instancia);
  }

  if (state.instanciasLoading) {
    return <div style={{ fontSize: 13, color: colors.textFaint, padding: 24 }}>Carregando instâncias…</div>;
  }
  if (colunas.length === 0) {
    return <div style={{ fontSize: 13, color: colors.textFaint, padding: 24 }}>Nenhuma instância de processo em andamento neste módulo.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas.length}, 1fr)`, gap: 14, padding: 24, overflowX: 'auto' }}>
      {colunas.map((coluna) => (
        <div key={coluna.nome}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>{coluna.nome}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coluna.instancias.map((instancia) => (
              <div
                key={instancia.id} onClick={() => actions.abrirCardInstancia(instancia.id)}
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, marginBottom: 4 }}>#{instancia.id.slice(0, 8)}</div>
                <div style={{ fontSize: 13, color: colors.textMuted }}>{instancia.etapaAtualNome}</div>
                {instancia.status === 'erro' && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: colors.danger }}>Falha — reenviar</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Adicionar a aba "Interação" a `CustomModuleView.tsx`**

Adicionar `moduloWorkspaceTab: 'chat' | 'interacao'` a `CorePilotState`
(`initialState.ts`, default `'chat'`) e a action `setModuloWorkspaceTab` em
`useCorePilotState.ts` (`update({ moduloWorkspaceTab: tab })`), exportada em
`actions`.

Editar `CustomModuleView.tsx` — importar `ModuloKanban` e `TelaDeInteracao`, e
envolver o conteúdo atual (que vira o caso `'chat'`) numa alternância por aba:

```typescript
import { ModuloKanban } from '../components/orquestrador/ModuloKanban';
import { TelaDeInteracao } from '../components/orquestrador/TelaDeInteracao';
```

No topo do JSX retornado (antes do `<div style={{ margin: 0, ... }}>` existente),
adicionar a barra de abas, e condicionar o conteúdo existente à aba `'chat'`:

```typescript
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, padding: '0 24px', flexShrink: 0 }}>
        {(['chat', 'interacao'] as const).map((tab) => (
          <div key={tab} onClick={() => actions.setModuloWorkspaceTab(tab)} style={{ padding: '12px 14px', cursor: 'pointer', position: 'relative' }}>
            <span style={{ fontSize: 13, fontWeight: state.moduloWorkspaceTab === tab ? 700 : 500, color: state.moduloWorkspaceTab === tab ? colors.teal : colors.textMuted }}>
              {tab === 'chat' ? 'Chat' : 'Interação'}
            </span>
            {state.moduloWorkspaceTab === tab && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
          </div>
        ))}
      </div>

      {state.moduloWorkspaceTab === 'interacao' ? (
        <ModuloKanban moduloId={module.id} state={state} actions={actions} />
      ) : (
        <div style={{ margin: 0, padding: '24px 16px 16px 24px', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
          {/* ...conteúdo existente do chat, sem mudança... */}
        </div>
      )}
      <TelaDeInteracao state={state} actions={actions} />
    </div>
  );
```

(O restante do JSX do chat — sidebar, mensagens, composer — permanece exatamente como
está hoje, só passa a viver dentro do bloco `'chat'` acima em vez de ser o retorno
direto do componente.)

- [ ] **Step 5: Conectar `AdminSettings.tsx` à integração WhatsApp real**

Em `useCorePilotState.ts`, substituir o corpo mock de `testWaConnection` por uma ação
real que salva e testa:

```typescript
  const salvarETestarWaConnection = async () => {
    await salvarIntegracaoWhatsAppReal();
    await testarIntegracaoWhatsAppReal();
  };
```

Trocar, no objeto `actions`, `testWaConnection` pela nova função (mantendo o nome
`testWaConnection` como chave, já usado pelo botão em `AdminSettings.tsx`, pra não
precisar editar o componente de UI):

```typescript
    updateWaField, toggleWaExpanded, toggleChangeWaKey, updateWaNewKey, toggleWaNotifyTasks, setAdminSettingsTab,
    testWaConnection: salvarETestarWaConnection,
```

Remover a implementação antiga de `testWaConnection` (o `setTimeout` fake) e o
`waTestTimer` que só era usado por ela, se não for mais referenciado em nenhum outro
lugar do arquivo.

Adicionar, em `AdminSettings.tsx`, um `useEffect` que carrega a integração salva ao
abrir a tela e popula `waForm`:

```typescript
useEffect(() => {
  void actions.carregarIntegracaoWhatsApp();
  // oxlint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  if (state.integracaoWhatsApp) {
    actions.updateWaField('apiUrl')({ target: { value: state.integracaoWhatsApp.apiUrl } } as ChangeEvent<HTMLInputElement>);
    actions.updateWaField('instanceName')({ target: { value: state.integracaoWhatsApp.instanceName } } as ChangeEvent<HTMLInputElement>);
    actions.updateWaField('phone')({ target: { value: state.integracaoWhatsApp.phone ?? '' } } as ChangeEvent<HTMLInputElement>);
  }
  // oxlint-disable-next-line react-hooks/exhaustive-deps
}, [state.integracaoWhatsApp]);
```

(Import `useEffect`/`ChangeEvent` de `react` no topo do arquivo, se ainda não
importados.)

- [ ] **Step 6: Rodar backend, build e lint do frontend**

Run: `cd backend && npm test`
Run: `cd frontend && npm run build && npm run lint`
Expected: tudo passa

- [ ] **Step 7: Commit**

```bash
git add backend/src/orquestrador frontend/src/corepilot
git commit -m "feat(frontend): Kanban real na aba Interação do módulo + conexão WhatsApp real no Admin"
```

---

## Task 18: Verificação de ponta a ponta (fluxo de Compras desenhado no builder)

**Files:** nenhum novo — só verificação, seguindo o padrão da Task 10 de
`docs/superpowers/plans/2026-08-04-rascunho-ia-builder.md`.

- [ ] **Step 1: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: todos os testes passam.

- [ ] **Step 2: Rodar o e2e do motor**

Run: `cd backend && npm run test:e2e -- orquestrador.e2e-spec.ts`
Expected: PASS no teste do motor completo (loop + idempotência + isolamento); o
teste de WhatsApp roda de verdade se `EVOLUTION_TEST_*` estiver em `.env.local`, ou
pula automaticamente.

- [ ] **Step 3: Build de backend e frontend**

Run: `cd backend && npm run build`
Run: `cd frontend && npm run build && npm run lint`
Expected: tudo limpo.

- [ ] **Step 4: Subir os dois servidores**

Run (background): `cd backend && npm run start:dev`
Run (background): `cd frontend && npm run dev`

Confirme no log do backend que as novas rotas aparecem mapeadas (`fluxo`,
`instancias`, `integracao-whatsapp`).

- [ ] **Step 5: Configurar a integração WhatsApp real (se for testar o envio de verdade)**

Logado como `seed-a@corepilot.dev`, abrir Admin → Configurações → "WhatsApp ·
Evolution API", preencher URL/instância/chave/telefone reais, "Salvar e testar
conexão" — confirmar que o badge muda pra "Conectado". Se não houver uma instância
Evolution disponível agora, pular este passo e tratar a etapa de Integração do fluxo
de Compras como não-testável nesta rodada (mas sem remover a etapa do fluxo).

- [ ] **Step 6: Desenhar o fluxo de Compras no builder, num módulo real**

Abrir (ou criar) um módulo customizado real → "Configurar módulo" → aba
**Orquestrador** (Step5, novo): criar as colunas "Triagem", "Validação Comprador",
"Cotação", "Aprovação Comprador", "Finalizado", e as 6 etapas do guia principal
(seção 11): Solicitação recebida (decisão automática) → IA confere e agrupa (tarefa
do agente — selecionar um agente/skill reais do módulo) → Comprador valida (aprovação,
1 aprovador) → Fornecedores cotam (tarefa do agente) → Comprador aprova (aprovação,
"se reprovado, voltar para" = Fornecedores cotam) → Pedido gerado (integração —
agente + integração, se WhatsApp estiver configurado). Publicar o fluxo.

- [ ] **Step 7: Disparar uma instância e acompanhar pela aba Interação**

Como ainda não existe um formulário de "nova solicitação" (fora de escopo desta
fase), disparar manualmente:

```bash
curl -X POST http://localhost:3000/modulos/<moduloId>/fluxo/instancias \
  -H "Authorization: Bearer <token de acesso>" -H "Content-Type: application/json" \
  -d '{"dadosIniciais": {"itens": ["parafuso M6", "porca M6"]}}'
```

Abrir a aba "Interação" do módulo no navegador — o card deve aparecer na coluna
"Triagem", avançar sozinho pra "Cotação" depois que o worker processar a etapa de
agente (alguns segundos), e então parar em "Aprovação Comprador". Abrir o card,
confirmar que a `TelaDeInteracao` mostra a trilha de progresso e os botões
"Aprovar"/"Solicitar ajustes". Clicar "Solicitar ajustes" com um motivo — confirmar
que volta pra "Cotação", reprocessa, e para de novo em "Aprovação Comprador". Clicar
"Aprovar" — confirmar que avança pra "Pedido gerado" e, se a integração WhatsApp
estiver configurada, que a mensagem chega de verdade no número de teste.

Se qualquer passo gerar erro de console no browser, investigar antes de prosseguir
(mesmas ferramentas de screenshot/Playwright já usadas nesta sessão pro resto do
projeto).

- [ ] **Step 8: Confirmar auditoria**

Verificar no Postgres (via Prisma Studio, `npm run prisma:studio`, ou uma query
direta) que existem linhas de `AuditLog` com `acao = 'fluxo_publicado'` e
`acao = 'etapa_acao_executada'` (uma por clique em Aprovar/Solicitar ajustes) para a
empresa usada no teste, e que `ExecucaoDeEtapa` tem uma linha `done` por etapa
automática/de agente/de integração executada, com `chaveIdempotencia` distinta entre
a primeira e a segunda execução da etapa "Fornecedores cotam" (por causa do loop).

- [ ] **Step 9: Encerrar os servidores de teste**

Identificar os PIDs exatos dos processos `node` cuja `CommandLine` contenha
`Corepilot\backend` ou `Corepilot\frontend` (via `Get-CimInstance Win32_Process
-Filter "Name='node.exe'"` no PowerShell) e encerrar só esses.

- [ ] **Step 10: Commit final (se sobrar algo não commitado, ex. ajuste feito durante a verificação)**

```bash
git status --short
```

Se houver mudanças pendentes relacionadas a esta feature, `git add` só os arquivos
relevantes e commitar. Não commitar nada que não tenha sido tocado por este plano.

