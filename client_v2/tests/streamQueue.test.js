import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, createContext } from 'node:vm';

const source = await readFile(new URL('../src/lib/streamQueue.js', import.meta.url), 'utf8');

async function harness() {
  let next = 0;
  let now = 0;
  const timers = new Map();
  const context = createContext({
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const module = new SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return {
    queue: module.namespace.default,
    get now() { return now; },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const entry = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)
          .find(([, timer]) => timer.due <= until);
        if (!entry) break;
        now = entry[1].due;
        timers.delete(entry[0]); entry[1].fn();
      }
      now = until;
    },
    run(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected a timer for ${delay}ms`);
      timers.delete(entry[0]); entry[1].fn();
    },
  };
}

test('only one live camera owns a startup turn at a time', async () => {
  const { queue, run } = await harness();
  const admitted = [];
  for (const id of ['slow', 'working', 'next']) queue.request(id, 0, () => admitted.push(id));
  run(80);
  assert.deepEqual(admitted, ['slow']);
  assert.equal(queue.getStats().starting, 1);
  queue.settle('slow');
  run(80);
  assert.deepEqual(admitted, ['slow', 'working']);
  assert.equal(queue.getStats().starting, 1);
  queue.reset();
});

test('nine slow cameras are admitted sequentially within nine seconds', async () => {
  const h = await harness();
  const { queue } = h;
  const admitted = [];
  for (let id = 0; id < 9; id++) queue.request(String(id), id, () => {
    admitted.push({ id, time: h.now });
    assert.equal(queue.getStats().starting, 1);
  });
  h.advance(9000);
  assert.equal(admitted.length, 9);
  assert.equal(admitted[8].time, 8720);
  for (let i = 1; i < admitted.length; i++) {
    assert.equal(admitted[i].time - admitted[i - 1].time, 1080);
  }
  assert.equal(queue.getStats().waiting, 0);
  queue.reset();
});

test('switching live pages releases old starts and admits replacement cameras', async () => {
  const { queue, run } = await harness();
  const admitted = [];
  queue.request('old', 0, () => admitted.push('old'));
  run(80);
  queue.release('old');
  queue.request('new', 0, () => admitted.push('new'));
  run(80);
  assert.deepEqual(admitted, ['old', 'new']);
  assert.equal(queue.getStats().starting, 1);
  queue.reset();
});
