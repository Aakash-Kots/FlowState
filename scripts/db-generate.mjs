// Linear migration generator: serialize Drizzle migration numbering through the
// shared trunk so parallel worktrees never mint colliding indexes.
//
// Drizzle numbers migrations sequentially (0008, 0009, …) and appends to an
// append-only `drizzle/meta/_journal.json`. Two worktrees generating off the
// same base both mint the same index → merge conflict + non-linear history. To
// keep the ledger a single linear chain this script:
//   1. rebases the drizzle dir on the latest <target> (default `main`),
//   2. runs `drizzle-kit generate` in this worktree,
//   3. lands ONLY the new migration on <target> via a throwaway detached git
//      worktree (claims the index the instant it's created), retrying off a
//      fresh <target> if another worktree pushed first,
//   4. commits the same migration onto the current feature branch.
//
// Run via `bun scripts/db-generate.mjs` (wired to `bun run db:generate`).
// Override the trunk with DB_MIGRATE_TARGET=<branch> to rehearse against a
// scratch branch without touching real `main`.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

//////////////
// Constants //
//////////////

const REMOTE = 'origin';
const TARGET = process.env.DB_MIGRATE_TARGET || 'main';
const DRIZZLE = 'apps/main/drizzle';
const MAX_ATTEMPTS = 5;

/////////////
// Helpers //
/////////////

// Run a command, streaming its output to the terminal. Throws on non-zero exit.
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited with code ${res.status}.`);
  }
}

// Run a command and capture stdout (trimmed). Throws on non-zero exit.
function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited with code ${res.status}.\n${res.stderr}`);
  }
  return res.stdout.trim();
}

const git = (...args) => run('git', args);
const gitOut = (...args) => capture('git', args);

// True when the working tree + index have no changes under the drizzle dir.
function drizzleClean() {
  return gitOut('status', '--porcelain', '--', DRIZZLE) === '';
}

// Hard-reset the drizzle dir to a ref: `checkout` restores tracked files, then
// `clean` removes the untracked `.sql` + snapshot a prior generate may have left.
function resetDrizzle(ref) {
  git('checkout', ref, '--', DRIZZLE);
  git('clean', '-fd', '--', DRIZZLE);
}

// Newest `NNNN_*.sql` basename (without extension) — the tag of the migration
// drizzle-kit just wrote. Sorted lexically, which matches the zero-padded index.
function newestMigrationTag() {
  const sql = readdirSync(DRIZZLE)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  return sql.length ? sql[sql.length - 1].replace(/\.sql$/, '') : null;
}

// Migration tags (`NNNN_*`) currently checked out in the working drizzle dir.
function migrationTags() {
  return readdirSync(DRIZZLE)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
}

// Migration tags present in the drizzle dir at a git ref (e.g. origin/main).
function migrationTagsAt(ref) {
  return gitOut('ls-tree', '-r', '--name-only', ref, '--', DRIZZLE)
    .split('\n')
    .map((p) => p.split('/').pop())
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
}

// Prepare the base for a new migration. We generate off the latest
// origin/<target> so parallel worktrees keep minting distinct, linear indices —
// but NEVER by discarding migrations that live only on this branch (those must
// survive onto the branch and get carried up to <target> by pushMigration):
//
//   - in sync / branch ahead  → keep the branch dir as-is; a new migration
//                               out-indexes <target>, and pushMigration copies
//                               any branch-only migrations up too.
//   - <target> strictly ahead → adopt <target> (branch has no unique work).
//   - genuinely diverged      → refuse; a human must reconcile the indices.
function rebaseDrizzleOntoTarget() {
  git('fetch', REMOTE, TARGET);
  // Restore the branch's own drizzle dir, dropping any half-generated leftovers
  // from a prior attempt, so the comparison below sees a clean branch baseline.
  resetDrizzle('HEAD');

  const branch = new Set(migrationTags());
  const target = new Set(migrationTagsAt(`${REMOTE}/${TARGET}`));
  const branchAhead = [...branch].some((t) => !target.has(t));
  const targetAhead = [...target].some((t) => !branch.has(t));

  if (branchAhead && targetAhead) {
    const onlyBranch = [...branch].filter((t) => !target.has(t)).join(', ');
    const onlyTarget = [...target].filter((t) => !branch.has(t)).join(', ');
    throw new Error(
      `[db:generate] drizzle history diverged from ${REMOTE}/${TARGET}: ` +
        `branch-only [${onlyBranch}] vs ${TARGET}-only [${onlyTarget}]. ` +
        `Reconcile the migration indices by hand before generating.`,
    );
  }
  // Adopt <target> only when it is strictly ahead; otherwise the branch dir is
  // already equal-or-superset and resetting to it would clobber branch-only work.
  if (targetAhead) resetDrizzle(`${REMOTE}/${TARGET}`);
}

