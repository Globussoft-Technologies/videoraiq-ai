import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { connectMongo, disconnectMongo, clearCollections } from '../dbSetup.js';
import { serviceCtx } from '../../helpers/service.js';

vi.mock('axios', () => ({ default: { post: vi.fn().mockResolvedValue({ data: { ok: true } }) } }));
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn() }));
vi.mock('../../../services/python.service.js', () => ({ default: {
  handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
} }));
vi.mock('../../../mailService/mail.helper.js', () => ({ default: { vehicleCheckInOut: vi.fn() } }));
vi.mock('../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js', () => ({ sendIncidentWhatsApp: vi.fn() }));

const { default: SettingsService } = await import('../../../core/v2/detectionSettings/detectionSettings.service.js');
const { vehicleCheckInOutDetectionSetting: Setting } = await import('../../../core/v2/detectionSettings/detectionSettings.model.js');
const { VehicleCheckInOutIncident: Incident } = await import('../../../core/v2/incidents/incidents.model.js');
const { default: Admin } = await import('../../../core/v2/admin/admin.model.js');
const { default: DetectionAllocation } = await import('../../../core/v2/clientConfig/clientDetectionAllocation.model.js');
const { default: Channel } = await import('../../../core/v2/channels/channels.model.js');
const { default: NVR } = await import('../../../core/v2/NVR/nvr.model.js');
const { triggerAlertOnIncident } = await import('../../../core/v2/alerts/alert.events.js');
const { triggerAlertOnIncident: triggerV1Alert } = await import('../../../core/v1/alerts/alert.events.js');
const { default: TelegramService } = await import('../../../services/telegram.service.js');
const { default: axios } = await import('axios');
await import('../../../core/v1/profiles/profiles.model.js');
await import('../../../core/v1/authorizedUsers/authorizedUsers.model.js');

let admin, channel, nvr, setting, jobs;
const zone = (name, chatIds, startTime = '09:00 AM', endTime = '06:00 PM') => ({
  name, telegramChatIds: chatIds, telegramChatId: chatIds[0] || null, startTime, endTime,
});

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  jobs = [];
  axios.post.mockClear();
  // Capture jobs locally: these tests never contact Telegram or send real alerts.
  vi.spyOn(TelegramService, '_enqueue').mockImplementation((chat, job) => jobs.push(job));
  admin = await Admin.create({
    user_id: 'vehicle-telegram-test', login: 'vehicle-telegram-test', email: 'vehicle-telegram@test.invalid',
    timezone: 'Asia/Kolkata', emailAlertsEnabled: false, telegramAlertsEnabled: true, purchasedCameras: 10,
    telegramChannels: [
      { chatId: '-1001', channelName: 'Gate alerts', active: true },
      { chatId: '-1002', channelName: 'Security alerts', active: true },
      { chatId: '-1003', channelName: 'Other alerts', active: true },
      { chatId: '-1004', channelName: 'Disconnected', active: false },
    ],
  });
  await DetectionAllocation.create({ adminId: admin._id, settingType: 'vehicleCheckInOutSettings', enabled: true, cameraAllocation: 10 });
  nvr = await NVR.create({ userId: admin.user_id, nvrName: 'Gate NVR', brand: 'hikvision', domain: 'http://nvr.test', location: 'Gate', localNvrId: 'telegram-test' });
  channel = await Channel.create({ userId: admin.user_id, nvrId: nvr._id, streamingPath: '/Streaming/Channels/101', localChannelId: '1', name: 'Gate camera', isAdded: true });
  const result = await SettingsService.constructor.saveDetectionSettings({
    userId: admin.user_id, name: 'Gate check-in and check-out', settingType: 'vehicleCheckInOutSettings', enabled: false,
    channelId: [String(channel._id)], NVRId: String(nvr._id), alerts: [],
    settings: {
      telegramChatIds: ['-1001', '-1002'], telegramChatId: '-1001',
      zone_configs: [zone('Gate polygon', ['-1001', '-1002'])],
      referencePoints: { [String(channel._id)]: [[[0, 0], [100, 0], [100, 100]]] },
      line_coordinates: [[0, 50], [100, 50]], inside_reference_point: [50, 75],
      zone_name: 'Gate crossing line', count_mode: 'all', camType: ['checkin', 'checkout'],
    },
  });
  expect(result.saved).toHaveLength(1);
  setting = await Setting.findById(result.saved[0].detection._id);
});
afterEach(() => vi.restoreAllMocks());

