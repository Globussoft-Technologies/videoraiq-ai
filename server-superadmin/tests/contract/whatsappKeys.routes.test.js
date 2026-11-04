import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from 'config';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, clearCollections } from '../integration/dbSetup.js';
import routes from '../../core/v1/whatsappKeys/whatsappKeys.routes.js';
import Admin from '../../core/v1/admin/admin.model.js';
import SuperAdmin from '../../core/v1/superAdmin/superAdmin.model.js';
import Sender from '../../core/v1/whatsappKeys/whatsapp.sharedSender.model.js';
import Keys from '../../core/v1/whatsappKeys/whatsappKeys.model.js';
import { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE, DEFAULT_TEMPLATE_BODY } from '../../core/v1/whatsappKeys/whatsapp.templateDefinitions.js';

let app, admin, reviewer, token, requestId;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: 'wa-client', login: 'wa-client', name_f: 'WhatsApp', name_l: 'Client', email: 'client@test.com' });
  reviewer = await SuperAdmin.create({ name: 'Reviewer', email: 'review@test.com', password: 'test-only-hash' });
  token = jwt.sign({ id: String(reviewer._id), role: 'superAdmin' }, config.get('jwt.secretKey'));
  await Sender.create({ _id: 'default', verifiedAt: new Date(), phoneNumberId: '1111111', businessAccountId: '2222222', apiVersion: 'v24.0', credentials: 'existing-encrypted-shared-credentials' });
  requestId = new mongoose.Types.ObjectId();
  await Keys.collection.insertOne({ adminId: admin._id, credentialSource: 'own', credentials: 'private-ciphertext',
    recipients: [{ name: 'Security', phone: '+919999999999' }],
    sharedKeyRequest: { requestId, type: 'enable', status: 'pending', adminName: 'WhatsApp Client', requestedAt: new Date() } });
  app = express(); app.use(express.json()); app.use('/requests', routes);
});
const decisionPath = () => `/requests/${admin._id}/${requestId}/decision`;
describe('Super Admin WhatsApp key approvals', () => {
  it('restricts direct access management to Super Admin and validates inputs', async () => {
    const path = `/requests/${admin._id}/access`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).put(path).send({ shared: true })).status).toBe(401);
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: 'true' })).status).toBe(400);
    expect((await request(app).put(`/requests/${new mongoose.Types.ObjectId()}/access`).set('x-access-token', token).send({ shared: true })).status).toBe(404);
  });
  it('grants access directly, supersedes pending requests, and preserves private keys and recipients', async () => {
    const path = `/requests/${admin._id}/access`;
    expect((await request(app).get(path).set('x-access-token', token)).body).toMatchObject({ shared: false });
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: true })).body).toEqual({ shared: true });
    const stored = await Keys.collection.findOne({ adminId: admin._id });
    expect(stored).toMatchObject({ credentialSource: 'env', alertsPaused: false, ownReverificationRequired: false,
      credentials: 'private-ciphertext', recipients: [{ name: 'Security' }], sharedKeyRequest: { status: 'approved', reviewedBy: reviewer._id } });
    expect(stored.sharedKeyRequest.requestId.equals(requestId)).toBe(false);
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'reject' })).status).toBe(409);
    expect((await request(app).get(path).set('x-access-token', token)).body).toMatchObject({ shared: true });
    // Repeated grants must not reset alert pauses or templates.
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { alertsPaused: true } });
    await request(app).put(path).set('x-access-token', token).send({ shared: true });
    expect((await Keys.collection.findOne({ adminId: admin._id })).alertsPaused).toBe(true);
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: false })).status).toBe(200);
    expect(await Keys.collection.findOne({ adminId: admin._id })).toMatchObject({ credentialSource: 'own', enabled: false,
      alertsPaused: true, ownReverificationRequired: true, credentials: 'private-ciphertext', recipients: [{ name: 'Security' }] });
  });
  it('creates shared access for accounts that have never configured WhatsApp', async () => {
    await Keys.deleteMany({});
    const path = `/requests/${admin._id}/access`;
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: true })).status).toBe(200);
    expect(await Keys.collection.findOne({ adminId: admin._id })).toMatchObject({ credentialSource: 'env', recipients: [], templates: [] });
  });
  it('reports readiness from the active shared sender without returning credentials', async () => {
    const path = `/requests/${admin._id}/access`;
    await request(app).put(path).set('x-access-token', token).send({ shared: true });
    const missing = await request(app).get(path).set('x-access-token', token);
    expect(missing.body.readiness).toMatchObject({ senderReady: true, imageApproved: false, textApproved: false, recipientCount: 0, ready: false });
    await Sender.updateOne({ _id: 'default' }, { $set: { templates: [{ name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE,
      status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: DEFAULT_TEMPLATE_BODY }] }] } });
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { 'recipients.0.optedInAt': new Date() } });
    const ready = await request(app).get(path).set('x-access-token', token);
    expect(ready.body.readiness).toMatchObject({ senderReady: true, imageApproved: true, textApproved: false, recipientCount: 1, alertsEnabled: true, ready: true });
    expect(JSON.stringify(ready.body)).not.toMatch(/ciphertext|encrypted-shared|999999|credentials/);
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { alertsPaused: true } });
    expect((await request(app).get(path).set('x-access-token', token)).body.readiness).toMatchObject({ alertsEnabled: false, alertsPaused: true, ready: false });
    await request(app).put(path).set('x-access-token', token).send({ shared: false });
    expect((await request(app).get(path).set('x-access-token', token)).body.readiness).toMatchObject({ senderReady: false, ready: false });
  });
  it('requires a verified central sender for direct grants but permits revocation when unavailable', async () => {
    await Sender.deleteMany({});
    const path = `/requests/${admin._id}/access`;
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: true })).status).toBe(409);
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { credentialSource: 'env' } });
    expect((await request(app).put(path).set('x-access-token', token).send({ shared: false })).status).toBe(200);
  });
  it('requires a real Super Admin session for reads and decisions', async () => {
    expect((await request(app).get('/requests')).status).toBe(401);
    const owner = jwt.sign({ id: String(reviewer._id), role: 'admin' }, config.get('jwt.secretKey'));
    expect((await request(app).post(decisionPath()).set('x-access-token', owner).send({ decision: 'approve' })).status).toBe(403);
  });
  it('lists requesting account names and notification counts without credentials or recipients', async () => {
    const result = await request(app).get('/requests').set('x-access-token', token);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ pendingCount: 1, total: 1, requests: [{ sharedKeyRequest: { adminName: 'WhatsApp Client' }, account: { login: 'wa-client' } }] });
    expect(JSON.stringify(result.body)).not.toMatch(/private-ciphertext|919999999999/);
    expect((await request(app).get('/requests?countOnly=true').set('x-access-token', token)).body).toEqual({ pendingCount: 1 });
  });
  it('approves shared access once, preserves own keys and recipients, and invalidates sender templates', async () => {
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'approve' })).status).toBe(200);
    const stored = await Keys.collection.findOne({ adminId: admin._id });
    expect(stored).toMatchObject({ credentialSource: 'env', enabled: false, credentials: 'private-ciphertext',
      templates: [], sharedKeyRequest: { status: 'approved', reviewedBy: reviewer._id } });
    expect(stored.recipients).toHaveLength(1);
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'approve' })).status).toBe(409);
  });
  it('keeps shared access on cancellation rejection and requires own-key reverification after cancellation approval', async () => {
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { credentialSource: 'env', enabled: true, 'sharedKeyRequest.type': 'cancel' } });
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'reject' })).status).toBe(200);
    expect(await Keys.collection.findOne({ adminId: admin._id })).toMatchObject({ credentialSource: 'env', enabled: true });
    requestId = new mongoose.Types.ObjectId();
    await Keys.collection.updateOne({ adminId: admin._id }, { $set: { 'sharedKeyRequest.requestId': requestId, 'sharedKeyRequest.status': 'pending' } });
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'approve' })).status).toBe(200);
    expect(await Keys.collection.findOne({ adminId: admin._id })).toMatchObject({ credentialSource: 'own', enabled: false, alertsPaused: true, ownReverificationRequired: true, credentials: 'private-ciphertext' });
  });
  it('allows only one reviewer to resolve a pending request', async () => {
    const results = await Promise.all(['approve', 'reject'].map(decision => request(app).post(decisionPath()).set('x-access-token', token).send({ decision })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  });
  it('requires a centrally configured sender before granting new shared access', async () => {
    await Sender.deleteMany({});
    expect((await request(app).post(decisionPath()).set('x-access-token', token).send({ decision: 'approve' })).status).toBe(409);
    expect((await Keys.collection.findOne({ adminId: admin._id })).sharedKeyRequest.status).toBe('pending');
  });
});
