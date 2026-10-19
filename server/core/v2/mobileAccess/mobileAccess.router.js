import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import Response from '../../../utils/response.js';

export const digest = value => createHash('sha256').update(String(value)).digest('hex');
export const consumeCodeScript = "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]); end; return v";

// No customer data or auth implementation in this factory; production supplies
// the same token, licence and role services used by the rest of the application.
export function createMobileAccessRouter({ redis, authenticate, resolveAccess, sign, frontendUrl, checkSession, now = Date.now }) {
  const router = Router();
  const fail = (res, status, message) => res.status(status).json({ statusCode: status, body: { status: 'failed', message } });
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.post('/exchange', async (req, res, next) => {
    try {
      const code = req.body?.code;
      if (typeof code !== 'string' || !/^[\w-]{43}$/.test(code)) return fail(res, 400, 'Invalid launch code');
      const raw = await redis.eval(consumeCodeScript, 1, `mobile:sso:code:${digest(code)}`);
      if (!raw) return fail(res, 401, 'Launch code expired or already used');
      const grant = JSON.parse(raw);
      if (grant.claims.exp * 1000 <= now() || await redis.get(`mobile:sso:revoked:${grant.parentHash}`)) return fail(res, 401, 'Mobile login expired or logged out');
      if (!await checkSession(req, grant)) return fail(res, 401, 'Parent session is unavailable');
      const snapshot = await resolveAccess(grant.claims, { includeDetectionDetails: false });
      const screen = snapshot.screens.find(screen => screen.id === grant.screenId);
      if (!screen) return fail(res, 403, 'Page access revoked');
      const ttl = Math.min(600, grant.claims.exp - Math.floor(now() / 1000));
      if (ttl < 1) return fail(res, 401, 'Mobile login expired');
      const embedId = randomBytes(24).toString('hex');
      await redis.set(`mobile:sso:session:${embedId}`, JSON.stringify(grant), 'EX', ttl);
      const { exp, iat, nbf, ...claims } = grant.claims;
      const token = sign({ ...claims, tokenType: 'mobile-embed', mobileEmbedId: embedId }, ttl);
      res.json(Response.userSuccessResp('Embedded session established', { token, expiresIn: ttl, screen, sessionId: grant.parentSessionId }));
    } catch (error) { next(error); }
  });
  router.use(authenticate);
  router.use((req, res, next) => {
    const claims = req.verified?.userData;
    if (!claims?.adminId || claims.system || claims.registrationLinkId ||
        (claims.tokenType && claims.tokenType !== 'mobile-embed')) return fail(res, 403, 'A user login is required');
    next();
  });
  router.get('/', async (req, res, next) => {
    try { res.json(Response.userSuccessResp('Mobile access fetched', await resolveAccess(req.verified.userData))); }
    catch (error) { next(error); }
  });
  router.post('/launch', async (req, res, next) => {
    try {
      const claims = req.verified?.userData;
      if (!claims?.adminId || claims.tokenType || !Number.isInteger(claims.exp) || !req.get('x-access-token')) return fail(res, 400, 'A user access token is required');
      const snapshot = await resolveAccess(claims, { includeDetectionDetails: false });
      const screen = snapshot.screens.find(screen => screen.id === req.body?.screenId);
      if (!screen) return fail(res, 404, 'Screen unavailable');
      const bucket = `mobile:sso:rate:${claims.adminId}:${claims.memberId || 'admin'}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.expire(bucket, 60);
      if (count > 20) return fail(res, 429, 'Too many page launches; retry shortly');
      const parentHash = digest(req.get('x-access-token'));
      if (await redis.get(`mobile:sso:revoked:${parentHash}`)) return fail(res, 401, 'Mobile web access logged out');
      const code = randomBytes(32).toString('base64url');
      await redis.set(`mobile:sso:code:${digest(code)}`, JSON.stringify({ claims, parentHash,
        parentSessionId: req.get('x-session-id') || claims.sessionId || null, parentDeviceId: req.get('x-device-id') || '', screenId: screen.id }), 'EX', 30);
      const url = new URL('/mobile-sso', frontendUrl());
      url.hash = 'code=' + code;
      res.json(Response.userSuccessResp('Page launch created', { launchUrl: url.toString(), expiresIn: 30 }));
    } catch (error) { next(error); }
  });
  router.get('/session', async (req, res, next) => {
    try {
      if (!req.verified?.userData?.mobileEmbedId) return fail(res, 403, 'Embedded session required');
      const grant = JSON.parse(await redis.get(`mobile:sso:session:${req.verified.userData.mobileEmbedId}`) || 'null');
      if (!grant) return fail(res, 401, 'Embedded session expired');
      const screen = req.mobileEmbeddedScreen || (await resolveAccess(req.verified.userData)).screens.find(screen => screen.id === grant.screenId);
      if (!screen) return fail(res, 403, 'Page access revoked');
      res.json(Response.userSuccessResp('Embedded session verified', { user: req.verified.userData, screen }));
    } catch (error) { next(error); }
  });
  router.post('/logout', async (req, res, next) => {
    try {
      const claims = req.verified.userData;
      if (claims.mobileEmbedId) await redis.del(`mobile:sso:session:${claims.mobileEmbedId}`);
      else await redis.set(`mobile:sso:revoked:${digest(req.get('x-access-token'))}`, '1', 'EX', Math.max(1, claims.exp - Math.floor(now() / 1000)));
      res.json(Response.userSuccessResp('Mobile web sessions revoked', { loggedOut: true }));
    } catch (error) { next(error); }
  });
  return router;
}
