import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createMobileAccessRouter, digest } from '../../core/v2/mobileAccess/mobileAccess.router.js';
import { permittedWebScreens } from '../../constants/mobileWebScreens.js';

function setup() {
  const data = new Map();
  let clock = 1000000;
  const redis = {
    get: vi.fn(async key => data.get(key)?.value ?? null),
    set: vi.fn(async (key, value, mode, ttl) => { data.set(key, { value, ttl }); return 'OK'; }),
    del: vi.fn(async key => data.delete(key)),
    incr: vi.fn(async key => { const n = Number(data.get(key)?.value || 0) + 1; data.set(key, { value: String(n) }); return n; }),
    expire: vi.fn(async () => 1),
    eval: vi.fn(async (script, count, key) => { const value = data.get(key)?.value ?? null; data.delete(key); return value; }),
  };
  const claims = { adminId: 'tenant-a', user_id: '13', memberId: 'member-a', exp: 5000 };
  const screen = { id: 'stockCountingAnalytics', title: 'Stock Analytics', webPath: '/logs/stock-counting/analytics' };
  const resolveAccess = vi.fn(async () => ({ screens: [screen] }));
  const checkSession = vi.fn(async () => true);
  const sign = vi.fn(() => 'derived-web-token');
  const app = express();
  app.use(express.json());
  const authenticate = (req, res, next) => {
    if (!req.get('x-access-token')) return res.sendStatus(401);
    req.verified = { userData: claims }; next();
  };
  app.use('/mobile-access', createMobileAccessRouter({ redis, authenticate, resolveAccess, checkSession, sign,
    frontendUrl: () => 'https://dev.example.com', now: () => clock }));
  app.use((err, req, res, next) => res.status(503).json({ message: 'Access service unavailable' }));
  const launch = (screenId = screen.id, sessionId = 'parent-session') => {
    let req = request(app).post('/mobile-access/launch').set('x-access-token', 'native-token');
    if (sessionId) req = req.set('x-session-id', sessionId);
    return req.send({ screenId });
  };
  const exchange = code => request(app).post('/mobile-access/exchange').send({ code });
  const codeFrom = response => new URLSearchParams(new URL(response.body.body.data.launchUrl).hash.slice(1)).get('code');
  return { app, redis, claims, resolveAccess, checkSession, sign, launch, exchange, codeFrom, data, setClock: value => { clock = value; } };
}

describe('production mobile SSO routes', () => {
  it('requires mobile auth, supports token-only clients and rejects embedded launches', async () => {
    const s = setup();
    expect((await request(s.app).get('/mobile-access')).status).toBe(401);
    expect((await s.launch(undefined, '')).status).toBe(200);
    s.claims.tokenType = 'mobile-embed';
    expect((await s.launch()).status).toBe(400);
  });
  it('creates an HTTPS frontend link without the parent token and stores only its hash', async () => {
    const s = setup();
    const result = await s.launch();
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.body.body.data.launchUrl).toMatch(/^https:\/\/dev.example.com\/mobile-sso#code=/);
    expect(JSON.stringify(result.body)).not.toContain('native-token');
    const code = s.codeFrom(result);
    const grant = s.data.get('mobile:sso:code:' + digest(code));
    expect(grant.ttl).toBe(30);
    expect(grant.value).not.toContain('native-token');
    expect(JSON.parse(grant.value).parentSessionId).toBe('parent-session');
  });
  it('atomically consumes a launch once and derives a bounded web token', async () => {
    const s = setup();
    const code = s.codeFrom(await s.launch());
    const results = await Promise.all([s.exchange(code), s.exchange(code)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(s.sign).toHaveBeenCalledWith(expect.objectContaining({ tokenType: 'mobile-embed', adminId: 'tenant-a' }), 600);
    expect(s.sign.mock.calls[0][0]).not.toHaveProperty('exp');
    expect(results.find(r => r.status === 200).body.body.data.token).toBe('derived-web-token');
  });
  it('rejects missing, malformed and expired/replayed codes', async () => {
    const s = setup();
    expect((await s.exchange('bad')).status).toBe(400);
    expect((await s.exchange('a'.repeat(43))).status).toBe(401);
    const code = s.codeFrom(await s.launch());
    s.setClock(5000001);
    expect((await s.exchange(code)).status).toBe(401);
  });
  it('rechecks current page permissions and parent session on exchange', async () => {
    const s = setup();
    const code = s.codeFrom(await s.launch());
    s.resolveAccess.mockResolvedValue({ screens: [] });
    expect((await s.exchange(code)).status).toBe(403);
    expect((await s.launch()).status).toBe(404);
    const other = setup();
    const nextCode = other.codeFrom(await other.launch());
    other.checkSession.mockResolvedValue(false);
    expect((await other.exchange(nextCode)).status).toBe(401);
  });
  it('does not accept arbitrary destinations', async () => {
    const s = setup();
    expect((await s.launch('https://attacker.example')).status).toBe(404);
  });
  it('invalidates pending launches on mobile logout', async () => {
    const s = setup();
    const code = s.codeFrom(await s.launch());
    expect((await request(s.app).post('/mobile-access/logout').set('x-access-token', 'native-token')).status).toBe(200);
    expect((await s.exchange(code)).status).toBe(401);
    expect((await s.launch()).status).toBe(401);
  });
  it('rate limits launches and fails closed when Redis is unavailable', async () => {
    const s = setup();
    s.redis.incr.mockResolvedValue(21);
    expect((await s.launch()).status).toBe(429);
    s.redis.incr.mockRejectedValue(new Error('offline'));
    expect((await s.launch()).status).toBe(503);
  });
  it('caps the derived session at the parent token expiry', async () => {
    const s = setup();
    s.claims.exp = 1020;
    const code = s.codeFrom(await s.launch());
    const result = await s.exchange(code);
    expect(result.body.body.data.expiresIn).toBe(20);
  });
});

it('filters denied pages and returns distinct stock logs/analytics paths', () => {
  const context = { permissions: { logs: { stockCountingLogs: { view: true } } }, logs: { stockCountingLogs: true }, modules: {} };
  const screens = permittedWebScreens(context);
  expect(screens.map(s => s.webPath)).toEqual(['/logs/stock-counting', '/logs/stock-counting/analytics']);
  expect(screens.every(s => !('allowed' in s))).toBe(true);
  expect(permittedWebScreens({ ...context, logs: { stockCountingLogs: false } })).toEqual([]);
});
