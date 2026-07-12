import { z } from 'zod';
import { TerminalService } from '../services/terminal';
import { publicProcedure, router } from '../trpc';

const terminals = new TerminalService();

// Stub router — see TerminalService / milestone 2. Bulk pty data flows over a
// dedicated raw IPC channel, not tRPC; this router covers lifecycle only.
export const terminalRouter = router({
  spawn: publicProcedure
    .input(z.object({ cwd: z.string() }))
    .mutation(({ input }) => terminals.spawn(input.cwd)),
});
