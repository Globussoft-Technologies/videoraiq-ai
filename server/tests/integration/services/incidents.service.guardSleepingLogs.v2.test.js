import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { serviceCtx } from '../../helpers/service.js';
import Response from '../../../utils/response.js';
import express from 'express';
import request from 'supertest';

// No Redis, job workers, external calls, or development database connection.
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../core/v2/jobs/utils/deletionQueue.js', () => ({ deletionQueue: {} }));
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn() }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn() }));
vi.mock('../../../core/v2/jobs/jobs.service.js', () => ({ default: {} }));
vi.mock('../../../services/push.service.js', () => ({ sendIncidentPush: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');
const { Incident } = await import('../../../core/v2/incidents/incidents.model.js');
const { default: routes } = await import('../../../core/v2/incidents/incidents.routes.js');
let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  // The URI is exclusively from the disposable server, never config/.env.
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  if (!mongo || mongoose.connection.port !== mongo.instanceInfo.port) {
    throw new Error('Fixture writes require the disposable MongoDB instance');
  }
  for (const name of ['incidents', 'nvrs', 'channels']) {
    await mongoose.connection.db.collection(name).deleteMany({});
  }
});

// Frozen pre-optimization pipeline, used as the equivalence reference.
const original = (match) => [
  { $match: match },
  { $sort: { timeOfIncident: -1 } },
  { $lookup: { from: 'nvrs', localField: 'nvrId', foreignField: '_id',
    pipeline: [{ $project: { _id: 1, nvrName: 1 } }], as: 'nvrData' } },
  { $unwind: { path: '$nvrData', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'channels', localField: 'channelId', foreignField: '_id',
    pipeline: [{ $project: { _id: 1, name: 1, customName: 1 } }], as: 'channelData' } },
  { $unwind: { path: '$channelData', preserveNullAndEmptyArrays: true } },
];
const n1 = new mongoose.Types.ObjectId(), n2 = new mongoose.Types.ObjectId();
const c1 = new mongoose.Types.ObjectId(), c2 = new mongoose.Types.ObjectId();
async function seed() {
  await mongoose.connection.db.collection('nvrs').insertMany([
    { _id: n1, nvrName: 'NVR one', secret: 'must not be populated' },
    { _id: n2, nvrName: 'NVR two' },
  ]);
  await mongoose.connection.db.collection('channels').insertMany([
    { _id: c1, name: 'Camera one', customName: 'Entrance' },
    { _id: c2, name: 'Camera two' },
  ]);
  await Incident.collection.insertMany([
    { userId: '100', incidentType: 'guardSleepingDetection', nvrId: n1, channelId: c1, isSleeping: true },
    { userId: '100', incidentType: 'guardSleepingDetection', nvrId: new mongoose.Types.ObjectId(), channelId: new mongoose.Types.ObjectId(), isSleeping: false },
    { userId: '100', incidentType: 'guardSleepingDetection', isSleeping: true },
    { userId: '100', incidentType: 'guardSleepingDetection', nvrId: [n1, n2], channelId: [c1, c2], isSleeping: true },
    { userId: '200', incidentType: 'guardSleepingDetection', nvrId: n1, channelId: c1 },
    { userId: '100', incidentType: 'motionDetection', nvrId: n1, channelId: c1 },
  ].map((doc, i) => ({ ...doc, timeOfIncident: new Date(`2026-06-15T10:0${i}:00Z`), Image: 'image.jpg' })));
}
const baseMatch = { userId: '100', incidentType: 'guardSleepingDetection' };
async function compare(body = {}, extraMatch = {}, authorizedChannel) {
  const match = { ...baseMatch, ...extraMatch };
  const pipeline = original(match);
  const [count, rows] = await Promise.all([
    Incident.aggregate([...pipeline, { $count: 'totalCount' }]),
    Incident.aggregate([...pipeline, { $skip: parseInt(body.skip ?? 0) }, { $limit: parseInt(body.limit ?? 10) }]),
  ]);
  const { req, res } = serviceCtx({ user_id: '100', body, authorizedChannel });
  const next = vi.fn();
  await service.getGuardSleepingLogs(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(200);
  expect(res._body).toEqual(Response.userSuccessResp('guardSleeping logs fetched successfully', {
    totalCount: count[0]?.totalCount || 0, data: rows,
  }));
  return res._body.body.data;
}

describe('v2 guard sleeping query equivalence', () => {
  it('returns the original empty response with no detection records', async () => {
    expect(await compare()).toEqual({ totalCount: 0, data: [] });
  });
  it('preserves complete responses, missing references, array expansion and pagination', async () => {
    await seed();
    const result = await compare();
    expect(result.totalCount).toBe(7);
    await compare({ skip: '1', limit: '2' });
    await compare({ skip: 99, limit: 2 });
  });
  it('preserves tenant, sleeping, NVR and authorized-channel filters', async () => {
    await seed();
    await compare({ isSleeping: 'false' }, { isSleeping: false });
    await compare({ nvrIds: `${n1},${n2}` }, { nvrId: { $in: [n1, n2] } });
    await compare({ channelIds: `${c1},${c2}` }, { channelId: { $in: [c1] } }, { channels: [c1] });
    await compare({}, { channelId: { $in: [] } }, { channels: [] });
  });
  it('preserves date filtering and empty results', async () => {
    await seed();
    await compare({ startDate: '2020-01-01', endDate: '2020-01-02' }, {
      timeOfIncident: { $gte: new Date('2020-01-01'), $lte: new Date('2020-01-02T23:59:59.999Z') },
    });
  });
  it('preserves unauthorized and invalid-reference responses', async () => {
    const unauth = serviceCtx();
    await service.getGuardSleepingLogs(unauth.req, unauth.res, unauth.next);
    expect(unauth.res._body).toEqual(Response.userFailResp('User authentication failed.', 'Unauthorized'));
    const invalid = serviceCtx({ user_id: '100', body: { nvrId: 'invalid' } });
    invalid.next = vi.fn();
    await service.getGuardSleepingLogs(invalid.req, invalid.res, invalid.next);
    expect(invalid.next).toHaveBeenCalledOnce();
    expect(invalid.next.mock.calls[0][0].message).toBe('Failed to fetch guard sleeping logs');
  });
  it('preserves a populated date window at the development default timezone boundary', async () => {
    await seed();
    await Incident.collection.insertMany([
      { ...baseMatch, timeOfIncident: new Date('2026-06-14T18:29:59.999Z') },
      { ...baseMatch, timeOfIncident: new Date('2026-06-14T18:30:00.000Z') },
      { ...baseMatch, timeOfIncident: new Date('2026-06-15T18:29:59.999Z') },
      { ...baseMatch, timeOfIncident: new Date('2026-06-15T18:30:00.000Z') },
    ]);
    const result = await compare({ startDate: '2026-06-15', endDate: '2026-06-15' }, {
      timeOfIncident: { $gte: new Date('2026-06-14T18:30:00.000Z'), $lte: new Date('2026-06-15T18:29:59.999Z') },
    });
    expect(result.totalCount).toBe(9);
  });
});

// Real HTTP routing, permission middleware, controller, service and MongoDB.
// Inject verified fixture identity so login/EMP and the dev database stay untouched.
function appFor(verified = { userData: { user_id: '100' } }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.verified = verified; next(); });
  app.use('/api/v2/incidents', routes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  return app;
}
describe('v2 guard sleeping HTTP response', () => {
  it('serves the exact empty response through the actual route', async () => {
    const res = await request(appFor()).post('/api/v2/incidents/logs/guard-sleeping').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(Response.userSuccessResp('guardSleeping logs fetched successfully', { totalCount: 0, data: [] }));
  });
  it('serves populated and paginated JSON identical to the original aggregation', async () => {
    await seed();
    const expected = await compare({ skip: 1, limit: 2 });
    const res = await request(appFor()).post('/api/v2/incidents/logs/guard-sleeping').send({ skip: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(Response.userSuccessResp('guardSleeping logs fetched successfully', expected))));
  });
  it('keeps channel restrictions in the HTTP path', async () => {
    await seed();
    const res = await request(appFor({ userData: { user_id: '100' }, authorizedChannel: { channels: [] } }))
      .post('/api/v2/incidents/logs/guard-sleeping').send({});
    expect(res.status).toBe(200);
    expect(res.body.body.data).toEqual({ totalCount: 0, data: [] });
  });
  it('propagates invalid references and pagination errors', async () => {
    for (const body of [{ nvrId: 'invalid' }, { skip: -1 }, { limit: 0 }]) {
      const res = await request(appFor()).post('/api/v2/incidents/logs/guard-sleeping').send(body);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to fetch guard sleeping logs');
    }
  });
});
