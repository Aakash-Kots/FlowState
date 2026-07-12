# CLAUDE.md

Guidance for AI agents working in this repo. Read
[docs/conventions.md](docs/conventions.md) before writing code — it is the
authoritative style guide and this file only summarizes it.

## What FlowState is

A local-first macOS dev command center (Electron + Next.js) that unifies Git,
terminals, worktrees, Linear, and Claude Code around one concept: a **Workspace**
= one git worktree + its terminals + its Claude Code session + an optional Linear
issue. See [README.md](README.md) for the product overview and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design rationale.

## Monorepo layout (Bun workspaces)

- `apps/main` — Electron main process. tRPC routers (`src/router/`), the logic
  behind them (`src/services/`), and local persistence (`src/store/`: Drizzle +
  `better-sqlite3`, secrets via `safeStorage`). Node/electron-only.
- `apps/renderer` — Next.js 14 / React 18 UI. tRPC client, Zustand stores,
  Tailwind. DOM-only.
- `packages/shared` (`@flowstate/shared`) — framework-agnostic zod schemas,
  types, enums, and constants shared by both processes. Keep it free of
  node/electron/DOM imports.

## Commands (this repo uses Bun, not npm/pnpm)

| Command                                        | What it does                                            |
| ---------------------------------------------- | ------------------------------------------------------- |
| `bun install`                                  | Install deps                                            |
| `bun run dev`                                  | Next dev server (:3000) + Electron with hot reload      |
| `bun run typecheck`                            | Typecheck every workspace (main + renderer + shared)    |
| `bun run lint`                                 | Lint the renderer                                       |
| `bun run build`                                | Static-export the renderer + bundle main/preload        |
| `bun run format`                               | Prettier over the repo                                  |
| `bun run --filter @flowstate/main db:generate` | Generate a Drizzle SQL migration from `store/schema.ts` |

CI runs `typecheck`, `lint`, and `build` — run all three before considering a
change done.

## Conventions (summary — full rules in docs/conventions.md)

- **File order:** imports → Types → Enums → Constants → Helpers → primary export.
- **Section boxes:** introduce each non-empty category with an ASCII box
  (`//////` / `// Constants //` / `//////`); skip boxes on trivial files.
- **No leaked shared code:** a type/enum/constant/schema used in >1 place must
  live in a domain file — `packages/shared/src/{types,enums,constants,schemas}/<domain>.ts`
  if cross-app, else that app's `src/lib/{types,enums,constants,schemas}/<domain>.ts`.
  Never export types/enums/constants from a feature file. A module's _behavior_
  (services, routers, store accessors, `cn`) legitimately stays put.
- **Enums, not string unions:** model fixed domain string sets as string `enum`s
  in `enums/<domain>.ts`; validate with `z.nativeEnum` / `z.literal(Enum.Member)`.
  Third-party/SDK string fields and presentational React variant props stay as
  raw strings.
- **Types vs schemas:** hand-declare shapes with `export type X = …` in
  `types/<domain>.ts` (the source-of-truth shape — do NOT use `z.infer` as your
  type system, and do NOT use `interface` — `type` only, everywhere). Put zod
  validation in a separate `schemas/<domain>.ts` that mirrors the type (annotate
  `z.ZodType<TheType>` where practical), and `.parse()` it at every boundary
  (tRPC/IPC inputs, SQLite rows, the Claude SDK, `JSON.parse`, user input).
  Purely in-memory / prop shapes that never cross a boundary stay a plain `type`
  with no schema.
- **UI components:** shadcn/ui design-system primitives live in
  `apps/renderer/components/ui/` (with the `cn` helper); feature/domain components
  live in `apps/renderer/components/<domain>/`. Primitives never import feature
  code (`feature → ui`, never back).
- **Imports:** `node:` builtins → third-party → `@flowstate/*` → local. Use
  `import type` for types (`verbatimModuleSyntax`); import enums as values.

## Gotchas

- The SDK package `@anthropic-ai/claude-agent-sdk` is ESM-only in a CJS bundle —
  it is loaded via a real dynamic `import()` in `services/claude.ts`, never a
  top-level import.
- Native modules (`node-pty`, `better-sqlite3`) are rebuilt against Electron's
  ABI; they only load inside the Electron main process, not plain Node.
- Migrations apply automatically on startup — edit `store/schema.ts`, run
  `db:generate`, commit the generated SQL; there is no manual migrate step.
