import { beforeEach, afterEach, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ token: null, sessionId: null }));
vi.mock('../../../../client_v2/src/utils/getAccessToken', () => ({ default: () => state.token }));
vi.mock('../../../../client_v2/src/utils/sessionIdentity', () => ({
  sessionHeaders: async () => ({ 'x-device-id': 'device-test' }),
  setSessionId: value => { state.sessionId = value; },
}));
vi.mock('../../../../client_v2/src/utils/mobileEmbed', () => ({ isMobileEmbedded: () => false }));
vi.mock('../../../../client_v2/node_modules/js-cookie/dist/js.cookie.mjs', () => ({
  default: { set: (name, value) => { state.token = value; } },
}));

const token = seconds => `header.${Buffer.from(JSON.stringify({ tokenType: 'browser-access', exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')}.signature`;
let auth, network;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'https://api.test/api/v2');
  state.token = token(-5);
  state.sessionId = null;
  network = vi.fn();
  const windowMock = { location: { origin: 'https://ui.test', protocol: 'https:' }, dispatchEvent: vi.fn(), fetch: network };
  vi.stubGlobal('window', windowMock);
  vi.stubGlobal('location', windowMock.location);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', network);
  auth = await import('../../../../client_v2/src/utils/refreshAuth.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('shares one refresh across concurrent requests and persists the returned session', async () => {
  const fresh = token(900);
  network.mockResolvedValue(new Response(JSON.stringify({ token: fresh, sessionId: 'renewed' }), { status: 200 }));
  const results = await Promise.all([auth.ensureAccessToken(), auth.ensureAccessToken(), auth.ensureAccessToken()]);
  expect(network).toHaveBeenCalledTimes(1);
  expect(results).toEqual([fresh, fresh, fresh]);
  expect(state.token).toBe(fresh);
  expect(state.sessionId).toBe('renewed');
  expect(network.mock.calls[0][1].credentials).toBe('include');
});

it('restores access when the JavaScript cookie is missing', async () => {
  state.token = null;
  const fresh = token(900);
  network.mockResolvedValue(new Response(JSON.stringify({ token: fresh, sessionId: 'restored' })));
  expect(await auth.ensureAccessToken()).toBe(fresh);
});

it('keeps credentials after a transient refresh failure and allows retry', async () => {
  const old = state.token;
  network.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'REFRESH_UNAVAILABLE' }), { status: 503 }));
  await expect(auth.ensureAccessToken()).rejects.toMatchObject({ status: 503 });
  expect(state.token).toBe(old);
  network.mockResolvedValueOnce(new Response(JSON.stringify({ token: token(900), sessionId: 'retry' })));
  await expect(auth.ensureAccessToken()).resolves.toBeTruthy();
});

it('never renews a legacy or impersonation JWT automatically', async () => {
  state.token = `header.${Buffer.from(JSON.stringify({ exp: 1, impersonatedByAdminId: 'operator' })).toString('base64url')}.sig`;
  expect(await auth.ensureAccessToken()).toBe(state.token);
  expect(network).not.toHaveBeenCalled();
});

it('does not persist an in-flight refresh after logout starts', async () => {
  let complete;
  const old = state.token;
  network.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const renewal = auth.refreshAccessToken().catch(error => error);
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  network.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
  const logout = auth.endRefreshSession();
  complete(new Response(JSON.stringify({ token: token(900), sessionId: 'late' })));
  await Promise.all([renewal, logout]);
  expect(state.token).toBe(old);
  expect(network.mock.calls[1][0]).toBe('https://api.test/api/v2/auth/logout');
});

it('limits backend interception to the exact origin and API path', () => {
  expect(auth.isBackendRequest('https://api.test/api/v2/channels')).toBe(true);
  expect(auth.isBackendRequest('https://api.test/api/v20/channels')).toBe(false);
  expect(auth.isBackendRequest('https://attacker.test/api/v2/channels')).toBe(false);
});

it('updates stale native fetch headers and leaves unrelated service calls untouched', async () => {
  const fresh = token(900);
  state.token = fresh;
  network.mockResolvedValue(new Response('{}'));
  auth.installAuthenticatedFetch();
  await window.fetch('https://api.test/api/v2/channels', { headers: { 'x-access-token': 'stale' } });
  expect(network.mock.calls[0][1].headers.get('x-access-token')).toBe(fresh);
  await window.fetch('https://stream.test/status', { headers: { 'x-access-token': 'service-token' } });
  expect(network.mock.calls[1][1].headers['x-access-token']).toBe('service-token');
});
