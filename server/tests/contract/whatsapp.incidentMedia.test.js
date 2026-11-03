import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { connectMongo, disconnectMongo, clearCollections } from '../integration/dbSetup.js';
vi.mock('../../core/v2/adminStorage/mediaStorage.v2.js', () => ({ streamMediaV2: vi.fn() }));
const { streamMediaV2 } = await import('../../core/v2/adminStorage/mediaStorage.v2.js');
const { prepareIncidentImage, serveIncidentImage } = await import('../../core/v2/whatsapp/whatsapp.incidentMedia.js');
const { default: Admin } = await import('../../core/v2/admin/admin.model.js');
const { Incident } = await import('../../core/v2/incidents/incidents.model.js');
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
let admin, incident, app;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections(); vi.resetAllMocks();
  admin = await Admin.create({ user_id: 'signed-owner', login: 'signed-owner', email: 'signed@test.com' });
  incident = await Incident.create({ userId: 'signed-owner', timeOfIncident: new Date(),
    channelId: '6ad9fdcac5ffd0d7c6588e7a', nvrId: '6ad9fdcac5ffd0d7c6588e7b',
    Image: '/mnt/nfs/emp-cctv-dev-media/uploads/images/crowd/snapshot.jpg' });
  streamMediaV2.mockImplementation(async (path, output) => { output.end(jpeg); });
  app = express(); app.get('/api/v2/whatsapp/incident-image/:incidentId', serveIncidentImage);
});
const requestPath = url => new URL(url).pathname + new URL(url).search;
describe('WhatsApp incident image transport', () => {
  it('reads owned storage bytes and issues a login-free signed link for only that image', async () => {
    const media = await prepareIncidentImage(incident._id, admin._id);
    expect(media.buffer).toEqual(jpeg);
    expect(media.mimetype).toBe('image/jpeg');
    expect(streamMediaV2).toHaveBeenCalledWith(incident.Image, expect.anything(), expect.objectContaining({ signal: expect.anything() }));
    const response = await request(app).get(requestPath(media.url));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(response.body).toEqual(jpeg);
  });
  it('rejects expired, forged, and absent image signatures', async () => {
    const media = await prepareIncidentImage(incident._id, admin._id);
    const url = new URL(media.url);
    url.searchParams.set('expires', '1');
    expect((await request(app).get(requestPath(url))).status).toBe(403);
    url.search = new URL(media.url).search;
    url.searchParams.set('signature', '0'.repeat(64));
    expect((await request(app).get(requestPath(url))).status).toBe(403);
    expect((await request(app).get(url.pathname)).status).toBe(403);
  });
  it('binds the signature to the incident and stored path', async () => {
    const media = await prepareIncidentImage(incident._id, admin._id);
    await Incident.updateOne({ _id: incident._id }, { $set: { Image: '/uploads/images/other.jpg' } });
    expect((await request(app).get(requestPath(media.url))).status).toBe(403);
  });
  it('refuses another account’s incident and another account’s v2 storage key', async () => {
    const other = await Admin.create({ user_id: 'other', login: 'other', email: 'other@test.com' });
    await expect(prepareIncidentImage(incident._id, other._id)).rejects.toThrow('unavailable for this account');
    await Incident.updateOne({ _id: incident._id }, { $set: { Image: `/v2/${other._id}/env/nas/uploads/images/crowd/a.jpg` } });
    await expect(prepareIncidentImage(incident._id, admin._id)).rejects.toThrow('another account');
    expect(streamMediaV2).not.toHaveBeenCalled();
  });
  it('never fetches arbitrary external URLs or traversal paths', async () => {
    for (const image of ['http://169.254.169.254/latest/meta-data', '/uploads/../private/photo.jpg']) {
      await Incident.updateOne({ _id: incident._id }, { $set: { Image: image } });
      await expect(prepareIncidentImage(incident._id, admin._id)).rejects.toThrow();
    }
    expect(streamMediaV2).not.toHaveBeenCalled();
  });
  it('rejects non-image and oversized image bytes before uploading to Meta', async () => {
    streamMediaV2.mockImplementation(async (path, output) => { output.end(Buffer.from('not an image')); });
    await expect(prepareIncidentImage(incident._id, admin._id)).rejects.toThrow('not a JPEG or PNG');
    streamMediaV2.mockImplementation(async (path, output) => {
      await new Promise((resolve, reject) => { output.on('error', reject); output.on('finish', resolve); output.end(Buffer.alloc(5 * 1024 * 1024 + 1)); });
    });
    await expect(prepareIncidentImage(incident._id, admin._id)).rejects.toThrow('exceeds 5 MB');
  });
});
