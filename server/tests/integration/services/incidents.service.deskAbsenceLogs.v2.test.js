import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
import { serviceCtx } from '../../helpers/service.js';

vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../core/v2/jobs/utils/deletionQueue.js', () => ({ deletionQueue: {} }));
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn() }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn() }));
vi.mock('../../../core/v2/jobs/jobs.service.js', () => ({ default: {} }));
vi.mock('../../../services/push.service.js', () => ({ sendIncidentPush: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');
const { Incident } = await import('../../../core/v2/incidents/incidents.model.js');

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

async function getLogs(body, authorizedChannel) {
  const { req, res } = serviceCtx({ user_id: '100', body, authorizedChannel });
  const next = vi.fn();
  await service.getDeskAbsenceLogs(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(200);
  return res._body.body.data;
}

describe('v2 desk absence image logs', () => {
  it('paginates matching image logs and returns a graph for the same filters', async () => {
    const channelId = new mongoose.Types.ObjectId();
    const event = {
      userId: '100',
      incidentType: 'deskAbsence',
      channelId,
      personPresent: false,
      timeSeries: [{ zoneName: 'Desk A', personCount: 0 }],
    };
    await Incident.collection.insertMany([
      {
        ...event, Image: 'older.jpg', description: '3 people missing from Desk A',
        timeOfIncident: new Date('2026-06-25T10:00:00Z'),
      },
      { ...event, Image: 'newer.jpg', personPresent: true, timeOfIncident: new Date('2026-06-25T10:01:00Z') },
      { ...event, Image: 'outside.jpg', personPresent: true, timeOfIncident: new Date('2026-06-24T10:01:00Z') },
      { ...event, Image: '   ', timeOfIncident: new Date('2026-06-25T10:02:00Z') },
      { ...event, Image: 'other-zone.jpg', timeSeries: [{ zoneName: 'Desk B' }], timeOfIncident: new Date('2026-06-25T10:02:00Z') },
    ]);

    const filters = { startDate: '2026-06-25', endDate: '2026-06-25', zoneNames: ['Desk A'] };
    const result = await getLogs({ ...filters, mode: 'images', skip: 1, limit: 1 });
    expect(result).toMatchObject({
      mode: 'images',
      totalCount: 2,
      summary: { totalCount: 2, presentCount: 1, absentCount: 1 },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      Image: 'older.jpg', zoneNames: ['Desk A'], personPresent: false,
      description: '3 people missing from Desk A',
    });
    for (const [personPresent, image] of [[true, 'newer.jpg'], [false, 'older.jpg']]) {
      const filtered = await getLogs({ ...filters, mode: 'images', personPresent, limit: 1 });
      expect(filtered).toMatchObject({
        totalCount: 1,
        summary: { totalCount: 2, presentCount: 1, absentCount: 1 },
      });
      expect(filtered.data.map((row) => row.Image)).toEqual([image]);
      const nextPage = await getLogs({ ...filters, mode: 'images', personPresent, skip: 1, limit: 1 });
      expect(nextPage.data).toEqual([]);
    }
    const graph = await getLogs({ ...filters, personPresent: true });
    expect(graph).toMatchObject({ granularity: 'time', totalCount: 1 });
    expect(graph.data[0].timeSeries).toHaveLength(3);
    const descriptionSearch = await getLogs({ ...filters, mode: 'images', search: 'PEOPLE MISSING' });
    expect(descriptionSearch).toMatchObject({
      totalCount: 1, summary: { totalCount: 1, presentCount: 0, absentCount: 1 },
      data: [{ Image: 'older.jpg' }],
    });
    const combined = await getLogs({ ...filters, mode: 'images', search: 'people missing', personPresent: true });
    expect(combined).toMatchObject({ totalCount: 0, data: [] });
    const escaped = await getLogs({ ...filters, mode: 'images', search: '.*' });
    expect(escaped).toMatchObject({ totalCount: 0, data: [] });
  });

  it('sorts image events before pagination by status, time and displayed labels', async () => {
    const [firstCamera, secondCamera, firstNvr, secondNvr] = Array.from(
      { length: 4 }, () => new mongoose.Types.ObjectId(),
    );
    await mongoose.connection.db.collection('channels').insertMany([
      { _id: firstCamera, name: 'A raw camera', customName: 'Zulu Camera' },
      { _id: secondCamera, name: 'alpha camera', customName: '' },
    ]);
    await mongoose.connection.db.collection('nvrs').insertMany([
      { _id: firstNvr, nvrName: 'beta recorder' },
      { _id: secondNvr, nvrName: 'Alpha recorder' },
    ]);
    const event = { userId: '100', incidentType: 'deskAbsence' };
    await Incident.collection.insertMany([
      {
        ...event, Image: 'older.jpg', channelId: firstCamera, nvrId: firstNvr, personPresent: true, severity: 'moderate',
        timeOfIncident: new Date('2026-06-25T10:00:00Z'), timeSeries: [{ zoneName: 'Desk A' }],
      },
      {
        ...event, Image: 'newer.jpg', channelId: secondCamera, nvrId: secondNvr, personPresent: false, severity: 'low',
        timeOfIncident: new Date('2026-06-25T10:01:00Z'), timeSeries: [{ zoneName: 'Desk B' }],
      },
    ]);

    for (const [sortField, firstImage, secondImage] of [
      ['status', 'newer.jpg', 'older.jpg'],
      ['severity', 'newer.jpg', 'older.jpg'],
      ['incidentTime', 'older.jpg', 'newer.jpg'],
      ['nvrName', 'newer.jpg', 'older.jpg'],
      ['channelName', 'newer.jpg', 'older.jpg'],
      ['zoneName', 'older.jpg', 'newer.jpg'],
    ]) {
      const first = await getLogs({ mode: 'images', limit: 1, sortField, sortOrder: 'asc' });
      const second = await getLogs({ mode: 'images', skip: 1, limit: 1, sortField, sortOrder: 'asc' });
      const reversed = await getLogs({ mode: 'images', limit: 1, sortField, sortOrder: 'desc' });
      expect(first.data.map((row) => row.Image), `${sortField} ascending, page 1`).toEqual([firstImage]);
      expect(second.data.map((row) => row.Image), `${sortField} ascending, page 2`).toEqual([secondImage]);
      expect(reversed.data.map((row) => row.Image), `${sortField} descending`).toEqual([secondImage]);
      if (sortField === 'severity') {
        expect(first.data[0].severity).toBe('low');
        expect(reversed.data[0].severity).toBe('moderate');
      }
    }
    for (const search of ['zulu camera', 'beta recorder', 'Desk A', 'moderate']) {
      const result = await getLogs({ mode: 'images', search, sortField: 'channelName', limit: 1 });
      expect(result).toMatchObject({ totalCount: 1, data: [{ Image: 'older.jpg' }] });
    }
  });

  it('returns graph data and an empty image list when the only image is on an unauthorized camera', async () => {
    const channelId = new mongoose.Types.ObjectId();
    const timeOfIncident = new Date('2026-06-25T10:00:00Z');
    const event = {
      userId: '100',
      incidentType: 'deskAbsence',
      timeOfIncident,
      timeSeries: [{ timestamp: timeOfIncident, zoneName: 'Desk A', personCount: 2 }],
    };
    await Incident.collection.insertMany([
      { ...event, channelId },
      { ...event, channelId: new mongoose.Types.ObjectId(), Image: 'private.jpg' },
    ]);

    const scope = { channels: [channelId] };
    const result = await getLogs({}, scope);
    expect(result).toMatchObject({ granularity: 'time', totalCount: 1 });
    expect(result.data[0].timeSeries).toMatchObject([{ personCount: 2, zoneName: 'Desk A' }]);
    expect(await getLogs({ mode: 'images' }, scope)).toEqual({
      mode: 'images',
      totalCount: 0,
      summary: { totalCount: 0, presentCount: 0, absentCount: 0 },
      data: [],
    });
  });
});
