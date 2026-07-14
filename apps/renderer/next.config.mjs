/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads the app as static files in production; Next's dev server is
  // used in development (Electron points at http://localhost:<port>, where the
  // port is chosen by scripts/dev.mjs — 3000 unless it's busy).
  output: 'export',
  // Relative asset paths so the export loads over file:// inside Electron: the
  // production build emits `./_next/...` (relative to index.html) instead of
  // `/_next/...`, which would resolve against the filesystem root under file://
  // and 404 every chunk. Only applied to the production export — `next dev`
  // serves from http://localhost where a relative prefix would break HMR.
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : undefined,
  images: { unoptimized: true },
  // The shared workspace package ships raw TS — let Next transpile it.
  transpilePackages: ['@flowstate/shared'],
};

export default nextConfig;
