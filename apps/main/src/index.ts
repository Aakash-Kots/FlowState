import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { appRouter } from './router';

const DEV_RENDERER_URL = 'http://localhost:3000';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
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

  if (!app.isPackaged) {
    void win.loadURL(DEV_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load the Next.js static export.
    void win.loadFile(join(__dirname, '../../renderer/out/index.html'));
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
