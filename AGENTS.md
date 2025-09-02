# Repository Guidelines

This repository is a TypeScript CLI assistant focused on tasks, health, nutrition, and planning. Use this guide to develop, test, and submit high‑quality changes.

## Project Structure & Module Organization
- `src/core/`: Orchestrators and core logic (`aegis.ts`, `state-manager.ts`, `goals-manager.ts`, `intent-classifier.ts`).
- `src/modules/`: Feature modules (`tasks.ts`, `nutrition.ts`, `health.ts`, `planning.ts`).
- `src/services/`: External integrations (Neon Postgres via `neon.ts`).
- `src/utils/`: Parsers and helpers (`duration-parser.ts`, `food-parser.ts`, etc.).
- `src/types/`: Shared types. `dist/`: compiled output. Entry: `src/index.ts`.

## Build, Test, and Development Commands
- `npm run dev`: Run CLI with hot reload (`ts-node-dev`).
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Execute compiled CLI (`node dist/index.js`).
- `npm test`: Run Jest. When adding TS tests, configure ts-jest if needed.
- `npm run lint`: Lint `src/**/*.ts` with ESLint.
- `npm run typecheck`: TypeScript type checking only.

## Coding Style & Naming Conventions
- TypeScript strict mode (see `tsconfig.json`). Use 2‑space indentation and semicolons.
- Filenames: kebab-case (`state-manager.ts`). Classes: PascalCase (`Aegis`). Variables/functions: camelCase.
- Keep utils pure; avoid side effects. Prefer small, focused modules.

## Testing Guidelines
- Framework: Jest (with `ts-jest` available). Place tests as `*.test.ts` co-located or under `src/__tests__/`.
- Mock database calls from `src/services/neon.ts`.
- Aim to cover `src/core/*` and `src/utils/*`. Run locally with `npm test`.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style, e.g., `feat(tasks): add priority calc)`; `fix(core): handle missing env`.
- PRs must include: concise description, linked issues, CLI output or screenshots if relevant, and notes on testing.
- CI expectations: lint, typecheck, build, and tests passing.

## Security & Configuration Tips
- Never commit `.env`. Use `.env.example` as a template; required: `DATABASE_URL`, `USER_ID` (loaded via `dotenv`).
- Do not log secrets. Keep credentials in environment variables only.

## Architecture Overview
- CLI entry is `src/index.ts`. The `Aegis` core coordinates modules and persists state via Neon Postgres. Keep module boundaries clear and dependencies flowing from `core` → `modules` → `services`.

