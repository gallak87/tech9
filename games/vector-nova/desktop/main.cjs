const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  ipcMain,
  session,
  screen,
  dialog,
} = require('electron');
const { join } = require('node:path');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const {
  ORIGIN,
  serveResource,
  trustedSender,
  forbiddenArguments,
} = require('./security.cjs');
const identity = require('./package.json');
if (forbiddenArguments(process.argv.slice(1))) app.exit(1);
app.enableSandbox();
app.setName(identity.productName);
app.setPath('userData', join(app.getPath('appData'), identity.name));
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vn-game',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);
let window;
const preferencesPath = join(app.getPath('userData'), 'window.json');
function readPreferences() {
  try {
    return JSON.parse(readFileSync(preferencesPath, 'utf8'));
  } catch {
    return {};
  }
}
function savePreferences() {
  if (!window || window.isDestroyed()) return;
  const { width, height } = window.getNormalBounds();
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(
      preferencesPath,
      JSON.stringify({ width, height, fullscreen: window.isFullScreen() }),
    );
  } catch {
    /* Play remains available if storage is read-only. */
  }
}
function toggleFullscreen() {
  window?.setFullScreen(!window.isFullScreen());
}
function createWindow() {
  const saved = readPreferences();
  const area = screen.getPrimaryDisplay().workAreaSize;
  const dimension = (value, fallback, min, max) =>
    Math.max(
      Math.min(min, max),
      Math.min(max, Number.isFinite(value) ? value : fallback),
    );
  window = new BrowserWindow({
    title: identity.productName,
    show: false,
    backgroundColor: '#090909',
    width: dimension(saved.width, 1440, 960, area.width),
    height: dimension(saved.height, 900, 600, area.height),
    minWidth: 800,
    minHeight: 500,
    fullscreen: saved.fullscreen === true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      devTools: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview'])
    window.webContents.on(event, (e) => e.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    if (
      key === 'f12' ||
      ((input.control || input.meta) &&
        (['r', 'u'].includes(key) ||
          (input.shift && ['i', 'j', 'c'].includes(key)) ||
          (input.alt && ['i', 'j'].includes(key))))
    )
      event.preventDefault();
    if (
      input.type === 'keyDown' &&
      (key === 'f11' || (input.alt && key === 'enter'))
    ) {
      event.preventDefault();
      toggleFullscreen();
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    dialog.showErrorBox(
      identity.productName,
      'The graphics process stopped. Please restart the game. If this repeats, select Low graphics in Settings.',
    );
    app.quit();
  });
  window.on('close', savePreferences);
  window.on('enter-full-screen', savePreferences);
  window.on('leave-full-screen', savePreferences);
  window.once('ready-to-show', () => window.show());
  void window.loadURL(`${ORIGIN}/index.html`);
}
app.whenReady().then(() => {
  // A null menu lets Electron recreate its default developer menu on macOS.
  // Install an explicit menu with only normal application/window operations.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      process.platform === 'darwin'
        ? [
            {
              label: identity.productName,
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
              ],
            },
            {
              label: 'Window',
              submenu: [
                { role: 'minimize' },
                { role: 'close' },
                { label: 'Fullscreen / Windowed', click: toggleFullscreen },
              ],
            },
          ]
        : [],
    ),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', (event) => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const scheme = new URL(details.url).protocol;
    callback({ cancel: !['vn-game:', 'blob:', 'data:'].includes(scheme) });
  });
  protocol.handle('vn-game', (request) =>
    serveResource(request, join(__dirname, 'dist')),
  );
  ipcMain.on('window:fullscreen', (event) => {
    if (trustedSender(event, window)) toggleFullscreen();
  });
  ipcMain.on('window:quit', (event) => {
    if (trustedSender(event, window)) app.quit();
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
