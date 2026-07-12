import { router } from '../trpc';
import { appRouter as appMeta } from './app';
import { claudeRouter } from './claude';
import { gitRouter } from './git';
import { linearRouter } from './linear';
import { onboardingRouter } from './onboarding';
import { terminalRouter } from './terminal';
import { worktreeRouter } from './worktree';

export const appRouter = router({
  app: appMeta,
  git: gitRouter,
  worktree: worktreeRouter,
  terminal: terminalRouter,
  onboarding: onboardingRouter,
  claude: claudeRouter,
  linear: linearRouter,
});

/** Exported for the renderer's typed tRPC client (type-only import). */
export type AppRouter = typeof appRouter;
