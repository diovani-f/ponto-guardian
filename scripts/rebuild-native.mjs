import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status && result.status !== 0) {
  console.warn('[postinstall] electron-rebuild falhou, o empacotamento tentará reconstruir os módulos nativos novamente.');
}
