# CorePilot — Fase 1: Fundação (design)

## 0. Contexto

Este é o primeiro de uma série de sub-projetos derivados de
`COREPILOT_GUIA_IMPLEMENTACAO.md`, que descreve 8 fases de implementação
(Fundação → Módulo+Chat → Agentes/Skills → Fontes de dados → BPM → Kanban →
Integrações → Permissões avançadas). O guia é explícito: não avançar de fase
sem o caso de validação da fase anterior funcionando ponta a ponta. Este
documento cobre **só a Fase 1**.

Estado atual do repositório: `backend/` é um scaffold NestJS padrão sem lógica
de domínio; `frontend/` é um protótipo navegável estático (dados mock em
`initialState.ts`/`seedData.ts`), sem autenticação real, com um cliente
Supabase (`@supabase/ssr`, `@supabase/supabase-js`) já adicionado mas ainda não
conectado a nada. Já existe um projeto Supabase provisionado (URL e chave
publishable configuradas em `frontend/.env.local`).

## 1. Objetivo da Fase 1

Ter infraestrutura, autenticação e multi-tenant funcionando de ponta a ponta,
com o modelo de dados core no Postgres, antes de qualquer lógica de módulo,
chat, agente ou BPM.

## 2. Fora de escopo (explicitamente adiado)

- Entidade `Modulo` e qualquer coisa dentro dela (base de conhecimento,
  agentes, skills, fluxo, fontes de dados) — Fase 2 em diante.
- Chamadas à Messages API da Anthropic — Fase 2.
- Kanban / Interação — Fase 6.
- RBAC granular (permissões por campo/ação/quadro) — Fase 8. Nesta fase, perfil
  é só `admin | membro`.
- Tela de signup/convite de usuário — usuários desta fase são criados via
  script de seed (Supabase Admin API), não por um fluxo de auto-cadastro.
- Deploy/hospedagem — foco em ambiente de desenvolvimento local.

## 3. Arquitetura

```
Frontend (Vite SPA)                    Backend (NestJS)                 Supabase
  supabase-js (Auth only) ──login──▶  JwtAuthGuard (valida via JWKS)    ├─ Auth (JWT, JWKS)
  fetch (Bearer <jwt>) ──────────────▶ TenantContext (empresa_id)   ◀── └─ Postgres (dados)
                                        Controllers/Services (Prisma)       connection string
                                        AuditLog em toda mutação
```

Princípio central (herdado do CLAUDE.md e da seção 2 do guia): o frontend
nunca acessa o Postgres nem a API da Anthropic diretamente, e nunca recebe
segredos. Supabase é usado só para Auth (login, sessão, refresh de JWT) do
lado do frontend. Toda leitura/escrita de dado de negócio passa pelo NestJS,
que fala com o Postgres via connection string própria — uma única fonte de
verdade para regra de negócio e autorização (sem RLS como mecanismo primário
de autorização, para não duplicar a lógica em duas camadas).

### 3.1. Regra permanente: toda tabela nasce com RLS habilitada e sem policies

Não usar RLS como mecanismo de autorização **não** significa deixar RLS
desligada. O Postgres do Supabase expõe automaticamente, via PostgREST, uma
Data API pública em `https://<projeto>.supabase.co/rest/v1/<Tabela>` para toda
tabela do schema `public` — inclusive as criadas pelo Prisma, que o Supabase
Studio nunca viu. Como a chave publishable/anon é embarcada no bundle do
frontend por design, qualquer tabela sem RLS é lida e escrita por qualquer
pessoa que abra o site, contornando `JwtAuthGuard` e `TenantGuard` por
completo. Isso foi confirmado na prática nesta fase (um `GET
/rest/v1/Empresa` com a chave anon retornava linhas reais) e corrigido pela
migração `20260726073505_lock_down_data_api`.

Regra, válida da Fase 2 em diante e sem exceção: **toda tabela nova recebe
`ALTER TABLE "<Tabela>" ENABLE ROW LEVEL SECURITY;` na mesma migração que a
cria, e nenhuma policy é criada.** RLS habilitada com zero policies é negação
total para os papéis `anon`/`authenticated` do PostgREST, e é invisível para o
backend: o NestJS conecta via `DATABASE_URL` como dono das tabelas, e o dono
ignora RLS. Ou seja, o efeito é fechar a porta lateral sem mover uma vírgula
da autorização, que continua explícita nos services (§5, item 5). Se algum dia
o acesso direto via PostgREST for realmente desejado para alguma tabela, isso
vira uma decisão de design explícita — não o default silencioso.

## 4. Modelo de dados (Prisma)

```prisma
model Empresa {
  id          String   @id @default(uuid())
  nome        String
  criadoEm    DateTime @default(now())

  usuarios    UsuarioEmpresa[]
  auditLogs   AuditLog[]
}

model Usuario {
  id               String   @id @default(uuid())
  supabaseUserId   String   @unique
  nome             String
  email            String   @unique
  criadoEm         DateTime @default(now())

  empresas         UsuarioEmpresa[]
  auditLogs        AuditLog[]
}

enum Perfil {
  admin
  membro
}

model UsuarioEmpresa {
  usuarioId String
  empresaId String
  perfil    Perfil

  usuario   Usuario @relation(fields: [usuarioId], references: [id])
  empresa   Empresa @relation(fields: [empresaId], references: [id])

  @@id([usuarioId, empresaId])
}

model AuditLog {
  id            String   @id @default(uuid())
  empresaId     String
  atorUsuarioId String
  acao          String
  dadosAntes    Json?
  dadosDepois   Json?
  timestamp     DateTime @default(now())

  empresa       Empresa @relation(fields: [empresaId], references: [id])
  ator          Usuario @relation(fields: [atorUsuarioId], references: [id])
}
```

