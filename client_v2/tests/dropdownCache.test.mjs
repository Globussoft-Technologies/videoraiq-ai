import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { createDropdownCache, dropdownCache, installDropdownCache, mutationDomains,
  DROPDOWN_LIMITS } from '../src/utils/dropdownCache.js';

const ok = data => ({ status: 200, statusText: 'OK', headers: {},
  data: JSON.stringify({ statusCode: 200, body: { status: 'success', data } }) });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
beforeEach(() => dropdownCache.clear(false));

function setup({ limits = DROPDOWN_LIMITS } = {}) {
  let time = 0, calls = 0;
  const cache = createDropdownCache({ now: () => time, limits });
  const read = (key = 'one', domain = 'nvrs', identity = 'user-1', load = async () => ok(++calls)) =>
    cache.read({ key, domain, identity, config: {}, load });
  return { cache, read, advance(ms) { time += ms; }, calls: () => calls };
}

test('reuses complete responses until expiry and returns independent response wrappers', async () => {
  const s = setup();
  const first = await s.read();
  first.headers.extra = true;
  const second = await s.read();
  assert.equal(first.data, second.data);
  assert.equal(second.headers.extra, undefined);
  assert.equal(s.calls(), 1);
  s.advance(60_001);
  await s.read();
  assert.equal(s.calls(), 2);
});

test('shares simultaneous requests but keeps filters and pagination separate', async () => {
  const { read } = setup();
  const waiting = deferred();
  let calls = 0;
  const load = () => { calls++; return waiting.promise; };
  const first = read('same', 'cameras', 'u', load);
  const second = read('same', 'cameras', 'u', load);
  const third = read('different-filter', 'cameras', 'u', load);
  assert.equal(calls, 2);
  waiting.resolve(ok([]));
  const responses = await Promise.all([first, second, third]);
  assert.notEqual(responses[0], responses[1]);
});

test('invalidates only affected metadata and notifies mounted subscribers', async () => {
  const s = setup();
  await s.read('nvr', 'nvrs');
  await s.read('shift', 'shifts');
  let notices = [];
  const unsubscribe = s.cache.subscribe(domains => notices.push(domains));
  s.cache.invalidate(['nvrs']);
  await s.read('shift', 'shifts');
  await s.read('nvr', 'nvrs');
  assert.equal(s.calls(), 3);
  assert.deepEqual(notices, [['nvrs']]);
  unsubscribe();
  s.cache.clear();
  assert.equal(notices.length, 1);
});

test('retries a pre-mutation response instead of restoring stale data', async () => {
  const { cache, read } = setup();
  const waiting = deferred();
  let calls = 0;
  const request = read('shifts', 'shifts', 'u', () => ++calls === 1 ? waiting.promise : Promise.resolve(ok('fresh')));
  cache.invalidate(['shifts']);
  waiting.resolve(ok('old'));
  assert.equal(JSON.parse((await request).data).body.data, 'fresh');
  assert.equal(calls, 2);
});

test('old accounts cannot populate or return data after an account change or logout', async () => {
  const { cache, read } = setup();
  const waiting = deferred();
  const request = read('same', 'nvrs', 'old-user', () => waiting.promise);
  const rejected = assert.rejects(request, /scope changed/);
  await read('same', 'nvrs', 'new-user');
  waiting.resolve(ok('old-user-data'));
  await rejected;
  assert.equal(cache.stats().entries, 1);
  cache.clear(false);
  assert.equal(cache.stats().entries, 0);
});

