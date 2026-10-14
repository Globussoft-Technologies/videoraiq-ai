import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
vi.mock('../../../socket.js', () => ({ emitCameraLimit: vi.fn() }));
vi.mock('../../../utils/helperFunctions.js', () => ({ getEmpAuthInfo: vi.fn(), autoSyncLocations: vi.fn() }));
vi.mock('../../../middlewares/checkActivePlan.js', () => ({ checkActivePlan: (_req, _res, next) => next() }));
vi.mock('../../../core/v2/sessions/sessions.service.js', () => ({ default: { enforceRequestSession: vi.fn().mockResolvedValue({ allowed: true }) } }));
vi.mock('../../../services/delete.service.js', () => ({ default: {} }));
const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: ApiKey } = await import('../../../core/v2/apiKeys/apiKey.model.js');
const { default: NVR } = await import('../../../core/v2/NVR/nvr.model.js');
const { default: keyAuth } = await import('../../../core/v2/apiKeys/apiKey.middleware.js');
const { default: verifyToken } = await import('../../../middlewares/verifyToken.js');
const { hashKey } = await import('../../../core/v2/apiKeys/apiKey.policy.js');
const { default: v1Routes } = await import('../../../core/v1/NVR/nvr.routes.js');
const { default: v2Routes } = await import('../../../core/v2/NVR/nvr.routes.js');
beforeAll(connectMongo); afterAll(disconnectMongo); beforeEach(clearCollections);
it('uses genuine v1/v2 NVR handlers without exposing another admin through list or ID lookup', async () => {
  const app = express(); app.use('/api', keyAuth);
  app.use('/api/v1/nvr', verifyToken, v1Routes); app.use('/api/v2/nvr', verifyToken, v2Routes);
  const admin = await Admin.create({ user_id: '101', login: 'owner', email: 'owner@example.test', subscriptionSnapshot: { subscriptions: { test: '2099-12-31' } } });
  const mine = new mongoose.Types.ObjectId(), foreign = new mongoose.Types.ObjectId();
  await NVR.collection.insertMany([{ _id: mine, userId: '101' }, { _id: foreign, userId: '102' }]);
  const secret = `vrq_${randomBytes(32).toString('base64url')}`;
  await ApiKey.create({ adminId: admin._id, name: 'NVR integration', keyHash: hashKey(secret), prefix: secret.slice(0, 12), access: 'read', scopes: ['cameras'], expiresAt: new Date(Date.now() + 86400000) });
  for (const version of ['v1', 'v2']) {
    const list = await request(app).get(`/api/${version}/nvr/all-nvrs`).set('x-api-key', secret).expect(200);
    expect(list.body.body.data.total).toBe(1);
    expect(list.body.body.data.nvrs.map(row => row._id)).toEqual([String(mine)]);
    const own = await request(app).get(`/api/${version}/nvr/${mine}`).set('x-api-key', secret).expect(200);
    expect(own.body.body.data.nvr._id).toBe(String(mine));
    await request(app).get(`/api/${version}/nvr/${foreign}`).set('x-api-key', secret).expect(403);
  }
});