Notas:
- `UsuarioEmpresa` já modela N:N (um usuário pode pertencer a mais de uma
  empresa), mesmo que a Fase 1 só exercite o caso 1:1 na prática — evita
  retrabalho de schema quando isso for necessário.
- `AuditLog` é genérico e serve à seção 9 do guia (toda ação logada com ator,
  timestamp, dados antes/depois). A `ExecucaoDeEtapa` específica de execução
  de etapa BPM (com input/output/custo de tokens) é modelada só na Fase 5,
  como uma tabela separada — não uma extensão desta.

## 5. Autenticação e enforcement de tenant

1. Login via Supabase Auth (email/senha) no frontend, usando o cliente já
   presente em `frontend/src/lib/supabase/client.ts`.
2. Frontend chama a API do NestJS enviando o JWT do Supabase como
   `Authorization: Bearer <jwt>`.
3. `JwtAuthGuard` no backend valida a assinatura do JWT buscando as chaves
   públicas no endpoint JWKS do projeto Supabase
   (`https://<projeto>.supabase.co/auth/v1/.well-known/jwks.json`), sem
   segredo compartilhado.
4. Um segundo guard/middleware resolve `Usuario` a partir do
   `supabaseUserId` do JWT (lazy-create na primeira request autenticada, já
   que não há fluxo de signup próprio nesta fase) e sua `Empresa`/`Perfil`,
   populando um `TenantContext` **request-scoped** injetado via DI do Nest.
   O modelo de dados permite um usuário pertencer a mais de uma empresa
   (`UsuarioEmpresa` é N:N), mas a Fase 1 assume exatamente uma
   `UsuarioEmpresa` por `Usuario` — se o seed ou um teste criar mais de uma,
   o guard deve falhar de forma explícita (erro claro) em vez de escolher uma
   arbitrariamente. Selecionar/trocar de empresa quando um usuário pertence a
   várias fica para quando esse caso realmente existir.
5. Toda query Prisma que toca dado de empresa inclui explicitamente
   `where: { empresaId: tenantContext.empresaId }` no código do service —
   escopo explícito e auditável no código-fonte, não implícito via
   middleware "mágico" do Prisma.

## 6. Superfície da API (Fase 1)

- `GET /me` — retorna `Usuario` + `Empresa(s)` + `Perfil` resolvidos a partir
  do JWT. É o endpoint usado no caso de validação (seção 8).
- Lazy-create de `Usuario` embutido no guard de resolução de tenant (sem
  endpoint dedicado).

## 7. Seed / dados de teste

Script de seed (`backend/prisma/seed.ts` ou equivalente) cria:
- 2 `Empresa` distintas.
- 1 usuário por empresa, criado via Supabase Admin API (service role key) +
  linha `Usuario`/`UsuarioEmpresa` correspondente no Postgres.

Usado tanto para desenvolvimento manual quanto como fixture do teste e2e de
isolamento entre tenants.

## 8. Critério de aceite (caso de validação da Fase 1)

- Usuário faz login real via Supabase Auth no frontend.
- Frontend chama `GET /me` no NestJS com o JWT.
- Backend valida o JWT via JWKS, resolve `empresaId`/`perfil`, retorna os
  dados escopados por empresa.
- A chamada fica registrada em `AuditLog`.
- Usuários de empresas diferentes nunca veem dado um do outro (validado por
  teste e2e automatizado, não só manualmente).

Fase 2 (Módulo + Chat) só começa depois desse caso funcionando de ponta a
ponta, com testes automatizados verdes.

## 9. Estratégia de testes

- Unit: `JwtAuthGuard` (JWT válido/inválido/expirado) e resolução de
  `TenantContext` (usuário novo vs. existente, usuário sem empresa).
- E2E (`backend/test/*.e2e-spec.ts`): fluxo completo `GET /me` com JWTs de
  fixture de duas empresas diferentes, confirmando isolamento cross-tenant.

## 10. Variáveis de ambiente

Frontend (`frontend/.env.local`, já configurado):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Backend (`backend/.env.local`, a configurar):
- `DATABASE_URL` — connection string do Postgres do Supabase (Project
  Settings → Database → Connection string).
- `SUPABASE_URL` — mesma URL pública do projeto (usada para montar a URL do
  JWKS).

Nenhum segredo é commitado; `backend/.env.local` fica coberto pelo padrão
`.env*.local` do `.gitignore` da raiz.

## 11. Decisões em aberto para a Fase 1 (a resolver durante a implementação, não bloqueantes para o plano)

- Se o projeto Supabase usa assinatura de JWT assimétrica (JWKS, padrão atual)
  — assumido nesta spec. Se na prática for HS256 legado, o `JwtAuthGuard`
  precisa trocar para validação com `JWT Secret` compartilhado; o restante do
  design não muda.
