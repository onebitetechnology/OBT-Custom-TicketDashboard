'use strict';

function calculatePerClientIntervalMs(options = {}) {
  const sharedLimit = Math.max(1, Number(options.sharedLimitPerMinute || 1));
  const reserved = Math.max(0, Number(options.reservedRequestsPerMinute || 0));
  const headroom = Math.max(0, Number(options.headroomRequestsPerMinute || 0));
  const maxClients = Math.max(1, Number(options.maxClients || 1));
  const availableForClients = Math.max(1, Math.floor(sharedLimit - reserved - headroom));
  const requestsPerClient = Math.max(1, Math.floor(availableForClients / maxClients));
  return Math.ceil(60_000 / requestsPerClient);
}

function ticketMetaRefreshPriority(options = {}) {
  if (options.scheduled) return 20;
  if (!options.hasUsableCache) return 10;
  return 1;
}

function filterFallbackRowsAgainstCurrentOrders(rows = [], currentOrderIds = new Set()) {
  return rows.filter((row) => !currentOrderIds.has(String(row?.order_id || '').trim()));
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const target = String(name || '').toLowerCase();
  const match = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
  return match ? String(match[1] || '') : '';
}

function parseRetryAfterMs(headers, now = Date.now()) {
  const raw = headerValue(headers, 'retry-after').trim();
  if (!raw) return 60_000;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return Math.max(0, Math.ceil(Number(raw) * 1_000));
  }
  const retryAt = Date.parse(raw);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 60_000;
}

function createRateLimitedRequester(options = {}) {
  const minIntervalMs = Math.max(0, Number(options.minIntervalMs || 0));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const wait = typeof options.sleep === 'function'
    ? options.sleep
    : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let nextAllowedAt = 0;
  let tail = Promise.resolve();

  return function request(task) {
    const run = tail.then(async () => {
      const waitMs = Math.max(0, nextAllowedAt - now());
      if (waitMs) await wait(waitMs);
      const startedAt = now();
      nextAllowedAt = Math.max(nextAllowedAt, startedAt + minIntervalMs);
      const response = await task();
      if (Number(response?.status || 0) === 429) {
        nextAllowedAt = Math.max(
          nextAllowedAt,
          now() + parseRetryAfterMs(response?.headers, now())
        );
      }
      return response;
    });
    tail = run.catch(() => {});
    return run;
  };
}

function createDeduplicatedWorkQueue(options = {}) {
  if (typeof options.worker !== 'function') {
    throw new TypeError('worker is required');
  }
  const pending = new Map();
  const active = new Set();
  const idleWaiters = new Set();
  let sequence = 0;
  let draining = false;

  function resolveIdleWaiters() {
    if (draining || active.size || pending.size) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  function nextJob() {
    return Array.from(pending.values()).sort((left, right) => (
      right.priority - left.priority || left.sequence - right.sequence
    ))[0] || null;
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.size) {
        const job = nextJob();
        if (!job) break;
        pending.delete(job.key);
        active.add(job.key);
        try {
          await options.worker(job.key);
        } catch (error) {
          if (typeof options.onError === 'function') options.onError(error, job.key);
        } finally {
          active.delete(job.key);
        }
      }
    } finally {
      draining = false;
      resolveIdleWaiters();
    }
  }

  function enqueue(rawKey, priority = 0) {
    const key = String(rawKey || '').trim();
    if (!key || active.has(key)) return false;
    const existing = pending.get(key);
    if (existing) {
      existing.priority = Math.max(existing.priority, Number(priority || 0));
      return false;
    }
    pending.set(key, { key, priority: Number(priority || 0), sequence: sequence += 1 });
    queueMicrotask(drain);
    return true;
  }

  function whenIdle() {
    if (!draining && !active.size && !pending.size) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  return { enqueue, whenIdle };
}

function createStaleWhileRefreshCoordinator(options = {}) {
  const cache = options.cache || Object.create(null);
  const expectedVersion = Number(options.metaVersion || 0);
  const ttlMs = Math.max(0, Number(options.ttlMs || 0));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const emptyValue = typeof options.emptyValue === 'function' ? options.emptyValue : () => null;
  if (typeof options.refresh !== 'function') {
    throw new TypeError('refresh is required');
  }

  function usable(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      (!expectedVersion || Number(value.metaVersion || 0) === expectedVersion)
    );
  }

  function fresh(value) {
    return usable(value) && (now() - Number(value.fetchedAt || 0)) < ttlMs;
  }

  const refreshes = new Map();
  const workQueue = createDeduplicatedWorkQueue({
    worker: async (key) => {
      const pendingRefresh = refreshes.get(key);
      try {
        const refreshed = await options.refresh(key);
        if (!usable(refreshed)) {
          throw new Error(`Refresh returned unusable data for ${key}`);
        }
        cache[key] = refreshed;
        pendingRefresh?.resolve(refreshed);
      } catch (error) {
        pendingRefresh?.reject(error);
        throw error;
      } finally {
        refreshes.delete(key);
      }
    },
    onError: options.onError,
  });

  function refresh(rawKey, priority = 0) {
    const key = String(rawKey || '').trim();
    if (!key) return Promise.resolve(emptyValue());
    const value = cache[key];
    if (fresh(value)) return Promise.resolve(value);

    let pendingRefresh = refreshes.get(key);
    if (!pendingRefresh) {
      pendingRefresh = {};
      pendingRefresh.promise = new Promise((resolve, reject) => {
        pendingRefresh.resolve = resolve;
        pendingRefresh.reject = reject;
      });
      refreshes.set(key, pendingRefresh);
    }
    workQueue.enqueue(key, priority);
    return pendingRefresh.promise;
  }

  function get(rawKey, priority = 0) {
    const key = String(rawKey || '').trim();
    if (!key) return emptyValue();
    const value = cache[key];
    if (!fresh(value)) refresh(key, priority).catch(() => {});
    return usable(value) ? value : emptyValue();
  }

  function snapshot(keys = [], priorityForKey = () => 0) {
    return Object.fromEntries(Array.from(new Set(keys.map((key) => String(key || '').trim()).filter(Boolean)))
      .map((key) => [key, get(key, priorityForKey(key))]));
  }

  return {
    get,
    snapshot,
    refresh,
    whenIdle: workQueue.whenIdle,
  };
}

function createBackgroundRefreshCache(options = {}) {
  const ttlMs = Math.max(0, Number(options.ttlMs || 0));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  if (typeof options.refresh !== 'function') {
    throw new TypeError('refresh is required');
  }
  let value = options.initialValue;
  let fetchedAt = 0;
  let inFlight = null;

  function getOrSchedule(input) {
    if (!inFlight && (!fetchedAt || (now() - fetchedAt) >= ttlMs)) {
      inFlight = Promise.resolve()
        .then(() => options.refresh(input, value))
        .then((refreshed) => {
          value = refreshed;
          fetchedAt = now();
        })
        .catch((error) => {
          if (typeof options.onError === 'function') options.onError(error);
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return value;
  }

  function whenIdle() {
    return inFlight || Promise.resolve();
  }

  return { getOrSchedule, whenIdle };
}

module.exports = {
  calculatePerClientIntervalMs,
  createBackgroundRefreshCache,
  createDeduplicatedWorkQueue,
  createRateLimitedRequester,
  createStaleWhileRefreshCoordinator,
  filterFallbackRowsAgainstCurrentOrders,
  parseRetryAfterMs,
  ticketMetaRefreshPriority,
};
