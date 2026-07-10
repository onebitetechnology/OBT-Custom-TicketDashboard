const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'app', 'server.js');
const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onebite-security-smoke-'));
const adminToken = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let child = null;
let serverOutput = '';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return {
    status: response.status,
    text: await response.text(),
    headers: response.headers,
  };
}

function rawRequest(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          text,
          headers: response.headers,
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function assert(condition, message, detail = '') {
  if (!condition) {
    throw new Error(detail ? `${message}: ${detail}` : message);
  }
  console.log(`PASS ${message}`);
}

function sharedAuthHeaders(secret, pathname, overrides = {}) {
  const timestamp = String(overrides.timestamp || Date.now());
  const nonce = String(overrides.nonce || crypto.randomBytes(18).toString('base64url'));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(['GET', pathname, timestamp, nonce].join('\n'))
    .digest('hex');
  return {
    'X-One-Bite-Shared-Timestamp': timestamp,
    'X-One-Bite-Shared-Nonce': nonce,
    'X-One-Bite-Shared-Signature': overrides.signature || signature,
  };
}

async function waitForServer(port) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${serverOutput}`);
    }
    try {
      const response = await request(port, '/ticket-display');
      if (response.status === 200) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become ready: ${lastError?.message || 'timeout'}\n${serverOutput}`);
}

