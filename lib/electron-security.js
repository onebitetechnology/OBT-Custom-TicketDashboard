'use strict';

function isTrustedIpcSender(event, mainWindow, isAllowedNavigation) {
  if (!event || !mainWindow || mainWindow.isDestroyed?.()) return false;

  const webContents = mainWindow.webContents;
  const senderFrame = event.senderFrame;
  if (!webContents || event.sender !== webContents || !senderFrame) return false;
  if (senderFrame.parent) return false;

  const frameUrl = String(senderFrame.url || '');
  const pageUrl = String(webContents.getURL?.() || '');
  return isAllowedNavigation(frameUrl) && isAllowedNavigation(pageUrl);
}

function createTrustedIpcHandler({ ipcMain, getMainWindow, isAllowedNavigation }) {
  if (!ipcMain?.handle || typeof getMainWindow !== 'function' || typeof isAllowedNavigation !== 'function') {
    throw new TypeError('Trusted IPC handler dependencies are required.');
  }

  return (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedIpcSender(event, getMainWindow(), isAllowedNavigation)) {
        throw new Error('IPC request rejected from an untrusted renderer.');
      }
      return handler(...args);
    });
  };
}

module.exports = {
  createTrustedIpcHandler,
  isTrustedIpcSender,
};
