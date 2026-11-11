import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import axios from 'axios';
import { startStub } from './helpers/xrayStubServer.js';
import { REACT_EXPORTS, fakeSocket, reactStub, renderHook } from './helpers/hookHarness.js';

/**
 * Plan Phase 7's leak audit, measured.
 *
 * Five scenarios — unmount, camera change, tab close, rapid toggling, and a
 * dead network — each driven through the **real** `useXraySession`, the **real**
 * `api.js`, real axios, and real HTTP against the contract stub. Only React and
 * the socket are substituted (see `helpers/hookHarness.js` for exactly what that
 * fakes and what it does not).
 *
 * The assertion is a ledger, not a reading of the source: the stub issues a
 * distinct `sessionId` per `POST /sessions`, and a leak is any id that was
 * created and never deleted. A GPU slot held by a leaked session is unavailable
 * until the 45 s idle reap (contract §10), which is why the plan singles this
 * out.
 *
 * Every test unmounts. A live session holds a 10 s heartbeat interval, and an
 * un-cleared interval would keep the test process alive — so a forgotten
 * unmount here shows up as a hanging suite, which is its own small guard.
 */

const SRC = (name) => fileURLToPath(new URL(`../src/xray/${name}`, import.meta.url));

/**
 * Load `useXraySession.js` with its import graph linked by hand.
 *
 * Real: the hook itself, `api.js`, `session.js`, `buttonState.js`, axios, HTTP.
 * Faked: `react` (the harness), the app's socket context, the token getter, and
 * the shared axios instance — repointed at the stub, with the same
 * `x-access-token` interceptor `helpers/client.js` installs.
 *
 * @param {string} baseURL
 * @param {object} [opts]
 * @param {(src: string) => string} [opts.patchHook] mutate the hook's source
 *   before it is loaded — used only to build the negative controls.
 */
async function loadHook(baseURL, { patchHook = (s) => s, token = 'test-token' } = {}) {
  const env = { VITE_BACKEND: baseURL };
  const client = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });
  client.interceptors.request.use((config) => {
    config.headers['x-access-token'] = token;
    return config;
  });

  const wire = fakeSocket();
  const cache = new Map();

  const make = (file, source) => new SourceTextModule(source, {
    identifier: file,
    initializeImportMeta(meta) { meta.env = env; },
  });

  const linker = (specifier) => {
    if (specifier === 'react') {
      return new SyntheticModule(REACT_EXPORTS, function () {
        for (const name of REACT_EXPORTS) this.setExport(name, reactStub[name]);
      });
    }
    if (specifier.includes('SocketContext')) {
      return new SyntheticModule(['useSocket'], function () {
        this.setExport('useSocket', () => ({ socket: wire.socket, connected: true }));
      });
    }
    if (specifier.includes('getAccessToken')) {
      return new SyntheticModule(['default'], function () {
        this.setExport('default', () => token);
      });
    }
    if (specifier.includes('helpers/client')) {
      return new SyntheticModule(['default', 'api'], function () {
        this.setExport('default', client);
        this.setExport('api', client);
      });
    }
    // Everything else is a real source file in src/xray/.
    const name = specifier.replace(/^\.\//, '').replace(/\.js$/, '') + '.js';
    const file = SRC(name);
    if (!cache.has(file)) cache.set(file, make(file, readFileSync(file, 'utf8')));
    return cache.get(file);
  };

  const file = SRC('useXraySession.js');
  const module = make(file, patchHook(readFileSync(file, 'utf8')));
  await module.link(linker);
  await module.evaluate();
  return { useXraySession: module.namespace.default, wire };
}

/** Let axios' in-flight promises and the stub's responses settle. */
const settle = async (ms = 60) => { await new Promise((r) => setTimeout(r, ms)); };

/**
 * `useXraySession` reads `window` for the `pagehide` listener. Node has no
 * `window`, so the suite supplies one it can also fire — which is what makes the
 * tab-close path a real measurement rather than an inspection.
 */
function installWindow() {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      const list = listeners.get(event) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
  return {
    fire: (event) => { for (const fn of [...(listeners.get(event) ?? [])]) fn(); },
    count: (event) => (listeners.get(event) ?? []).length,
  };
}

