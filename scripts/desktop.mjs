import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'build';
if (!['build', 'start', 'pack'].includes(command)) throw new Error(`Unknown desktop command: ${command}`);
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Desktop builds are supported on Windows and macOS.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(executable, args, cwd = root, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && executable.endsWith('.cmd') });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed with exit code ${result.status ?? 1}`);
}

if (command !== 'start') {
  const config = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  config.include = config.include.filter(pattern => !pattern.startsWith('.next/'));
  config.include.push('.next-desktop/types/**/*.ts', '.next-desktop/dev/types/**/*.ts');
  config.exclude = config.exclude.filter(pattern => pattern !== '.next-desktop');
  config.exclude.push('.next');
  writeFileSync(path.join(root, 'tsconfig.desktop.json'), JSON.stringify(config, null, 2));
  run(npm, ['run', 'engine:assets']);
  run(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], root, {
    ...process.env, CHESS_DESKTOP_BUILD: '1', NEXT_TELEMETRY_DISABLED: '1',
  });
  const standalone = path.join(root, '.next-desktop/standalone');
  cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
  cpSync(path.join(root, '.next-desktop/static'), path.join(standalone, '.next-desktop/static'), { recursive: true });
}

const desktop = path.join(root, 'desktop');
if (!existsSync(path.join(desktop, 'node_modules/electron/dist/version')) || !existsSync(path.join(desktop, 'node_modules/electron-builder'))) {
  run(npm, ['ci', '--no-audit', '--no-fund'], desktop);
}
if (command === 'start') {
  if (!existsSync(path.join(root, '.next-desktop/standalone/server.js'))) throw new Error('Run npm run desktop:build first.');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  run(process.execPath, ['node_modules/electron/cli.js', '.'], desktop, env);
} else {
  run(process.execPath, ['node_modules/electron-builder/cli.js', '--publish', 'never', ...(command === 'pack' ? ['--dir'] : [])], desktop, {
    ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  });
}
