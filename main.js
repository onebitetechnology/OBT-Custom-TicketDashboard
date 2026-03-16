const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (_) {
  autoUpdater = null;
}

let mainWindow = null;
let serverProcess = null;
let serverPort = null;
let updateCheckTimer = null;
let updateStatus = {
  available: false,
  checking: false,
  downloaded: false,
  message: 'Update checks are idle.',
  version: null,
};
const WEEKLY_UPDATE_CHECK_MS = 7 * 24 * 60 * 60 * 1000;

function getBundledAppDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, 'app');
}

function getDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function getConfigPath() {
  return path.join(getDataDir(), 'config.json');
}

function getServerEntry() {
  return path.join(getBundledAppDir(), 'server.js');
}

function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function seedDataFiles() {
  const sourceDir = getBundledAppDir();
  const targetDir = getDataDir();
  const fileNames = [
    'config.json',
    'category-rules.json',
    'consignment-rules.json',
    'invoice-detail-cache.json',
    'ticket-meta-cache.json',
  ];

  for (const fileName of fileNames) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function loadWindowPreferences() {
  const defaults = {
    fullscreen: false,
    orientation: 'auto',
  };

  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return defaults;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const saved = config?.uiPreferences?.display || {};
    const orientation = ['auto', 'horizontal', 'vertical'].includes(String(saved.orientation || '').toLowerCase())
      ? String(saved.orientation).toLowerCase()
      : defaults.orientation;
    return {
      fullscreen: !!saved.fullscreen,
      orientation,
    };
  } catch (_) {
    return defaults;
  }
}

function getWindowBoundsForPreferences(preferences = {}) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const orientation = preferences.orientation || 'auto';
  const isVertical = orientation === 'vertical';
  const widthRatio = isVertical ? 0.62 : 0.88;
  const heightRatio = isVertical ? 0.92 : 0.86;
  const width = Math.max(1100, Math.min(area.width, Math.round(area.width * widthRatio)));
  const height = Math.max(800, Math.min(area.height, Math.round(area.height * heightRatio)));

  return {
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
  };
}

function applyWindowPreferences(preferences = {}) {
  if (!mainWindow) return null;
  const nextPreferences = {
    fullscreen: !!preferences.fullscreen,
    orientation: ['auto', 'horizontal', 'vertical'].includes(String(preferences.orientation || '').toLowerCase())
      ? String(preferences.orientation).toLowerCase()
      : 'auto',
  };

  const bounds = getWindowBoundsForPreferences(nextPreferences);
  if (!mainWindow.isFullScreen()) {
    mainWindow.setBounds(bounds);
  }
  mainWindow.setFullScreen(nextPreferences.fullscreen);
  return nextPreferences;
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/config/status`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if ((Date.now() - startedAt) > timeoutMs) {
          reject(new Error('Timed out waiting for bundled server'));
          return;
        }
        setTimeout(attempt, 250);
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };
    attempt();
  });
}

async function startBundledServer() {
  ensureDataDir();
  seedDataFiles();
  serverPort = await findOpenPort();

  serverProcess = spawn(process.execPath, [getServerEntry()], {
    cwd: getBundledAppDir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(serverPort),
      APP_DATA_DIR: getDataDir(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[ticket-server] ${chunk}`);
  });
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[ticket-server] ${chunk}`);
  });
  serverProcess.on('exit', async (code) => {
    serverProcess = null;
    if (app.isQuitting) return;

    if (code === 0 && serverPort) {
      try {
        await waitForServer(serverPort, 8000);
        return;
      } catch (_) {
        // Fall through and show the error if the replacement never came back.
      }
    }

    dialog.showErrorBox(
      'Ticket server stopped',
      `The embedded ticket server exited unexpectedly with code ${code ?? 'unknown'}.`
    );
  });

  await waitForServer(serverPort);
}

async function createMainWindow() {
  const displayPreferences = loadWindowPreferences();
  const bounds = getWindowBoundsForPreferences(displayPreferences);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 800,
    backgroundColor: '#08111f',
    autoHideMenuBar: true,
    title: 'One Bite Ticket Display',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (displayPreferences.fullscreen) {
    mainWindow.setFullScreen(true);
  }

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopBundledServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
}

function setupAutoUpdates() {
  if (!autoUpdater || !app.isPackaged) {
    updateStatus = {
      ...updateStatus,
      message: autoUpdater ? 'Update checks are available in packaged builds.' : 'electron-updater is not installed yet.',
    };
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateStatus = { available: false, checking: true, downloaded: false, message: 'Checking for updates...', version: null };
  });
  autoUpdater.on('update-available', (info) => {
    updateStatus = { available: true, checking: false, downloaded: false, message: 'Update available. Downloading...', version: info?.version || null };
  });
  autoUpdater.on('update-not-available', () => {
    updateStatus = { available: false, checking: false, downloaded: false, message: 'App is up to date.', version: null };
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = { available: true, checking: false, downloaded: true, message: 'Update downloaded. Restart the app to install it.', version: info?.version || null };
  });
  autoUpdater.on('error', (error) => {
    updateStatus = { available: false, checking: false, downloaded: false, message: error?.message || 'Update check failed.', version: null };
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    updateStatus = { available: false, checking: false, downloaded: false, message: error?.message || 'Update check failed.', version: null };
  });

  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      updateStatus = { available: false, checking: false, downloaded: false, message: error?.message || 'Scheduled update check failed.', version: null };
    });
  }, WEEKLY_UPDATE_CHECK_MS);
}

ipcMain.handle('app:get-metadata', () => ({
  version: app.getVersion(),
  userDataPath: getDataDir(),
  appPath: getBundledAppDir(),
  isPackaged: app.isPackaged,
}));

ipcMain.handle('window:apply-preferences', (_, preferences) => applyWindowPreferences(preferences || {}));
ipcMain.handle('app:open-in-browser', async () => {
  if (!serverPort) {
    throw new Error('Local server is not ready yet.');
  }
  const targetUrl = `http://127.0.0.1:${serverPort}`;
  await shell.openExternal(targetUrl);
  return { ok: true, url: targetUrl };
});
ipcMain.handle('updates:get-status', () => updateStatus);
ipcMain.handle('updates:check', async () => {
  if (!autoUpdater || !app.isPackaged) {
    return updateStatus;
  }
  await autoUpdater.checkForUpdates();
  return updateStatus;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  stopBundledServer();
});

app.whenReady().then(async () => {
  try {
    await startBundledServer();
    await createMainWindow();
    setupAutoUpdates();
  } catch (error) {
    dialog.showErrorBox('Startup failed', error.message);
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});