// Land the freshly generated migration on <target> without pushing the feature
// branch: commit only the drizzle dir inside a throwaway detached worktree at
// origin/<target>, then push HEAD:<target>. Returns true on success, false if
// the push was rejected because <target> advanced (another worktree raced us).
function pushMigration(tag) {
  const tmp = mkdtempSync(join(tmpdir(), 'flowstate-migrate-'));
  try {
    // Detached (never the `main` branch, which may be checked out elsewhere).
    git('worktree', 'add', '--detach', tmp, `${REMOTE}/${TARGET}`);
    // Our drizzle dir == origin/<target> base + the one new migration, so
    // overlaying it makes the temp tree exactly `target + new migration`.
    cpSync(DRIZZLE, join(tmp, DRIZZLE), { recursive: true });
    git('-C', tmp, 'add', '--', DRIZZLE);
    git('-C', tmp, 'commit', '-m', `chore(db): add migration ${tag}`);

    const push = spawnSync('git', ['-C', tmp, 'push', REMOTE, `HEAD:${TARGET}`], {
      stdio: 'inherit',
    });
    return push.status === 0;
  } finally {
    git('worktree', 'remove', '--force', tmp);
  }
}

//////////
// Main //
//////////

// 1. Preflight.
if (gitOut('rev-parse', '--is-inside-work-tree') !== 'true') {
  console.error('[db:generate] not inside a git repository.');
  process.exit(1);
}
if (!gitOut('remote').split('\n').includes(REMOTE)) {
  console.error(`[db:generate] no \`${REMOTE}\` remote configured.`);
  process.exit(1);
}
const branch = gitOut('rev-parse', '--abbrev-ref', 'HEAD');
if (!drizzleClean()) {
  console.error(
    `[db:generate] \`${DRIZZLE}\` has uncommitted changes. Commit or stash them ` +
      `first — this script rebases the migration dir on ${REMOTE}/${TARGET}.`,
  );
  process.exit(1);
}

// 2. Generate-and-claim loop.
let landed = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS && !landed; attempt++) {
  rebaseDrizzleOntoTarget();

  // Invoke drizzle-kit directly (not `bun run --filter`, whose output-prefixing
  // pipes stdio and hides the TTY drizzle-kit needs for its rename/create
  // column prompts). cwd is apps/main so it finds drizzle.config.ts.
  run('bunx', ['drizzle-kit', 'generate'], { cwd: join(process.cwd(), 'apps/main') });

  if (drizzleClean()) {
    // schema.ts matches <target>'s latest snapshot — nothing to generate.
    resetDrizzle('HEAD');
    console.log('[db:generate] no schema changes — nothing to generate.');
    process.exit(0);
  }

  const tag = newestMigrationTag();
  console.log(`[db:generate] generated ${tag} (attempt ${attempt}/${MAX_ATTEMPTS}).`);

  if (pushMigration(tag)) {
    landed = true;
    console.log(`[db:generate] pushed ${tag} to ${REMOTE}/${TARGET}.`);
  } else {
    // <target> advanced under us — drop this migration and regenerate off the
    // new tip so we mint the next index instead of a colliding one.
    console.log(`[db:generate] ${REMOTE}/${TARGET} advanced; regenerating off the new tip.`);
    resetDrizzle('HEAD');
  }
}

if (!landed) {
  console.error(
    `[db:generate] gave up after ${MAX_ATTEMPTS} attempts — ${REMOTE}/${TARGET} ` +
      `kept advancing. Re-run when the trunk settles.`,
  );
  process.exit(1);
}

// 3. Commit the migration onto the current feature branch (drizzle paths only,
//    so any uncommitted schema.ts stays for the user to commit with their work).
const tag = newestMigrationTag();
git('add', '--', DRIZZLE);
git('commit', '-m', `chore(db): add migration ${tag}`);

// 4. Summary.
console.log(
  `[db:generate] done — ${tag} generated, pushed to ${REMOTE}/${TARGET}, and ` +
    `committed on ${branch}.`,
);
