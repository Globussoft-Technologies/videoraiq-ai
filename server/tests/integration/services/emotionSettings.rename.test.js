import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../dbSetup.js';
import { migrateEmotionSettings } from '../../../scripts/migrate-emotion-settings.js';

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => mongoose.connection.db.dropDatabase());
const OLD = 'emotionDetection';
const NEW = 'emotionDetectionSettings';
const db = () => mongoose.connection.db;

async function seed() {
  const adminId = new mongoose.Types.ObjectId();
  const cameraId = new mongoose.Types.ObjectId();
  const settingId = new mongoose.Types.ObjectId();
  const detection = { id: settingId, enabled: true, schedule: { mode: 'custom', timezone: 'Asia/Kolkata' }, overrideState: true };
  await db().collection('detectionsettings').insertOne({ _id: settingId, settingType: OLD, detectionType: OLD, settings: { zone_configs: [{ name: 'Reception', emotion_alert_groups: ['negative'] }] } });
  await db().collection('channels').insertOne({ _id: cameraId, detections: { [OLD]: detection, genderAgeDetectionSettings: { enabled: false } } });
  await db().collection('clientdetectionallocations').insertOne({ adminId, settingType: OLD, enabled: true, cameraAllocation: 3, cameraSelectionConfigured: true });
  await db().collection('clientcameradetections').insertOne({ adminId, cameraId, settingType: OLD, enabled: true });
  await db().collection('detectioncatalogs').insertOne({ settingType: OLD, name: 'Emotion Detection', active: true });
  await db().collection('admins').insertOne({ _id: adminId, detectionConfig: { [OLD]: 'Custom Emotion Label' } });
  await db().collection('globalschedules').insertOne({ detectors: [OLD, NEW, 'genderAgeDetectionSettings'] });
  await db().collection('livedemos').insertOne({ detections: { [OLD]: true }, sessionAnalytics: { byDetection: { [OLD]: { runs: 1, events: 2 } } } });
  await db().collection('incidents').insertOne({ incidentType: OLD, emotion: 'Sadness', channelId: cameraId });
  return { adminId, cameraId, settingId, detection };
}

describe('emotion setting key migration', () => {
  it('previews the rename without changing saved keys', async () => {
    await seed();
    const result = await migrateEmotionSettings(db());
    expect(result.modified).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(result.planned).toMatchObject({ channels: 1, detectionsettings: 1, clientdetectionallocations: 1 });
    expect(await db().collection('detectionsettings').countDocuments({ settingType: OLD })).toBe(1);
  });

  it('preserves settings, camera links, schedules and licenses and leaves incident contracts intact', async () => {
    const fixture = await seed();
    const result = await migrateEmotionSettings(db(), { apply: true });
    expect(result.modified).toBeGreaterThan(0);
    const setting = await db().collection('detectionsettings').findOne({ _id: fixture.settingId });
    expect(setting).toMatchObject({ settingType: NEW, detectionType: OLD });
    expect(setting.settings.zone_configs[0].emotion_alert_groups).toEqual(['negative']);
    const channel = await db().collection('channels').findOne({ _id: fixture.cameraId });
    expect(channel.detections[NEW]).toEqual(fixture.detection);
    expect(channel.detections).not.toHaveProperty(OLD);
    expect(channel.detections.genderAgeDetectionSettings.enabled).toBe(false);
    expect(await db().collection('clientdetectionallocations').findOne({ settingType: NEW })).toMatchObject({ enabled: true, cameraAllocation: 3, cameraSelectionConfigured: true });
    expect(await db().collection('clientcameradetections').findOne({ settingType: NEW })).toMatchObject({ cameraId: fixture.cameraId, enabled: true });
    expect((await db().collection('admins').findOne()).detectionConfig[NEW]).toBe('Custom Emotion Label');
    expect((await db().collection('globalschedules').findOne()).detectors).toEqual([NEW, 'genderAgeDetectionSettings']);
    const demo = await db().collection('livedemos').findOne();
    expect(demo.sessionAnalytics.byDetection[NEW]).toEqual({ runs: 1, events: 2 });
    expect(demo.detections[NEW]).toBe(true);
    expect(await db().collection('incidents').countDocuments({ incidentType: OLD })).toBe(1);
    expect((await migrateEmotionSettings(db(), { apply: true })).modified).toBe(0);
  });

  it('does not overwrite a canonical license or partially apply a conflicting rename', async () => {
    const { adminId } = await seed();
    await db().collection('clientdetectionallocations').insertOne({ adminId, settingType: NEW, enabled: false, cameraAllocation: 0 });
    expect((await migrateEmotionSettings(db())).conflicts).toHaveLength(1);
    await expect(migrateEmotionSettings(db(), { apply: true })).rejects.toThrow('no records changed');
    expect(await db().collection('detectionsettings').countDocuments({ settingType: OLD })).toBe(1);
    expect(await db().collection('clientdetectionallocations').findOne({ settingType: NEW })).toMatchObject({ enabled: false });
  });

  it('retires the old catalog entry when a canonical row has already been published', async () => {
    await seed();
    await db().collection('detectioncatalogs').insertOne({ settingType: NEW, name: 'Emotion Detection', active: true });
    await migrateEmotionSettings(db(), { apply: true });
    expect(await db().collection('detectioncatalogs').findOne({ settingType: OLD })).toMatchObject({ active: false });
    expect(await db().collection('detectioncatalogs').findOne({ settingType: NEW })).toMatchObject({ active: true });
  });
});
