import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import verifyToken from '../../../middlewares/verifyToken.js';
import Admin from '../admin/admin.model.js';
import ApiKey from './apiKey.model.js';
import { API_SCOPES, hashKey, expiryFromDuration, activeSubscriptions } from './apiKey.policy.js';
import Response from '../../../utils/response.js';

const router = express.Router();
const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  duration: Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required(),
  unit: Joi.string().valid('days', 'years').required(),
  access: Joi.string().valid('read', 'full').required(),
  scopes: Joi.array().items(Joi.string().valid('*', ...API_SCOPES.map(scope => scope.id))).min(1).unique().required(),
});
router.use(verifyToken, async (req, res, next) => {
  try {
    const user = req.verified?.userData;
    if (req.verified?.apiKey || user?.memberId || user?.system || user?.registrationLinkId || user?.tokenType === 'raspberry-pi' || !mongoose.isValidObjectId(user?.adminId)) return res.status(403).json(Response.accessDeniedResp('An admin login is required to manage API keys'));
    const admin = await Admin.findById(user.adminId).select('_id user_id subscriptionSnapshot').lean();
    if (!admin || String(admin.user_id) !== String(user.user_id)) return res.status(403).json(Response.accessDeniedResp('Admin account mismatch'));
    req.apiKeyOwner = admin;
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
});
router.get('/options', (_req, res) => res.json(Response.userSuccessResp('API-key options', { scopes: API_SCOPES.map(({ id, label }) => ({ id, label })), header: 'x-api-key' })));
router.get('/', async (req, res, next) => {
  try {
    const skip = Number(req.query.skip || 0), limit = Number(req.query.limit || 20);
    if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json(Response.userFailResp('Invalid pagination'));
    const filter = { adminId: req.apiKeyOwner._id };
    const [keys, total] = await Promise.all([ApiKey.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), ApiKey.countDocuments(filter)]);
    res.json(Response.userSuccessResp('API keys fetched', { keys, total }));
  } catch (error) { next(error); }
});
router.post('/', rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => String(req.apiKeyOwner._id), standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json(Response.userFailResp(error.details[0].message));
    const expiresAt = expiryFromDuration(value.duration, value.unit);
    if (!expiresAt) return res.status(400).json(Response.userFailResp('Validity must produce a valid future date'));
    if (!activeSubscriptions(req.apiKeyOwner.subscriptionSnapshot?.subscriptions)) return res.status(403).json(Response.userFailResp('Refresh your admin login with an active subscription before creating an API key'));
    const secret = `vrq_${randomBytes(32).toString('base64url')}`;
    const row = await ApiKey.create({ adminId: req.apiKeyOwner._id, name: value.name, access: value.access, scopes: value.scopes.includes('*') ? ['*'] : value.scopes, expiresAt, prefix: secret.slice(0, 12), keyHash: hashKey(secret) });
    const key = row.toObject(); delete key.keyHash;
    res.status(201).json(Response.userSuccessResp('API key created. Copy it now; it cannot be retrieved again.', { key, secret }));
  } catch (error) { next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json(Response.userFailResp('Invalid key ID'));
    const row = await ApiKey.findOneAndUpdate({ _id: req.params.id, adminId: req.apiKeyOwner._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true });
    if (!row) return res.status(404).json(Response.notFoundResp('Active API key not found'));
    res.json(Response.userSuccessResp('API key revoked', { id: row._id }));
  } catch (error) { next(error); }
});
export default router;
