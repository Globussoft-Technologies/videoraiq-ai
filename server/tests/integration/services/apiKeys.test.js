import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from 'config';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';

vi.mock('../../../middlewares/checkActivePlan.js', () => ({ checkActivePlan: (_req, _res, next) => next() }));
vi.mock('../../../utils/helperFunctions.js', () => ({ getEmpAuthInfo: vi.fn().mockResolvedValue(null) }));
vi.mock('../../../core/v2/sessions/sessions.service.js', () => ({ default: { enforceRequestSession: vi.fn().mockResolvedValue({ allowed: true }) } }));

const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: ApiKey } = await import('../../../core/v2/apiKeys/apiKey.model.js');
const { default: keyRoutes } = await import('../../../core/v2/apiKeys/apiKey.routes.js');
const { default: keyAuth } = await import('../../../core/v2/apiKeys/apiKey.middleware.js');
const { default: verifyToken } = await import('../../../middlewares/verifyToken.js');
const { hashKey, expiryFromDuration, keyAllows, activeSubscriptions } = await import('../../../core/v2/apiKeys/apiKey.policy.js');
const { default: NVR } = await import('../../../core/v2/NVR/nvr.model.js');
const { default: Channel } = await import('../../../core/v2/channels/channels.model.js');
const { default: User } = await import('../../../core/v2/users/users.model.js');

const app = express();
app.use(express.json());
app.use('/api', keyAuth);
app.use('/api/v2/api-keys', keyRoutes);
app.all(['/api/v2/*', '/api/v1/*'], verifyToken, (req, res) => res.json({ adminId: req.verified.userData.adminId, userId: req.verified.userData.user_id, apiKey: Boolean(req.verified.apiKey) }));
app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Test request failed' }));
let admin, other, session;
const unwrap = response => response.body.body.data;
const newId = () => new mongoose.Types.ObjectId();
const sign = claims => jwt.sign(claims, config.get('jwt.secretKey'));
const baseClaims = owner => ({ adminId: String(owner._id), user_id: owner.user_id, userSubscriptionType: { test: '2099-12-31' } });
async function issue(overrides = {}) {
  const secret = `vrq_${randomBytes(32).toString('base64url')}`;
  const row = await ApiKey.create({ adminId: admin._id, name: 'Test integration', keyHash: hashKey(secret), prefix: secret.slice(0, 12), access: 'read', scopes: ['*'], expiresAt: new Date(Date.now() + 86400000), ...overrides });
  return { secret, row };
}
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: '101', login: 'api-a', email: 'a@example.test', subscriptionSnapshot: { subscriptions: { test: '2099-12-31' } } });
  other = await Admin.create({ user_id: '102', login: 'api-b', email: 'b@example.test', subscriptionSnapshot: { subscriptions: { test: '2099-12-31' } } });
  session = sign(baseClaims(admin));
});

