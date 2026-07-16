# Creatorwood

A platform for creators to produce, distribute, and monetize content.

This file is the repo-wide briefing for coding agents. Keep it short: only rules needed in almost every session belong here. Domain-specific detail lives in `.claude/rules/` and app-local `CLAUDE.md` files.

---

## Environment

- **Runtime/package manager**: Bun. Always use `bun`, never `npm` or `yarn`.
- **Framework**: Next.js 15 App Router + React 19 + TypeScript strict (`noUncheckedIndexedAccess`).
- **UI**: Tailwind CSS + shadcn/ui (New York, Neutral, CSS vars).
- **Backend**: Drizzle ORM + PlanetScale Postgres, Better Auth, Redis, Cloudflare R2, Inngest, Hono API.
- **Apps**: Web in `src/`, mobile in `apps/mobile/`, TV in `apps/tv-native/`.

---

## Git Workflow

- **`staging`** — all PRs target `staging`. Never open a PR against `main` unless explicitly instructed.
- **`main`** — production. Do not touch.
- **Feature branches** — `<developer>/<ticket>` or `<developer>/<description>`.
- **Diffs** — always against `staging`: `git diff staging...HEAD`, `git log staging..HEAD`.
- **Commits** — conventional format (`feat:`, `fix:`, `refactor:`, `chore:`, `perf:`), under 72 chars. Never `git add .`.
- **Push to the current feature branch, never to `staging` or `main`.** Always commit and push to the worktree's own branch (the one the PR is built from). Feature branches created off `origin/staging` often have their upstream set to `origin/staging`, so a bare `git push` can target the wrong ref or be rejected. Always push explicitly to the feature branch: `git push origin HEAD:<feature-branch>` (e.g. `git push origin HEAD:manit/cre2-1142`). Confirm the branch with `git rev-parse --abbrev-ref HEAD` first. Never push directly to `staging` or `main` under any circumstances.

---

## Commands

```bash
bun dev              # start dev server (Turbopack)
bun build            # production build
bun test             # unit tests
bun run test:e2e     # Playwright E2E
bun run lint         # ESLint
```

### Critical Warnings

- **Never run integration tests** — `bun test tests/integration/` calls real external APIs and costs money unless explicitly requested.
- **Never run db commands** — do not run `db:generate`, `db:migrate`, or `db:studio`. After schema changes, tell the user what to run.
- **Never hand-write migrations** — edit only `src/server/db/schema.ts`; never edit `src/server/db/migrations/`.

### Environment Variables

- **Adding new required ENVs** — when adding code that reads a new required environment variable, you MUST also update `scripts/dev/validate-env.ts` to include validation for that variable. This prevents production incidents from missing ENVs.
- **Validation categories** — add ENVs to the appropriate category: Critical Infrastructure, Database, Redis, Storage, Background Jobs, AI Services, Payments, Analytics, or Email.
- **Staging variants** — if the ENV has a staging variant (e.g. `STAGING_DATABASE_URL`), use the `hasEitherEnv()` helper to accept either production or staging values.
- **Optional ENVs** — truly optional ENVs go in the `OPTIONAL_*` arrays and will show warnings but not block startup.

---

## Directory Map

```text
src/app/                    Next.js App Router pages, layouts, actions
src/shadcn-components/      shadcn/ui installs only
src/shared-components/      composed UI shared across pages
src/hooks/                  client React hooks
src/stores/                 Zustand stores
src/lib/                    bundle-safe types, schemas, constants, errors, helpers
src/server/                 server-only DB, Redis, R2, auth, services, data access
server/                     Hono API server for mobile, webhooks, WebSockets
workers/                    Inngest functions and activities
tests/unit/                 unit tests
tests/integration/          integration tests, never run autonomously
tests/e2e/                  Playwright E2E
apps/mobile/                Expo Router mobile app
apps/tv-native/             React Native TV app
packages/contracts/         cross-platform contracts
packages/mobile-helpers/    mobile/TV-safe helpers
```

---

## Non-Negotiable Rules

