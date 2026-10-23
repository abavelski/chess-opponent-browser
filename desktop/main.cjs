const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron');
const path = require('node:path');

let server;
let window;
let stopping = false;
let origin;

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: 'Chess Opponent Browser',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (new URL(details.url).origin === origin) {
      headers['Content-Security-Policy'] = [
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      ];
    }
    callback({ responseHeaders: headers });
  });
  const openExternal = url => {
    if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      openExternal(url);
    }
  });
  void window.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    const root = app.isPackaged
      ? path.join(process.resourcesPath, 'server')
      : path.resolve(__dirname, '../.next-desktop/standalone');
    server = utilityProcess.fork(path.join(__dirname, 'server.cjs'), [], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: '',
        CHESS_SERVER_ROOT: root,
        CHESS_SQLITE_PATH: path.join(app.getPath('userData'), 'chess.sqlite'),
      },
      stdio: 'pipe',
    });
    let diagnostics = '';
    server.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
    server.stdout.on('data', chunk => process.stdout.write(chunk));
    const timeout = setTimeout(() => {
      dialog.showErrorBox('Desktop server did not start', diagnostics || 'The local server did not become ready within 60 seconds.');
      app.quit();
    }, 60000);
    server.on('message', async message => {
      if (origin || !Number.isInteger(message.port) || message.port <= 0) return;
      clearTimeout(timeout);
      origin = `http://127.0.0.1:${message.port}`;
      try {
        const response = await fetch(`${origin}/api/health`);
        if (!response.ok) throw new Error('Local SQLite database could not be opened.');
        createWindow();
      } catch (error) {
        dialog.showErrorBox('Desktop startup failed', `${error.message}\n${diagnostics}`);
        app.quit();
      }
    });
    server.on('exit', code => {
      clearTimeout(timeout);
      if (!stopping) {
        dialog.showErrorBox('Desktop server stopped', `Exit code: ${code}\n${diagnostics}`);
        app.quit();
      }
    });
  }).catch(error => {
    dialog.showErrorBox('Desktop startup failed', error.message);
    app.quit();
  });
  app.on('activate', () => { if (origin && BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { stopping = true; server?.kill(); });
}