const CAMERA = { cameraId: '6ae4b52ea9fb890eb3283b85', nvrId: '6ae4b52ea9fb890eb3283b83' };

// ───────────────────────────── the harness itself ─────────────────────────────

test('the harness can drive the real hook at all', async () => {
  const stub = await startStub({ uniqueSessions: true });
  const win = installWindow();
  const { useXraySession, wire } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    assert.equal(h.result.status, 'idle');
    assert.equal(wire.listenerCount('xray:state'), 1, 'subscribed on mount');
    assert.equal(win.count('pagehide'), 1);

    await h.result.start();
    assert.equal(h.result.status, 'ready', 'a 200 means ready (contract §4)');
    assert.equal(h.result.session.sessionId, 'sess-001');
    assert.equal(h.result.session.maxObjects, 1);
  } finally {
    h.unmount();
    await settle();
    await stub.close();
  }
});

// ───────────────────── scenario 1 — unmount, and route away ─────────────────────

test('scenario 1: unmount deletes the session and removes every listener', async () => {
  const stub = await startStub({ uniqueSessions: true });
  const win = installWindow();
  const { useXraySession, wire } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();

  h.unmount();
  await settle();

  const { created, deleted, leaked } = stub.ledger();
  assert.deepEqual(created, ['sess-001']);
  assert.deepEqual(leaked, [], `leaked ${leaked.join(', ')}`);
  assert.ok(deleted.includes('sess-001'));
  assert.equal(wire.listenerCount(), 0, 'socket.io listeners outlived the hook');
  assert.equal(win.count('pagehide'), 0, 'pagehide listener outlived the hook');
  await stub.close();
});

test('NEGATIVE CONTROL: with the unmount close removed, the audit fails', async () => {
  // The point of this test is to fail the one above on purpose. A harness that
  // cannot see an injected leak is not evidence that there is no real one — and
  // this project has already shipped two tests whose setup made the failure they
  // named impossible.
  const stub = await startStub({ uniqueSessions: true });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL, {
    patchHook: (src) => {
      const broken = src.replace(
        'window.removeEventListener(\'pagehide\', onPageHide);\n      closeNow();',
        'window.removeEventListener(\'pagehide\', onPageHide);',
      );
      assert.notEqual(broken, src, 'the control patch matched nothing — fix the patch');
      return broken;
    },
  });
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();

  h.unmount();
  await settle();

  const { created, leaked } = stub.ledger();
  assert.deepEqual(created, ['sess-001']);
  assert.deepEqual(leaked, ['sess-001'], 'the harness did NOT detect a removed teardown');
  await stub.close();
});

test('scenario 1b: StrictMode double-invoke does not leak or lose the session', async () => {
  // `main.jsx:22` really does wrap the app in <StrictMode>, so in dev every
  // effect mounts, tears down and mounts again. A teardown that only works once
  // is broken in the environment the user will actually look at.
  const stub = await startStub({ uniqueSessions: true });
  const win = installWindow();
  const { useXraySession, wire } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA, strict: true });

  assert.equal(wire.listenerCount('xray:state'), 1, 'double-invoke left a duplicate listener');
  assert.equal(win.count('pagehide'), 1);

  await h.result.start();
  assert.equal(h.result.status, 'ready', 'the mount-time close invalidated a later start');

  h.unmount();
  await settle();
  assert.deepEqual(stub.ledger().leaked, []);
  assert.equal(wire.listenerCount(), 0);
  await stub.close();
});

// ───────────── scenario 2 — the camera changes without an unmount ─────────────

