// Run with Electron, not Node: this checks the shipped utility-process runtime.
const { app, BrowserWindow, utilityProcess } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const temporary = mkdtempSync(path.join(tmpdir(), 'chess-desktop-check-'));
app.setPath('userData', path.join(temporary, 'profile'));
const packaged = process.argv.includes('--packaged');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'desktop-dist/win-unpacked/resources');
const serverRoot = packaged ? path.join(resources, 'server') : path.join(root, '.next-desktop/standalone');
const serverFile = packaged ? path.join(resources, 'app.asar/server.cjs') : path.join(root, 'desktop/server.cjs');
let child;
let window;
let diagnostics = '';
let finished = false;

function startServer() {
  return new Promise((resolve, reject) => {
    child = utilityProcess.fork(serverFile, [], {
      cwd: serverRoot,
      env: { ...process.env, CHESS_SERVER_ROOT: serverRoot, CHESS_SQLITE_PATH: path.join(temporary, 'chess.sqlite'), DATABASE_URL: '' },
      stdio: 'pipe',
    });
    child.stdout.on('data', chunk => { diagnostics += chunk; });
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    child.once('message', message => resolve(`http://127.0.0.1:${message.port}`));
    child.once('exit', code => { if (!finished) reject(new Error(`Server exited ${code}: ${diagnostics}`)); });
  });
}

async function stopServer() {
  const exited = new Promise(resolve => child.once('exit', resolve));
  finished = true;
  child.kill();
  await exited;
}

const evaluate = script => window.webContents.executeJavaScript(script);
async function waitFor(script) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(script)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Browser condition timed out: ${script}\n${await evaluate('location.href + "\\n" + document.body.innerText')}`);
}

app.whenReady().then(async () => {
  let origin = await startServer();
  assert.equal((await fetch(`${origin}/api/health`)).status, 200, diagnostics);
  window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.on('console-message', (...args) => { diagnostics += `\nBrowser: ${args[1]?.message ?? args[2]}`; });
  // Block every nonlocal browser request to exercise offline rendering.
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(origin) && !details.url.startsWith('data:') && !details.url.startsWith('blob:') });
  });
  await window.loadURL(`${origin}/tournaments/new`);
  await waitFor(`!!document.querySelector('input[name="nickname"]')`);
  await evaluate(`document.querySelector('input[name="name"]').value = 'Offline Smoke'; document.querySelector('input[name="nickname"]').value = 'offline-smoke'; document.querySelector('input[name="sourceUrl"]').value = 'https://example.com/offline'; document.querySelector('form').requestSubmit();`);
  await waitFor(`location.pathname === '/tournaments/1'`);
  await window.loadURL(`${origin}/admin`);
  // Activate through the real server action rather than direct database writes.
  await evaluate(`const form = [...document.querySelectorAll('form')].find(form => /make active/i.test(form.innerText)); if (!form) throw new Error('Activate form missing'); form.requestSubmit();`);
  await waitFor(`!!document.querySelector('.active-tournament-label')`);
  const pgn = '[White "Offline White"]\n[Black "Offline Black"]\n[Result "1-0"]\n\n1. e4 e5 1-0';
  const importResult = await evaluate(`(async () => { const form = new FormData(); form.set('tournamentNickname', 'offline-smoke'); form.set('sourceLabel', 'Local'); form.set('name', 'Offline White'); form.set('pgnFile', new File([${JSON.stringify(pgn)}], 'smoke.pgn')); const response = await fetch('/api/admin/opponents/import', {method: 'POST', body: form}); return {status: response.status, body: await response.json()}; })()`);
  assert.equal(importResult.status, 200, JSON.stringify(importResult));
  for (const route of ['/', '/admin', '/admin/data-health', '/admin/games', '/admin/players', '/imports', '/imports/new', '/unresolved-players', '/tournaments/1', '/games/1']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, `${route}: ${await response.text()}\n${diagnostics}`);
  }
  await window.loadURL(`${origin}/games/1`);
  await waitFor(`!!document.querySelector('.cg-wrap')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Offline White')`), true);
  const worker = await fetch(`${origin}/stockfish/stockfish-19-lite-single.js`);
  assert.equal(worker.status, 200);
  const bestmove = await evaluate(`new Promise((resolve, reject) => {
    const worker = new Worker('/stockfish/stockfish-19-lite-single.js');
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Stockfish timed out')); }, 15000);
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error('Stockfish worker failed')); };
    worker.onmessage = event => {
      const line = String(event.data);
      if (line.includes('uciok')) { worker.postMessage('position startpos'); worker.postMessage('go depth 4'); }
      if (line.startsWith('bestmove ')) { clearTimeout(timeout); worker.terminate(); resolve(line); }
    };
    worker.postMessage('uci');
  })`);
  assert.match(bestmove, /^bestmove [a-h][1-8][a-h][1-8]/);
  await stopServer();
  finished = false;
  origin = await startServer();
  const persisted = await (await fetch(`${origin}/admin/games`)).text();
  assert.ok(persisted.includes('Offline White'), 'Saved game should survive server restart');
  await stopServer();
  window.destroy();
  // Chromium holds its temporary profile open until process exit on Windows.
  // Remove the database now; the OS temp directory owns the browser profile.
  for (const suffix of ['', '-wal', '-shm']) rmSync(path.join(temporary, `chess.sqlite${suffix}`), { force: true });
  console.log('PASS: Electron utility process, offline browser, tournament actions, PGN import, game viewer, local engine assets and SQLite persistence.');
  app.exit(0);
}).catch(error => {
  console.error(error, diagnostics);
  finished = true;
  child?.kill();
  app.exit(1);
});
setTimeout(() => { console.error('Desktop smoke check timed out', diagnostics); child?.kill(); app.exit(1); }, 60000).unref();
