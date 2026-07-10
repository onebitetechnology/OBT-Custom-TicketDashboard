const crypto = require('crypto');

const SHARED_TIMESTAMP_HEADER = 'x-one-bite-shared-timestamp';
const SHARED_NONCE_HEADER = 'x-one-bite-shared-nonce';
const SHARED_SIGNATURE_HEADER = 'x-one-bite-shared-signature';
const DEFAULT_AUTH_WINDOW_MS = 2 * 60 * 1000;

function normalizeSharedStoreSecret(value) {
  const secret = String(value || '').trim();
  return secret.length >= 16 && secret.length <= 128 ? secret : '';
}

function generateSharedStoreSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

function sharedAuthMessage(method, pathname, timestamp, nonce) {
  return [String(method || 'GET').toUpperCase(), String(pathname || '/'), String(timestamp), String(nonce)].join('\n');
}

function createSharedAuthHeaders(secret, method, pathname, options = {}) {
  const normalizedSecret = normalizeSharedStoreSecret(secret);
  if (!normalizedSecret) {
    throw new Error('Shared board key is missing or invalid.');
  }
  const timestamp = String(options.timestamp ?? Date.now());
  const nonce = String(options.nonce || crypto.randomBytes(18).toString('base64url'));
  const signature = crypto
    .createHmac('sha256', normalizedSecret)
    .update(sharedAuthMessage(method, pathname, timestamp, nonce))
    .digest('hex');
  return {
    [SHARED_TIMESTAMP_HEADER]: timestamp,
    [SHARED_NONCE_HEADER]: nonce,
    [SHARED_SIGNATURE_HEADER]: signature,
  };
}

function sharedSecretFingerprint(secret) {
  const normalizedSecret = normalizeSharedStoreSecret(secret);
  if (!normalizedSecret) return '';
  return crypto.createHash('sha256').update(normalizedSecret).digest('hex').slice(0, 16);
}

function verifySharedAuth(options = {}) {
  const secret = normalizeSharedStoreSecret(options.secret);
  const method = String(options.method || 'GET').toUpperCase();
  const pathname = String(options.pathname || '/');
  const timestamp = String(options.timestamp || '').trim();
  const nonce = String(options.nonce || '').trim();
  const signature = String(options.signature || '').trim().toLowerCase();
  const now = Number(options.now ?? Date.now());
  const windowMs = Number(options.windowMs || DEFAULT_AUTH_WINDOW_MS);
  const timestampMs = Number(timestamp);
  const nonceCache = options.nonceCache instanceof Map ? options.nonceCache : new Map();

  if (!secret || !Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > windowMs) return false;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;

  for (const [key, expiresAt] of nonceCache.entries()) {
    if (expiresAt <= now) nonceCache.delete(key);
  }
  const nonceKey = `${sharedSecretFingerprint(secret)}:${nonce}`;
  if (nonceCache.has(nonceKey)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(sharedAuthMessage(method, pathname, timestamp, nonce))
    .digest('hex');
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return false;
  }
  nonceCache.set(nonceKey, now + windowMs);
  return true;
}

module.exports = {
  DEFAULT_AUTH_WINDOW_MS,
  SHARED_NONCE_HEADER,
  SHARED_SIGNATURE_HEADER,
  SHARED_TIMESTAMP_HEADER,
  createSharedAuthHeaders,
  generateSharedStoreSecret,
  normalizeSharedStoreSecret,
  sharedAuthMessage,
  sharedSecretFingerprint,
  verifySharedAuth,
};
