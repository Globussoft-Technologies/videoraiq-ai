import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const source = await readFile(new URL('../src/hooks/useHlsPlayer.js', import.meta.url), 'utf8');

async function harness({ native = false } = {}) {
  const effects = [], players = [], timers = new Map(), intervals = new Map();
  let sequence = 0;
  class Hls {
    static Events = { MEDIA_ATTACHED: 'attached', ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    static DefaultConfig = { loader: class { load() {} } };
    static isSupported() { return !native; }
    constructor(config) { this.config = config; this.events = new Map(); this.levels = [{}]; this.sourceLoads = 0; players.push(this); }
    on(event, callback) { this.events.set(event, callback); }
    emit(event, data) { this.events.get(event)?.(event, data); }
    attachMedia() { this.emit('attached'); }
    loadSource(url) { this.url = url; this.sourceLoads++; }
    destroy() { this.destroyed = true; }
    startLoad() {}
  }
  const listeners = new Map();
  const video = {
    readyState: 4, currentTime: 0, pause() {}, load() {}, play: async () => {}, canPlayType: () => 'probably',
    removeAttribute(key) { delete this[key]; },
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event) => listeners.delete(event),
  };
  const context = createContext({
    setTimeout: (fn) => { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { const id = ++sequence; intervals.set(id, fn); return id; },
    clearInterval: (id) => intervals.delete(id),
  });
  const module = new SourceTextModule(source, { context });
  await module.link((specifier) => {
    const values = specifier === 'react'
      ? { useRef: (current) => ({ current }), useEffect: (fn) => effects.push(fn) }
      : { default: specifier === 'hls.js' ? Hls : () => 'token' };
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const mount = (url, options) => {
    effects.length = 0;
    module.namespace.default({ current: video }, url, options);
    const cleanups = effects.map(fn => fn());
    return () => cleanups.forEach(fn => fn?.());
  };
  const retry = () => {
    const [id, fn] = timers.entries().next().value;
    timers.delete(id); fn();
  };
  return { mount, players, video, listeners, timers, intervals, retry };
}

test('fatal network errors recover on the same player and preserve its media', async () => {
  const h = await harness();
  const unmount = h.mount('camera-a.m3u8');
  assert.equal(h.players[0].url, 'camera-a.m3u8');
  h.listeners.get('playing')();
  h.players[0].emit('error', { response: { code: 404 }, fatal: true, type: 'network' });
  assert.equal(h.timers.size, 1);
  h.retry();
  assert.equal(h.players[0].destroyed, undefined);
  assert.equal(h.players[0].sourceLoads, 1, 'established feeds must not reload/detach their media source');
  assert.equal(h.players.length, 1);
  assert.equal(h.players[0].url, 'camera-a.m3u8');
  unmount();
  assert.equal(h.intervals.size, 0);
});

test('switching cameras cancels old retries and ignores late errors', async () => {
  const h = await harness();
  const cleanup = h.mount('camera-a.m3u8');
  const old = h.players[0];
  old.emit('error', { fatal: true, type: 'network' });
  cleanup();
  assert.equal(h.timers.size, 0);
  const cleanupNext = h.mount('camera-b.m3u8');
  old.emit('error', { response: { code: 404 } });
  assert.equal(h.timers.size, 0);
  assert.equal(h.players.at(-1).url, 'camera-b.m3u8');
  cleanupNext();
  assert.equal(h.listeners.size, 0);
});

test('native HLS releases its media source on switch or unmount', async () => {
  const h = await harness({ native: true });
  const cleanup = h.mount('camera-a.m3u8');
  assert.equal(h.video.src, 'camera-a.m3u8');
  cleanup();
  assert.equal(h.video.src, undefined);
  assert.equal(h.listeners.size, 0);
});

test('a frozen live frame reconnects even when readyState says buffered', async () => {
  const h = await harness();
  const cleanup = h.mount('live-camera.m3u8');
  h.video.currentTime = 10;
  const tick = [...h.intervals.values()][0];
  tick();
  assert.equal(h.timers.size, 0, 'an advancing live frame should keep its connection');
  tick();
  assert.equal(h.timers.size, 1, 'a frozen buffered frame should reconnect');
  h.retry();
  assert.equal(h.players[0].destroyed, undefined);
  assert.equal(h.players.length, 1);
  assert.equal(h.players[0].url, 'live-camera.m3u8');
  cleanup();
});

test('temporary segment 404s do not mark the camera unavailable or rebuild it', async () => {
  const h = await harness();
  const errors = [];
  const cleanup = h.mount('live.m3u8', { onError: error => errors.push(error) });
  h.players[0].emit('error', { response: { code: 404 }, fatal: false, type: 'network' });
  assert.equal(h.timers.size, 0);
  assert.equal(h.players.length, 1);
  assert.deepEqual(errors, []);
  cleanup();
});

test('video progress clears buffering and cancels recovery without another playing event', async () => {
  const h = await harness();
  const states = [];
  const cleanup = h.mount('live.m3u8', { onBuffering: value => states.push(value) });
  h.listeners.get('waiting')();
  h.players[0].emit('error', { fatal: true, type: 'network' });
  assert.equal(h.timers.size, 1);
  h.video.currentTime = 1;
  h.listeners.get('timeupdate')();
  assert.equal(states.at(-1), false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.players[0].destroyed, undefined);
  cleanup();
});

test('an initial manifest failure retries the manifest without creating another player', async () => {
  const h = await harness();
  const cleanup = h.mount('live.m3u8');
  h.players[0].levels = [];
  h.players[0].emit('error', { fatal: true, type: 'network' });
  h.retry();
  assert.equal(h.players[0].sourceLoads, 2);
  assert.equal(h.players.length, 1);
  cleanup();
});
