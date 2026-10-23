const { createRequire } = require('node:module');
const path = require('node:path');

async function start() {
  const root = process.env.CHESS_SERVER_ROOT;
  if (!root || !process.env.CHESS_SQLITE_PATH) throw new Error('Desktop server paths are missing');
  process.env.NODE_ENV = 'production';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  delete process.env.DATABASE_URL;
  process.chdir(root);
  const localRequire = createRequire(path.join(root, 'package.json'));
  const { config } = localRequire('./.next-desktop/required-server-files.json');
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  localRequire('next');
  const { startServer } = localRequire('next/dist/server/lib/start-server');
  await startServer({ dir: root, isDev: false, hostname: '127.0.0.1', port: 0, allowRetry: false });
  const ready = { port: Number(process.env.PORT) };
  if (process.parentPort) process.parentPort.postMessage(ready);
  else if (process.send) process.send(ready);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