test('scenario 2: a camera change closes the session for the old camera', async () => {
  // The route-change case that does NOT unmount. `Detections.jsx` keys the page
  // on `${camera._id}-${settingType}`, and `DetectionSettings.jsx` only reaches
  // a second camera via onBack → null → the list, so today this is unreachable
  // through the UI. The failure if either call site changes is not a crash: it
  // is masks for camera A drawn over camera B's video, silently.
  const stub = await startStub({ uniqueSessions: true });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();
  assert.equal(h.result.session.sessionId, 'sess-001');

  h.setProps({ cameraId: 'a-different-camera', nvrId: CAMERA.nvrId });
  await settle();

  assert.deepEqual(stub.ledger().leaked, [], 'the old camera kept its GPU slot');
  assert.equal(h.result.status, 'idle', 'the UI still claimed a live session');
  assert.equal(h.result.session, null);

  // ...and the new camera can start cleanly.
  await h.result.start();
  assert.equal(h.result.session.sessionId, 'sess-002');
  assert.equal(stub.calls.filter((c) => c.method === 'POST'
    && /sessions\/?$/.test(c.path)).at(-1).body.cameraId, 'a-different-camera');

  h.unmount();
  await settle();
  assert.deepEqual(stub.ledger().leaked, []);
  await stub.close();
});

test('a re-render with the same camera does NOT restart the session', async () => {
  // The guard compares a composite key, not object identity, because the page
  // hands the hook fresh strings on every render and `refreshOpenCamera` replaces
  // the camera object wholesale for the same `_id`. Keyed on identity, this
  // would close and reopen a live session on every refresh — a GPU slot churned
  // for nothing, and the user's track lost.
  const stub = await startStub({ uniqueSessions: true });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();

  h.setProps({ ...CAMERA });
  h.setProps({ ...CAMERA });
  await settle();

  assert.equal(h.result.status, 'ready');
  assert.equal(h.result.session.sessionId, 'sess-001');
  assert.equal(stub.ledger().created.length, 1, 'a re-render started a second session');
  assert.equal(stub.ledger().deleted.length, 0);

  h.unmount();
  await settle();
  await stub.close();
});

// ──────────────────────── scenario 3 — the tab closes ────────────────────────

test('scenario 3: pagehide deletes the session over keepalive fetch', async () => {
  // Real `fetch`, real HTTP, real DELETE. On a real `pagehide` the browser
  // cancels in-flight XHR, which is why this one path does not go through axios.
  const stub = await startStub({ uniqueSessions: true });
  const win = installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();

  win.fire('pagehide');
  await settle(150);

  const { deleted } = stub.ledger();
  assert.ok(deleted.includes('sess-001'), `pagehide sent no DELETE (saw ${deleted.join(', ') || 'none'})`);
  const del = stub.calls.find((c) => c.method === 'DELETE');
  assert.equal(del.token, 'test-token', 'the unload DELETE must still carry the token');

  h.unmount();
  await settle();
  await stub.close();
});

test('pagehide with no token sends nothing rather than an unauthenticated DELETE', async () => {
  const stub = await startStub({ uniqueSessions: true });
  const win = installWindow();
  const { useXraySession } = await loadHook(stub.baseURL, { token: '' });
  const h = renderHook(useXraySession, { props: CAMERA });
  // With no token the stub answers 401, so no session exists to leak. What is
  // being pinned is that the unload path does not fire a credential-less request
  // on the way out; Node's own socket-disconnect reap (contract §10) is what
  // covers this case.
  await h.result.start();
  assert.equal(h.result.status, 'idle');
  win.fire('pagehide');
  await settle(120);
  assert.equal(stub.calls.filter((c) => c.method === 'DELETE').length, 0);
  h.unmount();
  await settle();
  await stub.close();
});

// ────────────────── scenario 4 — rapid toggling, the usual leak ──────────────────

test('scenario 4: toggling faster than the server answers leaks nothing', async () => {
  // The plan calls this one out as "the one that usually leaks", and it is the
  // only scenario where a session exists that the client has never been told
  // about: `POST /sessions` is slow by design (contract §4, the SHM gate), so a
  // user who presses off during "Preparing X-Ray…" has created a real GPU-side
  // session whose id arrives after nobody is watching.
  const stub = await startStub({ uniqueSessions: true, delayMs: 90 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });

  const inFlight = [];
  inFlight.push(h.result.start());   // abandoned mid-bootstrap
  h.result.stop();
  inFlight.push(h.result.start());   // abandoned mid-bootstrap
  h.result.stop();
  inFlight.push(h.result.start());   // the one the user actually wants
  await Promise.all(inFlight);
  await settle(200);

  const { created, leaked } = stub.ledger();
  assert.deepEqual(created, ['sess-001', 'sess-002', 'sess-003'],
    'three presses must have reached the server — otherwise this proves nothing');
  // The survivor is the live one, which is not a leak: it is what the user asked
  // for and the hook is holding it.
  assert.deepEqual(leaked, ['sess-003'], `abandoned sessions left open: ${leaked.join(', ')}`);
  assert.equal(h.result.status, 'ready');
  assert.equal(h.result.session.sessionId, 'sess-003');

  h.unmount();
  await settle(120);
  assert.deepEqual(stub.ledger().leaked, [], 'nothing survives the unmount');
  await stub.close();
});

