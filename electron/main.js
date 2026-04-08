const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// In production, the game lives in extraResources/game.
// In development, we load directly from ../ethera.
const isDev = !app.isPackaged;
const gamePath = isDev
  ? path.join(__dirname, '..', 'ethera', 'index.html')
  : path.join(process.resourcesPath, 'game', 'index.html');

// Save files go in the user's AppData (persists across updates/reinstalls)
const savePath = path.join(app.getPath('userData'), 'saves');

// IPC: let the preload script request the save path
ipcMain.handle('get-save-path', () => savePath);

// IPC: install update when player clicks "restart"
ipcMain.on('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

// ── Auto-updater (production only) ──────────────────────────
let autoUpdater = null;
let mainWindow = null;

function setupAutoUpdater() {
  if (isDev) return; // skip in development

  try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;

    // Check for updates silently — don't interrupt gameplay
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      if (mainWindow) mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-update error:', err);
      // Don't bother the player with update errors — just log them
    });

    // Check for updates after a short delay so the game loads first
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('Update check failed (offline?):', err.message);
      });
    }, 5000);

  } catch (e) {
    console.log('Auto-updater not available:', e.message);
  }
}

// ── Window ──────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(960, height),
    title: 'Ethera - The Awakening',
    icon: path.join(__dirname, '..', 'ethera', 'assets', 'icon.png'),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(gamePath);

  // Open DevTools in dev mode only
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

// Quit when all windows are closed (including macOS)
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
