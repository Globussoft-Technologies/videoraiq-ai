import { checkKeyOwnership } from './apiKey.ownership.js';
import rateLimit from 'express-rate-limit';
import Admin from '../admin/admin.model.js';
import ApiKey from './apiKey.model.js';
import { KEY_PATTERN, hashKey, keyAllows, activeSubscriptions } from './apiKey.policy.js';
import Response from '../../../utils/response.js';
import { DEFAULT_ADMIN_TIMEZONE, validTimezone } from '../../../utils/timezone.js';

const byIp = rateLimit({ windowMs: 60000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false });
const byKey = rateLimit({ windowMs: 60000, limit: 600, keyGenerator: req => String(req.verified.apiKey.id), standardHeaders: 'draft-7', legacyHeaders: false });
const fail = (res, status, message) => res.status(status).json(Response.tokenFailResp(message));

async function authenticate(req, res, next, secret) {
  try {
    if (req.get('authorization')) return fail(res, 400, 'Send one authentication credential per request');
    if (!KEY_PATTERN.test(secret)) return fail(res, 401, 'Invalid API key');
    const key = await ApiKey.findOne({ keyHash: hashKey(secret), revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!key) return fail(res, 401, 'API key is invalid, expired or revoked');
    res.set('Cache-Control', 'no-store');
    if (!keyAllows(key, req.method, req.originalUrl)) return fail(res, 403, 'This API key does not allow this operation');
    const admin = await Admin.findById(key.adminId).select('_id user_id login email name_f name_l orgId timezone subscriptionSnapshot').lean();
    if (!admin) return fail(res, 401, 'Admin account no longer exists');
    if (!activeSubscriptions(admin.subscriptionSnapshot?.subscriptions)) return res.status(403).json(Response.planExpiredResp('Your subscription plan has expired', 'API-key validity does not extend the account subscription'));
    try { await checkKeyOwnership(req, admin); }
    catch { return fail(res, 403, 'Resource access is not allowed for this admin'); }
    req.verified = { state: true, apiKey: { id: key._id, access: key.access, scopes: key.scopes }, permissionConfig: null, authorizedChannel: null,
      userData: { adminId: String(admin._id), user_id: admin.user_id, userId: admin.user_id, user_email: admin.email, login: admin.login,
        orgId: admin.orgId, name_f: admin.name_f, name_l: admin.name_l, timezone: validTimezone(admin.timezone) || DEFAULT_ADMIN_TIMEZONE,
        userSubscriptionType: admin.subscriptionSnapshot.subscriptions, tokenType: 'api-key' },
    };
    return byKey(req, res, () => {
      res.once('finish', () => {
        ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: req.ip || '', lastUsedPath: req.originalUrl.split('?')[0], lastStatus: res.statusCode }, $inc: { requestCount: 1 } }).catch(() => {});
      });
      next();
    });
  } catch (error) { next(error); }
}

export default function apiKeyAuth(req, res, next) {
  const dedicated = req.header('x-api-key');
  const access = req.header('x-access-token');
  const secret = dedicated || (access?.startsWith('vrq_') ? access : '');
  if (!secret) {
    if (String(req.query?.token || '').startsWith('vrq_')) return fail(res, 401, 'API keys must be sent in a request header');
    return next();
  }
  return byIp(req, res, () => authenticate(req, res, next, secret));
}

