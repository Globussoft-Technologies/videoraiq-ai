import { createServer } from 'node:http';

/**
 * A minimal Node-shaped X-ray backend: contract §5's six routes, §10's error
 * body, flat JSON (no envelope), `x-access-token` required.
 *
 * Why this exists: the real Node session's handlers are still deliberate
 * `501 not_implemented`, and session S's fake backend speaks the *service* API
 * (§6 — snake_case, `X-API-Key`), which sits behind Node and cannot serve the
 * browser. Testing the frontend's client against the frozen contract is the
 * whole point of the contract, so this stub plays Node's part over real HTTP:
 * real axios, real headers, real status codes, real error bodies.
 *
 * It is a test fixture, not a second implementation — it has no session logic
 * beyond what a request/response assertion needs.
 */

const SESSION = Object.freeze({
  sessionId: '7f3ac091',
  width: 1920,
  height: 1080,
  frameRate: 5.0,
  lostAfterFrames: 25,
  maxObjects: 1,
});

const err = (code, message, retryable) => ({ error: code, message, retryable });

/** Contract §10's codes with the status each is served as. */
export const FAILURES = Object.freeze({
  stream_not_ready: [503, 'Camera is not streaming yet', true],
  max_sessions_reached: [503, 'All X-ray slots are in use', true],
  not_licensed: [403, 'X-ray is not allocated to this admin', false],
  frame_not_buffered: [409, 'That frame is no longer buffered', false],
  mask_too_small: [422, 'The mask was too small to track', false],
  max_objects_reached: [409, 'This session already tracks its maximum', false],
  session_not_found: [404, 'No such session', false],
  // 404, not 403: the Node session answers this for a camera outside the
  // caller's tenant, matching every other v2 endpoint so a 403 cannot be used
  // to confirm an id exists.
  camera_not_found: [404, 'No such camera for this account', false],
});

/**
 * @param {object} [opts]
 * @param {string|null} [opts.failWith] a key of FAILURES — every route fails with it
 * @param {number} [opts.delayMs] how long POST /sessions takes (contract §4: slow by design)
 * @param {boolean} [opts.uniqueSessions] issue a distinct `sessionId` per POST
 *   /sessions. Off by default so the fixed `SESSION` id stays assertable; on for
 *   the leak audit, where the question is whether *every* session that was
 *   created was also deleted. With one shared id, two creates and one delete
 *   look identical to one create and one delete — the leak is unobservable.
 */
export async function startStub({ failWith = null, delayMs = 0, uniqueSessions = false } = {}) {
  const calls = [];
  let issued = 0;

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      let parsed = null;
      try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }

      calls.push({
        method: req.method,
        path,
        token: req.headers['x-access-token'] ?? null,
        body: parsed,
      });

      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      // Mirrors the real mount: every X-ray route sits behind verifyToken.
      if (!req.headers['x-access-token']) {
        return send(401, err('unauthorized', 'Missing token', false));
      }

      if (failWith) {
        const [status, message, retryable] = FAILURES[failWith];
        return send(status, err(failWith, message, retryable));
      }

      const m = /^\/api\/v2\/xray\/sessions(?:\/([^/]+))?(?:\/(prompt|heartbeat|objects))?(?:\/([^/]+))?\/?$/
        .exec(path);
      if (!m) return send(404, err('not_found', 'No such route', false));
      const [, sessionId, sub, objId] = m;

      if (req.method === 'POST' && !sessionId) {
        // The id is allocated BEFORE the delay, as a real server would: the GPU
        // slot is taken while the client is still waiting. Allocating after
        // would make a session abandoned mid-bootstrap invisible to this fixture
        // — the exact case `startToken` exists to handle.
        issued += 1;
        const payload = uniqueSessions
          ? { ...SESSION, sessionId: `sess-${String(issued).padStart(3, '0')}` }
          : SESSION;
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        return send(200, payload);
      }
      if (req.method === 'POST' && sub === 'prompt') {
        return send(200, { objId: 'obj-a1b2c3d4', resolvedSeq: parsed?.seq ?? 0, resolvedOffset: 1.19 });
      }
      if (req.method === 'POST' && sub === 'heartbeat') {
        return send(200, { isSuccess: true });
      }
      // Both DELETEs are idempotent 200 per contract §5 — never 404 for
      // "already gone".
      if (req.method === 'DELETE' && sub === 'objects' && objId) {
        return send(200, { isSuccess: true });
      }
      if (req.method === 'DELETE' && sessionId) {
        return send(200, { isSuccess: true });
      }
      if (req.method === 'GET' && sessionId) {
        return send(200, {
          sessionId, state: 'ready', objects: [], framesBehindLive: 142,
        });
      }
      return send(405, err('method_not_allowed', 'Wrong method', false));
    });
  });

  // Port 0 + read it back, rather than picking a port and hoping. Avoids the
  // TOCTOU race that a "find a free port" helper always has.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  /**
   * Which sessions the server handed out, and which were closed again. The leak
   * audit's whole assertion is `created minus deleted === empty`.
   */
  const ledger = () => {
    const created = calls
      .filter((c) => c.method === 'POST' && /\/xray\/sessions\/?$/.test(c.path))
      .map((_, i) => `sess-${String(i + 1).padStart(3, '0')}`);
    const deleted = calls
      .filter((c) => c.method === 'DELETE')
      .map((c) => /\/xray\/sessions\/([^/]+)$/.exec(c.path)?.[1])
      .filter(Boolean);
    return {
      created,
      deleted,
      leaked: created.filter((id) => !deleted.includes(id)),
    };
  };

  return {
    baseURL: `http://127.0.0.1:${port}/api/v2`,
    calls,
    ledger,
    session: SESSION,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
