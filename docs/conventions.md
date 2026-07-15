# FlowState code conventions

This is the authoritative style guide for the FlowState codebase. It exists so
every file reads the same way and so shared declarations live in one predictable
place instead of leaking out of feature files. `CLAUDE.md` links here; when the
two disagree, this file wins.

FlowState is a **Bun monorepo**:

- `apps/main` — Electron main process (node/electron-only; tRPC server, SQLite).
- `apps/renderer` — Next.js/React renderer (DOM-only).
- `packages/shared` — framework-agnostic types, enums, constants, and zod
  validation schemas shared across both processes (`@flowstate/shared`).

---

## 1. File internal order

After any leading directive (`'use client'`) and the file's top-of-file JSDoc,
every file is laid out in this fixed order:

1. **Imports** — grouped (see §5).
2. **Types**
3. **Enums**
4. **Constants**
5. **Helpers** — private/module-local functions.
6. **Sub-components** — private/module-local React components used only by this
   file's one exported component (see §8). Component files only.
7. **Primary export** — the module's reason to exist (a class, the single
   exported React component, a tRPC router, a store's data-access API, …).

A category that has no members is simply absent — do not leave a gap or an empty
header for it.

## 2. Section boxes

Each **non-empty** category from §1 (Types / Enums / Constants / Helpers /
Sub-components) is introduced by an ASCII box whose rules match the middle line's
width:

```
///////////
// Types //
///////////
```

```
///////////////
// Constants //
///////////////
```

```
///////////////////
// Sub-components //
///////////////////
```

Rules:

- The box label is the category name (`Types`, `Enums`, `Constants`, `Helpers`,
  `Sub-components`).
- Emit a box **only** when that category has at least one declaration.
- **Skip boxes entirely on trivial files** — a lone component, a single util, a
  one-declaration module (`components/ui/cn.ts`, `lib/trpc.ts`). The §1 ordering
  still applies; the boxes would just dwarf the code. Rule of thumb: if a file
  has one primary export and ≤1 supporting declaration, no boxes.
- **Skip the box on single-category files.** Boxes delimit categories _within a
  mixed file_. A file that is entirely one category — every shared `types/`,
  `enums/`, or `constants/` domain file — needs no box; its folder and name
  already say what it holds. Boxes earn their keep in feature files (services,
  components, stores) that mix types + constants + helpers + a primary export.
- The **primary export** (the class/component/router) does not get a box — it is
  the point of the file, not a section within it.
- Do **not** use other divider styles (e.g. `// ---- label ----`). If a large
  file needs finer structure inside a class or the Helpers section, prefer
  splitting the file or a plain one-line `// comment`.

## 3. Shared code lives in domain files, never exported from feature files

A **type, enum, or constant must never be exported from a feature file** (a
service, component, router, store module, …). If it is used in more than one
place, it moves to a domain-named file under a shared location and is imported
from there.

### Two-tier shared location

- **Cross-app** (used by both processes, or genuinely framework-agnostic) →
  `packages/shared/src/{types,enums,constants,schemas}/<domain>.ts`, re-exported
  from `packages/shared/src/index.ts`. Keep this package free of
  node/electron/DOM imports so both processes can consume it.
- **App-internal but used across multiple files in one app** → that app's own
  `src/lib/{types,enums,constants,schemas}/<domain>.ts`
  (`apps/main/src/lib/...`, `apps/renderer/lib/...`). Use this for anything that
  must stay on one side of the process boundary (e.g. main's Electron/keychain
  code).

The four folders map to four kinds of declaration: `types/` = TypeScript
types/interfaces, `enums/` = enums, `constants/` = constant values, `schemas/` =
zod validation schemas (§5).

Files are named by **domain**, kebab-case: `claude.ts`, `workspace.ts`,
`onboarding.ts`, `secret.ts`, `connection.ts`.

### Carve-out: a module's intentional public API

This rule targets **incidental** shared declarations that leak between files. It
does **not** force a module's deliberate public interface out of the module.
These legitimately stay where they are:

- Service singletons — `terminalService`, `claudeService`, `authService`.
- Store data-access functions (`getSetting`, `setSecret`, `listWorkspaces`, …)
  and the drizzle table objects in `store/schema.ts`.
- tRPC routers and the inferred `AppRouter` type (`router/index.ts`).
- Framework-inferred, co-located types (`WorkspaceRow`, `Db`) that only make
  sense next to their schema/client.
- The design-system `cn()` util in `components/ui/cn.ts`.

The test: if the export is a **type/enum/constant** and another file imports it,
it moves. If it is the module's **behavior** (a function/class/singleton that is
the module's purpose), it stays.

