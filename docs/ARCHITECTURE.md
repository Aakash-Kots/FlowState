# FlowState — Infrastructure & Architecture Plan

This document is the implementation blueprint for FlowState: a macOS desktop app (shipped as a DMG) that unifies Claude Code, Git, terminals, worktrees, and Linear into one coder's workflow.

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** | Full Node access in the main process (ptys, git, Claude Agent SDK), mature macOS packaging/signing story |
| UI | **Next.js (React + TypeScript)**, static export | App Router UI dev experience; exported as static assets that Electron serves — no Node server in production |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, consistent desktop-app UI |
| State | **Zustand** (client state) + **TanStack Query** (async/server state like Linear data) | Small, composable, no boilerplate |
| IPC | **electron-trpc** (tRPC over Electron IPC) via a `contextBridge` preload | End-to-end typed calls and subscriptions between renderer and main; no hand-rolled channel strings |
| Claude Code | **`@anthropic-ai/claude-agent-sdk`** | Official SDK that programmatically drives Claude Code sessions (spawn, stream, interrupt, resume); reuses the user's existing Claude Code login |
| Git | **simple-git** (wraps system `git`) + **chokidar** watching `.git` | Full worktree support via raw commands; system git means user's hooks/credentials/LFS all work |
| Terminal | **node-pty** (main) + **xterm.js** (renderer) | The standard Electron terminal pairing (same as VS Code) |
| Linear | **`@linear/sdk`** | Official typed GraphQL client; OAuth 2.0 or personal API key |
| Persistence | Local **SQLite** via **Drizzle ORM** + **`better-sqlite3`** | Queryable workspace/transcript store; type-safe queries; `drizzle-kit` migrations. Local-first — no server |
| Secrets | Electron **`safeStorage`** (Keychain-backed) | Never store Linear/GitHub/Anthropic tokens in plaintext; only ciphertext is written to SQLite |
| Packaging | **electron-builder** + **electron-updater** | DMG output, code signing, notarization, auto-update from GitHub Releases |
| Tooling | **pnpm workspaces**, **electron-vite** for main/preload bundling, ESLint + Prettier, Vitest + Playwright | Monorepo hygiene, fast builds |

> Note on Next.js-in-Electron: production uses `output: 'export'` (pure static assets loaded by Electron). In dev, Electron points at the Next dev server (`http://localhost:3000`) for HMR. Anything needing Node (git, ptys, SDK) lives in the **main process**, never in the renderer — Next.js API routes and SSR are not used.

## 2. Repository Layout

```
flowstate/
├── apps/
│   ├── main/                 # Electron main process (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts          # app lifecycle, window management
│   │   │   ├── preload.ts        # contextBridge — the only renderer↔main door
│   │   │   ├── router/           # tRPC routers (one per domain)
│   │   │   │   ├── claude.ts     #   Claude Code sessions
│   │   │   │   ├── git.ts        #   status/branch/commit/push/log
│   │   │   │   ├── worktree.ts   #   add/list/remove/switch
│   │   │   │   ├── terminal.ts   #   pty lifecycle
│   │   │   │   └── linear.ts     #   issues, status updates, OAuth
│   │   │   ├── services/         # the actual logic behind each router
│   │   │   └── store/            # local SQLite via Drizzle + safeStorage secrets
│   │   └── electron-builder.yml
│   └── renderer/             # Next.js UI
│       ├── app/                  # App Router pages: /workspace, /tickets, /agent, /settings
│       ├── components/           # git panel, terminal tabs, agent chat, ticket list
│       └── lib/trpc.ts           # typed client over IPC
├── packages/
│   └── shared/               # types + zod schemas shared by main and renderer
├── docs/
└── .github/workflows/        # CI: lint/test/build; Release: sign, notarize, DMG
```

## 3. Process Architecture

