const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const os = require('os');
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
  supported: true,
  available: false,
  checking: false,
  downloaded: false,
  progressPercent: 0,
  bytesPerSecond: 0,
  transferredBytes: 0,
  totalBytes: 0,
  message: 'Update checks are idle.',
  version: null,
  releaseNotes: '',
  updateChannel: 'latest',
  receiveBetaUpdates: false,
  skipped: false,
  skippedVersion: '',
};
const BACKGROUND_UPDATE_CHECK_MS = 60 * 60 * 1000;
const GITHUB_RELEASE_NOTES_BASE_URL = 'https://api.github.com/repos/onebitetechnology/OBT-Custom-TicketDashboard/releases/tags/';
const releaseNotesFetchCache = new Map();

function getUnsupportedMacUpdateStatus() {
  return {
    supported: false,
    available: false,
    checking: false,
    downloaded: false,
    progressPercent: 0,
    bytesPerSecond: 0,
    transferredBytes: 0,
    totalBytes: 0,
    message: 'Automatic updates are disabled on macOS until signed and notarized builds are in place. Please install newer DMG releases manually.',
    version: null,
    releaseNotes: '',
    skipped: false,
    skippedVersion: getSkippedUpdateVersion(),
  };
}

function normalizeReleaseNotes(info) {
  const raw = info?.releaseNotes;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        const version = entry?.version ? `Version ${entry.version}` : '';
        const note = String(entry?.note || '').trim();
        return [version, note].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return String(raw || '').trim();
}

function fetchGitHubReleaseNotes(version) {
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '');
  if (!normalizedVersion) return Promise.resolve('');
  if (releaseNotesFetchCache.has(normalizedVersion)) {
    return releaseNotesFetchCache.get(normalizedVersion);
  }

  const requestUrl = `${GITHUB_RELEASE_NOTES_BASE_URL}v${encodeURIComponent(normalizedVersion)}`;
  const requestPromise = new Promise((resolve) => {
    const request = https.get(requestUrl, {
      headers: {
        'User-Agent': 'One-Bite-Ticket-Display-Updater',
        'Accept': 'application/vnd.github+json',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          resolve('');
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(String(parsed?.body || '').trim());
        } catch (_) {
          resolve('');
        }
      });
    });

    request.on('error', () => resolve(''));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve('');
    });
  });

  releaseNotesFetchCache.set(normalizedVersion, requestPromise);
  return requestPromise;
}

async function hydrateReleaseNotesIfMissing(version) {
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '');
  if (!normalizedVersion) return;
  if (String(updateStatus.releaseNotes || '').trim()) return;
  const notes = await fetchGitHubReleaseNotes(normalizedVersion);
  if (!notes) return;
  if (String(updateStatus.version || '').trim().replace(/^v/i, '') !== normalizedVersion) return;
  setUpdateStatus({
    ...updateStatus,
    releaseNotes: notes,
  });
}

function readUpdateChannelPreferencesFromConfig() {
  try {
    ensureDataDir();
    if (!fs.existsSync(getConfigPath())) {
      return { updateChannel: 'latest', receiveBetaUpdates: false };
    }
    const parsed = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    const receiveBetaUpdates = !!parsed?.uiPreferences?.updates?.receiveBetaUpdates;
    return {
      updateChannel: receiveBetaUpdates ? 'beta' : 'latest',
      receiveBetaUpdates,
    };
  } catch (_) {
    return { updateChannel: 'latest', receiveBetaUpdates: false };
  }
}

function applyConfiguredUpdateChannel() {
  const { updateChannel, receiveBetaUpdates } = readUpdateChannelPreferencesFromConfig();
  if (autoUpdater) {
    autoUpdater.channel = updateChannel;
    autoUpdater.allowPrerelease = receiveBetaUpdates;
  }
  return { updateChannel, receiveBetaUpdates };
}

function areAutoUpdatesSupported() {
  if (!autoUpdater || !app.isPackaged) return false;
  if (process.platform === 'darwin') return false;
  return true;
}

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

function getUpdatePrefsPath() {
  return path.join(getDataDir(), 'update-preferences.json');
}

function getServerEntry() {
  return path.join(getBundledAppDir(), 'server.js');
}

function formatTimestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function loadUpdatePreferences() {
  ensureDataDir();
  try {
    const prefsPath = getUpdatePrefsPath();
    if (!fs.existsSync(prefsPath)) return { skippedVersion: '' };
    const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    return {
      skippedVersion: String(parsed?.skippedVersion || '').trim(),
    };
  } catch (_) {
    return { skippedVersion: '' };
  }
}

function saveUpdatePreferences(preferences = {}) {
  ensureDataDir();
  const prefsPath = getUpdatePrefsPath();
  const normalized = {
    skippedVersion: String(preferences?.skippedVersion || '').trim(),
  };
  fs.writeFileSync(prefsPath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function getSkippedUpdateVersion() {
  return loadUpdatePreferences().skippedVersion;
}

function setSkippedUpdateVersion(version = '') {
  return saveUpdatePreferences({ skippedVersion: version }).skippedVersion;
}

function setUpdateStatus(nextStatus) {
  const skippedVersion = getSkippedUpdateVersion();
  const version = String(nextStatus?.version || '').trim();
  const { updateChannel, receiveBetaUpdates } = readUpdateChannelPreferencesFromConfig();
  updateStatus = {
    ...nextStatus,
    updateChannel,
    receiveBetaUpdates,
    skippedVersion,
    skipped: !!version && skippedVersion === version,
  };
}

function seedDataFiles() {
  const sourceDir = getBundledAppDir();
  const targetDir = getDataDir();
  const fileNames = [
    'category-rules.json',
    'consignment-rules.json',
  ];

  for (const fileName of fileNames) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function summarizeConfigForSupport() {
  try {
    ensureDataDir();
    if (!fs.existsSync(getConfigPath())) {
      return {
        hasConfigFile: false,
        hasApiKey: false,
        hasTicketCounterDisplayUrl: false,
        rushSyncEnabled: false,
        hasRushSyncCookie: false,
        receiveBetaUpdates: false,
      };
    }

    const parsed = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    return {
      hasConfigFile: true,
      hasApiKey: !!String(parsed?.apiKey || '').trim(),
      hasTicketCounterDisplayUrl: !!String(parsed?.ticketCounterDisplayUrl || '').trim(),
      rushSyncEnabled: !!parsed?.rushSync?.enabled,
      hasRushSyncCookie: !!String(parsed?.rushSync?.cookie || '').trim(),
      receiveBetaUpdates: !!parsed?.uiPreferences?.updates?.receiveBetaUpdates,
    };
  } catch (_) {
    return {
      hasConfigFile: true,
      hasApiKey: false,
      hasTicketCounterDisplayUrl: false,
      rushSyncEnabled: false,
      hasRushSyncCookie: false,
      receiveBetaUpdates: false,
      configReadError: true,
    };
  }
}

function createSupportBundle() {
  ensureDataDir();
  const supportDir = path.join(getDataDir(), 'support');
  fs.mkdirSync(supportDir, { recursive: true });

  const configSummary = summarizeConfigForSupport();
  const { updateChannel, receiveBetaUpdates } = readUpdateChannelPreferencesFromConfig();
  const timestamp = new Date();
  const bundlePath = path.join(supportDir, `support-bundle-${formatTimestampForFile(timestamp)}.json`);
  const payload = {
    capturedAt: timestamp.toISOString(),
    app: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      appPath: getBundledAppDir(),
      userDataPath: getDataDir(),
      localBoardUrl: serverPort ? `http://127.0.0.1:${serverPort}` : '',
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      hostname: os.hostname(),
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
    },
    updates: {
      channel: updateChannel,
      receiveBetaUpdates,
      status: {
        supported: !!updateStatus.supported,
        available: !!updateStatus.available,
        downloaded: !!updateStatus.downloaded,
        checking: !!updateStatus.checking,
        version: String(updateStatus.version || '').trim(),
        message: String(updateStatus.message || '').trim(),
      },
    },
    configSummary,
  };

  fs.writeFileSync(bundlePath, JSON.stringify(payload, null, 2), 'utf8');
  return { bundlePath, payload };
}

function loadWindowPreferences() {
  const defaults = {
    fullscreen: false,
    orientation: 'auto',
    displayTarget: 'current',
  };

  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return defaults;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const saved = config?.uiPreferences?.display || {};
    const orientation = ['auto', 'horizontal', 'vertical'].includes(String(saved.orientation || '').toLowerCase())
      ? String(saved.orientation).toLowerCase()
      : defaults.orientation;
    const displayTarget = String(saved.displayTarget || defaults.displayTarget).trim() || defaults.displayTarget;
    return {
      fullscreen: !!saved.fullscreen,
      orientation,
      displayTarget,
    };
  } catch (_) {
    return defaults;
  }
}

function getTargetDisplay(preferences = {}, currentBounds = null) {
  const target = String(preferences.displayTarget || 'current').toLowerCase();
  const displays = screen.getAllDisplays();
  if (!displays.length) return screen.getPrimaryDisplay();
  if (target.startsWith('display:')) {
    const id = Number(target.slice('display:'.length));
    return displays.find((display) => Number(display.id) === id) || screen.getPrimaryDisplay();
  }
  if (target === 'primary') return screen.getPrimaryDisplay();
  if (target === 'secondary') {
    const primaryId = screen.getPrimaryDisplay().id;
    return displays.find((display) => display.id !== primaryId) || screen.getPrimaryDisplay();
  }
  if (currentBounds) {
    return screen.getDisplayMatching(currentBounds);
  }
  return screen.getPrimaryDisplay();
}

function getWindowBoundsForPreferences(preferences = {}, currentBounds = null) {
  const display = getTargetDisplay(preferences, currentBounds);
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
    displayTarget: String(preferences.displayTarget || 'current').trim().toLowerCase() || 'current',
  };

  const currentBounds = mainWindow.getBounds();
  const bounds = getWindowBoundsForPreferences(nextPreferences, currentBounds);
  mainWindow.setFullScreen(false);
  mainWindow.setBounds(bounds);
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
  if (process.platform === 'darwin' && app.isPackaged) {
    setUpdateStatus(getUnsupportedMacUpdateStatus());
    return;
  }

  if (!autoUpdater || !app.isPackaged) {
    setUpdateStatus({
      ...updateStatus,
      supported: false,
      message: autoUpdater ? 'Update checks are available in packaged builds.' : 'electron-updater is not installed yet.',
      releaseNotes: '',
    });
    return;
  }

  applyConfiguredUpdateChannel();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({ supported: true, available: false, checking: true, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: 'Checking for updates...', version: null, releaseNotes: '' });
  });
  autoUpdater.on('update-available', (info) => {
    const releaseNotes = normalizeReleaseNotes(info);
    setUpdateStatus({ supported: true, available: true, checking: false, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: 'Update available. Downloading...', version: info?.version || null, releaseNotes });
    if (!releaseNotes) {
      hydrateReleaseNotesIfMissing(info?.version).catch(() => {});
    }
  });
  autoUpdater.on('update-not-available', () => {
    setUpdateStatus({ supported: true, available: false, checking: false, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: 'App is up to date.', version: null, releaseNotes: '' });
  });
  autoUpdater.on('download-progress', (progress) => {
    setUpdateStatus({
      ...updateStatus,
      available: true,
      checking: false,
      downloaded: false,
      progressPercent: Number(progress?.percent || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      transferredBytes: Number(progress?.transferred || 0),
      totalBytes: Number(progress?.total || 0),
      message: `Downloading update... ${Math.round(Number(progress?.percent || 0))}%`,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const releaseNotes = normalizeReleaseNotes(info) || updateStatus.releaseNotes || '';
    setUpdateStatus({ supported: true, available: true, checking: false, downloaded: true, progressPercent: 100, bytesPerSecond: 0, transferredBytes: updateStatus.totalBytes || 0, totalBytes: updateStatus.totalBytes || 0, message: 'Update downloaded. Close the app to install it, or use Install Update Now.', version: info?.version || null, releaseNotes });
    if (!releaseNotes) {
      hydrateReleaseNotesIfMissing(info?.version).catch(() => {});
    }
  });
  autoUpdater.on('error', (error) => {
    setUpdateStatus({ supported: true, available: false, checking: false, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: error?.message || 'Update check failed.', version: null, releaseNotes: '' });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    setUpdateStatus({ supported: true, available: false, checking: false, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: error?.message || 'Update check failed.', version: null, releaseNotes: '' });
  });

  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    applyConfiguredUpdateChannel();
    autoUpdater.checkForUpdates().catch((error) => {
      setUpdateStatus({ supported: true, available: false, checking: false, downloaded: false, progressPercent: 0, bytesPerSecond: 0, transferredBytes: 0, totalBytes: 0, message: error?.message || 'Scheduled update check failed.', version: null, releaseNotes: '' });
    });
  }, BACKGROUND_UPDATE_CHECK_MS);
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
ipcMain.handle('app:list-displays', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: Number(display.id),
    label: `${Number(display.id) === primaryId ? 'Primary' : `Display ${index + 1}`} - ${display.bounds.width}x${display.bounds.height}${display.bounds.height > display.bounds.width ? ' portrait' : ''}`,
    isPrimary: Number(display.id) === primaryId,
    width: display.bounds.width,
    height: display.bounds.height,
  }));
});
ipcMain.handle('app:open-feature-request', async () => {
  const { bundlePath, payload } = createSupportBundle();
  const subject = encodeURIComponent('OBT Ticket Display Feature Request / Bug Report');
  const body = encodeURIComponent([
    'Hi Jeff,',
    '',
    'Request type: [Feature Request / Bug Report]',
    '',
    'Summary:',
    '',
    'What I expected:',
    '',
    'What happened instead:',
    '',
    'Steps to reproduce:',
    '',
    'Diagnostics:',
    `- App version: ${payload.app.version}`,
    `- Platform: ${payload.system.platform} (${payload.system.arch})`,
    `- Update channel: ${payload.updates.channel}${payload.updates.receiveBetaUpdates ? ' (beta enabled)' : ''}`,
    `- Local board URL: ${payload.app.localBoardUrl || 'Not running yet'}`,
    `- Support bundle path: ${bundlePath}`,
    '',
    'If this is a bug report, please attach the support bundle file from the path above to this email if your mail app allows attachments.',
  ].join('\n'));
  const url = `mailto:jeff@onebitetechnology.ca?subject=${subject}&body=${body}`;
  await shell.openExternal(url);
  return { ok: true, url, bundlePath };
});
ipcMain.handle('app:clear-local-data', async () => {
  const userDataPath = app.getPath('userData');
  try {
    app.isQuitting = true;
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    stopBundledServer();
    fs.rmSync(userDataPath, { recursive: true, force: true });
    app.relaunch();
    setImmediate(() => app.exit(0));
    return { ok: true, userDataPath };
  } catch (error) {
    app.isQuitting = false;
    throw error;
  }
});
ipcMain.handle('updates:get-status', () => updateStatus);
ipcMain.handle('updates:check', async () => {
  if (!areAutoUpdatesSupported()) {
    if (process.platform === 'darwin' && app.isPackaged) {
      setUpdateStatus(getUnsupportedMacUpdateStatus());
    }
    return updateStatus;
  }
  applyConfiguredUpdateChannel();
  await autoUpdater.checkForUpdates();
  return updateStatus;
});
ipcMain.handle('updates:refresh-config', async () => {
  if (areAutoUpdatesSupported()) {
    applyConfiguredUpdateChannel();
  }
  setUpdateStatus({ ...updateStatus });
  return updateStatus;
});
ipcMain.handle('updates:skip', async (_, version) => {
  const normalizedVersion = String(version || '').trim();
  setSkippedUpdateVersion(normalizedVersion);
  setUpdateStatus({ ...updateStatus, version: updateStatus.version || normalizedVersion, skipped: !!normalizedVersion, skippedVersion: normalizedVersion });
  return updateStatus;
});
ipcMain.handle('updates:install', async () => {
  if (!areAutoUpdatesSupported()) {
    if (process.platform === 'darwin' && app.isPackaged) {
      setUpdateStatus(getUnsupportedMacUpdateStatus());
    }
    return updateStatus;
  }
  if (!updateStatus.downloaded) {
    return updateStatus;
  }
  setImmediate(() => autoUpdater.quitAndInstall());
  return { ...updateStatus, message: 'Installing update and restarting app...' };
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
