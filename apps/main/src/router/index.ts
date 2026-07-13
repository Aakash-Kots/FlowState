import { router } from '../trpc';
import { appRouter as appMeta } from './app';
import { claudeRouter } from './claude';
import { gitRouter } from './git';
import { linearRouter } from './linear';
import { onboardingRouter } from './onboarding';
import { projectsRouter } from './projects';
import { shortcutsRouter } from './shortcuts';
import { tabsRouter } from './tabs';
import { terminalRouter } from './terminal';
import { worktreeRouter } from './worktree';

export const appRouter = router({
  app: appMeta,
  git: gitRouter,
  worktree: worktreeRouter,
  tabs: tabsRouter,
  terminal: terminalRouter,
  onboarding: onboardingRouter,
  projects: projectsRouter,
  claude: claudeRouter,
  linear: linearRouter,
  shortcuts: shortcutsRouter,
});

/** Exported for the renderer's typed tRPC client (type-only import). */
export type AppRouter = typeof appRouter;
