import { observable } from '@trpc/server/observable';
import { keymapOverridesSchema, type ShortcutCommand } from '@flowstate/shared';
import { shortcutsService } from '../services/shortcuts';
import { publicProcedure, router } from '../trpc';

// Keyboard-shortcut control plane: read/write the user's persisted keymap
// overrides, and stream commands triggered from the native application menu back
// to the renderer's dispatcher (mirrors `terminal.onData` / `claude.onEvent`).
export const shortcutsRouter = router({
  getKeymap: publicProcedure.query(() => shortcutsService.getKeymap()),

  setKeymap: publicProcedure
    .input(keymapOverridesSchema)
    .mutation(({ input }) => shortcutsService.setKeymap(input)),

  onCommand: publicProcedure.subscription(() =>
    observable<ShortcutCommand>((emit) =>
      shortcutsService.onCommand((command) => emit.next(command)),
    ),
  ),
});
