import { exposeElectronTRPC } from 'electron-trpc/main';

// The ONLY thing exposed across the contextBridge is the electron-trpc port.
// All privileged operations go through the typed tRPC routers in the main
// process, where inputs are validated with zod.
process.once('loaded', () => {
  exposeElectronTRPC();
});
