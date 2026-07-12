import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads this to generate SQL migrations from `store/schema.ts` into
// `apps/main/drizzle/`. Run via `bun run db:generate`. The generated folder is
// committed and shipped with the app (see electron-builder.yml extraResources).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/store/schema.ts',
  out: './drizzle',
});
