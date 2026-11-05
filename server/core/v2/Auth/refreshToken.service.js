import { createHash, randomBytes } from 'node:crypto';
import config from 'config';
import jwt from 'jsonwebtoken';
import tokens from './refreshToken.model.js';
import sessions from '../sessions/sessions.model.js';
import sessionsService from '../sessions/sessions.service.js';
import Admin from '../../v1/admin/admin.model.js';
import User from '../../v1/users/users.model.js';
import { authOriginAllowed } from '../../../utils/authOrigins.js';
import { sendSessionRevoked } from '../../../socket.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const cookieName = () => `vq_refresh_${config.get('APP_ENV')}`;
const accessSeconds = () => Math.min(3600, Math.max(60, Number(process.env.AUTH_ACCESS_TOKEN_SECONDS) || 900));
const lifetime = remember => (remember ? 30 : 7) * 86400000;
const cookieOptions = req => ({
  httpOnly: true,
  secure: req.secure,
  sameSite: process.env.AUTH_REFRESH_SAME_SITE === 'none' && req.secure ? 'none' : 'lax',
  // Host-only; path '/' also works behind an /api-backend reverse proxy.
  path: '/',
});
const fail = (res, code, message, status = 401) => res.status(status).json({ success: false, code, message });
const version = user => user?.password ? hash(String(user.password)) : '';

async function revokeSession(sessionId, reason) {
  const now = new Date();
  await sessions.updateOne({ sessionId, status: 'active' }, {
    $set: { status: 'logged_out', logoutTime: now },
    $push: { events: { type: 'logout', at: now, reason } },
  });
  await tokens.deleteMany({ sessionId });
  await sendSessionRevoked(sessionId, { code: 'SESSION_LOGGED_OUT', message: reason });
}

function accessToken(claims, sessionId) {
  const { exp, iat, nbf, ...payload } = claims;
  return jwt.sign({ ...payload, sessionId, tokenType: 'browser-access' }, config.get('jwt.secretKey'), {
    algorithm: 'HS512', expiresIn: accessSeconds(),
  });
}

export async function issueBrowserTokens(req, res, claims, session, legacyToken) {
  // Explicit client_v2 opt-in preserves existing API consumers and legacy clients.
  if (req.headers?.['x-auth-refresh'] !== '1') return legacyToken;
  if (claims.impersonatedByAdminId) {
    // An impersonation must not later restore a previous account's refresh cookie.
    res.clearCookie(cookieName(), cookieOptions(req));
    return legacyToken;
  }
  if (!authOriginAllowed(req)) throw new Error('Browser auth origin is not allowed');
  if (!session?.sessionId) throw new Error('Unable to create authenticated session');
  const raw = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + lifetime(req.body?.rememberMe === true || req.body?.rememberMe === 'true'));
  const user = claims.memberId ? await User.findById(claims.memberId).lean() : await Admin.findById(claims.adminId).lean();
  await tokens.create({ tokenHash: hash(raw), sessionId: session.sessionId, claims, expiresAt, credentialVersion: version(user) });
  res.cookie(cookieName(), raw, { ...cookieOptions(req), maxAge: expiresAt.getTime() - Date.now() });
  res.set('Cache-Control', 'no-store');
  return accessToken(claims, session.sessionId);
}

