import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createPendingRead } from '../src/utils/pendingRead.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;
async function fixture() {
  const calls = [];
  const harness = { token: 'token-one', session: 'session-one', calls,
    axios: { post: (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })) } };
  const name = `__pendingReadFixture${sequence++}`;
  globalThis[name] = harness;
  let source = await fs.readFile(new URL('../src/helpers/incidents.js', import.meta.url), 'utf8');
  source = source
    .replace("import axios from 'axios';", `const axios = globalThis.${name}.axios;`)
    .replace("import getAccessToken from '@/utils/getAccessToken';", `const getAccessToken = () => globalThis.${name}.token;`)
    .replace("import { getSessionId } from '@/utils/sessionIdentity';", `const getSessionId = () => globalThis.${name}.session;`)
    .replace("'../utils/pendingRead'", JSON.stringify(new URL('../src/utils/pendingRead.js', import.meta.url).href))
    .replace('import.meta.env.VITE_BACKEND', JSON.stringify('http://backend.test/api/v2'));
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { ...harness, harness, fetch: module.fetchIncidents };
}
const response = { body: { data: { result: [{ _id: 'one', Image: 'image.jpg', extra: { keep: true } }], totalCount: 8, counts: { severity: { all: 8 }, status: { new: 3 } } } } };
const shared = { sharePending: true };

test('four overlapping today/yesterday reads use two HTTP calls and preserve complete results', async () => {
  const f = await fixture();
  const today = { startDate: '2026-10-14', endDate: '2026-10-14', statusFilter: ['new', 'resolved', 'reported'] };
  const yesterday = { ...today, startDate: '2026-10-13', endDate: '2026-10-13' };
  const reads = [today, yesterday, today, yesterday].map(filter => f.fetch({ skip: 0, limit: 1 }, filter, shared));
  await tick();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0].args, ['http://backend.test/api/v2/incidents?skip=0&limit=1', today,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': 'token-one' } }]);
  f.calls.forEach(call => call.resolve({ data: response }));
  const results = await Promise.all(reads);
  results.forEach(result => assert.deepEqual(result, { items: response.body.data.result, totalCount: 8, counts: response.body.data.counts }));
  results[0].items[0].extra.keep = false;
  assert.equal(results[2].items[0].extra.keep, true);
  const fresh = f.fetch({ skip: 0, limit: 1 }, today, shared);
  await tick();
  assert.equal(f.calls.length, 3);
  f.calls[2].resolve({ data: response });
  await fresh;
});

test('different filters, pagination, tokens and sessions never share', async () => {
  const f = await fixture();
  const reads = [f.fetch({ limit: 1 }, {}, shared), f.fetch({ limit: 2 }, {}, shared), f.fetch({ limit: 1 }, { nvrIds: 'other' }, shared)];
  f.harness.token = 'token-two';
  reads.push(f.fetch({ limit: 1 }, {}, shared));
  f.harness.session = 'session-two';
  reads.push(f.fetch({ limit: 1 }, {}, shared));
  await tick();
  assert.equal(f.calls.length, 5);
  f.calls.forEach(call => call.resolve({ data: response }));
  await Promise.all(reads);
});

test('ordinary incident reads remain independent', async () => {
  const f = await fixture();
  const reads = [f.fetch(), f.fetch()];
  assert.equal(f.calls.length, 2);
  f.calls.forEach(call => call.resolve({ data: response }));
  await Promise.all(reads);
});

test('shared failures reach every caller and allow a fresh retry', async () => {
  const f = await fixture();
  const reads = [f.fetch({}, {}, shared), f.fetch({}, {}, shared)];
  const settled = Promise.allSettled(reads);
  await tick();
  const error = new Error('network failure');
  f.calls[0].reject(error);
  (await settled).forEach(result => { assert.equal(result.status, 'rejected'); assert.equal(result.reason, error); });
  const retry = f.fetch({}, {}, shared);
  await tick();
  assert.equal(f.calls.length, 2);
  f.calls[1].resolve({ data: response });
  await retry;
});

test('pending map capacity bypasses sharing without dropping reads', async () => {
  const read = createPendingRead(1);
  let release;
  const first = read('one', () => new Promise(resolve => { release = resolve; }));
  await tick();
  assert.deepEqual(await read('two', async () => ({ value: 2 })), { value: 2 });
  release({ value: 1 });
  assert.deepEqual(await first, { value: 1 });
});

test('actual Command Center count and comparison functions share reads and keep KPI values', async () => {
  const f = await fixture();
  const name = `__dashboardFunctions${sequence++}`;
  globalThis[name] = f.fetch;
  const source = await fs.readFile(new URL('../src/page/user/CommandCenter/CommandCenter.jsx', import.meta.url), 'utf8');
  const functions = source.slice(source.indexOf('const ALL_STATUS_FILTER'), source.indexOf('function dateFilter'));
  const module = await import(`data:text/javascript;base64,${Buffer.from(
    `const fetchIncidents = globalThis.${name};\n${functions}\nexport {getDashboardIncidentCounts,getDashboardDailyComparison};`
  ).toString('base64')}`);
  const filters = { nvrId: 'nvr-one', channelId: 'camera-one' };
  const reads = [
    module.getDashboardIncidentCounts({ ...filters, startDate: '2026-10-14', endDate: '2026-10-14' }),
    module.getDashboardIncidentCounts({ ...filters, startDate: '2026-10-13', endDate: '2026-10-13' }),
    module.getDashboardDailyComparison(filters, '2026-10-14', '2026-10-13'),
  ];
  await tick();
  assert.equal(f.calls.length, 2);
  f.calls.forEach(call => call.resolve({ data: response }));
  const [today, yesterday, comparison] = await Promise.all(reads);
  assert.deepEqual(today, yesterday);
  assert.equal(today.severity.all, 8);
  assert.equal(today.status.new, 3);
  assert.deepEqual(comparison, {
    today: { activeAlerts: 3, highAlerts: 0, events: 8, resolved: 0 },
    previous: { activeAlerts: 3, highAlerts: 0, events: 8, resolved: 0 },
  });
});
