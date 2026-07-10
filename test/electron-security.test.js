const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createTrustedIpcHandler,
  isTrustedIpcSender,
} = require('../lib/electron-security');

const allowedUrl = 'http://127.0.0.1:54338/ticket-display';
const isAllowedNavigation = (url) => String(url).startsWith('http://127.0.0.1:54338/');

function createWindow(url = allowedUrl) {
  const webContents = {
    getURL: () => url,
  };
  return {
    isDestroyed: () => false,
    webContents,
  };
}

function createEvent(mainWindow, frameUrl = allowedUrl, parent = null) {
  return {
    sender: mainWindow.webContents,
    senderFrame: { parent, url: frameUrl },
  };
}

test('trusted IPC accepts only the main frame on the active local board', () => {
  const mainWindow = createWindow();
  assert.equal(isTrustedIpcSender(createEvent(mainWindow), mainWindow, isAllowedNavigation), true);
  assert.equal(isTrustedIpcSender(createEvent(mainWindow, 'https://attacker.example/'), mainWindow, isAllowedNavigation), false);
  assert.equal(isTrustedIpcSender(createEvent(mainWindow, allowedUrl, {}), mainWindow, isAllowedNavigation), false);
  assert.equal(isTrustedIpcSender({ ...createEvent(mainWindow), sender: {} }, mainWindow, isAllowedNavigation), false);
  assert.equal(isTrustedIpcSender(createEvent(mainWindow), createWindow('https://attacker.example/'), isAllowedNavigation), false);
});

test('trusted IPC registrar rejects untrusted senders before running a handler', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
  };
  const mainWindow = createWindow();
  const register = createTrustedIpcHandler({
    ipcMain,
    getMainWindow: () => mainWindow,
    isAllowedNavigation,
  });
  let calls = 0;
  register('secure-action', (value) => {
    calls += 1;
    return `accepted:${value}`;
  });

  assert.equal(await handlers.get('secure-action')(createEvent(mainWindow), 'value'), 'accepted:value');
  await assert.rejects(
    handlers.get('secure-action')(createEvent(mainWindow, 'https://attacker.example/'), 'value'),
    /untrusted renderer/
  );
  assert.equal(calls, 1);
});
