import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';

// Only the main and preload processes are bundled here. The renderer is a
// separate Next.js app (apps/renderer) served on :3000 in dev and exported to
// static HTML for production — it is intentionally not part of this config.
export default defineConfig(({ mode }) => {
  // Linear + Spotify OAuth client credentials — read from a gitignored repo-root
  // .env in dev and from CI env vars for release, then inlined into the MAIN
  // bundle only (never the renderer static export, which ships outside the asar).
  // Spotify uses PKCE, so only its client id is injected — there is no secret.
  const env = loadEnv(mode, resolve(__dirname, '../..'), ['LINEAR_', 'SPOTIFY_']);
  const oauthDefine = {
    'process.env.LINEAR_CLIENT_ID': JSON.stringify(env.LINEAR_CLIENT_ID ?? ''),
    'process.env.LINEAR_CLIENT_SECRET': JSON.stringify(env.LINEAR_CLIENT_SECRET ?? ''),
    'process.env.SPOTIFY_CLIENT_ID': JSON.stringify(env.SPOTIFY_CLIENT_ID ?? ''),
  };

  return {
    main: {
      // Main runs in full Node; keep npm deps external and emit CommonJS so
      // `__dirname` and `require` work as Electron expects. The @flowstate/shared
      // workspace ships raw TS, so bundle (transpile) it rather than externalize.
      plugins: [externalizeDepsPlugin({ exclude: ['@flowstate/shared'] })],
      define: oauthDefine,
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/index.ts') },
          output: { format: 'cjs', entryFileNames: '[name].js' },
        },
      },
    },
    preload: {
      // The preload runs sandboxed: it cannot `require` arbitrary node_modules at
      // runtime, so electron-trpc must be bundled in (only `electron` stays
      // external, which electron-vite handles). Emit CommonJS.
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/preload.ts') },
          output: { format: 'cjs', entryFileNames: '[name].js' },
        },
      },
    },
  };
});
