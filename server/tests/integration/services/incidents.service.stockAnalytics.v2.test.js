import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { serviceCtx } from '../../helpers/service.js';
import Response from '../../../utils/response.js';

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


const channel = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const fixture = (extra = {}) => ({ userId: '100', incidentType: 'loadingUnloadingStockCountingDetection',
  channelId: channel, timeOfIncident: new Date('2026-10-13T20:00:00Z'), direction: 'loading',
  boxCount: 4, boxType: 'mixed', vehicleNumber: 'GJ01AA1234', ...extra });
async function analytics(query = {}, channels = [channel]) {
  const { req, res } = serviceCtx({ user_id: '100', authorizedChannel: { channels } });
  req.query = { startDate: '2026-10-14', endDate: '2026-10-15', ...query };
  req.verified.userData.timezone = 'Asia/Kolkata';
  const next = vi.fn();
  await service.getLoadingUnloadingStockCountingAnalytics(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}
describe('stock analytics and movement evidence', () => {
  it('reconciles mixed colour composition, legacy counts, invalid data and unknown directions', async () => {
    await Incident.collection.insertMany([
      fixture({ brownCount: 3, whiteCount: 1, otherCount: 0 }),
      fixture({ boxCount: 2, direction: ' unloading ', vehicleNumber: 'UNKNOWN2', boxType: 'white' }),
      fixture({ boxCount: 3, direction: 'unknown', vehicleNumber: '' }),
      fixture({ boxCount: 'broken', vehicleNumber: 'UNREADABLE:1' }),
      fixture({ boxCount: -2 }), fixture({ boxCount: 1.5 }), fixture({ boxCount: null }),
      fixture({ boxCount: 100, channelId: other }), fixture({ userId: '200', boxCount: 100 }),
    ]);
    const data = (await analytics())._body.body.data;
    // UNKNOWN2 is a DS id for one unreadable truck, so it counts as a vehicle; blank and UNREADABLE:1 do not.
    expect(data.summary).toMatchObject({ totalEvents: 7, totalVehicles: 2, loadedBoxes: 4, unloadedBoxes: 2,
      totalBoxes: 9, unidentifiedEvents: 2, invalidCountEvents: 4, unknownDirectionBoxes: 3,
      unknownDirectionEvents: 1, colourSplitEvents: 1 });
    expect(data.composition).toEqual([{ boxType: 'classification only', total: 5 }, { boxType: 'brown', total: 3 }, { boxType: 'white', total: 1 }]);
    expect(data.trends).toHaveLength(2);
    expect(data.trends[1]).toMatchObject({ date: '2026-10-15', total: 0, events: 0 });
    expect(data.hourlyActivity).toHaveLength(24);
    expect(data.hourlyActivity[1]).toMatchObject({ total: 9, events: 7 });
    expect(data.topVehicles.map((v) => v.vehicleNumber)).toEqual(['GJ01AA1234', 'UNKNOWN2']);
    expect(data.insights[0].message).toContain('were loaded than unloaded');
    const grouped = serviceCtx({ user_id: '100', authorizedChannel: { channels: [channel] } });
    grouped.req.query = { startDate: '2026-10-14', endDate: '2026-10-15', limit: 100 };
    const next = vi.fn();
    await service.getLoadingUnloadingStockCountingLogs(grouped.req, grouped.res, next);
    expect(next).not.toHaveBeenCalled();
    const groupedData = grouped.res._body.body.data;
    expect(groupedData.data.reduce((sum, row) => sum + row.boxCount, 0)).toBe(data.summary.totalBoxes);
    expect(data.trends.reduce((sum, row) => sum + row.total, 0)).toBe(data.summary.totalBoxes);
    expect(data.composition.reduce((sum, row) => sum + row.total, 0)).toBe(data.summary.totalBoxes);
  });
  it('paginates raw events, applies the same filters, and populates evidence names', async () => {
    const nvr = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('nvrs').insertOne({ _id: nvr, nvrName: 'Warehouse' });
    await mongoose.connection.db.collection('channels').insertOne({ _id: channel, name: 'Cam', customName: 'Bay' });
    await Incident.collection.insertMany(Array.from({ length: 31 }, (_, i) => fixture({ nvrId: nvr, eventId: `event-${i}` })));
    const total = (await analytics())._body.body.data.summary.totalEvents;
    const first = (await analytics({ mode: 'events', limit: 25 }))._body.body.data;
    const second = (await analytics({ mode: 'events', skip: 25, limit: 25 }))._body.body.data;
    expect(first.total).toBe(total);
    expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(6);
    expect(new Set([...first.rows, ...second.rows].map((row) => String(row._id))).size).toBe(31);
    expect(first.rows[0]).toMatchObject({ channelName: 'Bay', nvrName: 'Warehouse', boxCount: 4 });
    expect((await analytics({ mode: 'events', boxType: 'white' }))._body.body.data.total).toBe(0);
    expect((await analytics({ mode: 'events' }, []))._body.body.data.total).toBe(0);
  });
  it('rejects malformed and reversed date ranges before either query mode', async () => {
    expect((await analytics({ startDate: 'bad' })).statusCode).toBe(400);
    expect((await analytics({ startDate: '2026-10-16', mode: 'events' })).statusCode).toBe(400);
  });
  it('keeps malformed or fractional colour splits out of measured composition', async () => {
    await Incident.collection.insertMany([
      fixture({ brownCount: 'broken', whiteCount: 1, otherCount: 0 }),
      fixture({ brownCount: 1.5, whiteCount: 2.5, otherCount: 0 }),
    ]);
    const data = (await analytics())._body.body.data;
    expect(data.summary.totalBoxes).toBe(8);
    expect(data.summary.colourSplitEvents).toBe(0);
    expect(data.composition).toEqual([{ boxType: 'classification only', total: 8 }]);
  });
  it('adapts activity to hourly, daily and monthly buckets without changing totals', async () => {
    await Incident.collection.insertMany([
      fixture({ timeOfIncident: new Date('2026-01-01T18:30:00Z'), boxCount: 3 }),
      fixture({ timeOfIncident: new Date('2026-01-02T18:29:59Z'), boxCount: 2, direction: 'unloading' }),
      fixture({ timeOfIncident: new Date('2026-03-01T00:00:00Z'), boxCount: 4 }),
    ]);
    for (const [startDate, endDate, interval, length] of [
      ['2026-01-02', '2026-01-02', 'hour', 24],
      ['2026-01-01', '2026-01-31', 'day', 31],
      ['2026-01-01', '2026-02-01', 'month', 2],
      ['2026-01-01', '2026-12-31', 'month', 12],
      ['2025-12-20', '2026-02-01', 'month', 3],
    ]) {
      const data = (await analytics({ startDate, endDate }))._body.body.data;
      expect(data.activityInterval).toBe(interval);
      expect(data.activity).toHaveLength(length);
      for (const [key, summaryKey] of [['loaded', 'loadedBoxes'], ['unloaded', 'unloadedBoxes'], ['total', 'totalBoxes'], ['events', 'totalEvents']]) {
        expect(data.activity.reduce((sum, row) => sum + row[key], 0)).toBe(data.summary[summaryKey]);
      }
    }
    const yearly = (await analytics({ startDate: '2026-01-01', endDate: '2026-12-31' }))._body.body.data;
    expect(yearly.activity[0]).toMatchObject({ bucket: '2026-01', loaded: 3, unloaded: 2, total: 5 });
    expect(yearly.activity[1]).toMatchObject({ bucket: '2026-02', total: 0, events: 0 });
    expect(yearly.activity[2]).toMatchObject({ bucket: '2026-03', total: 4 });
  });
  it('returns vehicles beyond the first eight in deterministic throughput order', async () => {
    await Incident.collection.insertMany(Array.from({ length: 12 }, (_, i) => fixture({
      vehicleNumber: `DEMO${String(i).padStart(4, '0')}`, boxCount: i + 1,
    })));
    const data = (await analytics())._body.body.data;
    expect(data.topVehicles).toHaveLength(12);
    expect(data.topVehicles[0]).toMatchObject({ vehicleNumber: 'DEMO0011', total: 12 });
    expect(data.topVehicles[11]).toMatchObject({ vehicleNumber: 'DEMO0000', total: 1 });
  });
  it('respects the local midnight boundary', async () => {
    await Incident.collection.insertMany([
      fixture({ timeOfIncident: new Date('2026-10-13T18:29:59.999Z') }),
      fixture({ timeOfIncident: new Date('2026-10-13T18:30:00Z') }),
      fixture({ timeOfIncident: new Date('2026-10-14T18:29:59.999Z') }),
      fixture({ timeOfIncident: new Date('2026-10-14T18:30:00Z') }),
    ]);
    expect((await analytics({ endDate: '2026-10-14' }))._body.body.data.summary.totalEvents).toBe(2);
  });
});
