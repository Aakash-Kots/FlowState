/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron loads the app as static files in production; Next's dev server is
  // used in development (Electron points at http://localhost:3000).
  output: 'export',
  // Relative asset paths so the export loads over file:// inside Electron.
  images: { unoptimized: true },
  // The shared workspace package ships raw TS — let Next transpile it.
  transpilePackages: ['@flowstate/shared'],
};

export default nextConfig;
