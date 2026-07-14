import { join } from 'node:path';
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { DEFAULT_KEYBINDINGS, ShortcutCommand } from '@flowstate/shared';
import { appRouter } from './router';
import { archiveReaperService } from './services/archive';
import { claudeService } from './services/claude';
import { shortcutsService } from './services/shortcuts';
import { terminalService } from './services/terminal';
import { updateService } from './services/update';
import { closeStore, getWindowBounds, initStore, setWindowBounds } from './store';

///////////////
// Constants //
///////////////

// The dev orchestrator (scripts/dev.mjs) picks the first open port at/after
// 3000 and passes it through FLOWSTATE_DEV_PORT; fall back to 3000 when the
// main process is launched on its own.
const DEV_RENDERER_URL = `http://localhost:${process.env.FLOWSTATE_DEV_PORT ?? '3000'}`;

const DEFAULT_BOUNDS = { width: 1440, height: 900 };

const IS_MAC = process.platform === 'darwin';

/** Chord modifier/key tokens → Electron accelerator tokens. */
const ACCEL_MODS: Record<string, string> = {
  mod: 'CmdOrCtrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Super',
};
const ACCEL_KEYS: Record<string, string> = {
  enter: 'Return',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

/////////////
// Helpers //
/////////////

/** Translate a shared `KeyChord` (`"mod+shift+]"`) into an Electron accelerator. */
function chordToAccelerator(chord: string): string {
  const parts = chord.toLowerCase().split('+');
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1).map((m) => ACCEL_MODS[m] ?? m);
  const keyToken = ACCEL_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...mods, keyToken].join('+');
}

/**
 * Build the application menu, deriving accelerators from the resolved keymap
 * (defaults + persisted overrides) so native shortcuts track the user's
 * bindings. Menu clicks push their command to the renderer's dispatcher via
 * `shortcutsService`, which is how a shortcut fires even when a focused terminal
 * would swallow the web keydown. Rebuilt whenever the keymap changes.
 */
function buildAppMenu(): void {
  const overrides = shortcutsService.getKeymap();
  const accelerator = (command: ShortcutCommand): string | undefined => {
    const chord =
      overrides[command] ?? DEFAULT_KEYBINDINGS.find((b) => b.command === command)?.keys;
    return chord ? chordToAccelerator(chord) : undefined;
  };
  const item = (command: ShortcutCommand, label: string): MenuItemConstructorOptions => ({
    label,
    accelerator: accelerator(command),
    click: () => shortcutsService.trigger(command),
  });

  const template: MenuItemConstructorOptions[] = [
    ...(IS_MAC ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        item(ShortcutCommand.NewTab, 'New Tab'),
        item(ShortcutCommand.CloseTab, 'Close Tab'),
        { type: 'separator' },
        item(ShortcutCommand.PickWorkingFolder, 'Open Working Folder…'),
        ...(IS_MAC
          ? []
          : [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'quit' } as MenuItemConstructorOptions,
            ]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        item(ShortcutCommand.ToggleSidebar, 'Toggle Sidebar'),
        item(ShortcutCommand.OpenCommandPalette, 'Command Palette…'),
        item(ShortcutCommand.ShowShortcutsHelp, 'Keyboard Shortcuts'),
        item(ShortcutCommand.OpenSettings, 'Settings…'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        // Native accelerators so view switching works even while a focused
        // terminal would otherwise swallow the keydown.
        item(ShortcutCommand.NextView, 'Next View'),
        item(ShortcutCommand.PrevView, 'Previous View'),
        { type: 'separator' },
        item(ShortcutCommand.NextTab, 'Next Tab'),
        item(ShortcutCommand.PrevTab, 'Previous Tab'),
        { type: 'separator' },
        item(ShortcutCommand.GoToTab1, 'Tab 1'),
        item(ShortcutCommand.GoToTab2, 'Tab 2'),
        item(ShortcutCommand.GoToTab3, 'Tab 3'),
        item(ShortcutCommand.GoToTab4, 'Tab 4'),
        item(ShortcutCommand.GoToTab5, 'Tab 5'),
        { type: 'separator' },
        item(ShortcutCommand.FocusInput, 'Focus Composer'),
        item(ShortcutCommand.InterruptSession, 'Interrupt Claude'),
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const saved = getWindowBounds();
  const win = new BrowserWindow({
    width: saved?.width ?? DEFAULT_BOUNDS.width,
    height: saved?.height ?? DEFAULT_BOUNDS.height,
    x: saved?.x,
    y: saved?.y,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Wire tRPC over Electron IPC for this window.
  createIPCHandler({ router: appRouter, windows: [win] });

  win.once('ready-to-show', () => win.show());

  // Persist size/position so the window reopens where the user left it.
  win.on('close', () => {
    const { width, height, x, y } = win.getBounds();
    setWindowBounds({ width, height, x, y });
  });

  if (!app.isPackaged) {
    void win.loadURL(DEV_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load the Next.js static export.
    void win.loadFile(join(__dirname, '../../renderer/out/index.html'));
  }
}

void app.whenReady().then(() => {
  // Open the local SQLite store and run migrations before any window opens.
  initStore();

  // No Claude sessions run at boot — clear any tab left mid-turn so its status
  // dot reflects reality rather than a stuck "working" state.
  claudeService.reconcileOnStartup();

  // Reap archived worktrees whose retention delay has elapsed (incl. any that
  // came due while the app was closed), then keep sweeping on a timer.
  archiveReaperService.start();

  // Application menu carries the keyboard accelerators; rebuild it whenever the
  // user rebinds a shortcut so the native accelerators stay in sync.
  buildAppMenu();
  shortcutsService.onKeymapChange(buildAppMenu);

  createWindow();

  // Poll GitHub for a newer release and download it in the background. Only
  // meaningful in a packaged build; skipped in dev.
  if (app.isPackaged) updateService.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  archiveReaperService.stop();
  claudeService.disposeAll();
  terminalService.disposeAll();
  closeStore();
});
