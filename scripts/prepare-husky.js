const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const huskyBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'husky.cmd' : 'husky');

if (!fs.existsSync(huskyBin)) {
  process.exit(0);
}

const result = spawnSync(huskyBin, { stdio: 'inherit', shell: process.platform === 'win32' });

if (result.error) {
  console.warn('[prepare] husky unavailable, skipping hooks setup.');
  process.exit(0);
}

process.exit(result.status ?? 0);
