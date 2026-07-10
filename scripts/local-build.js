'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mode = String(process.argv[2] || '').trim();
if (!['pack', 'mac', 'win'].includes(mode)) {
  console.error('Usage: node scripts/local-build.js <pack|mac|win>');
  process.exit(1);
}

const packageJson = require('../package.json');
const productName = packageJson.build.productName;
const outputRoot = process.env.ONEBITE_LOCAL_BUILD_DIR
  ? path.resolve(process.env.ONEBITE_LOCAL_BUILD_DIR)
  : path.join(os.tmpdir(), 'onebite-ticket-display-local-builds');
const outputDir = path.join(outputRoot, mode);
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const args = [];
if (mode === 'pack') args.push('--dir');
if (mode === 'mac') args.push('--mac', 'dmg', 'zip');
if (mode === 'win') args.push('--win', 'nsis', '--x64');
args.push(`-c.directories.output=${outputDir}`, '-c.forceCodeSigning=false');
if (mode === 'mac' || (mode === 'pack' && process.platform === 'darwin')) {
  args.push('-c.mac.identity=null', '-c.mac.notarize=false');
}

const build = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), ...args], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
  stdio: 'inherit',
});
if (build.status !== 0) {
  process.exit(build.status || 1);
}

function findPackagedTarget(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === `${productName}.app`) return fullPath;
    if (entry.isFile() && entry.name === `${productName}.exe`) return fullPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith('.app')) continue;
    const found = findPackagedTarget(path.join(directory, entry.name));
    if (found) return found;
  }
  return '';
}

const packagedTarget = findPackagedTarget(outputDir);
if (!packagedTarget) {
  console.error(`Packaged Electron target was not found under ${outputDir}`);
  process.exit(1);
}

const verify = spawnSync(process.execPath, [
  path.join(__dirname, 'verify-electron-fuses.js'),
  packagedTarget,
], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
});
if (verify.status !== 0) {
  process.exit(verify.status || 1);
}

console.log(`Local build output: ${outputDir}`);
