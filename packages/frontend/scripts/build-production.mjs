import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const viteBin = path.join(
  frontendRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

const result = spawnSync(viteBin, ['build'], {
  cwd: frontendRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    VITE_USER_NODE_ENV: 'production',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
