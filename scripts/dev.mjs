// Dev orchestrator: pick the first open port at/after 3000, then run the
// renderer (Next dev) and main (Electron) with that port injected so both
// halves agree on where the renderer lives.
//
// The chosen port is exported as FLOWSTATE_DEV_PORT and consumed by:
//   - apps/renderer `dev`  -> `next dev -p ${FLOWSTATE_DEV_PORT:-3000}`
//   - root `dev:main`      -> `wait-on tcp:127.0.0.1:${FLOWSTATE_DEV_PORT:-3000}`
//   - apps/main src/index.ts -> DEV_RENDERER_URL
//
// Run via `bun scripts/dev.mjs` (wired to `bun run dev`).

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const BASE_PORT = 3000;
const MAX_ATTEMPTS = 50;

// Resolve to `port` if nothing is listening on it, otherwise reject so we can
// try the next one. We bind the unspecified address (no host) so the check
// matches how `next dev` binds — all interfaces, IPv6 `::` in dual-stack mode.
// Probing only 127.0.0.1 would miss a process holding the port on IPv6 and
// hand Next a port it then fails to bind with EADDRINUSE.
function tryPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.once('listening', () => {
      server.close(() => resolve(port));
    });
    server.listen(port);
  });
}

async function findOpenPort(start, attempts) {
  for (let port = start; port < start + attempts; port++) {
    try {
      return await tryPort(port);
    } catch {
      // Port busy — try the next one.
    }
  }
  throw new Error(`No open port found in range ${start}-${start + attempts - 1}.`);
}

const port = await findOpenPort(BASE_PORT, MAX_ATTEMPTS);
if (port !== BASE_PORT) {
  console.log(`[dev] port ${BASE_PORT} busy — using ${port} instead.`);
} else {
  console.log(`[dev] using port ${port}.`);
}

// Delegate the actual two-process orchestration to the existing concurrently
// script; running it through `bun run` puts node_modules/.bin on PATH.
const child = spawn('bun', ['run', 'dev:concurrent'], {
  stdio: 'inherit',
  env: { ...process.env, FLOWSTATE_DEV_PORT: String(port) },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
