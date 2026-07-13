/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads the app as static files in production; Next's dev server is
  // used in development (Electron points at http://localhost:<port>, where the
  // port is chosen by scripts/dev.mjs — 3000 unless it's busy).
  output: 'export',
  // Relative asset paths so the export loads over file:// inside Electron.
  images: { unoptimized: true },
  // The shared workspace package ships raw TS — let Next transpile it.
  transpilePackages: ['@flowstate/shared'],
};

export default nextConfig;
