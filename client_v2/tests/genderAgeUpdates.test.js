import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeGenderAgeCounts } from '../src/lib/genderAgeUpdates.js';

function socketFixture() {
  const listeners = new Map();
  return {
    on: (name, callback) => listeners.set(name, callback),
    off: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    emit: name => listeners.get(name)?.(), listeners,
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('count events coalesce, refresh through the API and catch up after reconnect', async () => {
  const socket = socketFixture();
  const calls = [];
  const stop = subscribeGenderAgeCounts(socket, 'client-one', async options => calls.push(options), 0);
  try {
    socket.emit('genderAgeCounts_other-client');
    await tick();
    assert.equal(calls.length, 0);
    socket.emit('genderAgeCounts_client-one');
    socket.emit('genderAgeCounts_client-one');
    socket.emit('genderAgeCounts_client-one');
    await tick();
    assert.deepEqual(calls, [{ background: true }]);
    socket.emit('connect');
    await tick();
    assert.equal(calls.length, 2);
  } finally { stop(); }
  assert.equal(socket.listeners.size, 0);
});

test('updates during a pending request trigger one follow-up without overlapping reads', async () => {
  const socket = socketFixture();
  let release;
  let calls = 0;
  const stop = subscribeGenderAgeCounts(socket, 'client', () => {
    calls += 1;
    if (calls === 1) return new Promise(resolve => { release = resolve; });
    return Promise.resolve();
  }, 0);
  try {
    socket.emit('genderAgeCounts_client');
    await tick();
    socket.emit('genderAgeCounts_client');
    socket.emit('genderAgeCounts_client');
    await tick();
    assert.equal(calls, 1);
    release();
    await tick();
    assert.equal(calls, 2);
  } finally { release?.(); stop(); }
});

test('unmount cancels queued reads and failures allow later events to retry', async () => {
  const socket = socketFixture();
  let calls = 0;
  const stop = subscribeGenderAgeCounts(socket, 'client', async () => { calls += 1; throw new Error('Offline'); }, 0);
  socket.emit('genderAgeCounts_client');
  await tick();
  socket.emit('genderAgeCounts_client');
  await tick();
  assert.equal(calls, 2);
  socket.emit('genderAgeCounts_client');
  stop();
  await tick();
  assert.equal(calls, 2);
  assert.equal(socket.listeners.size, 0);
});
