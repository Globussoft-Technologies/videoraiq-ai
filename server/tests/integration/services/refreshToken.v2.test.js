import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from 'config';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';

vi.mock('../../../socket.js', () => ({ sendSessionRevoked: vi.fn() }));
vi.mock('../../../core/v2/sessions/sessionPresence.js', () => ({ getOnlineSessionIds: vi.fn(async () => new Set()) }));

const { issueBrowserTokens, refreshBrowserTokens, logoutBrowserSession } = await import('../../../core/v2/Auth/refreshToken.service.js');
const { default: Admin } = await import('../../../core/v1/admin/admin.model.js');
const { default: User } = await import('../../../core/v1/users/users.model.js');
const { default: Session } = await import('../../../core/v2/sessions/sessions.model.js');
const { default: Token } = await import('../../../core/v2/Auth/refreshToken.model.js');
const { default: BlockedDevice } = await import('../../../core/v2/sessions/blockedDevice.model.js');
const { default: sessionsService } = await import('../../../core/v2/sessions/sessions.service.js');

let app, admin, user, claims, session;
const resolveClaims = vi.fn(async claims => claims);
const origin = 'http://frontend.test';
const cookie = response => response.headers['set-cookie'][0].split(';')[0];
const refresh = raw => request(app).post('/refresh').set('Origin', origin).set('Cookie', raw).set('x-device-id', 'device-1');

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  resolveClaims.mockReset().mockImplementation(async claims => claims);
  admin = await Admin.create({ user_id: '101', login: 'refresh-test', email: 'refresh@test.com' });
  claims = { adminId: String(admin._id), login: admin.login, userSubscriptionType: { trial: '2099-01-01' } };
  session = await Session.create({ sessionId: 'session-1', adminId: admin._id, deviceId: 'device-1', userType: 'admin' });
  app = express();
  app.use(express.json(), cookieParser());
  app.post('/login', async (req, res, next) => {
    try { res.json({ token: await issueBrowserTokens(req, res, claims, session, 'legacy-token') }); }
    catch (error) { next(error); }
  });
  app.post('/refresh', (req, res, next) => refreshBrowserTokens(req, res, resolveClaims).catch(next));
  app.post('/logout', (req, res, next) => logoutBrowserSession(req, res).catch(next));
  app.use((error, req, res, next) => res.status(503).json({ code: 'REFRESH_UNAVAILABLE' }));
});

const login = body => request(app).post('/login').set('Origin', origin).set('x-auth-refresh', '1').send(body || {});

