const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  getMetadata: () => ipcRenderer.invoke('app:get-metadata'),
  listDisplays: () => ipcRenderer.invoke('app:list-displays'),
  applyWindowPreferences: (preferences) => ipcRenderer.invoke('window:apply-preferences', preferences),
  openInBrowser: () => ipcRenderer.invoke('app:open-in-browser'),
  openFeatureRequest: () => ipcRenderer.invoke('app:open-feature-request'),
  clearLocalData: () => ipcRenderer.invoke('app:clear-local-data'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  skipUpdateVersion: (version) => ipcRenderer.invoke('updates:skip', version),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
});
