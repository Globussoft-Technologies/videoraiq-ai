import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import axios from 'axios';
import { FAILURES, startStub } from './helpers/xrayStubServer.js';

const source = await readFile(new URL('../src/xray/api.js', import.meta.url), 'utf8');

/**
 * An address that always refuses a connection.
 *
 * Port 1 is privileged on every platform this runs on, so no test fixture can
 * ever be listening there. The earlier version of these tests took a live stub's
 * port and added one, assuming the neighbour was free — which collides as soon
 * as two test files run at once, and then the request SUCCEEDS and the test
 * fails claiming the transport works. A guessed-free port is a race, not a
 * fixture.
 */
const REFUSED = 'http://127.0.0.1:1/api/v2';

/**
 * Load src/xray/api.js with the app's shared axios instance swapped for one
 * pointed at the stub — the same link-a-SyntheticModule approach
 * tests/streamUrl.test.js uses. Real axios, real HTTP, real headers; only the
 * base URL and the token source are substituted.
 */
async function loadApi(baseURL, { token = 'test-token' } = {}) {
  const client = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });
  if (token) client.interceptors.request.use((config) => {
    config.headers['x-access-token'] = token;
    return config;
  });

  const module = new SourceTextModule(source, {
    initializeImportMeta(meta) { meta.env = { VITE_BACKEND: baseURL }; },
  });
  await module.link((specifier) => {
    if (specifier.includes('helpers/client')) {
      return new SyntheticModule(['default', 'api'], function () {
        this.setExport('default', client);
        this.setExport('api', client);
      });
    }
    throw new Error(`unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}

test('createSession posts camelCase ids and returns the flat body', async () => {
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL);
    const session = await api.createSession({ cameraId: 'cam-1', nvrId: 'nvr-1' });

    // Contract §5: flat JSON, not the app's { statusCode, body: { data } }
    // envelope. Asserted field-by-field because every one of these is something
    // Phases 4-6 depend on.
    assert.deepEqual(session, stub.session);
    assert.equal(session.frameRate, 5.0);
    assert.equal(session.maxObjects, 1);

    const call = stub.calls.at(-1);
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/api/v2/xray/sessions');
    assert.deepEqual(call.body, { cameraId: 'cam-1', nvrId: 'nvr-1' });
    assert.equal(call.token, 'test-token', 'auth must come from the shared client');
  } finally {
    await stub.close();
  }
});

test('the path is relative to VITE_BACKEND, not re-prefixed with /api/v2', async () => {
  // The trap this guards: VITE_BACKEND already ends in /api/v2, so writing
  // '/api/v2/xray/sessions' here would request /api/v2/api/v2/xray/sessions.
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL);
    await api.createSession({ cameraId: 'c', nvrId: 'n' });
    assert.equal(stub.calls.at(-1).path, '/api/v2/xray/sessions');
    assert.doesNotMatch(stub.calls.at(-1).path, /api\/v2.*api\/v2/);
  } finally {
    await stub.close();
  }
});

test('a slow start is awaited, not timed out — it is slow by design', async () => {
  // Contract §4: POST /sessions does not return until frames are decoding.
  const stub = await startStub({ delayMs: 400 });
  try {
    const api = await loadApi(stub.baseURL);
    assert.ok(api.REQUEST_TIMEOUT_MS >= 20000, 'contract §10 gives the frontend 20 s');
    const t0 = Date.now();
    const session = await api.createSession({ cameraId: 'c', nvrId: 'n' });
    assert.ok(Date.now() - t0 >= 380, 'the wait must not be short-circuited');
    assert.equal(session.sessionId, stub.session.sessionId);
  } finally {
    await stub.close();
  }
});

test('every contract §10 code survives the round trip with its human message', async () => {
  for (const [code, [status, message, retryable]] of Object.entries(FAILURES)) {
    const stub = await startStub({ failWith: code });
    try {
      const api = await loadApi(stub.baseURL);
      await assert.rejects(() => api.createSession({ cameraId: 'c', nvrId: 'n' }));
      try {
        await api.createSession({ cameraId: 'c', nvrId: 'n' });
      } catch (e) {
        const x = api.xrayErrorOf(e);
        assert.equal(x.code, code);
        assert.equal(x.status, status);
        assert.equal(x.retryable, retryable, `retryable must come from the body for ${code}`);
        // The whole reason X-ray does not use getApiErrorMessage(): that helper
        // prefers body.error on a 422, which would show the user the string
        // "mask_too_small" instead of a sentence.
        assert.equal(x.message, message);
        assert.notEqual(x.message, code, `${code}: the machine code must not reach the user`);
      }
    } finally {
      await stub.close();
    }
  }
});

test('a transport failure is reported as internal_error, not a made-up code', async () => {
  const api = await loadApi(REFUSED);
  try {
    await api.createSession({ cameraId: 'c', nvrId: 'n' });
    assert.fail('expected a connection failure');
  } catch (e) {
    const x = api.xrayErrorOf(e);
    // internal_error is the one code §7 already has copy for. Inventing
    // 'network_error' would reach a copy table with no entry for it.
    assert.equal(x.code, 'internal_error');
    assert.equal(x.status, null);
    assert.equal(x.retryable, true, 'a transport blip is worth another press');
    assert.ok(x.message, 'the axios message is better than nothing for logs');
  }
});

test('session_not_found is recognised however it arrives', async () => {
  const stub = await startStub({ failWith: 'session_not_found' });
  try {
    const api = await loadApi(stub.baseURL);
    try {
      await api.getSession('gone');
      assert.fail('expected 404');
    } catch (e) {
      assert.equal(api.isGone(e), true);
    }
  } finally {
    await stub.close();
  }
});

test('deleteSession is idempotent and never throws on a teardown path', async () => {
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL);
    assert.equal(await api.deleteSession('7f3ac091'), true);
    assert.equal(await api.deleteSession('7f3ac091'), true, 'contract §5: deleting twice is 200');
    assert.equal(stub.calls.filter((c) => c.method === 'DELETE').length, 2);
  } finally {
    await stub.close();
  }
});

test('a DELETE against a dead server resolves false instead of rejecting', async () => {
  // Teardown runs on unmount and route change, where there is no UI left to
  // show an error in — a rejection would only become an unhandled rejection.
  const api = await loadApi(REFUSED);
  assert.equal(await api.deleteSession('x'), false);
  assert.equal(await api.deleteObject('x', 'obj-1'), false);
});

test('heartbeat answers ok / gone / error rather than throwing', async () => {
  const ok = await startStub();
  try {
    assert.equal(await (await loadApi(ok.baseURL)).heartbeat('s1'), 'ok');
    assert.equal(ok.calls.at(-1).path, '/api/v2/xray/sessions/s1/heartbeat');
  } finally {
    await ok.close();
  }

  const gone = await startStub({ failWith: 'session_not_found' });
  try {
    assert.equal(await (await loadApi(gone.baseURL)).heartbeat('s1'), 'gone');
  } finally {
    await gone.close();
  }

  // A 503 is a blip, not a dead session: the caller must not end the track.
  const blip = await startStub({ failWith: 'stream_not_ready' });
  try {
    assert.equal(await (await loadApi(blip.baseURL)).heartbeat('s1'), 'error');
  } finally {
    await blip.close();
  }
});

test('prompt sends the click in the contract §5 shape', async () => {
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL);
    const out = await api.sendPrompt('s1', { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 });
    assert.deepEqual(stub.calls.at(-1).body,
      { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 });
    assert.equal(stub.calls.at(-1).path, '/api/v2/xray/sessions/s1/prompt');
    assert.equal(out.objId, 'obj-a1b2c3d4');
    assert.equal(out.resolvedSeq, 12345);
  } finally {
    await stub.close();
  }
});

test('session ids are escaped into the URL', async () => {
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL);
    await api.deleteSession('a/b');
    assert.equal(stub.calls.at(-1).path, '/api/v2/xray/sessions/a%2Fb',
      'an unescaped id would address a different route');
  } finally {
    await stub.close();
  }
});

test('no request goes out unauthenticated', async () => {
  const stub = await startStub();
  try {
    const api = await loadApi(stub.baseURL, { token: null });
    await assert.rejects(() => api.createSession({ cameraId: 'c', nvrId: 'n' }));
    assert.equal(stub.calls.at(-1).token, null);
    // The stub mirrors the real mount: every X-ray route sits behind
    // verifyToken, so a missing token is a 401 before any logic runs.
  } finally {
    await stub.close();
  }
});

test('a 404 camera_not_found is NOT mistaken for a dead session', () => {
  // The trap, reported by the Node session: `POST /sessions` answers 404 — not
  // 403 — for a camera outside the caller's tenant or a sub-user's allow-list,
  // deliberately matching every other v2 endpoint so a 403 cannot be used to
  // confirm that an id exists. A status-driven `isGone` would read that as "the
  // session is gone" and report an expiry for a session that was never created.
  const err = {
    response: { status: 404, data: { error: 'camera_not_found', message: 'No such camera', retryable: false } },
  };
  return startStub().then(async (stub) => {
    try {
      const api = await loadApi(stub.baseURL);
      assert.equal(api.isGone(err), false, 'a coded 404 must be judged on its code');
      assert.equal(api.xrayErrorOf(err).code, 'camera_not_found');

      // A session 404 still reads as gone.
      assert.equal(api.isGone({
        response: { status: 404, data: { error: 'session_not_found', message: 'x' } },
      }), true);

      // And an uncoded 404 — a proxy or gateway page — still falls back, because
      // there is nothing better to go on.
      assert.equal(api.isGone({ response: { status: 404, data: '<html>Not Found</html>' } }), true);
      assert.equal(api.isGone({ response: { status: 404, data: {} } }), true);
    } finally {
      await stub.close();
    }
  });
});

test('camera_not_found round-trips and has its own message', async () => {
  const stub = await startStub({ failWith: 'camera_not_found' });
  try {
    const api = await loadApi(stub.baseURL);
    await assert.rejects(() => api.createSession({ cameraId: 'someone-elses', nvrId: 'n' }));
    try {
      await api.createSession({ cameraId: 'someone-elses', nvrId: 'n' });
    } catch (e) {
      const x = api.xrayErrorOf(e);
      assert.equal(x.code, 'camera_not_found');
      assert.equal(x.status, 404);
      assert.equal(api.isGone(e), false);
    }
  } finally {
    await stub.close();
  }
});