## 4. Enums, not string unions

Model any **fixed set of domain string values** as a TypeScript `enum` in an
`enums/<domain>.ts` file — do not declare `type X = 'a' | 'b' | 'c'` for
data/logic values.

```ts
export enum ClaudeSessionState {
  Idle = 'idle',
  Running = 'running',
  Waiting = 'waiting',
  Error = 'error',
}
```

- Use **string enums** whose values are the wire strings, so they serialize over
  IPC / persist to SQLite unchanged and existing data still validates.
- **Zod:** validate against the enum with `z.nativeEnum(TheEnum)`; in a
  `z.discriminatedUnion`, use `z.literal(TheEnum.Member)` as the discriminator.
  Schema defaults use enum members (`.default(ClaudeSessionState.Idle)`).
- **Consumers** compare/construct with enum members (`state === ClaudeSessionState.Running`,
  `{ kind: ChatEventKind.Init, … }`), never raw strings.

### Mirroring third-party / SDK discriminants

When we **dispatch on** a third-party / SDK string discriminant (e.g. the
`subtype` of `@anthropic-ai/claude-agent-sdk`'s `type: 'system'` messages),
re-declare that fixed set as our own **mirror enum** in `enums/<domain>.ts` and
branch on its members instead of scattering raw wire strings through a `switch` /
`if` chain. A string enum whose values are byte-identical to the SDK's still
narrows the SDK's discriminated union (`message.subtype === SdkSystemSubtype.X`
narrows `message`), so we get named branches with no loss of type-safety. Keep
the enum values exactly equal to the vendor's strings, and comment that they must
stay in sync. See `apps/main/src/lib/enums/claude.ts` (`SdkSystemSubtype`).

Constructing a value the SDK owns (passing `{ behavior: 'allow' }` into the SDK's
`PermissionResult`) may still use the raw literal the SDK defines — mirror it only
when we branch on it enough to earn the enum.

### One boundary where raw strings stay

**Purely-presentational React variant props** and **trivial single-file UI
state** stay as string-literal unions — enums make JSX unidiomatic. Examples that
intentionally remain unions: `Button`'s `variant` prop, `ConnectScreen`'s local
`Busy`. These are not domain data and are not exported.

A schema that validates one of these enums uses `z.nativeEnum(TheEnum)` (or
`z.literal(TheEnum.Member)` inside a discriminated union) — see §5 for where
schemas live.

## 5. Types are hand-declared; zod schemas validate at boundaries

A TypeScript `type`/`interface` and a zod schema do two **different jobs**, so we
keep them in two different places:

- **Types are the declared shape.** Hand-write them in `types/<domain>.ts` with
  the `type` keyword — this is the source of truth a reader looks at, and it is
  what the rest of the code type-checks against. Do **not** use zod (`z.infer`)
  as your type system. Always declare with `export type X = …`; we do **not** use
  `interface` anywhere (one keyword, consistently, incl. unions & intersections).

  ```ts
  // packages/shared/src/types/workspace.ts
  export type Workspace = {
    id: string;
    name: string;
    // …
    claudeState: ClaudeSessionState;
  };
  ```

- **Schemas are runtime validation.** A TypeScript type is erased at build time
  and enforces nothing at runtime, so data that enters from **outside
  TypeScript's guarantees** is validated with a zod schema. Schemas live in a
  separate `schemas/<domain>.ts` and mirror the declared type:

  ```ts
  // packages/shared/src/schemas/workspace.ts
  import type { Workspace } from '../types/workspace';
  export const workspaceSchema: z.ZodType<Workspace> = z.object({/* … */});
  ```

  Annotate the schema with `z.ZodType<TheType>` (or otherwise keep it in lockstep
  with the type) so the two cannot silently drift. The schema imports its enums
  from `enums/<domain>.ts` and validates them with `z.nativeEnum` /
  `z.literal(Enum.Member)`.

### Which boundaries need a schema

Validate — i.e. `schema.parse(...)` at the edge — whenever data arrives from
outside TypeScript's control, so the rest of the code works with trusted values:

- tRPC/IPC inputs — `.input(schema)` (`worktree.ts` → `createWorkspaceInputSchema`).
- SQLite rows / `JSON.parse` output — re-parsed before use
  (`workspaceSchema.parse(row)`, `claudeMessageSchema.parse(...)`), because the
  DB column is untyped text as far as TypeScript knows.
- The Claude Agent SDK payloads and any user input.

Trivial one-off tRPC input schemas (`z.object({ terminalId: z.string() })`) may
stay **inline** in the router — only shared/reused schemas move to `schemas/`.

### When a plain type with no schema is correct

