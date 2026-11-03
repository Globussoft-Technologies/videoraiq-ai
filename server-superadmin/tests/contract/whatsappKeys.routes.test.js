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
