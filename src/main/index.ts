// Entry point main process GreenMart Kasir.
import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';
import { openDatabaseAt, type DB } from './db/database';
import { getSetting, setSetting } from './db/repositories/settings';
import { runBackup } from './db/backup';
import { registerIpc } from './ipc/register';
import { SyncManager } from './sync/scheduler';

let db: DB | null = null;
let syncManager: SyncManager | null = null;
let mainWindow: BrowserWindow | null = null;

// Log ke file di userData (PRD §9 — rotasi sederhana bawaan electron-log).
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1200,
    minHeight: 700,
    title: 'GreenMart Kasir',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  // Renderer tidak boleh membuka window/navigasi keluar aplikasi.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function backupDaily(): void {
  if (!db) return;
  const dir = getSetting(db, 'backup_dir', '') || path.join(app.getPath('userData'), 'backups');
  if (!getSetting(db, 'backup_dir', '')) setSetting(db, 'backup_dir', dir);
  const res = runBackup(db, dir, true);
  log.info(res.skipped ? `Backup hari ini sudah ada: ${res.file}` : `Backup dibuat: ${res.file}`);
}

app.whenReady().then(() => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'kasir.db');
    db = openDatabaseAt(dbPath);
    log.info('Database terbuka:', dbPath);

    backupDaily();

    syncManager = new SyncManager(db, () => mainWindow);
    registerIpc({ db, sync: syncManager, defaultBackupDir: path.join(app.getPath('userData'), 'backups') });
    syncManager.startAuto();

    createWindow();
  } catch (err) {
    log.error('Gagal start:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('quit', () => {
  try {
    syncManager?.stop();
    db?.close();
  } catch {
    // abaikan
  }
});
