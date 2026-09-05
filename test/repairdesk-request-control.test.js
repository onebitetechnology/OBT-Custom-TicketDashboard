const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculatePerClientIntervalMs,
  createBackgroundRefreshCache,
  createDeduplicatedWorkQueue,
  createRateLimitedRequester,
  createStaleWhileRefreshCoordinator,
  filterFallbackRowsAgainstCurrentOrders,
  parseRetryAfterMs,
  ticketMetaRefreshPriority,
} = require('../app/lib/repairdesk-request-control');

test('fleet quota budget reserves external capacity across five displays', () => {
  const intervalMs = calculatePerClientIntervalMs({
    sharedLimitPerMinute: 50,
    reservedRequestsPerMinute: 30,
    maxClients: 5,
    headroomRequestsPerMinute: 1,
  });

  assert.equal(intervalMs, 20_000);
  assert.ok((5 * (60_000 / intervalMs)) + 30 < 50);
});

test('scheduled and cache-missing active tickets outrank stale metadata refreshes', () => {
  assert.equal(ticketMetaRefreshPriority({ scheduled: true, hasUsableCache: false }), 20);
  assert.equal(ticketMetaRefreshPriority({ scheduled: false, hasUsableCache: false }), 10);
  assert.equal(ticketMetaRefreshPriority({ scheduled: false, hasUsableCache: true }), 1);
});

test('cached appointment fallback rows are filtered against each current queue snapshot', () => {
  const cachedRows = [{ order_id: 'T-100' }, { order_id: 'T-200' }];

  assert.deepEqual(
    filterFallbackRowsAgainstCurrentOrders(cachedRows, new Set(['T-100'])),
    [{ order_id: 'T-200' }]
  );
  assert.deepEqual(
    filterFallbackRowsAgainstCurrentOrders(cachedRows, new Set(['T-200'])),
    [{ order_id: 'T-100' }]
  );
});

