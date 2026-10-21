const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'vectorNovaDesktop',
  Object.freeze({
    toggleFullscreen: () => ipcRenderer.send('window:fullscreen'),
    getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
    onFullscreenChange: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, fullscreen) => callback(fullscreen === true);
      ipcRenderer.on('window:fullscreen-changed', listener);
      return () =>
        ipcRenderer.removeListener('window:fullscreen-changed', listener);
    },
    quit: () => ipcRenderer.send('window:quit'),
  }),
);
