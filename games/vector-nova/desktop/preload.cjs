const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'vectorNovaDesktop',
  Object.freeze({
    toggleFullscreen: () => ipcRenderer.send('window:fullscreen'),
    quit: () => ipcRenderer.send('window:quit'),
  }),
);
