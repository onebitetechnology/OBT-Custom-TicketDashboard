const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SHARED_NONCE_HEADER,
  SHARED_SIGNATURE_HEADER,
  SHARED_TIMESTAMP_HEADER,
  createSharedAuthHeaders,
  generateSharedStoreSecret,
  normalizeSharedStoreSecret,
  verifySharedAuth,
} = require('../app/lib/shared-auth');

const secret = 'shared-board-test-key-1234567890';
const pathname = '/api/shared-store-settings';
const now = 1_800_000_000_000;

function verify(headers, overrides = {}) {
  return verifySharedAuth({
    secret,
    method: 'GET',
    pathname,
    timestamp: headers[SHARED_TIMESTAMP_HEADER],
    nonce: headers[SHARED_NONCE_HEADER],
    signature: headers[SHARED_SIGNATURE_HEADER],
    now,
    nonceCache: new Map(),
    ...overrides,
  });
}

test('shared board secrets are strong and length-limited', () => {
  const generated = generateSharedStoreSecret();
  assert.ok(generated.length >= 32);
  assert.equal(normalizeSharedStoreSecret(generated), generated);
  assert.equal(normalizeSharedStoreSecret('too-short'), '');
  assert.equal(normalizeSharedStoreSecret('x'.repeat(129)), '');
});

test('valid signed shared-settings request verifies', () => {
  const headers = createSharedAuthHeaders(secret, 'GET', pathname, {
    timestamp: now,
    nonce: 'fixed-test-nonce-123456789',
  });
  assert.equal(verify(headers), true);
  assert.equal(Object.values(headers).includes(secret), false);
});

test('signature is bound to secret, method, path, and timestamp window', () => {
  const headers = createSharedAuthHeaders(secret, 'GET', pathname, {
    timestamp: now,
    nonce: 'binding-test-nonce-1234567',
  });
  assert.equal(verify(headers, { secret: 'different-shared-board-key-1234' }), false);
  assert.equal(verify(headers, { method: 'POST' }), false);
  assert.equal(verify(headers, { pathname: '/api/shared-calendar-blocks' }), false);
  assert.equal(verify(headers, { now: now + (3 * 60 * 1000) }), false);
});

test('a valid nonce can only be used once', () => {
  const nonceCache = new Map();
  const headers = createSharedAuthHeaders(secret, 'GET', pathname, {
    timestamp: now,
    nonce: 'replay-test-nonce-12345678',
  });
  const options = {
    secret,
    method: 'GET',
    pathname,
    timestamp: headers[SHARED_TIMESTAMP_HEADER],
    nonce: headers[SHARED_NONCE_HEADER],
    signature: headers[SHARED_SIGNATURE_HEADER],
    now,
    nonceCache,
  };
  assert.equal(verifySharedAuth(options), true);
  assert.equal(verifySharedAuth(options), false);
});

test('malformed and forged signatures are rejected', () => {
  const headers = createSharedAuthHeaders(secret, 'GET', pathname, {
    timestamp: now,
    nonce: 'forgery-test-nonce-1234567',
  });
  assert.equal(verify({ ...headers, [SHARED_SIGNATURE_HEADER]: '0'.repeat(64) }), false);
  assert.equal(verify({ ...headers, [SHARED_SIGNATURE_HEADER]: 'not-hex' }), false);
  assert.equal(verify({ ...headers, [SHARED_NONCE_HEADER]: 'short' }), false);
});