async function main() {
  const port = await getFreePort();
  child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      APP_DATA_DIR: appDataDir,
      ONEBITE_LOCAL_ADMIN_TOKEN: adminToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });

  const page = await waitForServer(port);
  const csp = page.headers.get('content-security-policy') || '';
  assert(csp.includes("script-src 'self'"), 'ticket page sends self-only script CSP');
  assert(csp.includes("style-src 'self' https://fonts.googleapis.com"), 'ticket page sends self-only style CSP with Google Fonts');
  assert(!csp.includes("'unsafe-inline'"), 'ticket page CSP does not allow inline script or style');
  assert(!page.text.includes('__LOCAL_ADMIN_TOKEN_JSON__'), 'ticket page has no unreplaced admin token placeholder');
  assert(!page.text.includes(adminToken), 'ticket page does not inline the local admin token');

  const css = await request(port, '/ticket-display.css');
  assert(css.status === 200 && css.text.includes('.settings-drawer'), 'ticket CSS asset is served', `HTTP ${css.status}`);

  const script = await request(port, '/ticket-display.js');
  assert(script.status === 200, 'ticket JS asset is served', `HTTP ${script.status}`);
  assert(!script.text.includes('__LOCAL_ADMIN_TOKEN_JSON__'), 'ticket JS has no unreplaced admin token placeholder');
  assert(script.text.includes(JSON.stringify(adminToken)), 'loopback ticket JS receives local admin token');
  const crossSiteScript = await request(port, '/ticket-display.js', {
    headers: {
      'Sec-Fetch-Site': 'cross-site',
      Referer: 'https://example.test/',
    },
  });
  assert(crossSiteScript.status === 403, 'cross-site script-style asset request is rejected', `HTTP ${crossSiteScript.status}`);

  const hostileHostScript = await rawRequest(port, '/ticket-display.js', {
    headers: {
      Host: `attacker.example:${port}`,
      'Sec-Fetch-Site': 'same-origin',
      Referer: `http://attacker.example:${port}/ticket-display`,
    },
  });
  assert(hostileHostScript.status === 421, 'hostile Host cannot receive the local admin token', `HTTP ${hostileHostScript.status}`);

  const hostileHostConfig = await rawRequest(port, '/api/config', {
    headers: {
      Host: `attacker.example:${port}`,
      Origin: `http://attacker.example:${port}`,
      'X-One-Bite-Admin-Token': adminToken,
    },
  });
  assert(hostileHostConfig.status === 421, 'hostile Host cannot use the local admin API', `HTTP ${hostileHostConfig.status}`);

  const preferencesWithoutToken = await request(port, '/api/preferences');
  assert(preferencesWithoutToken.status === 403, 'preferences API rejects missing admin token', `HTTP ${preferencesWithoutToken.status}`);

  const preferencesWithToken = await request(port, '/api/preferences', {
    headers: { 'X-One-Bite-Admin-Token': adminToken },
  });
  assert(preferencesWithToken.status === 200, 'preferences API accepts valid admin token', `HTTP ${preferencesWithToken.status}`);

  const configWithoutToken = await request(port, '/api/config');
  assert(configWithoutToken.status === 403, 'config API rejects missing admin token', `HTTP ${configWithoutToken.status}`);

  const configWithToken = await request(port, '/api/config', {
    headers: { 'X-One-Bite-Admin-Token': adminToken },
  });
  assert(configWithToken.status === 200, 'config API accepts valid admin token', `HTTP ${configWithToken.status}`);

  const invalidDisplayUrl = await request(port, '/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: JSON.stringify({
      ticketCounterDisplayUrl: 'https://attacker.example/ticket-counter?token=stolen',
    }),
  });
  assert(invalidDisplayUrl.status === 400, 'config rejects a non-RepairDesk Ticket Counter URL', `HTTP ${invalidDisplayUrl.status}`);

  const insecureDisplayUrl = await request(port, '/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: JSON.stringify({
      ticketCounterDisplayUrl: 'http://store.repairdesk.co/ticket-counter?token=stolen',
    }),
  });
  assert(insecureDisplayUrl.status === 400, 'config rejects an insecure RepairDesk Ticket Counter URL', `HTTP ${insecureDisplayUrl.status}`);

  const validDisplayUrl = await request(port, '/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: JSON.stringify({
      ticketCounterDisplayUrl: 'https://store.repairdesk.co/ticket-counter?token=smoke-token',
    }),
  });
  assert(validDisplayUrl.status === 200, 'config accepts an HTTPS RepairDesk Ticket Counter URL', `HTTP ${validDisplayUrl.status}`);

  const partialPreferenceSave = await request(port, '/api/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: JSON.stringify({ display: { densityMode: 'compact' } }),
  });
  assert(partialPreferenceSave.status === 200, 'partial preference save is accepted', `HTTP ${partialPreferenceSave.status}`);
  const partialPreferencePayload = JSON.parse(partialPreferenceSave.text);
  assert(partialPreferencePayload.preferences?.display?.densityMode === 'compact', 'partial preference save updates requested field');
  assert(partialPreferencePayload.preferences?.display?.orientation === 'auto', 'partial preference save preserves sibling display fields');
  assert(Array.isArray(partialPreferencePayload.preferences?.schedule?.alertAudioRules), 'partial preference save preserves schedule alert rules');

  const ticketWithoutToken = await request(port, '/api/ticket-counter?url=http%3A%2F%2F127.0.0.1%2Fexample');
  assert(ticketWithoutToken.status === 403, 'ticket feed proxy rejects missing admin token', `HTTP ${ticketWithoutToken.status}`);

  const hostModeSave = await request(port, '/api/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: JSON.stringify({
      ambientAudio: {
        enabled: true,
        audioDataUrl: 'data:audio/mpeg;base64,U01PS0U=',
        fileName: 'private-smoke-audio.mp3',
      },
      schedule: {
        alertAudioEnabled: true,
        speechVoiceUri: 'private-smoke-voice',
        sharedCalendarSync: {
          mode: 'host',
          boardName: 'Security Smoke Host',
        },
      },
    }),
  });
  assert(hostModeSave.status === 200, 'host mode can be configured through the local admin API', `HTTP ${hostModeSave.status}`);
  const hostPreferences = JSON.parse(hostModeSave.text).preferences;
  const sharedSecret = hostPreferences?.schedule?.sharedCalendarSync?.sharedSecret || '';
  assert(sharedSecret.length >= 16, 'host mode generates a strong shared board key');

  const sharedInfo = await request(port, '/api/shared-store-host-info');
  assert(sharedInfo.status === 200, 'shared host discovery metadata remains available', `HTTP ${sharedInfo.status}`);
  assert(!sharedInfo.text.includes(sharedSecret), 'shared host discovery does not expose the board key');

  const sharedWithoutAuth = await request(port, '/api/shared-store-settings');
  assert(sharedWithoutAuth.status === 401, 'shared settings reject an unsigned LAN request', `HTTP ${sharedWithoutAuth.status}`);

  const signedHeaders = sharedAuthHeaders(sharedSecret, '/api/shared-store-settings');
  const sharedWithAuth = await request(port, '/api/shared-store-settings', { headers: signedHeaders });
  assert(sharedWithAuth.status === 200, 'shared settings accept a valid signed LAN request', `HTTP ${sharedWithAuth.status}`);
  const sharedPayload = JSON.parse(sharedWithAuth.text);
  assert(!Object.prototype.hasOwnProperty.call(sharedPayload.preferences || {}, 'ambientAudio'), 'shared settings omit ambient audio data');
  assert(!Object.prototype.hasOwnProperty.call(sharedPayload.preferences?.schedule || {}, 'sharedCalendarSync'), 'shared settings omit local sync metadata and keys');
  assert(!Object.prototype.hasOwnProperty.call(sharedPayload.preferences?.schedule || {}, 'alertAudioEnabled'), 'shared settings keep appointment audio settings local');

  const replayedSharedRequest = await request(port, '/api/shared-store-settings', { headers: signedHeaders });
  assert(replayedSharedRequest.status === 401, 'shared settings reject a replayed signed request', `HTTP ${replayedSharedRequest.status}`);

  const invalidSharedSignature = await request(port, '/api/shared-store-settings', {
    headers: sharedAuthHeaders(sharedSecret, '/api/shared-store-settings', { signature: '0'.repeat(64) }),
  });
  assert(invalidSharedSignature.status === 401, 'shared settings reject an invalid signature', `HTTP ${invalidSharedSignature.status}`);

  const oversizedBody = JSON.stringify({ payload: 'x'.repeat(1300000) });
  const oversizedConfig = await request(port, '/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-One-Bite-Admin-Token': adminToken,
    },
    body: oversizedBody,
  });
  assert(oversizedConfig.status === 413, 'oversized config write is rejected', `HTTP ${oversizedConfig.status}`);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    if (serverOutput) {
      console.error('\nServer output:\n' + serverOutput);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    if (child && child.exitCode === null) {
      child.kill();
    }
    fs.rmSync(appDataDir, { recursive: true, force: true });
  });
