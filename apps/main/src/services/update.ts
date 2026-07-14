/**
 * Auto-update — thin wrapper over `electron-updater`'s `autoUpdater`, which
 * pulls release metadata (`latest-mac.yml`) and assets from the GitHub release
 * whose tag matches this build's version (see the `publish` block in
 * electron-builder.yml). Updates download in the background and install on the
 * next quit.
 *
 * macOS caveat: `autoUpdater` refuses to apply an unsigned/un-notarized update —
 * the OS Squirrel.Mac layer requires a valid Developer ID signature. Until
 * signing is wired up (CSC_LINK / APPLE_API_KEY in electron-builder.yml), the
 * check runs but no install will land; that's expected and harmless.
 */
import { autoUpdater } from 'electron-updater';

//////////////////////
// Update service //
//////////////////////

class UpdateService {
  private started = false;

  /**
   * Kick off a background update check. No-op in dev (an unpackaged app has no
   * release to update to) and idempotent so repeated calls are safe.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // `checkForUpdatesAndNotify` handles the whole flow: check → download →
    // OS notification, then install on quit. Swallow errors (offline, no
    // release yet, unsigned build) — a failed check must never crash boot.
    void autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
}

/** Shared singleton — started from `index.ts` once the app is ready. */
export const updateService = new UpdateService();
