import { router } from '../trpc';
import { analyticsRouter } from './analytics';
import { appRouter as appMeta } from './app';
import { claudeRouter } from './claude';
import { filesRouter } from './files';
import { gitRouter } from './git';
import { linearRouter } from './linear';
import { onboardingRouter } from './onboarding';
import { pinsRouter } from './pins';
import { projectsRouter } from './projects';
import { settingsRouter } from './settings';
import { shortcutsRouter } from './shortcuts';
import { skillsRouter } from './skills';
import { spotifyRouter } from './spotify';
import { systemRouter } from './system';
import { tabsRouter } from './tabs';
import { terminalRouter } from './terminal';
import { usageRouter } from './usage';
import { worktreeRouter } from './worktree';

export const appRouter = router({
  app: appMeta,
  git: gitRouter,
  files: filesRouter,
  worktree: worktreeRouter,
  tabs: tabsRouter,
  terminal: terminalRouter,
  onboarding: onboardingRouter,
  projects: projectsRouter,
  pins: pinsRouter,
  skills: skillsRouter,
  claude: claudeRouter,
  linear: linearRouter,
  spotify: spotifyRouter,
  system: systemRouter,
  shortcuts: shortcutsRouter,
  settings: settingsRouter,
  usage: usageRouter,
  analytics: analyticsRouter,
});

/** Exported for the renderer's typed tRPC client (type-only import). */
export type AppRouter = typeof appRouter;