- **No barrel files** — no `index.ts` re-exports; import directly from source modules.
- **Services throw typed errors** — never return `{ success: false }`.
- **No infra clients in `src/lib/`** — DB, Redis, R2, secrets, and SDK clients belong in `src/server/` or app-specific server code.
- **No `import "server-only"` in pure services** — only files using Next.js APIs like `next/headers` or `next/cache` need it.
- **No dynamic imports in server components/actions** — static top-level imports, except lazy service loading inside `createAuthenticatedAction` handlers.
- **Enums over magic strings** — fixed domain values live in `src/lib/enums/<domain>.ts`, separate from `src/lib/types/<domain>.ts`; never put shared enums in type files like `src/lib/types/jefe.ts`.
- **No string-literal unions for domain values** — use TypeScript enums in `src/lib/enums/<domain>.ts` instead.
- **DB-backed enums need a `pgEnum` AND a matching TS enum, kept in sync** — any enum used as a Postgres `pgEnum` column is declared twice and both copies must always match: a `pgEnum` with an inline string-literal array in `src/server/db/schema.ts` (what `bun run db:generate` reads), and a TypeScript enum in `src/lib/enums/<domain>.ts` (what app code and types reference — never a string-literal union, since `src/lib/` must not import `schema.ts`). Two copies are expected; they must NEVER drift. To add, remove, or rename a value, edit both the `pgEnum` array and the TS enum in the same change with identical string values.
- **`type` over `interface`** — reserve interfaces for class contracts only.
- **No `any`, no inline object types** — name object input/return types.
- **All schemas in `src/lib/schemas.ts`** — derive types with `z.infer`, never duplicate schemas inline.
- **Shared constants in constants folders** — `src/lib/constants/<domain>.ts` or `server/lib/constants/<domain>.ts`.
- **No simple wrapper functions** — delete wrappers that only forward calls or rename arguments without adding meaningful policy, validation, orchestration, or readability.
- **Deduplicate helpers into shared files** — repeated helper logic belongs in `src/lib/helpers/<domain>/`, `src/lib/helpers/common/`, `server/lib/helpers/<domain>/`, or service-level `helpers.ts`; do not copy helpers across files.
- **Named exports preferred** — exported functions, types, enums, and constants require JSDoc. One sentence is almost always enough; see `.claude/rules/code-style.md` → Comments for length and style rules.
- **Immutability** — never mutate objects or arrays.
- **No dead code or TODOs** — no commented-out code, unused imports, unreachable branches, orphaned types, or TODO comments. Exception: foundation PRs in a tracked `docs/plans/` multi-PR plan may land unconsumed `src/lib/` declarations (enums, types, errors, schemas, constants); see `.claude/rules/code-style.md`.
- **Do not edit unrelated code** — only touch code relevant to the task.

---

## Web UI Rules

- **Phosphor Icons only** — `@phosphor-icons/react`, never `lucide-react`.
- **Semantic Tailwind tokens only** — `bg-primary`, `text-muted-foreground`, etc.; never raw palette classes.
- **Primary green only via semantic primary tokens** — no `emerald-*` or `green-*`.
- **shadcn/ui for primitives** — install with `bunx shadcn@latest add <component>`.
- **Use shared button components** — `CtaTextIconButton`, `CtaIconOnlyButton`, `TransparentButton`, `RedDestructiveButton`; avoid raw action buttons.
- **All clickable elements need `cursor-pointer`**.
- **Use discriminated union props for distinct modes**.
- **Decompose large components into named sub-components**.

---

## File Structure

Every code file uses named sections with this divider:

```typescript
// /////////////////////////////////////////////
/* Section Name */
// /////////////////////////////////////////////
```

Imports never get a divider. Canonical order:

- Components: Imports → Enums → Types → Constants → Helpers → Sub-components → Component
- Services: Imports → Enums → Types → Constants → Helpers → Service
- Actions: Imports → Enums → Types → Constants → Helpers → Actions
- Hono routes: Imports → Enums → Types → Constants → Routes
- Stores: Imports → Enums → Types → Store
- Hooks: Imports → Enums → Types → Constants → Hook

---

## Detailed Rules

`.claude/rules/` contains the detailed conventions. These files are path-scoped so agents load them only when relevant:

| File | Scope |
|------|-------|
| `.claude/rules/code-style.md` | TypeScript code style, naming, exports, helpers |
| `.claude/rules/components.md` | Web React UI, Tailwind, shadcn, component structure |
| `.claude/rules/api-conventions.md` | Server/client boundary, actions, services, Hono routes |
| `.claude/rules/database.md` | Drizzle schema, migrations, transactions |
| `.claude/rules/mobile.md` | Expo mobile and shared mobile packages |
| `.claude/rules/tv.md` | React Native TV app |
| `.claude/rules/moviemachine.md` | Movie Machine chat tool integration |
| `.claude/rules/moviemachine-chat-capabilities.md` | Movie Machine agent capabilities reference |
| `.claude/rules/testing.md` | Unit/E2E/integration test constraints |

Before changing a subsystem, read the matching rule file and at least two nearby examples. Existing code is the source of truth.

---

## Worktree Workflow

When creating a worktree for a task:

1. Create the worktree.
2. Run `bun install` in the worktree.
3. Find an available frontend port starting at 3001.
4. Start `PORT=<port> bun dev` in the background.
5. Confirm it responds, then tell the user: `Dev server running at http://localhost:<port>`.

Start a separate Hono server only when changing Hono routes, WebSocket handlers, or server middleware. DB, Redis, R2, and Inngest are shared external services.

---

## PR Conventions

- **Title**: `feat(domain): short description (CRE-XXX)`.
- **Body**: include Summary, Demo, What Changed, and Test plan sections.
- **Demo**: use an MP4 embed for UI changes, or write `No UI changes — not applicable`.

---

## GitHub CLI

Use `gh` for PR operations:

```bash
gh pr view <NUMBER>
gh pr diff <NUMBER>
gh pr checkout <NUMBER>
```

Never use `git fetch origin pull/<NUMBER>/head`; sandbox proxies can fail with CONNECT tunnel 403.

### TLS workaround

If `gh` fails with `tls: failed to verify certificate: x509: OSStatus -26276` (corporate proxy / VPN intercepting TLS), fall back to `curl -sk` with the GitHub API:

```bash
TOKEN=$(gh auth token) && curl -sk -H "Authorization: token $TOKEN" "https://api.github.com/repos/Creatorwood/creatorwood/pulls/<NUMBER>"
# For the diff:
curl -sk -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github.v3.diff" "https://api.github.com/repos/Creatorwood/creatorwood/pulls/<NUMBER>"
```
