# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General project rules

- **Backend logic stays local.** All backend behavior should be implemented in `backend/` (NestJS) and run locally/self-hosted, not pushed into Supabase Edge Functions.
- **Supabase Functions are a last resort.** Only use Supabase Functions when there is no alternative within the local backend — e.g. scheduled/cron jobs that must run inside Supabase itself. Default to implementing scheduling, business logic, and API behavior in `backend/` instead.

## Repository structure

This is a monorepo-by-folder (no root `package.json`, no npm/pnpm workspaces) containing two independent, separately-versioned projects:

- `backend/` — NestJS 11 API (TypeScript, Express platform)
- `frontend/` — React 19 + Vite 8 SPA (TypeScript)

There is no shared tooling, shared types, or build orchestration between them. All commands below must be run from inside the relevant subdirectory (`cd backend` or `cd frontend`) — there is no root script that runs both.

Fase 1 (Fundação) is implemented: the backend has real Supabase Auth JWT verification, multi-tenant scoping and audit logging behind `GET /me`; the frontend has a real login flow gating the (still mock-data) prototype.

## Backend (`backend/`)

NestJS using the standard module/controller/service pattern. Entry point is `src/main.ts`, which bootstraps via `NestFactory.create(AppModule)`, enables CORS for `FRONTEND_ORIGIN` (default `http://localhost:5173`) and listens on `process.env.PORT ?? 3000`.

Domain modules:
- `src/prisma/` — `PrismaService` (extends `PrismaClient`) exposed by a `@Global()` `PrismaModule`.
- `src/auth/` — `SupabaseJwtVerifier` (validates the Supabase JWT via the project's JWKS endpoint, no shared secret), `JwtAuthGuard`, `TenantGuard` (resolves `Usuario` → `UsuarioEmpresa` read-only and populates a request-scoped `TenantContext`), `AuthModule`.
- `src/audit/` — `AuditService.record()`, writes an `AuditLog` row per audited action.
- `src/me/` — `GET /me`, the Fase 1 validation endpoint (returns `{ usuario, empresa, perfil }`).
- `src/testing/` — Supabase Admin API helpers used by the seed script and the e2e test (not application code, but it lives in `src/` because `prisma/seed.ts` imports it).

Data model lives in `prisma/schema.prisma`: `Empresa`, `Usuario`, `UsuarioEmpresa` (N:N + `Perfil` enum `admin | membro`), `AuditLog`.

Commands:
```bash
npm run start:dev      # run with watch mode (typical for local dev)
npm run start          # run once, no watch
npm run start:debug    # watch mode with --debug
npm run build           # compile via nest build -> dist/
npm run start:prod       # run compiled output (node dist/main)

npm run lint            # eslint --fix over src/apps/libs/test
npm run format           # prettier --write over src/ and test/

npm run test             # jest unit tests (*.spec.ts, colocated in src/)
npm run test:watch
npm run test:cov
npm run test:e2e         # jest e2e tests, config in test/jest-e2e.json (*.e2e-spec.ts)

npm run prisma:migrate   # prisma migrate dev against DATABASE_URL (loads .env.local)
npm run prisma:generate   # regenerate @prisma/client from schema.prisma
npm run prisma:studio     # open Prisma Studio (loads .env.local)
npm run db:seed           # run prisma/seed.ts (loads .env.local)
```

Run a single unit test file:
```bash
npx jest path/to/file.spec.ts
```

### Local setup

Everything here talks to a **real, shared Supabase project** — there is no local Postgres or Supabase emulator in this phase.

1. `cp backend/.env.example backend/.env.local` and fill in the real values (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SEED_USER_PASSWORD`). `.env.local` is gitignored — never commit it. The npm scripts and the Jest setup file (`src/test-setup.ts`) load it automatically; `npm run start:dev` loads it via `ConfigModule.forRoot({ envFilePath: '.env.local' })`.
2. `npm run prisma:migrate` — applies `prisma/migrations/` and regenerates the client.
3. `npm run db:seed` — creates/updates two `Empresa` rows plus one admin per company (`seed-a@corepilot.dev`, `seed-b@corepilot.dev`) in both Supabase Auth and Postgres. It is idempotent and re-runnable: an existing auth user has its password reset to the current `SEED_USER_PASSWORD` instead of erroring.

Every table must be created with RLS enabled and **no** policies (see `prisma/migrations/*_lock_down_data_api/`). This is not authorization — that stays explicit in the NestJS services — it just closes Supabase's public PostgREST Data API, which would otherwise expose every Prisma-created table to anyone holding the publishable key shipped in the frontend bundle.

### What the test commands actually require

- `npm test` (unit) runs offline **except** `src/prisma/prisma.smoke.spec.ts`, which hits the real database. That suite auto-skips when `DATABASE_URL` is unset, so a green run on a fresh clone without `.env.local` proves less than it looks like — it silently skipped the only test that touches Postgres.
- `npm run test:e2e` hard-requires a working `.env.local`: it boots the real `AppModule` (real DB connection), creates throwaway users through the Supabase Admin API with `SUPABASE_SERVICE_ROLE_KEY`, signs them in for real JWTs, and cleans them up afterwards. It cannot run offline and it does write to (and delete from) the shared Supabase project.

Notes:
- ESLint uses flat config (`eslint.config.mjs`) with `typescript-eslint` recommendedTypeChecked + `eslint-plugin-prettier`. `no-explicit-any` is disabled; `no-floating-promises` and `no-unsafe-argument` are warnings, not errors.
- Prettier config (`.prettierrc`): single quotes, trailing commas everywhere (`trailingComma: all`).
- Unit test files live next to the code they test (e.g. `src/app.controller.spec.ts`), not in a separate `__tests__` tree. `jest`'s `rootDir` is `src`.
- `tsconfig.json` targets `ES2023`, uses `nodenext` module resolution, and enables decorator metadata (required for Nest's DI).

## Frontend (`frontend/`)

Vite + React 19 + TypeScript SPA, bootstrapped with `createRoot` in `src/main.tsx`, rendering `src/App.tsx` under `StrictMode`. `App.tsx` renders `src/corepilot/auth/AuthGate.tsx`, which gates on a real Supabase session (`useSession`) and shows either the login form or `FundacaoStatus` (which calls `GET /me` through `src/corepilot/api/apiFetch.ts`). The navigable prototype behind it (`src/corepilot/`) still runs on mock data.

Supabase is used from the frontend **for auth only** — never for data. Env vars live in `.env.local` (gitignored; see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`. They are typed in `src/vite-env.d.ts`; add new ones there so they don't fall back to Vite's loose `string | undefined`.

Commands:
```bash
npm run dev        # start Vite dev server
npm run build       # tsc -b (project-references type check) then vite build
npm run preview      # preview the production build
npm run lint         # oxlint
```

Notes:
- Linting uses **oxlint**, not ESLint (`.oxlintrc.json`, plugins: `react`, `typescript`, `oxc`). Type-aware linting is not currently enabled (would require `oxlint-tsgolint` per `frontend/README.md`).
- No test runner is configured for the frontend yet.
- TypeScript uses project references: root `tsconfig.json` points to `tsconfig.app.json` (app code) and `tsconfig.node.json` (Vite config itself) — run `tsc -b` rather than plain `tsc` when type-checking manually.
- Static assets referenced via `<use href="/icons.svg#...">` come from `public/icons.svg`; images imported directly (e.g. `hero.png`, `react.svg`) live in `src/assets/`.
