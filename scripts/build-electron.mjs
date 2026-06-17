import { build } from 'esbuild';
import { copyFileSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

const outdir = 'dist-electron';

// main process
await build({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: `${outdir}/electron/main.js`,
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
});

// preload
await build({
  entryPoints: ['electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: `${outdir}/electron/preload.js`,
  external: ['electron'],
  sourcemap: true,
});

// renderer HTML
mkdirSync(`${outdir}/electron/renderer`, { recursive: true });
copyFileSync(
  'electron/renderer/index.html',
  `${outdir}/electron/renderer/index.html`,
);
copyFileSync(
  'electron/renderer/settings.html',
  `${outdir}/electron/renderer/settings.html`,
);

console.log('Build concluído em', outdir);
