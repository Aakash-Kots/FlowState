import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads this to generate SQL migrations from `store/schema.ts` into
// `apps/main/drizzle/`. Run via `bun run db:generate`. The generated folder is
// committed and shipped with the app (see electron-builder.yml extraResources).
//
// The app applies migrations automatically on startup (see store/db.ts). The
// `db:migrate` script below is a convenience for applying them to the dev
// database out-of-band — it targets the same SQLite file Electron opens in dev:
// `app.getPath('userData')/flowstate.db`, which on macOS resolves via the
// `@flowstate/main` package name to ~/Library/Application Support/@flowstate.
const devDbFile = join(homedir(), 'Library', 'Application Support', '@flowstate', 'flowstate.db');

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/store/schema.ts',
  out: './drizzle',
  dbCredentials: { url: devDbFile },
});