test('does not cache application errors or network failures', async () => {
  const { read, cache } = setup();
  await read('failed', 'nvrs', 'u', async () => ({ ...ok(null), data: JSON.stringify({ statusCode: 400, body: { status: 'failed' } }) }));
  assert.equal(cache.stats().entries, 0);
  await assert.rejects(read('network', 'nvrs', 'u', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(cache.stats().pending, 0);
  const malformed = await read('malformed', 'nvrs', 'u', async () => ({ ...ok(null), data: 'not-json' }));
  assert.equal(malformed.data, 'not-json');
});

test('enforces LRU entry and payload budgets and skips oversized responses', async () => {
  const s = setup({ limits: { ...DROPDOWN_LIMITS, entries: 2, bytes: 1000, entryBytes: 500 } });
  await s.read('a'); await s.read('b'); await s.read('a'); await s.read('c');
  assert.equal(s.cache.stats().entries, 2);
  assert.ok(s.cache.stats().bytes <= 1000);
  await s.read('b');
  assert.equal(s.calls(), 4);
  await s.read('big', 'nvrs', 'user-1', async () => ok('x'.repeat(1000)));
  assert.equal(s.cache.stats().entries, 2);
  s.advance(60_001);
  assert.equal(s.cache.stats().bytes, 0);
});

test('bounds pending bookkeeping without blocking other network requests', async () => {
  const s = setup({ limits: { ...DROPDOWN_LIMITS, pending: 2 } });
  const waiting = deferred();
  const requests = ['a', 'b', 'c'].map(key => s.read(key, 'nvrs', 'u', () => waiting.promise));
  assert.equal(s.cache.stats().pending, 2);
  waiting.resolve(ok([]));
  await Promise.all(requests);
  assert.equal(s.cache.stats().pending, 0);
});

test('a late pending completion cannot remove a newer pending request', async () => {
  const { cache, read } = setup();
  const first = deferred(), second = deferred();
  let calls = 0;
  const load = () => ++calls === 1 ? first.promise : second.promise;
  const old = read('a', 'nvrs', 'u', load);
  cache.invalidate(['nvrs']);
  const fresh = read('a', 'nvrs', 'u', load);
  first.resolve(ok('stale'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(cache.stats().pending, 1);
  second.resolve(ok('fresh'));
  await Promise.all([old, fresh]);
  assert.equal(cache.stats().pending, 0);
});

function client(adapter, onInvalidate) {
  const api = axios.create({ baseURL: 'http://example.test/api/v2', adapter,
    headers: { 'x-access-token': 'token' } });
  installDropdownCache(axios, api, 'http://example.test/api/v2', { onInvalidate });
  return api;
}

test('real Axios integration caches JSON while each caller can safely mutate its own result', async () => {
  let calls = 0;
  const api = client(async config => ({ ...ok([{ id: ++calls }]), config }));
  const first = await api.post('/authorizedChannels/getNVRS', {});
  first.data.body.data[0].id = 'mutated';
  const second = await api.post('/authorizedChannels/getNVRS', {});
  assert.equal(second.data.body.data[0].id, 1);
  assert.equal(calls, 1);
});

test('separate Axios instances share identical request data and pending reads', async () => {
  let calls = 0;
  const waiting = deferred();
  const adapter = async config => { calls++; await waiting.promise; return { ...ok([]), config }; };
  const a = client(adapter), b = client(adapter);
  const one = a.post('/authorizedChannels/getNVRS', {});
  const two = b.post('/authorizedChannels/getNVRS', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  waiting.resolve();
  await Promise.all([one, two]);
});

test('successful CRUD invalidates metadata before its caller receives the response', async () => {
  let reads = 0, notifications = 0;
  const api = client(async config => ({ ...ok(config.url.includes('getNVRS') ? ++reads : 'created'), config }),
    () => notifications++);
  await api.post('/authorizedChannels/getNVRS', {});
  await api.post('/nvr/direct', {});
  await api.post('/authorizedChannels/getNVRS', {});
  assert.equal(reads, 2);
  assert.equal(notifications, 1);
});

test('HTTP 200 application-level failed CRUD keeps the cache intact', async () => {
  let reads = 0;
  const api = client(async config => ({ ...ok(config.url.includes('getNVRS') ? ++reads : null), config,
    ...(config.url.includes('/nvr/direct') ? { data: JSON.stringify({ statusCode: 400, body: { status: 'failed' } }) } : {}) }));
  await api.post('/authorizedChannels/getNVRS', {});
  await api.post('/nvr/direct', {});
  await api.post('/authorizedChannels/getNVRS', {});
  assert.equal(reads, 1);
});

test('uses canonical keys for object/filter order and isolates pagination, NVR and accounts', async () => {
  let calls = 0;
  const api = client(async config => ({ ...ok(++calls), config }));
  await api.post('/authorizedChannels/getChannels?limit=10&skip=0', { nvrIds: ['a'], selectedLocations: [] });
  await api.post('/authorizedChannels/getChannels?skip=0&limit=10', { selectedLocations: [], nvrIds: ['a'] });
  assert.equal(calls, 1);
  await api.post('/authorizedChannels/getChannels?skip=10&limit=10', { nvrIds: ['a'] });
  await api.post('/authorizedChannels/getChannels?skip=0&limit=10', { nvrIds: ['b'] });
  await api.post('/authorizedChannels/getChannels?skip=0&limit=10', { nvrIds: ['b'] }, { headers: { 'x-access-token': 'other-account' } });
  assert.equal(calls, 4);
});

test('all five metadata types cache, while management and live endpoints bypass', async () => {
  let calls = 0;
  const api = client(async config => ({ ...ok(++calls), config }));
  for (const path of ['/authorizedChannels/getNVRS', '/authorizedChannels/getChannels', '/departments/get', '/locations/employee-location']) {
    await api.post(path, {}); await api.post(path, {});
  }
  await api.get('/shifts/list'); await api.get('/shifts/list');
  assert.equal(calls, 5);
  for (const path of ['/shifts', '/channel', '/nvr', '/sessions', '/permissions/user-permissions']) {
    await api.get(path); await api.get(path);
  }
  assert.equal(calls, 15);
  await api.get('/shifts', { dropdownCache: true }); await api.get('/shifts', { dropdownCache: true });
  assert.equal(calls, 16);
});

test('explicit refresh, cancellation, timeouts, other backends and binary requests preserve network behavior', async () => {
  let calls = 0;
  const api = client(async config => ({ ...ok(++calls), config }));
  for (const options of [{ dropdownCache: false }, { headers: { 'Cache-Control': 'no-cache' } },
    { signal: new AbortController().signal }, { timeout: 100 }, { responseType: 'blob' }]) {
    await api.get('/shifts/list', options); await api.get('/shifts/list', options);
  }
  await api.get('http://other.test/api/v2/shifts/list'); await api.get('http://other.test/api/v2/shifts/list');
  assert.equal(calls, 12);
});

test('mutation dependency map excludes read-only queries and includes dependent dropdowns', () => {
  assert.deepEqual(mutationDomains('post', '/authorizedUsers/fetch'), []);
  assert.deepEqual(mutationDomains('post', '/shifts/assignments/preview'), []);
  assert.deepEqual(mutationDomains('post', '/shifts/schedule'), []);
  assert.deepEqual(mutationDomains('post', '/channel/playback-url'), []);
  assert.deepEqual(mutationDomains('get', '/nvr/delete-all'), ['nvrs', 'cameras']);
  assert.deepEqual(mutationDomains('put', '/departments/update'), ['departments', 'cameras']);
  assert.deepEqual(mutationDomains('put', '/authorizedUsers/update'), ['locations', 'departments', 'shifts']);
});

test('request tracking saturation still protects against a concurrent mutation', async () => {
  const s = setup({ limits: { ...DROPDOWN_LIMITS, pending: 0 } });
  const waiting = deferred();
  let calls = 0;
  const request = s.read('a', 'nvrs', 'u', () => ++calls === 1 ? waiting.promise : Promise.resolve(ok('fresh')));
  s.cache.invalidate(['nvrs']);
  waiting.resolve(ok('stale'));
  assert.equal(JSON.parse((await request).data).body.data, 'fresh');
  assert.equal(s.cache.stats().pending, 0);
});

test('canceled dropdown requests preserve Axios cancellation behavior', async () => {
  let calls = 0;
  const api = client(async config => { calls++; return { ...ok([]), config }; });
  await api.get('/shifts/list');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.get('/shifts/list', { signal: controller.signal }), error => axios.isCancel(error));
  assert.equal(calls, 1);
});

test('oversized query bodies are passed directly to the network without storage', async () => {
  let calls = 0;
  const api = client(async config => ({ ...ok(++calls), config }));
  const filter = { search: 'x'.repeat(9000) };
  await api.post('/departments/get', filter);
  await api.post('/departments/get', filter);
  assert.equal(calls, 2);
  assert.equal(dropdownCache.stats().entries, 0);
});

test('large filter churn remains within the configured storage budget', async t => {
  const s = setup();
  const start = performance.now();
  for (let i = 0; i < 2000; i++) await s.read(`filter-${i}`, 'cameras', 'u', async () => ok('x'.repeat(5000)));
  const stats = s.cache.stats();
  assert.ok(stats.entries <= DROPDOWN_LIMITS.entries);
  assert.ok(stats.bytes <= DROPDOWN_LIMITS.bytes);
  t.diagnostic(`2,000 filter variations: ${stats.entries} retained entries, ${stats.bytes} accounted bytes, ${Math.round(performance.now() - start)}ms in Node`);
});
