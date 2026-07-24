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

Both are currently at initial-scaffold state (default NestJS starter / default Vite React-TS template) with no custom domain logic yet.

## Backend (`backend/`)

NestJS starter using the standard module/controller/service pattern (`AppModule` → `AppController` → `AppService`). Entry point is `src/main.ts`, which bootstraps via `NestFactory.create(AppModule)` and listens on `process.env.PORT ?? 3000`.

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
```

Run a single unit test file:
```bash
npx jest path/to/file.spec.ts
```

Notes:
- ESLint uses flat config (`eslint.config.mjs`) with `typescript-eslint` recommendedTypeChecked + `eslint-plugin-prettier`. `no-explicit-any` is disabled; `no-floating-promises` and `no-unsafe-argument` are warnings, not errors.
- Prettier config (`.prettierrc`): single quotes, trailing commas everywhere (`trailingComma: all`).
- Unit test files live next to the code they test (e.g. `src/app.controller.spec.ts`), not in a separate `__tests__` tree. `jest`'s `rootDir` is `src`.
- `tsconfig.json` targets `ES2023`, uses `nodenext` module resolution, and enables decorator metadata (required for Nest's DI).

## Frontend (`frontend/`)

Standard Vite + React 19 + TypeScript SPA, bootstrapped with `createRoot` in `src/main.tsx`, rendering `src/App.tsx` under `StrictMode`.

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