Not every shape needs a schema. A hand-written `type` with **no** schema is right
when the shape never crosses a validation boundary — it is constructed and
consumed entirely within code you control:

- In-memory / module-local runtime state (`Session` in `terminal.ts`,
  `PendingPermission` in `claude.ts`).
- React prop shapes (typed inline on the component).
- Framework-inferred types (`AppRouter = typeof appRouter`).

Rule of thumb: **does this data arrive from outside TypeScript's control?**
Yes → declared `type` in `types/` **and** a `z.ZodType<>` schema in `schemas/`.
No → plain `type` only.

## 6. Imports

Grouped, in this order, blank line optional between groups but order enforced:

1. `node:` builtins (`import { join } from 'node:path'`).
2. Third-party packages (`zod`, `react`, `drizzle-orm`, …).
3. Workspace packages (`@flowstate/shared`).
4. Local relative imports (`./db`, `../ui/cn`, `@/lib/chat`).

Type-only imports use `import type` (required by `verbatimModuleSyntax` on
main+shared; use it in the renderer too for consistency). **Enums are values**
(used at runtime), so import them as regular imports, never `import type`.

## 7. Naming

- React components: `PascalCase.tsx`, function components, props typed inline as
  a destructured object literal (`function X({ a }: { a: string })`).
- Non-component modules: kebab/lowercase `.ts` named by domain.
- Enums: `PascalCase` type, `PascalCase` members with wire-string values.
- Constants: `SCREAMING_SNAKE_CASE`.
- Object/union shapes: declare with `type`, never `interface`.

## 8. UI components (renderer)

All React components live in `apps/renderer/components/`, split by role:

- **Design-system primitives (shadcn/ui)** → `apps/renderer/components/ui/`.
  This is the shadcn destination — reusable, presentational, app-agnostic
  primitives (`Button`, `Card`, `StatusPill`) plus the `cn()` class-merge helper
  (`components/ui/cn.ts`). If you add shadcn components (via the CLI or by hand),
  they go here; point the shadcn `components.json` alias at `@/components/ui`. A
  primitive owns its own **presentational** variant unions inline (e.g. `Button`'s
  `variant`) — those intentionally stay string-literal props (§4), not enums.
- **Feature / domain components** → `apps/renderer/components/<domain>/`
  (`components/chat/…`) or the top level for one-off screens (`ConnectScreen`,
  `TerminalView`). These compose primitives and wire in `@/lib` state.

Primitives must not import from feature components or feature state — the
dependency arrow points `feature → ui`, never back.

### One exported component per feature file

A **feature/domain component file exports exactly one component** — its primary
export, at the end of the file (§1). It may compose any number of **local
sub-components declared above it under the `// Sub-components //` box (§2); those
are never exported.** When a piece of UI is reused by another file it graduates
to its own file (or a `ui/` primitive), not an exported sub-component.

```tsx
// components/sidebar/AppSidebar.tsx
///////////////////
// Sub-components //
///////////////////

/** One project row: derived name + full path. */
function ProjectItem({ cwd }: { cwd: string }) {
  /* … */
}

/** The workspace sidebar — shows the current project/worktree. */
export function AppSidebar() {
  return <ProjectItem cwd={/* … */} />;
}
```

**Carve-out — shadcn/ui primitives are exempt.** Design-system primitives in
`components/ui/` are compound-component families that intentionally export many
parts (`Sidebar`, `SidebarMenu`, `SidebarTrigger`, …) and keep their canonical
upstream **lowercase filenames** (`sidebar.tsx`, `collapsible.tsx`, `tabs.tsx`).
The one-export rule governs feature components, not primitives.

## 9. Docstrings

Write a short `/** … */` docstring over anything whose purpose or contract isn't
obvious from its name — non-trivial **functions, services, tRPC procedures, store
accessors, and the exported component** of a component file. One or two lines is
plenty: say what it does and any contract worth knowing (side effects, what it
keys on, when it's a no-op). This is the same style already used at the top of
`services/claude.ts`, `store/*.ts`, and on `ClaudeService`'s methods.

- **Do** document: exported/public functions and singletons, anything with a
  non-obvious side effect or ordering requirement, the primary component export.
- **Skip** trivial one-liners and self-evident wrappers — a docstring that just
  restates the name is noise. Prefer a clear name over a docstring.
- Keep the file's **top-of-file JSDoc** (module summary) as the norm for any
  non-trivial module (§1).

## 10. Formatting

Prettier is the source of truth (`.prettierrc`): single quotes, semicolons,
trailing commas, `printWidth: 100`, `tabWidth: 2`. Run `bun run format`. Verify a
change with `bun run typecheck && bun run lint && bun run build`.
