const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  getMetadata: () => ipcRenderer.invoke('app:get-metadata'),
  applyWindowPreferences: (preferences) => ipcRenderer.invoke('window:apply-preferences', preferences),
  openInBrowser: () => ipcRenderer.invoke('app:open-in-browser'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
});
