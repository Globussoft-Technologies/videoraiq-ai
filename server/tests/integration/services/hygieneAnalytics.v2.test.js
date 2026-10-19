import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { clearCollections, connectMongo, disconnectMongo } from '../dbSetup.js';
import { payload, serviceCtx } from '../../helpers/service.js';
import { getHygieneAnalytics, getHygieneLogFilters, hygieneQuery } from '../../../core/v2/incidents/hygieneAnalytics.service.js';
import { HygieneSanitationFoodSafetyDetectionIncident as Incident } from '../../../core/v2/incidents/incidents.model.js';
import Channel from '../../../core/v2/channels/channels.model.js';

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);
const id = () => new mongoose.Types.ObjectId();
const request = (query = {}, overrides = {}) => {
  const ctx = serviceCtx({ user_id: 'tenant-a', query: { startDate: '2026-10-16', endDate: '2026-10-16', ...query }, ...overrides });
  ctx.next = vi.fn();
  return ctx;
};
async function fetch(ctx = request()) {
  await getHygieneAnalytics(ctx.req, ctx.res, ctx.next);
  expect(ctx.next).not.toHaveBeenCalled();
  return payload(ctx.res).data;
}
async function seed() {
  const camera = id(), otherCamera = id(), nvr = id();
  await Channel.collection.insertMany([
    { _id: camera, userId: 'tenant-a', name: 'Kitchen 1' },
    { _id: otherCamera, userId: 'tenant-a', name: 'Kitchen 2' },
  ]);
  const event = { userId: 'tenant-a', nvrId: nvr, channelId: camera, zone: 'Prep', timeOfIncident: new Date('2026-10-15T19:00:00Z'), severity: 'high', resolved: false };
  await Incident.create([
    { ...event, violationCount: 3, violations: [
      { category: 'productContact', confidence: 0.8, severity: 'high' },
      { category: 'productContact' },
      { category: 'contaminationRisk', confidence: 0.6 },
    ] },
    { ...event, channelId: otherCamera, severity: 'low', resolved: true, timeOfIncident: new Date('2026-10-16T03:00:00Z'), violations: [{ category: 'handHygieneBypass', confidence: 0.9 }] },
    { ...event, userId: 'tenant-b', violations: [{ category: 'productContact' }] },
    { ...event, timeOfIncident: new Date('2026-10-15T18:00:00Z'), violations: [{ category: 'productContact' }] },
  ]);
  return { camera, otherCamera };
}
describe('hygiene analytics', () => {
  it('returns historical NVR/camera choices independently of dates, scoped to the tenant and camera grant', async () => {
    const { camera } = await seed();
    const ctx = request({ startDate: '2020-01-01' }, { authorizedChannel: { channels: [String(camera)] } });
    await getHygieneLogFilters(ctx.req, ctx.res, ctx.next);
    const options = payload(ctx.res).data;
    expect(options.cameras).toEqual([expect.objectContaining({ _id: String(camera), name: 'Kitchen 1' })]);
    expect(options.nvrs).toHaveLength(1);
    const denied = request({}, { authorizedChannel: { channels: [] } });
    await getHygieneLogFilters(denied.req, denied.res, denied.next);
    expect(payload(denied.res).data).toEqual({ nvrs: [], cameras: [] });
  });
  it('aggregates full matching events without multiplying incident counts by violations; respects tenant and local day', async () => {
    await seed();
    const data = await fetch();
    expect(data.summary).toMatchObject({ incidents: 2, violations: 4, open: 1, high: 1, cameras: 2 });
    expect(data.events).toHaveLength(2);
    expect(data.trend).toEqual([expect.objectContaining({ _id: '2026-10-16', incidents: 2, violations: 4 })]);
    expect(data.hours.map(h => h._id)).toEqual([0, 8]);
    expect(data.categories.find(c => c._id === 'productContact')).toMatchObject({ violations: 2, confidence: 0.8, confidenceSamples: 1 });
    expect(data.options.cameras).toHaveLength(2);
    expect(data.categoryZones.find(r => r._id.category === 'productContact')).toMatchObject({ incidents: 1, violations: 2 });
    expect(data.categoryHours).toEqual(expect.arrayContaining([
      { _id: { category: 'productContact', hour: 0 }, violations: 2 },
      { _id: { category: 'contaminationRisk', hour: 0 }, violations: 1 },
      { _id: { category: 'handHygieneBypass', hour: 8 }, violations: 1 },
    ]));
  });
  it('intersects selected camera with authorized scope, including an empty grant', async () => {
    const { camera, otherCamera } = await seed();
    const ctx = request({ camera: String(otherCamera) }, { authorizedChannel: { channels: [String(camera)] } });
    expect((await fetch(ctx)).summary.incidents).toBe(0);
    expect((await fetch(request({}, { authorizedChannel: { channels: [] } }))).summary.incidents).toBe(0);
  });
  it('supports category, camera, zone, severity and resolution filters', async () => {
    const { camera } = await seed();
    const data = await fetch(request({ category: 'productContact', camera: String(camera), zone: 'Prep', severity: 'high', status: 'open' }));
    expect(data.summary).toMatchObject({ incidents: 1, violations: 2 });
    expect(data.summary.violations).toBe(data.categories.reduce((sum, c) => sum + c.violations, 0));
    expect(data.trend[0].violations).toBe(2);
    expect(data.hours[0].violations).toBe(2);
    expect(data.zones[0].violations).toBe(2);
    expect(data.events[0].violationCount).toBe(2);
    expect(data.events[0].violations).toHaveLength(2);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].violations).toBe(2);
    expect(data.categoryZones).toHaveLength(1);
    expect(data.categoryHours).toEqual([{ _id: { category: 'productContact', hour: 0 }, violations: 2 }]);
    expect(data.categoryOverview.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: 'productContact', violations: 2 }),
      expect.objectContaining({ _id: 'contaminationRisk', violations: 1 }),
    ]));
    // The low-severity second camera remains excluded by the other filters.
    expect(data.categoryOverview.categories.some(c => c._id === 'handHygieneBypass')).toBe(false);
    expect(data.categoryOverview.categoryHours).toEqual(expect.arrayContaining([
      { _id: { category: 'contaminationRisk', hour: 0 }, violations: 1 },
    ]));
  });
  it('paginates evidence without truncating summary analytics', async () => {
    const camera = id();
    await Incident.insertMany(Array.from({ length: 31 }, (_, i) => ({ userId: 'tenant-a', channelId: camera, nvrId: id(), timeOfIncident: new Date(`2026-10-16T01:00:${String(i).padStart(2, '0')}Z`), violationCount: 1 })));
    const data = await fetch(request({ page: '2' }));
    expect(data.summary).toMatchObject({ incidents: 31, violations: 31 });
    expect(data.events).toHaveLength(6);
    expect(data.events[0].timeOfIncident.toISOString()).toBe('2026-10-16T01:00:05.000Z');
  });
  it('rejects invalid filters, dates and missing authentication', () => {
    for (const query of [{ startDate: '2026-02-30' }, { endDate: '2026-10-01' }, { startDate: '2020-01-01' }, { category: 'invented' }, { camera: '$ne' }, { page: '0' }, { status: 'other' }]) expect(() => hygieneQuery(request(query).req)).toThrow();
    expect(() => hygieneQuery({})).toThrow('Authentication required');
  });
  it('denies members without hygiene log view permission', async () => {
    const ctx = request({}, { memberId: 'member', permissionConfig: [{ permissionConfig: { logs: { hygieneSanitationFoodSafetyLogs: { view: false } } } }] });
    await getHygieneAnalytics(ctx.req, ctx.res, ctx.next);
    expect(ctx.res._body.statusCode).toBe(403);
  });
});
