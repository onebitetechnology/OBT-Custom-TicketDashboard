const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) {
    throw new Error('Electron output directory was not found for fuse hardening.');
  }

  const appName = context.packager.appInfo.productFilename;
  const targetPlatform = context.electronPlatformName || process.platform;
  const appPath = targetPlatform === 'darwin'
    ? path.join(appOutDir, `${appName}.app`)
    : appOutDir;
  const executablePath = targetPlatform === 'darwin'
    ? path.join(appPath, 'Contents', 'MacOS', appName)
    : targetPlatform === 'win32'
      ? path.join(appOutDir, `${appName}.exe`)
      : path.join(appOutDir, appName);

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Electron executable was not found for fuse hardening: ${executablePath}`);
  }

  if (targetPlatform === 'darwin') {
    execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
  }

  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const isMacArm64 = targetPlatform === 'darwin' && (
    context.arch === 3 ||
    context.arch === 'arm64' ||
    path.basename(appOutDir).includes('arm64')
  );

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: isMacArm64,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });
};