describe('API-key lifecycle and admin management', () => {
  it('creates a secret once, stores only its hash, and lists only the owner metadata', async () => {
    const response = await request(app).post('/api/v2/api-keys').set('x-access-token', session).send({ name: 'ERP', duration: 2, unit: 'years', access: 'full', scopes: ['incidents'] }).expect(201);
    const result = unwrap(response);
    expect(result.secret).toMatch(/^vrq_[A-Za-z0-9_-]{43}$/);
    expect(result.key).not.toHaveProperty('keyHash');
    expect(new Date(result.key.expiresAt).getUTCFullYear()).toBe(new Date().getUTCFullYear() + 2);
    const stored = await ApiKey.findById(result.key._id).select('+keyHash').lean();
    expect(stored.keyHash).toBe(hashKey(result.secret));
    expect(JSON.stringify(stored)).not.toContain(result.secret);
    await issue({ adminId: other._id });
    const list = unwrap(await request(app).get('/api/v2/api-keys').set('x-access-token', session).expect(200));
    expect(list.total).toBe(1); expect(list.keys[0].name).toBe('ERP');
    expect(list.keys[0]).not.toHaveProperty('keyHash');
    expect(JSON.stringify(list)).not.toContain(result.secret);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('accepts days and rejects invalid duration, scope, access and extra fields', async () => {
    const data = { name: 'ERP', duration: 3, unit: 'days', access: 'read', scopes: ['*'] };
    const result = unwrap(await request(app).post('/api/v2/api-keys').set('x-access-token', session).send(data).expect(201));
    expect(+new Date(result.key.expiresAt) - Date.now()).toBeGreaterThan(3 * 86400000 - 5000);
    for (const changed of [{ duration: 0 }, { duration: -1 }, { duration: 1.5 }, { duration: Number.MAX_SAFE_INTEGER }, { scopes: ['bad'] }, { scopes: [] }, { access: 'admin' }, { adminId: String(other._id) }]) {
      await request(app).post('/api/v2/api-keys').set('x-access-token', session).send({ ...data, ...changed }).expect(400);
    }
  });
  it('rejects anonymous, member, system and registration-invite management', async () => {
    await request(app).get('/api/v2/api-keys').expect(401);
    await request(app).get('/api/v2/api-keys').set('x-access-token', sign({ ...baseClaims(admin), registrationLinkId: 'invite' })).expect(401);
    admin.registrationLink = { linkId: 'invite', expiresAt: new Date(Date.now() + 86400000) }; await admin.save();
    await request(app).get('/api/v2/api-keys').set('x-access-token', sign({ ...baseClaims(admin), registrationLinkId: 'invite' })).expect(403);
    const member = await User.collection.insertOne({ adminId: admin._id, email: 'member@example.test' });
    await request(app).get('/api/v2/api-keys').set('x-access-token', sign({ ...baseClaims(admin), memberId: String(member.insertedId) })).expect(403);
    await request(app).get('/api/v2/api-keys').set('x-access-token', jwt.sign({ service: 'python-backend' }, config.get('Backend.token'))).expect(403);
  });
  it('prevents another admin revoking a key and revokes immediately for its owner', async () => {
    const { secret, row } = await issue();
    await request(app).delete(`/api/v2/api-keys/${row._id}`).set('x-access-token', sign(baseClaims(other))).expect(404);
    await request(app).get('/api/v2/incidents/solder-line').set('x-api-key', secret).expect(200);
    await request(app).delete(`/api/v2/api-keys/${row._id}`).set('x-access-token', session).expect(200);
    await request(app).get('/api/v2/incidents/solder-line').set('x-api-key', secret).expect(401);
  });
  it('paginates metadata and validates pagination inputs', async () => {
    await Promise.all(Array.from({ length: 4 }, (_, i) => issue({ name: `Key ${i}` })));
    const list = unwrap(await request(app).get('/api/v2/api-keys?skip=2&limit=2').set('x-access-token', session).expect(200));
    expect(list.total).toBe(4); expect(list.keys).toHaveLength(2);
    await request(app).get('/api/v2/api-keys?skip=-1').set('x-access-token', session).expect(400);
    await request(app).get('/api/v2/api-keys?limit=101').set('x-access-token', session).expect(400);
  });
});

describe('API-key request authentication', () => {
  it('uses the current owner identity and supports header compatibility and v1', async () => {
    const { secret } = await issue();
    const result = await request(app).get('/api/v2/incidents/solder-line').set('x-api-key', secret).expect(200);
    expect(result.body).toEqual({ adminId: String(admin._id), userId: '101', apiKey: true });
    await request(app).get('/api/v1/incidents').set('x-access-token', secret).expect(200);
    await vi.waitFor(async () => expect((await ApiKey.findOne().lean()).requestCount).toBe(2));
    const stored = await ApiKey.findOne().lean();
    expect(stored.lastUsedAt).toBeInstanceOf(Date); expect(stored.lastStatus).toBe(200);
  });
  it('denies invalid, expired, revoked and deleted-owner keys', async () => {
    await request(app).get('/api/v2/incidents').set('x-api-key', 'invalid').set('x-access-token', session).expect(401);
    for (const props of [{ expiresAt: new Date(Date.now() - 1000) }, { revokedAt: new Date() }, { adminId: newId() }]) {
      const { secret } = await issue(props);
      await request(app).get('/api/v2/incidents').set('x-api-key', secret).expect(401);
    }
  });
  it('does not accept API keys from URLs', async () => {
    const { secret } = await issue();
    await request(app).get(`/api/v2/incidents?token=${secret}`).expect(401);
    await request(app).get('/api/v2/incidents').set('x-api-key', secret).set('authorization', 'Bearer another-credential').expect(400);
  });
  it('read-only allows queries but blocks writes, mutating GET and credential routes', async () => {
    const { secret } = await issue();
    await request(app).post('/api/v2/incidents').set('x-api-key', secret).send({}).expect(200);
    for (const [method, path] of [['post', '/nvr/register'], ['delete', '/incidents'], ['put', '/admin/update'], ['get', '/nvr/delete-all'], ['get', '/nvr/edit'], ['post', '/users/login'], ['get', '/api-keys']]) {
      await request(app)[method](`/api/v2${path}`).set('x-api-key', secret).expect(403);
    }
  });
  it('full access permits business writes within scopes, but cannot manage keys or credentials', async () => {
    const { secret } = await issue({ access: 'full', scopes: ['incidents'] });
    for (const method of ['post', 'put', 'patch', 'delete']) await request(app)[method]('/api/v2/incidents').set('x-api-key', secret).expect(200);
    for (const path of ['/nvr', '/api-keys', '/auth/login', '/incidents-extra', '/sessions', '/incidents/rotate-token']) await request(app).get(`/api/v2${path}`).set('x-api-key', secret).expect(403);
    const full = await issue({ access: 'full' });
    await request(app).post('/api/v2/users/login').set('x-api-key', full.secret).expect(403);
    await request(app).put('/api/v2/admin/allowed-detections').set('x-api-key', full.secret).expect(403);
    await request(app).delete('/api/v2/jobs/mock').set('x-api-key', full.secret).expect(403);
  });
  it('honors current subscription expiry even when key validity is longer', async () => {
    const { secret } = await issue();
    await Admin.updateOne({ _id: admin._id }, { $set: { 'subscriptionSnapshot.subscriptions': { test: '2000-01-01' } } });
    await request(app).get('/api/v2/incidents').set('x-api-key', secret).expect(403);
    await request(app).post('/api/v2/api-keys').set('x-access-token', session).send({ name: 'ERP', duration: 30, unit: 'days', access: 'read', scopes: ['*'] }).expect(403);
  });
  it('blocks foreign references in paths, query, nested JSON and tenant overrides', async () => {
    const mine = newId(), foreign = newId(), channel = newId(), foreignUser = newId();
    await NVR.collection.insertMany([{ _id: mine, userId: '101' }, { _id: foreign, userId: '102' }]);
    await Channel.collection.insertOne({ _id: channel, userId: '101', isAdded: false });
    await User.collection.insertOne({ _id: foreignUser, adminId: other._id });
    const { secret } = await issue({ access: 'full' });
    await request(app).get(`/api/v2/nvr/${mine}`).set('x-api-key', secret).expect(200);
    await request(app).get(`/api/v2/channel/nvr/${mine}`).set('x-api-key', secret).expect(200);
    await request(app).get(`/api/v2/nvr/${foreign}`).set('x-api-key', secret).expect(403);
    await request(app).get(`/api/v2/incidents?cameraId=${channel}`).set('x-api-key', secret).expect(200);
    await request(app).get(`/api/v2/incidents?nvrId=${foreign}`).set('x-api-key', secret).expect(403);
    await request(app).post('/api/v2/users/create').set('x-api-key', secret).send({ authorizedChannelsData: { nvrIds: [String(foreign)] } }).expect(403);
    await request(app).put(`/api/v2/users/update?userId=${foreignUser}`).set('x-api-key', secret).expect(403);
    await request(app).put('/api/v2/admin/update').set('x-api-key', secret).send({ targetAdminId: String(other._id) }).expect(403);
    await request(app).get(`/api/v2/channel/nvr-camera-detections/${admin._id}`).set('x-api-key', secret).expect(200);
    await request(app).get(`/api/v2/channel/nvr-camera-detections/${other._id}`).set('x-api-key', secret).expect(403);
  });
  it('rechecks multipart form fields before protected handlers', async () => {
    const multipartApp = express();
    multipartApp.use('/api', keyAuth);
    multipartApp.put('/api/v2/admin/update', (req, _res, next) => { req.body = { adminId: String(other._id) }; next(); }, verifyToken, (_req, res) => res.sendStatus(200));
    const { secret } = await issue({ access: 'full' });
    await request(multipartApp).put('/api/v2/admin/update').set('x-api-key', secret).expect(403);
  });
});

describe('calendar expiry and route policy edge cases', () => {
  it('uses calendar years and validates date overflow', () => {
    const leap = new Date('2024-02-29T12:30:00Z');
    expect(expiryFromDuration(1, 'years', leap).toISOString()).toBe('2025-02-28T12:30:00.000Z');
    expect(expiryFromDuration(30, 'days', leap).toISOString()).toBe('2024-03-30T12:30:00.000Z');
    expect(expiryFromDuration(Number.MAX_SAFE_INTEGER, 'years')).toBeNull();
    expect(expiryFromDuration(0, 'days')).toBeNull();
    expect(expiryFromDuration(1, 'months')).toBeNull();
  });
  it('keeps subscriptions active until the end of their UTC expiry date', () => {
    expect(activeSubscriptions({ plan: '2026-10-14' }, +new Date('2026-10-14T20:00:00Z'))).toBe(true);
    expect(activeSubscriptions(new Map([['plan', '2026-10-14']]), +new Date('2026-10-15T00:00:00Z'))).toBe(false);
    expect(activeSubscriptions({ plan: 'invalid' })).toBe(false);
  });
  it('denies malformed and unsupported paths and method overrides', () => {
    const key = { access: 'read', scopes: ['incidents'] };
    for (const path of ['/api/v3/incidents', '/api/v2/incidents-other', '/api/v2/%', '/api/v2/incidents/../nvr']) expect(keyAllows(key, 'GET', path)).toBe(false);
    expect(keyAllows(key, 'TRACE', '/api/v2/incidents')).toBe(false);
    expect(keyAllows(key, 'POST', '/api/v2/incidents?sort=asc')).toBe(true);
    expect(keyAllows({ access: 'read', scopes: ['analytics'] }, 'POST', '/api/v2/dashboard/headerStats')).toBe(true);
    expect(keyAllows({ access: 'full', scopes: ['*'] }, 'POST', '/api/v2/assistant/chat')).toBe(false);
  });
});
