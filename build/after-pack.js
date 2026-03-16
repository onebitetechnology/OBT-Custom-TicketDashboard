const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const appOutDir = context.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const targetPath = fs.existsSync(appPath) ? appPath : appOutDir;

  execFileSync('xattr', ['-cr', targetPath], { stdio: 'inherit' });
};