test('NEGATIVE CONTROL: without the late-response close, rapid toggling leaks', async () => {
  // Removes only the one line that closes a session whose response arrived after
  // the user turned X-ray off. If the scenario above can pass with this line
  // gone, it is not testing the guard.
  const stub = await startStub({ uniqueSessions: true, delayMs: 90 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL, {
    patchHook: (src) => {
      const broken = src.replace(
        'if (session?.sessionId) deleteSession(session.sessionId);',
        '/* control: abandoned session left for the reaper */',
      );
      assert.notEqual(broken, src, 'the control patch matched nothing — fix the patch');
      return broken;
    },
  });
  const h = renderHook(useXraySession, { props: CAMERA });

  const inFlight = [];
  inFlight.push(h.result.start());
  h.result.stop();
  inFlight.push(h.result.start());
  h.result.stop();
  inFlight.push(h.result.start());
  await Promise.all(inFlight);
  await settle(200);

  const { leaked } = stub.ledger();
  assert.deepEqual(leaked.slice(0, 2), ['sess-001', 'sess-002'],
    'the harness did NOT detect two abandoned sessions');

  h.unmount();
  await settle(120);
  // Still leaked after unmount: nothing left holding those ids knows they exist.
  assert.deepEqual(stub.ledger().leaked, ['sess-001', 'sess-002']);
  await stub.close();
});

test('a prompt answered after the session was dropped does not resurrect it', async () => {
  const stub = await startStub({ uniqueSessions: true });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  await h.result.start();

  const pending = h.result.prompt({ xNorm: 0.4, yNorm: 0.6, seq: 12345, offset: 1.24 });
  h.result.stop();
  assert.equal(await pending, false, 'the prompt reported success into a dead session');
  await settle(120);

  assert.deepEqual(h.result.objects, [], 'an object was attached to no session');
  assert.deepEqual(stub.ledger().leaked, []);
  // The object itself is deleted too, not just forgotten locally.
  assert.ok(stub.calls.some((c) => c.method === 'DELETE' && c.path.includes('/objects/')));

  h.unmount();
  await settle();
  await stub.close();
});

// ───────────────────── scenario 5 — the network is gone ─────────────────────

test('scenario 5: a dead backend leaves no session and no false licence verdict', async () => {
  // Port 1 is privileged everywhere this runs, so nothing can be listening — a
  // guessed-free port would be a race, not a fixture.
  installWindow();
  const { useXraySession, wire } = await loadHook('http://127.0.0.1:1/api/v2');
  const h = renderHook(useXraySession, { props: CAMERA });

  await h.result.start();

  assert.equal(h.result.status, 'idle', 'a transport failure must not look like a live session');
  assert.equal(h.result.session, null);
  // A transport failure carries no body and therefore no §10 code. Reporting it
  // as `internal_error` keeps the UI inside the contract's vocabulary; inventing
  // a code would leave the copy table with nothing to say.
  assert.equal(h.result.lastError.code, 'internal_error');
  // And it must NOT latch `notLicensed`, which is permanent for the session —
  // one network blip would otherwise disable X-ray until the page reloads.
  assert.equal(h.result.notLicensed, false);

  h.unmount();
  assert.equal(wire.listenerCount(), 0);
});


// New selection must release the single GPU slot before reserving another.
const click = { xNorm: 0.4, yNorm: 0.6, seq: 12345, offset: 1.24 };
const sessionPosts = stub => stub.calls.filter(c => c.method === 'POST' && /sessions$/.test(c.path));

test('reset clears selection and confirms DELETE before starting a fresh session', async () => {
  const stub = await startStub({ uniqueSessions: true, deleteDelayMs: 80 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    await h.result.prompt(click);
    assert.equal(h.result.objects.length, 1);
    const pending = h.result.resetSelection();
    assert.equal(h.result.status, 'preparing');
    assert.equal(h.result.session, null);
    assert.deepEqual(h.result.objects, []);
    assert.equal(await h.result.prompt(click), false);
    await settle(30);
    assert.equal(sessionPosts(stub).length, 1, 'replacement started before close confirmation');
    assert.equal(await pending, true);
    const ack = stub.events.findIndex(c => c.method === 'ACK_DELETE');
    const replacement = stub.events.findLastIndex(c => c.method === 'POST' && /sessions$/.test(c.path));
    assert.ok(ack >= 0 && replacement > ack);
    assert.equal(h.result.session.sessionId, 'sess-002');
    assert.equal(await h.result.prompt(click), true);
    assert.equal(h.result.objects.length, 1);
    assert.deepEqual(stub.ledger().leaked, ['sess-002']);
  } finally { h.unmount(); await settle(120); await stub.close(); }
  assert.deepEqual(stub.ledger().leaked, []);
});

test('rapid reset clicks reserve exactly one replacement', async () => {
  const stub = await startStub({ uniqueSessions: true, deleteDelayMs: 60 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    const reset = h.result.resetSelection;
    assert.deepEqual(await Promise.all([reset(), reset(), reset()]), [true, false, false]);
    assert.equal(sessionPosts(stub).length, 2);
    assert.equal(stub.calls.filter(c => c.method === 'DELETE').length, 1);
  } finally { h.unmount(); await settle(100); await stub.close(); }
});

test('failed close shows an error and does not open a replacement', async () => {
  const stub = await startStub({ uniqueSessions: true, deleteFails: true });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    assert.equal(await h.result.resetSelection(), false);
    assert.equal(sessionPosts(stub).length, 1);
    assert.equal(h.result.status, 'idle');
    assert.equal(h.result.lastError.code, 'service_unavailable');
  } finally { h.unmount(); await settle(); await stub.close(); }
});

test('turning off while reset is closing prevents a replacement', async () => {
  const stub = await startStub({ uniqueSessions: true, deleteDelayMs: 80 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    const pending = h.result.resetSelection();
    h.result.stop();
    assert.equal(await pending, false);
    assert.equal(h.result.status, 'idle');
    assert.equal(sessionPosts(stub).length, 1);
    assert.deepEqual(stub.ledger().leaked, []);
  } finally { h.unmount(); await settle(100); await stub.close(); }
});

test('unmount during reset bootstrap closes the late replacement', async () => {
  const stub = await startStub({ uniqueSessions: true, delayMs: 90 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    const pending = h.result.resetSelection();
    await settle(35);
    assert.equal(sessionPosts(stub).length, 2, 'replacement request must really be in flight');
    h.unmount();
    assert.equal(await pending, false);
    await settle(100);
    assert.deepEqual(stub.ledger().leaked, []);
  } finally { h.unmount(); await settle(); await stub.close(); }
});

test('a late prompt from before reset cannot attach to the new session', async () => {
  const stub = await startStub({ uniqueSessions: true, promptDelayMs: 100 });
  installWindow();
  const { useXraySession } = await loadHook(stub.baseURL);
  const h = renderHook(useXraySession, { props: CAMERA });
  try {
    await h.result.start();
    const pending = h.result.prompt(click);
    assert.equal(await h.result.resetSelection(), true);
    assert.equal(await pending, false);
    await settle();
    assert.equal(h.result.session.sessionId, 'sess-002');
    assert.deepEqual(h.result.objects, []);
    assert.ok(stub.calls.some(c => c.method === 'DELETE' && c.path === '/api/v2/xray/sessions/sess-001/objects/obj-a1b2c3d4'));
  } finally { h.unmount(); await settle(); await stub.close(); }
});