describe('V2 refresh lifecycle', () => {
  it('stores only a hash, uses HttpOnly cookies and issues short session-bound JWTs', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const decoded = jwt.verify(response.body.token, config.get('jwt.secretKey'));
    expect(decoded.tokenType).toBe('browser-access');
    expect(decoded.sessionId).toBe(session.sessionId);
    expect(decoded.exp - decoded.iat).toBe(900);
    const record = await Token.findOne().lean();
    expect(record.tokenHash).not.toBe(cookie(response).split('=')[1]);
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 86400000);
  });

  it('preserves legacy consumers without the client_v2 opt-in', async () => {
    const response = await request(app).post('/login');
    expect(response.body.token).toBe('legacy-token');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await Token.countDocuments()).toBe(0);
  });

  it('sets Secure cookies behind a trusted HTTPS proxy', async () => {
    app.set('trust proxy', 1);
    const response = await request(app).post('/login').set('Origin', origin).set('x-auth-refresh', '1').set('X-Forwarded-Proto', 'https');
    expect(response.headers['set-cookie'][0]).toContain('Secure');
  });

  it('does not grant refresh credentials to impersonation sessions', async () => {
    claims.impersonatedByAdminId = 'operator';
    const response = await login();
    expect(response.body.token).toBe('legacy-token');
    expect(await Token.countDocuments()).toBe(0);
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('uses a 30-day absolute expiry for Remember me and rotates without extending it', async () => {
    const first = await login({ rememberMe: true });
    const original = await Token.findOne().lean();
    expect(original.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86400000);
    const renewed = await refresh(cookie(first));
    expect(renewed.status).toBe(200);
    expect(cookie(renewed)).not.toBe(cookie(first));
    const next = await Token.findOne({ consumedAt: null }).lean();
    expect(next.expiresAt).toEqual(original.expiresAt);
    expect(await Session.countDocuments()).toBe(1);
  });

  it('handles simultaneous refreshes with one winner and a retryable collision', async () => {
    const first = await login();
    const results = await Promise.all([refresh(cookie(first)), refresh(cookie(first))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 409).body.code).toBe('REFRESH_RETRY');
    expect(await Token.countDocuments({ consumedAt: null })).toBe(1);
  });

  it('revokes the session when a consumed refresh token is reused outside the collision window', async () => {
    const first = await login();
    const renewed = await refresh(cookie(first));
    await Token.updateOne({ consumedAt: { $ne: null } }, { $set: { consumedAt: new Date(Date.now() - 11000) } });
    expect((await refresh(cookie(first))).body.code).toBe('REFRESH_REUSED');
    expect((await Session.findOne()).status).toBe('logged_out');
    expect((await refresh(cookie(renewed))).status).toBe(401);
  });

  it.each(['blocked', 'logged_out', 'expired'])('rejects %s sessions without issuing new credentials', async status => {
    const first = await login();
    await Session.updateOne({}, { $set: { status } });
    expect((await refresh(cookie(first))).status).toBe(401);
    expect(await Token.countDocuments()).toBe(1);
  });

  it('logs out using only the refresh cookie after the access JWT expires', async () => {
    const first = await login();
    const response = await request(app).post('/logout').set('Origin', origin).set('Cookie', cookie(first));
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect((await refresh(cookie(first))).status).toBe(401);
    expect((await Session.findOne()).status).toBe('logged_out');
  });

  it('rejects blocked devices even when the session row was active', async () => {
    const first = await login();
    await BlockedDevice.create({ deviceId: 'device-1', adminId: admin._id });
    const response = await refresh(cookie(first));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('DEVICE_BLOCKED');
  });

  it('does not restore a session revoked while subscription lookup was in flight', async () => {
    const first = await login();
    resolveClaims.mockImplementationOnce(async claims => {
      await Session.updateOne({}, { $set: { status: 'blocked' } });
      return claims;
    });
    expect((await refresh(cookie(first))).status).toBe(401);
    expect(await Token.countDocuments()).toBe(0);
  });

  it('rejects untrusted origins and expired tokens', async () => {
    const first = await login();
    const denied = await request(app).post('/refresh').set('Origin', 'https://attacker.test').set('Cookie', cookie(first));
    expect(denied.status).toBe(403);
    await Token.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(cookie(first))).status).toBe(401);
  });

  it('leaves refresh usable after a transient subscription lookup failure', async () => {
    const first = await login();
    resolveClaims.mockRejectedValueOnce(new Error('upstream unavailable'));
    expect((await refresh(cookie(first))).status).toBe(503);
    expect(await Token.countDocuments({ consumedAt: null })).toBe(1);
    expect((await refresh(cookie(first))).status).toBe(200);
  });

  it('denies inactive subscriptions', async () => {
    const first = await login();
    resolveClaims.mockResolvedValueOnce(null);
    expect((await refresh(cookie(first))).body.code).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('denies refresh after a member password changes or the member is disabled', async () => {
    user = await User.create({ adminId: admin._id, roleIds: new mongoose.Types.ObjectId(), userName: 'member', password: 'before' });
    claims.memberId = String(user._id);
    await Session.updateOne({}, { $set: { memberId: user._id, userType: 'user' } });
    const first = await login();
    user.password = 'after';
    await user.save();
    expect((await refresh(cookie(first))).body.code).toBe('SESSION_INVALID');
    const second = await login();
    await User.updateOne({ _id: user._id }, { $set: { active: false } });
    expect((await refresh(cookie(second))).status).toBe(401);
  });

  it('uses the signed session claim when the caller omits or substitutes the session header', async () => {
    await Session.updateOne({}, { $set: { status: 'logged_out' } });
    const result = await sessionsService.enforceRequestSession({ headers: {}, body: {} }, { ...claims, sessionId: session.sessionId });
    expect(result.allowed).toBe(false);
    expect(result.body.code).toBe('SESSION_LOGGED_OUT');
  });
});