test('public API requests start no faster than the configured interval', async () => {
  let now = 1_000;
  const starts = [];
  const requester = createRateLimitedRequester({
    minIntervalMs: 5_000,
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
  });

  const responses = await Promise.all([
    requester(async () => { starts.push(now); return { status: 200, headers: {} }; }),
    requester(async () => { starts.push(now); return { status: 200, headers: {} }; }),
    requester(async () => { starts.push(now); return { status: 200, headers: {} }; }),
  ]);

  assert.deepEqual(starts, [1_000, 6_000, 11_000]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
});

test('a 429 Retry-After response delays the next public API request', async () => {
  let now = 10_000;
  const starts = [];
  const requester = createRateLimitedRequester({
    minIntervalMs: 5_000,
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
  });

  await requester(async () => {
    starts.push(now);
    return { status: 429, headers: { 'retry-after': '60' } };
  });
  await requester(async () => {
    starts.push(now);
    return { status: 200, headers: {} };
  });

  assert.deepEqual(starts, [10_000, 70_000]);
  assert.equal(parseRetryAfterMs({ 'retry-after': '7' }, 0), 7_000);
});

test('background work is deduplicated and higher-priority jobs run first', async () => {
  const started = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const queue = createDeduplicatedWorkQueue({
    worker: async (key) => {
      started.push(key);
      if (key === 'first') await firstBlocked;
    },
  });

  queue.enqueue('first', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['first']);

  queue.enqueue('low', 0);
  queue.enqueue('low', 0);
  queue.enqueue('high', 10);

  releaseFirst();
  await queue.whenIdle();

  assert.deepEqual(started, ['first', 'high', 'low']);
});

test('stale ticket metadata is returned immediately while one background refresh starts', async () => {
  let releaseRefresh;
  const refreshBlocked = new Promise((resolve) => { releaseRefresh = resolve; });
  const refreshed = [];
  const cache = Object.fromEntries(Array.from({ length: 94 }, (_, index) => [
    String(index + 1),
    { metaVersion: 7, fetchedAt: 1_000, serviceName: `Cached ${index + 1}` },
  ]));
  const coordinator = createStaleWhileRefreshCoordinator({
    cache,
    metaVersion: 7,
    ttlMs: 15 * 60 * 1_000,
    now: () => 2_000_000,
    emptyValue: () => ({ serviceName: '' }),
    refresh: async (key) => {
      refreshed.push(key);
      if (key === '1') await refreshBlocked;
      return { metaVersion: 7, fetchedAt: 2_000_000, serviceName: `Fresh ${key}` };
    },
  });

  const snapshot = coordinator.snapshot(Object.keys(cache));
  assert.equal(snapshot['1'].serviceName, 'Cached 1');
  assert.equal(snapshot['94'].serviceName, 'Cached 94');

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(refreshed, ['1']);

  releaseRefresh();
  await coordinator.whenIdle();
  assert.equal(refreshed.length, 94);
  assert.equal(cache['94'].serviceName, 'Fresh 94');
});

test('awaited metadata refresh reuses fresh cache and coalesces concurrent callers', async () => {
  let refreshCount = 0;
  let finishRefresh;
  const refreshBlocked = new Promise((resolve) => { finishRefresh = resolve; });
  const cache = {
    fresh: { metaVersion: 7, fetchedAt: 2_000_000, serviceName: 'Already fresh' },
  };
  const coordinator = createStaleWhileRefreshCoordinator({
    cache,
    metaVersion: 7,
    ttlMs: 60 * 60 * 1_000,
    now: () => 2_000_100,
    emptyValue: () => ({ serviceName: '' }),
    refresh: async (key) => {
      refreshCount += 1;
      await refreshBlocked;
      return { metaVersion: 7, fetchedAt: 2_000_100, serviceName: `Fresh ${key}` };
    },
  });

  assert.equal((await coordinator.refresh('fresh', 20)).serviceName, 'Already fresh');
  assert.equal(refreshCount, 0);

  const first = coordinator.refresh('missing', 10);
  const second = coordinator.refresh('missing', 20);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCount, 1);

  finishRefresh();
  assert.equal((await first).serviceName, 'Fresh missing');
  assert.equal((await second).serviceName, 'Fresh missing');
  assert.equal(refreshCount, 1);
});

test('an unusable metadata refresh rejects without overwriting last-good cache', async () => {
  const cache = {
    'T-100': { metaVersion: 7, fetchedAt: 1_000, serviceName: 'Last good' },
  };
  const coordinator = createStaleWhileRefreshCoordinator({
    cache,
    metaVersion: 7,
    ttlMs: 1_000,
    now: () => 10_000,
    emptyValue: () => ({ serviceName: '' }),
    refresh: async () => ({ serviceName: '' }),
  });

  await assert.rejects(coordinator.refresh('T-100', 20), /unusable data/);
  assert.equal(cache['T-100'].serviceName, 'Last good');
});

test('appointment fallback reuses last-good rows and coalesces refreshes', async () => {
  let now = 1_000;
  let refreshCount = 0;
  let finishRefresh;
  const refreshBlocked = new Promise((resolve) => { finishRefresh = resolve; });
  const cache = createBackgroundRefreshCache({
    ttlMs: 15 * 60 * 1_000,
    now: () => now,
    initialValue: [],
    refresh: async () => {
      refreshCount += 1;
      await refreshBlocked;
      return [{ order_id: 'T-100' }];
    },
  });

  assert.deepEqual(cache.getOrSchedule(new Set()), []);
  assert.deepEqual(cache.getOrSchedule(new Set()), []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCount, 1);

  finishRefresh();
  await cache.whenIdle();
  now += 60_000;
  assert.deepEqual(cache.getOrSchedule(new Set()), [{ order_id: 'T-100' }]);
  assert.equal(refreshCount, 1);
});
