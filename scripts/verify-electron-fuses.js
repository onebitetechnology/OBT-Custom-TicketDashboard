'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const targetPath = path.resolve(String(process.argv[2] || '').trim());
  if (!process.argv[2] || !fs.existsSync(targetPath)) {
    throw new Error('Pass the packaged .app bundle or Electron executable to verify.');
  }

  const {
    FuseState,
    FuseVersion,
    FuseV1Options,
    getCurrentFuseWire,
  } = await import('@electron/fuses');
  const current = await getCurrentFuseWire(targetPath);
  if (current.version !== FuseVersion.V1) {
    throw new Error(`Unexpected Electron fuse version: ${current.version}`);
  }

  const expected = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
    [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
  ]);

  const mismatches = [];
  for (const [fuse, expectedState] of expected) {
    if (current[fuse] !== expectedState) {
      mismatches.push(FuseV1Options[fuse]);
    }
  }
  if (mismatches.length) {
    throw new Error(`Packaged Electron fuse policy mismatch: ${mismatches.join(', ')}`);
  }

  console.log(`Verified hardened Electron fuses: ${targetPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
