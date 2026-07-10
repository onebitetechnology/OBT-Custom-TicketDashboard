const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'app', 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function request(port, pathname, token, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-One-Bite-Admin-Token'] = token;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  return {
    status: response.status,
    text: await response.text(),
  };
}

async function startServer(dataDir, token) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      APP_DATA_DIR: dataDir,
      ONEBITE_LOCAL_ADMIN_TOKEN: token,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${output}`);
    }
    try {
      const response = await request(port, '/ticket-display');
      if (response.status === 200) {
        return { child, output: () => output, port };
      }
    } catch (_) {
      // The socket may not be listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Server did not become ready.\n${output}`);
}

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  server.child.kill();
  await once(server.child, 'exit');
}

async function saveConfig(port, token, apiKey) {
  return request(port, '/api/config', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      ticketCounterDisplayUrl: 'https://store.repairdesk.co/ticket-counter?token=config-test',
    }),
  });
}

test('corrupt config is restored from the newest valid backup', { timeout: 20_000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onebite-config-recovery-'));
  const token = 'config-recovery-admin-token';
  let server;
  try {
    server = await startServer(dataDir, token);
    assert.equal((await saveConfig(server.port, token, 'first-config-key')).status, 200);
    assert.equal((await saveConfig(server.port, token, 'second-config-key')).status, 200);
    await stopServer(server);
    server = null;

    const backupDir = path.join(dataDir, 'config-backups');
    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith('.json'));
    assert.ok(backups.length >= 1);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(path.join(backupDir, backups[0])).mode & 0o777;
      assert.equal(mode, 0o600);
    }

    fs.writeFileSync(path.join(dataDir, 'config.json'), '{broken-json', 'utf8');
    server = await startServer(dataDir, token);
    const response = await request(server.port, '/api/config', token);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.text).apiKey, 'first-config-key');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).apiKey, 'first-config-key');
  } finally {
    await stopServer(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('config write failures return an error instead of a false success', { timeout: 20_000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onebite-config-write-failure-'));
  const token = 'config-write-failure-admin-token';
  let server;
  try {
    fs.mkdirSync(path.join(dataDir, 'config.json'));
    server = await startServer(dataDir, token);
    const response = await saveConfig(server.port, token, 'must-not-report-success');
    assert.equal(response.status, 500, `${response.text}\n${server.output()}`);
    assert.match(JSON.parse(response.text).error, /directory|rename|config/i);
  } finally {
    await stopServer(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