describe.each([['v1', triggerV1Alert], ['v2', triggerAlertOnIncident]])('%s vehicle check-in/out Telegram settings and delivery', (_version, trigger) => {
  const alert = async ({ checkin = true, zone: zoneName = 'Gate polygon', timeOfIncident = '2026-09-09T06:30:00Z' } = {}) => {
    const incident = await Incident.create({
      userId: admin.user_id, channelId: channel._id, nvrId: nvr._id, checkin,
      timeOfIncident, zone: zoneName, vehicleNumber: 'KA01AB1234', Image: 'gate/snapshot.jpg',
    });
    await trigger({ detectionType: 'vehicleCheckInOut', channelId: channel._id, nvrId: nvr._id, saved: incident.toObject(), adminId: admin._id });
  };
  it.each([true, false])('persists settings and routes checkin=%s to every selected linked channel', async (checkin) => {
    expect(setting.settings.zone_configs[0].telegramChatIds).toEqual(['-1001', '-1002']);
    expect(setting.settings.zone_configs[0].startTime).toBe('09:00 AM');
    expect(setting.settings.count_mode).toBe('all');
    expect(setting.settings.line_coordinates).toEqual([[0, 50], [100, 50]]);
    await alert({ checkin });
    expect(jobs.map((job) => job.chat)).toEqual(['-1001', '-1002']);
    for (const job of jobs) await TelegramService._deliver(job);
    expect(axios.post).toHaveBeenCalledTimes(2);
    for (const [, body] of axios.post.mock.calls) {
      expect(body.caption).toContain(checkin ? '*Direction:* CHECK\\-IN' : '*Direction:* CHECK\\-OUT');
      expect(body.caption).toContain('KA01AB1234');
      expect(body.caption).toContain('GATE CHECK\\-IN AND CHECK\\-OUT');
      expect(body.photo).toContain('gate/snapshot.jpg');
    }
  });

  it('updates selected channels and preserves check-in/out geometry', async () => {
    const settings = { ...setting.settings.toObject(), telegramChatIds: ['-1003'], telegramChatId: '-1003', zone_configs: [zone('Gate polygon', ['-1003'])] };
    const { req, res, next } = serviceCtx({ user_id: admin.user_id, params: { id: String(setting._id) }, body: { settings } });
    await SettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Setting.findById(setting._id);
    expect(reloaded.settings.telegramChatIds).toEqual(['-1003']);
    expect(reloaded.settings.line_coordinates).toEqual([[0, 50], [100, 50]]);
    await alert();
    expect(jobs.map((job) => job.chat)).toEqual(['-1003']);
  });

  it('clearing channels stops alerts instead of restoring an old/default channel', async () => {
    const settings = { ...setting.settings.toObject(), telegramChatIds: [], telegramChatId: null, zone_configs: [zone('Gate polygon', [], null, null)] };
    const { req, res, next } = serviceCtx({ user_id: admin.user_id, params: { id: String(setting._id) }, body: { settings } });
    await SettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Setting.findById(setting._id);
    expect(reloaded.settings.telegramChatIds).toEqual([]);
    expect(reloaded.settings.telegramChatId).toBeNull();
    await alert();
    expect(jobs).toEqual([]);
  });

  it('honors the admin timezone and sends nothing outside the selected schedule', async () => {
    await alert({ timeOfIncident: '2026-09-09T15:30:00Z' }); // 9 PM in Kolkata
    expect(jobs).toEqual([]);
  });

  it('a line-level event reaches eligible zones, without duplicate or out-of-window recipients', async () => {
    setting.settings.zone_configs = [zone('Zone A', ['-1001', '-1002']), zone('Zone B', ['-1002']), zone('Night zone', ['-1003'], '08:00 PM', '11:59 PM')];
    await setting.save();
    await alert({ zone: 'Gate crossing line' });
    expect(jobs.map((job) => job.chat)).toEqual(['-1001', '-1002']);
  });

  it('a matched zone does not inherit another zone selection', async () => {
    setting.settings.zone_configs = [zone('Zone A', [], null, null), zone('Zone B', ['-1002'])];
    await setting.save();
    await alert({ zone: 'Zone A' });
    expect(jobs).toEqual([]);
  });

  it('a line-level event outside every zone schedule does not fall back to detection channels', async () => {
    setting.settings.zone_configs = [zone('Zone A', ['-1001']), zone('Zone B', ['-1002'])];
    await setting.save();
    await alert({ zone: 'Gate crossing line', timeOfIncident: '2026-09-09T15:30:00Z' });
    expect(jobs).toEqual([]);
  });

  it('retains legacy detection-wide channel selections when no zone configs exist', async () => {
    setting.settings.zone_configs = [];
    await setting.save();
    await alert();
    expect(jobs.map((job) => job.chat)).toEqual(['-1001', '-1002']);
  });

  it('filters disconnected/unlinked channels and respects the global Telegram switch', async () => {
    setting.settings.zone_configs = [zone('Gate polygon', ['-1001', '-1004', '-9999'])];
    await setting.save();
    await alert();
    expect(jobs.map((job) => job.chat)).toEqual(['-1001']);
    jobs.length = 0;
    await Admin.updateOne({ _id: admin._id }, { $set: { telegramAlertsEnabled: false } });
    await alert();
    expect(jobs).toEqual([]);
  });
});
