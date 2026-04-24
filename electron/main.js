const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// Game location:
// - In development, load from the Vite dev server at localhost:5173.
//   Start it with `npm run dev` in ../slime-depths (or VITE_DEV_URL override).
//   This gives us HMR + devtools for free. If Vite isn't running, the window
//   will show a connection error — start Vite first.
// - In production (packaged), load the built HTML from extraResources/game.
//   electron-builder's `build.extraResources` in package.json copies
//   ../slime-depths/dist into the packaged app's resources at "game/".
//   Run `npm run build:win` (or :mac / :linux) — the prebuild script will
//   rebuild slime-depths first automatically.
const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';
const prodIndexPath = path.join(process.resourcesPath, 'game', 'index.html');

// Save files go in the user's AppData (persists across updates/reinstalls)
const savePath = path.join(app.getPath('userData'), 'saves');

// IPC: let the preload script request the save path
ipcMain.handle('get-save-path', () => savePath);

// IPC: synchronous save-path — lets preload.js bootstrap its KV store
// before the renderer begins making localStorage-style reads, without
// needing to make every game-side read/write async. The value is static
// (set at app start), so a blocking sync IPC is safe here.
ipcMain.on('get-save-path-sync', (event) => {
  event.returnValue = savePath;
});

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
    // Icon source is the electron/build/ folder (used by electron-builder for
    // the installer). No per-platform inline icon override here — Windows
    // picks up .ico from the installer, macOS from Info.plist, Linux from
    // the AppImage metadata. Leaving this line commented as a marker for
    // where a runtime-override icon path would go if ever needed.
    // icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(prodIndexPath);
  }

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