export async function refreshBrowserTokens(req, res, resolveClaims) {
  res.set('Cache-Control', 'no-store');
  if (!authOriginAllowed(req)) return fail(res, 'AUTH_ORIGIN_DENIED', 'Browser auth origin is not allowed', 403);
  const raw = req.cookies?.[cookieName()];
  if (!raw || typeof raw !== 'string' || raw.length > 256) return fail(res, 'REFRESH_INVALID', 'Please sign in again');
  const record = await tokens.findOne({ tokenHash: hash(raw) }).lean();
  if (!record || record.expiresAt <= new Date()) {
    res.clearCookie(cookieName(), cookieOptions(req));
    return fail(res, 'REFRESH_EXPIRED', 'Please sign in again');
  }
  // A small collision window lets requests already in flight retry with the
  // winning response's cookie. Old-token reuse outside it revokes the session.
  if (record.consumedAt) {
    if (Date.now() - record.consumedAt.getTime() < 10000) return fail(res, 'REFRESH_RETRY', 'Refresh already in progress', 409);
    await revokeSession(record.sessionId, 'Refresh token reuse detected');
    res.clearCookie(cookieName(), cookieOptions(req));
    return fail(res, 'REFRESH_REUSED', 'Please sign in again');
  }
  const session = await sessions.findOne({ sessionId: record.sessionId }).lean();
  if (!session || session.status !== 'active') return fail(res, 'SESSION_INVALID', 'Session is no longer active');
  if (String(session.adminId) !== String(record.claims.adminId) || String(session.memberId || '') !== String(record.claims.memberId || '')) {
    return fail(res, 'SESSION_INVALID', 'Session identity does not match');
  }
  const scopedReq = { ...req, headers: { ...req.headers, 'x-session-id': record.sessionId } };
  const allowed = await sessionsService.enforceRequestSession(scopedReq, record.claims);
  if (!allowed.allowed) return res.status(allowed.statusCode).json({ success: false, ...allowed.body });
  const admin = await Admin.findById(record.claims.adminId).lean();
  const user = record.claims.memberId ? await User.findById(record.claims.memberId).lean() : admin;
  if (!admin || !user || user.active === false || (record.claims.memberId && String(user.adminId) !== String(admin._id)) || version(user) !== record.credentialVersion) {
    await revokeSession(record.sessionId, 'Account or credentials have changed');
    return fail(res, 'SESSION_INVALID', 'Account or credentials have changed');
  }
  // Resolve subscription/profile data before consuming: an upstream outage must
  // leave the refresh token usable rather than logging a healthy session out.
  const claims = await resolveClaims(record.claims, admin, user);
  if (!claims) return fail(res, 'SUBSCRIPTION_INACTIVE', 'Subscription is not active', 403);
  const consumed = await tokens.findOneAndUpdate({ _id: record._id, consumedAt: null }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!consumed) return fail(res, 'REFRESH_RETRY', 'Refresh already in progress', 409);
  const nextRaw = randomBytes(48).toString('base64url');
  try {
    await tokens.create({ tokenHash: hash(nextRaw), sessionId: record.sessionId, claims, expiresAt: record.expiresAt, credentialVersion: record.credentialVersion });
  } catch (error) {
    await tokens.updateOne({ _id: record._id }, { $set: { consumedAt: null } });
    throw error;
  }
  // Recheck revocation after upstream calls; refresh never creates a session.
  if (!await sessions.exists({ sessionId: record.sessionId, status: 'active' })) {
    await tokens.deleteMany({ sessionId: record.sessionId });
    return fail(res, 'SESSION_INVALID', 'Session is no longer active');
  }
  res.cookie(cookieName(), nextRaw, { ...cookieOptions(req), maxAge: record.expiresAt.getTime() - Date.now() });
  return res.json({ success: true, token: accessToken(claims, record.sessionId), sessionId: record.sessionId, expiresIn: accessSeconds() });
}

export async function logoutBrowserSession(req, res) {
  res.set('Cache-Control', 'no-store');
  if (!authOriginAllowed(req)) return fail(res, 'AUTH_ORIGIN_DENIED', 'Browser auth origin is not allowed', 403);
  const raw = req.cookies?.[cookieName()];
  if (typeof raw === 'string' && raw.length <= 256) {
    const record = await tokens.findOne({ tokenHash: hash(raw) }).lean();
    if (record) {
      await revokeSession(record.sessionId, 'Signed out');
    }
  }
  res.clearCookie(cookieName(), cookieOptions(req));
  return res.json({ success: true });
}
