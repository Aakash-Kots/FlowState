/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads the app as static files in production; Next's dev server is
  // used in development (Electron points at http://localhost:<port>, where the
  // port is chosen by scripts/dev.mjs — 3000 unless it's busy).
  output: 'export',
  // Emit every route as a directory with its own `index.html` (`/connect` →
  // `connect/index.html`). In the packaged app Electron serves the export over
  // the custom `app://` scheme (see apps/main/src/index.ts); directory routes
  // mean navigations and reloads target `app://bundle/connect/` — a trailing-
  // slash URL the protocol handler can resolve — rather than an extensionless
  // URL, which crashes a Chromium `standard`-scheme main-frame navigation.
  trailingSlash: true,
  // No `assetPrefix`: the `app://` origin (prod) and localhost (dev) both make
  // absolute `/_next/...` URLs resolve correctly regardless of route depth, so
  // the relative-path workaround the file:// load once needed is unnecessary.
  images: { unoptimized: true },
  // The shared workspace package ships raw TS — let Next transpile it.
  transpilePackages: ['@flowstate/shared'],
};

export default nextConfig;