```
┌─────────────────────────── Electron Main (Node) ───────────────────────────┐
│                                                                             │
│  ClaudeService          GitService           TerminalService   LinearService│
│  Agent SDK query()      simple-git per       node-pty pool     @linear/sdk  │
│  1 session / worktree   worktree + watcher   1+ pty / worktree OAuth tokens │
│                                                                             │
│                 └──────────── tRPC over IPC (typed) ────────────┘           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                            preload / contextBridge
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                     Renderer — Next.js static export                         │
│   Workspace view: [Git panel] [xterm tabs] [Claude session] [Linear ticket]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**The core domain concept is a Workspace** = one git worktree + its terminals + its Claude Code session + an optionally linked Linear issue. Every service is keyed by workspace ID, which makes parallel agent runs on separate branches the natural default.

Security posture: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer; all privileged operations go through the tRPC routers where inputs are validated with zod.

## 4. Feature Design

### 4.1 Claude Code connectivity
- Use the **Claude Agent SDK for TypeScript** in the main process. Each workspace gets a session created with `query({ prompt, options: { cwd: worktreePath, ... } })`; messages stream back and are forwarded to the renderer as a tRPC subscription.
- **Auth:** the SDK resolves credentials the same way Claude Code does — the user's existing Claude Code login/OAuth profile or `ANTHROPIC_API_KEY`. FlowState should not ask for a key if a login already exists; a settings screen covers the fallback.
- Support session lifecycle: start, stream (text, tool-use, permission requests), interrupt, resume by session ID. Permission prompts from the agent render as native-feeling dialogs in the UI.
- Session transcripts persist per-workspace so a workspace reopens with its agent history.

### 4.2 Git management
- `simple-git` instance per worktree. Expose: status, stage/unstage, commit, branch create/switch, log, diff (rendered in UI), push/pull, stash.
- `chokidar` watches `.git/HEAD`, index, and refs to push live status updates to the renderer (debounced).
- Diff review UI doubles as the review surface for what the Claude agent changed before committing.

### 4.3 Worktree management
- Thin wrapper over `git worktree add/list/remove --porcelain` (raw commands through simple-git).
- Creating a workspace from a Linear ticket: derive branch name from the ticket identifier (e.g. `eng-142-fix-login`), `git worktree add`, open terminals + agent in it.
- Guard rails: block removal with uncommitted changes unless forced; prune stale worktrees on startup.

### 4.4 Terminal management
- `node-pty` spawns the user's login shell (`$SHELL`, login+interactive so PATH/nvm/rbenv work) with `cwd` set to the worktree.
- Renderer uses `xterm.js` + fit/webgl addons. Data is streamed over a dedicated high-throughput IPC channel (raw `ipcRenderer` port, not tRPC) to keep latency low.
- Multiple tabs per workspace; ptys are killed when a workspace closes, with scrollback optionally persisted.

### 4.5 Linear connectivity
- **OAuth 2.0** flow: open Linear's authorize URL in the default browser, catch the redirect on a localhost loopback (or custom `flowstate://` protocol), exchange for tokens in the main process. Personal API key supported as the simple path first.
- Tokens encrypted with `safeStorage`; only the ciphertext is written to the local SQLite `secrets` table.
- Features: my assigned issues, issue detail, status transitions (auto-move to "In Progress" when a workspace is created from a ticket, prompt to move to "In Review" when a PR is pushed), attach branch/PR links back to the issue.

### 4.6 Persistence (local-first)

- **One SQLite database** at `app.getPath('userData')/flowstate.db`, accessed through **Drizzle ORM**
  over `better-sqlite3` (synchronous, native — rebuilt against Electron's ABI via
  `electron-builder install-app-deps`, same as `node-pty`).
- **Schema** lives in `store/schema.ts`; tables: `workspaces`, `claude_messages` (transcripts),
  `settings` (key/value; window bounds, UI prefs), `secrets` (encrypted ciphertext only). Column
  shapes mirror the shared zod schemas, and the query modules re-validate on read/write.
- **Migrations** are SQL files generated by `drizzle-kit` into `apps/main/drizzle/` (committed).
  `store/db.ts` applies them on startup via Drizzle's migrator. The folder ships beside the app:
  `app.getAppPath()` in dev, `process.resourcesPath` when packaged (electron-builder
  `extraResources`).
- **Secrets** (Linear/GitHub/Anthropic) are encrypted with `safeStorage` and only their ciphertext is
  stored in the `secrets` table — plaintext never touches disk. If encryption is unavailable (e.g.
  headless CI), the store refuses to persist rather than fall back to plaintext.
- **No cloud database.** A backend (e.g. Supabase) is deferred until accounts/billing/team/cross-device
  sync exist, and would hold metadata only — never tokens, transcripts, or code. Drizzle keeps that a
  driver swap (e.g. libsql/Turso for embedded-replica sync), not a rewrite.

### 4.7 The unified flow (v1 golden path)
1. Pick a Linear ticket → 2. FlowState creates a worktree + branch named after it → 3. Claude Code session starts in that worktree with ticket context in the prompt → 4. Review the diff in the Git panel, run tests in the terminal → 5. Commit + push → 6. Linear status updates automatically.

## 5. Packaging & Distribution (macOS DMG)

- **electron-builder** targets: `dmg` and `zip` (zip required for auto-update), `arm64` + `x64` (or universal).
- **Native modules:** `node-pty` must be rebuilt against Electron's Node ABI — `electron-builder install-app-deps` / `@electron/rebuild` in postinstall.
- **Signing & notarization:** Developer ID Application certificate, hardened runtime, entitlements for JIT if needed; notarize via `notarytool` (electron-builder's `notarize` option) in CI using App Store Connect API key secrets.
- **Auto-update:** `electron-updater` pointed at GitHub Releases; publish on tag.
- **CI (GitHub Actions):**
  - `ci.yml` — lint, typecheck, unit tests on PRs.
  - `release.yml` — on `v*` tag: build renderer (static export) → build main → `electron-builder --mac --publish always` on a macOS runner with signing certs in secrets.

## 6. Build Order (suggested milestones)

1. **Scaffold** — pnpm monorepo, Electron + Next.js dev loop, typed IPC bridge, window/state persistence.
2. **Terminal** — node-pty + xterm.js in a fixed directory. (Proves the native-module + IPC-throughput path early, which is the riskiest packaging item.)
3. **Git + worktrees** — status panel, worktree create/switch, workspace model.
4. **Claude Code** — Agent SDK session per workspace, streaming chat UI, permission prompts, diff review of agent output.
5. **Linear** — API-key auth first, ticket list, ticket → workspace flow; OAuth after.
6. **Ship** — signing, notarization, DMG, auto-update, release CI.
