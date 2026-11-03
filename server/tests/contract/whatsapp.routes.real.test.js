import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { connectMongo, disconnectMongo, clearCollections } from '../integration/dbSetup.js';
vi.mock('../../core/v2/whatsapp/whatsapp.incidentMedia.js', () => ({ prepareIncidentImage: vi.fn(), serveIncidentImage: (req, res) => res.sendStatus(404) }));
vi.mock('axios', () => ({ default: vi.fn() }));
// Isolate contract cases from the shared IP counter; production limiting stays enabled.
vi.mock('express-rate-limit', () => ({ default: () => (req, res, next) => next() }));
vi.mock('../../middlewares/verifyToken.js', () => ({ default: (req, res, next) => {
  req.verified = { userData: { adminId: globalThis.__WA_ADMIN_ID__, memberId: req.get('x-test-member') || undefined } }; next();
} }));
const { default: express } = await import('express');
const { default: routes } = await import('../../core/v2/whatsapp/whatsapp.routes.js');
const { default: axios } = await import('axios');
const { default: Admin } = await import('../../core/v1/admin/admin.model.js');
const { WhatsAppSettings, WhatsAppDelivery } = await import('../../core/v2/whatsapp/whatsapp.model.js');
const { sendIncidentWhatsApp } = await import('../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js');
const { FireSmokeDetectionSetting } = await import('../../core/v2/detectionSettings/detectionSettings.model.js');
const { supportedTemplate, sendTemplateAlert } = await import('../../core/v2/whatsapp/whatsapp.service.js');
const { FALLBACK_TEMPLATE_NAME, FALLBACK_TEMPLATE_BODY, DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE, DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_EXAMPLE, buildDefaultTemplateValues } = await import('../../core/v2/whatsapp/whatsapp.defaultTemplate.js');
const { prepareIncidentImage } = await import('../../core/v2/whatsapp/whatsapp.incidentMedia.js');
const { default: SharedSender } = await import('../../core/v2/whatsapp/whatsapp.sharedSender.model.js');
const { encryptData } = await import('../../utils/cryptoUtils.js');
let app, admin;
const template = { id: 'template1', name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE, status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: DEFAULT_TEMPLATE_BODY }] };
const textTemplate = { ...template, id: 'text-template', name: FALLBACK_TEMPLATE_NAME, components: [{ type: 'BODY', text: FALLBACK_TEMPLATE_BODY }] };
const settings = { phoneNumberId: '1234567', businessAccountId: '7654321', apiVersion: 'v24.0', accessToken: 'secret-test-access-token', appSecret: 'secret-test-app-secret' };
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections(); vi.resetAllMocks();
  prepareIncidentImage.mockResolvedValue({ buffer: Buffer.from([255,216,255,217]), mimetype: 'image/jpeg', url: 'https://media.example.com/signed-incident.jpg' });
  admin = await Admin.create({ user_id: 'wa-test', login: 'wa-test', email: 'wa@test.com' });
  globalThis.__WA_ADMIN_ID__ = String(admin._id);
  app = express(); app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } })); app.use('/whatsapp', routes);
  axios.mockImplementation(async options => {
    if (options.url.endsWith('/phone_numbers')) return { data: { data: [{ id: settings.phoneNumberId }] } };
    if (options.url.endsWith('/message_templates')) return { data: { data: [template] } };
    if (options.url.endsWith('/media')) return { data: { id: 'media-test' } };
    if (options.url.endsWith('/messages')) return { data: { messages: [{ id: 'wamid.test' }] } };
    return { data: { id: settings.phoneNumberId } };
  });
});
async function configure() {
  const response = await request(app).put('/whatsapp/settings').send(settings);
  expect(response.status).toBe(200); return response;
}
async function enable() {
  await configure();
  const response = await request(app).put('/whatsapp/template').send({ name: template.name, language: template.language });
  expect(response.status).toBe(200);
}
describe('WhatsApp alert configuration', () => {
  it('encrypts credentials and never exposes secrets in settings responses', async () => {
    const response = await configure();
    expect(JSON.stringify(response.body)).not.toContain(settings.accessToken);
    expect(JSON.stringify(response.body)).not.toContain(settings.appSecret);
    const stored = await WhatsAppSettings.findOne({ adminId: admin._id }).select('+credentials');
    expect(stored.credentials).not.toContain(settings.accessToken);
    const read = await request(app).get('/whatsapp/settings');
    expect(read.body).not.toHaveProperty('credentials');
    expect(read.body).not.toHaveProperty('webhookVerifyToken');
    expect(read.body.enabled).toBe(false);
  });
  it('rejects member configuration and isolates another account', async () => {
    expect((await request(app).put('/whatsapp/settings').set('x-test-member', 'member').send(settings)).status).toBe(403);
    await configure();
    const other = await Admin.create({ user_id: 'wa-other', login: 'wa-other', email: 'other@wa.com' });
    globalThis.__WA_ADMIN_ID__ = String(other._id);
    expect((await request(app).get('/whatsapp/settings')).body.configured).toBe(false);
    expect((await request(app).get('/whatsapp/deliveries')).status).toBe(404);
  });
  it('rejects a sender from another business account', async () => {
    axios.mockResolvedValue({ data: { id: 'other', data: [] } });
    expect((await request(app).put('/whatsapp/settings').send(settings)).status).toBe(400);
    expect(await WhatsAppSettings.countDocuments()).toBe(0);
  });
  it('submits both fixed templates, uploads only the bundled image, and avoids duplicate submissions', async () => {
    await configure();
    const submitted = [];
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/message_templates') && options.method === 'get') return { data: { data: submitted.map(name => ({ ...(name === DEFAULT_TEMPLATE_NAME ? template : textTemplate), status: 'PENDING' })) } };
      if (options.url.endsWith('/message_templates') && options.method === 'post') { submitted.push(options.data.name); return { data: { id: 'template1' } }; }
      if (options.url.endsWith('/app/uploads')) return { data: { id: 'upload:123' } };
      if (options.url.includes('/upload:123')) return { data: { h: '4:bundled-sample' } };
      return { data: {} };
    });
    const response = await request(app).post('/whatsapp/templates').send({});
    expect(response.status).toBe(200);
    expect(response.body.defaultTemplate.status).toBe('PENDING');
    expect(response.body.enabled).toBe(false);
    const payload = axios.mock.calls.find(([options]) => options.method === 'post' && options.url.endsWith('/message_templates'))[0].data;
    expect(payload).toMatchObject({ name: DEFAULT_TEMPLATE_NAME, language: 'en_US', components: [
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4:bundled-sample'] } },
      { type: 'BODY', text: DEFAULT_TEMPLATE_BODY, example: { body_text: [DEFAULT_TEMPLATE_EXAMPLE] } },
    ] });
    const upload = axios.mock.calls.find(([options]) => options.url.includes('/upload:123'))[0];
    expect(Buffer.isBuffer(upload.data)).toBe(true);
    expect(upload.data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await request(app).post('/whatsapp/templates').send({});
    expect(axios.mock.calls.filter(([options]) => options.method === 'post' && options.url.endsWith('/message_templates'))).toHaveLength(2);
    const textPayload = axios.mock.calls.find(([options]) => options.method === 'post' && options.data?.name === FALLBACK_TEMPLATE_NAME)[0].data;
    expect(textPayload.components).toEqual([{ type: 'BODY', text: FALLBACK_TEMPLATE_BODY, example: { body_text: [DEFAULT_TEMPLATE_EXAMPLE.filter((_, index) => index !== 8)] } }]);
    expect(response.body.defaultTemplate.fallback.status).toBe('PENDING');
    axios.mockResolvedValue({ data: { data: [template] } });
    const synced = await request(app).post('/whatsapp/templates/sync').send({});
    expect(synced.body).toMatchObject({ enabled: true, selectedTemplate: { name: DEFAULT_TEMPLATE_NAME, language: 'en_US' } });
  });
  it('rejects custom template requests, uploads, and selection', async () => {
    await configure();
    expect((await request(app).post('/whatsapp/templates').send({ name: 'custom_alert', language: 'en_US' })).status).toBe(400);
    expect((await request(app).post('/whatsapp/templates/sample').send({})).status).toBe(404);
    expect((await request(app).put('/whatsapp/template').send({ name: 'custom_alert', language: 'en_US' })).status).toBe(400);
    expect(supportedTemplate({ ...template, name: 'custom_alert' })).toBe(false);
    expect(supportedTemplate({ ...template, components: [{ type: 'BODY', text: DEFAULT_TEMPLATE_BODY }] })).toBe(false);
    expect(supportedTemplate({ ...template, components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Wrong {{1}}' }] })).toBe(false);
    axios.mockResolvedValue({ data: { data: [{ ...template, status: 'PENDING' }] } });
    expect((await request(app).put('/whatsapp/enabled').send({ enabled: true })).status).toBe(400);
  });
  it('preserves a manual pause across sync and explicitly resumes only the approved default', async () => {
    await enable();
    await request(app).put('/whatsapp/enabled').send({ enabled: false });
    expect((await request(app).post('/whatsapp/templates/sync').send({})).body.enabled).toBe(false);
    expect((await request(app).put('/whatsapp/enabled').send({ enabled: true })).body.enabled).toBe(true);
    axios.mockResolvedValue({ data: { data: [{ ...template, name: 'unrelated_template' }] } });
    expect((await request(app).post('/whatsapp/templates/sync').send({})).body.enabled).toBe(false);
  });
  it('requires recipient consent and sends approved template payloads', async () => {
    await enable();
    expect((await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: false })).status).toBe(400);
    const added = await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: true });
    const recipientId = added.body.recipients[0]._id;
    const sent = await request(app).post('/whatsapp/test').send({ recipientId });
    expect(sent.status).toBe(200);
    expect(sent.body.results[0].status).toBe('accepted');
    const call = axios.mock.calls.find(([options]) => options.url.endsWith('/messages'))[0];
    expect(call.data).toMatchObject({ to: '919999999999', type: 'template', template: { name: template.name, language: { code: 'en_US' } } });
    expect(call.data.template.components[0].parameters[0].image).toEqual({ id: 'media-test' });
    expect(call.data.template.components[1].parameters).toHaveLength(10);
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
    await request(app).put('/whatsapp/enabled').send({ enabled: false });
    expect(await sendTemplateAlert(admin._id, {}, ['+919999999999'])).toEqual([]);
  });
  it('routes incidents to the configured account recipients even without legacy phone selections', async () => {
    await enable();
    await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: true });
    const result = await sendIncidentWhatsApp({ incidentName: 'Fire', severity: 'high', Image: 'https://media.example.com/fire.jpg' }, [], {}, {}, 'UTC', admin._id);
    expect(result[0].status).toBe('accepted');
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(1);
  });
  it('pauses alerts when template approval is revoked on sync', async () => {
    await enable();
    axios.mockResolvedValue({ data: { data: [{ ...template, status: 'REJECTED' }] } });
    const response = await request(app).post('/whatsapp/templates/sync').send({});
    expect(response.body.enabled).toBe(false);
  });
  it('sends zone alerts only to selected opted-in recipients using the shared template', async () => {
    await enable();
    const first = (await request(app).post('/whatsapp/recipients').send({ name: 'Security', phone: '+919999999999', optedIn: true })).body.recipients[0];
    await request(app).post('/whatsapp/recipients').send({ name: 'Maintenance', phone: '+918888888888', optedIn: true });
    const options = await request(app).get('/whatsapp/recipient-options').set('x-test-member', 'member');
    expect(options.status).toBe(200);
    expect(options.body.recipients.map(item => item.name)).toEqual(['Security', 'Maintenance']);
    expect(options.body).not.toHaveProperty('credentials');
    const result = await sendIncidentWhatsApp({ incidentName: 'Fire', Image: 'https://media.example.com/fire.jpg' }, [], {}, {}, 'UTC', admin._id, [String(first._id), 'foreign-recipient']);
    expect(result).toHaveLength(1);
    const sends = axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'));
    expect(sends).toHaveLength(1);
    expect(sends[0][0].data).toMatchObject({ to: '919999999999', template: { name: template.name } });
    expect(await sendIncidentWhatsApp({}, [], {}, {}, 'UTC', admin._id, [])).toEqual([]);
    await request(app).delete(`/whatsapp/recipients/${first._id}`);
    expect(await sendIncidentWhatsApp({}, [], {}, {}, 'UTC', admin._id, [String(first._id)])).toEqual([]);
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(1);
  });
  it('persists zone recipients while preserving explicit disabled and legacy zones', async () => {
    await configure();
    const added = await request(app).post('/whatsapp/recipients').send({ name: 'Security', phone: '+919999999999', optedIn: true });
    const recipientId = added.body.recipients[0]._id;
    const setting = await FireSmokeDetectionSetting.create({ userId: String(admin._id), name: 'Fire zones', enabled: true,
      settings: { zone_configs: [{ name: 'North', whatsappRecipientIds: [recipientId] }, { name: 'South', whatsappRecipientIds: [] }, { name: 'Legacy' }] } });
    const saved = await FireSmokeDetectionSetting.findById(setting._id).lean();
    expect(saved.settings.zone_configs[0].whatsappRecipientIds.map(String)).toEqual([recipientId]);
    expect(saved.settings.zone_configs[1].whatsappRecipientIds).toEqual([]);
    expect(saved.settings.zone_configs[2].whatsappRecipientIds).toBeUndefined();
  });
  it('verifies callbacks without storing delivery updates', async () => {
    await enable();
    const details = (await request(app).get('/whatsapp/webhook-config')).body;
    const challenge = await request(app).get(`/whatsapp/webhook/${admin._id}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': details.verifyToken, 'hub.challenge': '123' });
    expect(challenge.text).toBe('123');
    const body = { entry: [{ id: settings.businessAccountId, changes: [{ value: { metadata: { phone_number_id: settings.phoneNumberId }, statuses: [{ id: 'wamid.test', status: 'delivered', timestamp: '2000' }] } }] }] };
    const raw = JSON.stringify(body);
    expect((await request(app).post(`/whatsapp/webhook/${admin._id}`).send(body)).status).toBe(403);
    const signature = 'sha256=' + createHmac('sha256', settings.appSecret).update(raw).digest('hex');
    expect((await request(app).post(`/whatsapp/webhook/${admin._id}`).set('x-hub-signature-256', signature).set('Content-Type', 'application/json').send(raw)).status).toBe(200);
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
  });
  it('sends dynamic incident fields and the live snapshot without a fallback or delivery storage', async () => {
    await enable();
    const incident = { incidentType: 'deskAbsence', incidentName: 'DMA-Cabin desk absence', severity: 'moderate',
      timeOfIncident: '2026-09-22T14:30:30Z', zone: 'DA', description: '2 persons missing\nfrom DA', Image: 'https://media.example.com/incident.jpg' };
    const result = await sendTemplateAlert(admin._id, incident, ['+919999999999'], { nvrName: 'NVR12' }, { customName: 'DMA-CABIN (CAM -02)' }, 'Asia/Kolkata');
    expect(result[0].status).toBe('accepted');
    const payload = axios.mock.calls.find(([options]) => options.url.endsWith('/messages'))[0].data;
    expect(payload.template.name).toBe(DEFAULT_TEMPLATE_NAME);
    expect(payload.template.components[0].parameters[0].image).toEqual({ id: 'media-test' });
    expect(prepareIncidentImage).toHaveBeenCalledWith(incident._id, admin._id);
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/media'))).toHaveLength(1);
    const values = payload.template.components[1].parameters.map(item => item.text);
    expect(values).toEqual([expect.stringContaining('DESK'), 'DMA-CABIN DESK ABSENCE', 'TUESDAY', '9/22/2026, 8:00:30 PM', 'MODERATE', 'DMA-CABIN (CAM -02)', 'NVR12', 'DA', 'https://media.example.com/signed-incident.jpg', '2 PERSONS MISSING FROM DA']);
    expect(values.every(value => !/[\r\n\t]/.test(value))).toBe(true);
    const missing = await sendTemplateAlert(admin._id, {}, ['+919999999999']);
    expect(missing[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Incident image is missing') });
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(1);
    axios.mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Unknown delivery outcome' });
    expect((await sendTemplateAlert(admin._id, incident, ['+919999999999']))[0].status).toBe('failed');
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(1);
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
  });
  it('bounds long dynamic fields without truncating the image URL', () => {
    const image = 'https://media.example.com/snapshot.jpg';
    const values = buildDefaultTemplateValues({ Image: image, description: 'long description '.repeat(500), incidentName: 'name'.repeat(100) });
    expect(values[8]).toBe(image);
    expect(DEFAULT_TEMPLATE_BODY.replace(/\{\{(\d+)\}\}/g, (_, index) => values[Number(index) - 1]).length).toBeLessThanOrEqual(1024);
  });
  it('sends hello_world only through the sample action while live alerts remain paused', async () => {
    await configure();
    const added = await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: true });
    const sample = { name: 'hello_world', language: 'en_US', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello world' }] };
    axios.mockImplementation(async options => ({ data: options.url.endsWith('/message_templates') ? { data: [sample] } : { messages: [{ id: 'wamid.sample' }] } }));
    const response = await request(app).post('/whatsapp/test-sample').send({ recipientId: added.body.recipients[0]._id });
    expect(response.status).toBe(200);
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
    const sent = axios.mock.calls.find(([options]) => options.url.endsWith('/messages'))[0];
    expect(sent.data.template).toEqual({ name: 'hello_world', language: { code: 'en_US' } });
    expect((await WhatsAppSettings.findOne({ adminId: admin._id })).enabled).toBe(false);
    expect((await request(app).put('/whatsapp/template').send({ name: 'hello_world', language: 'en_US' })).status).toBe(400);
  });
  it('returns the Meta send error without storing delivery records', async () => {
    await enable();
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/media')) return { data: { id: 'incident-media-id' } };
      throw { response: { data: { error: { code: 131030, message: 'Recipient is not in allowed list' } } } };
    });
    const result = await sendTemplateAlert(admin._id, { Image: 'https://media.example.com/incident.jpg' }, ['+919999999999']);
    expect(result[0]).toMatchObject({ status: 'failed', error: 'Recipient is not in allowed list' });
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
  });
  it('uses the approved text fallback for missing or unreadable snapshots, and retries only definite media rejections', async () => {
    await enable();
    let failure;
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/message_templates')) return { data: { data: [template, textTemplate] } };
      if (options.url.endsWith('/media')) return { data: { id: 'snapshot-media' } };
      if (options.url.endsWith('/messages')) {
        if (options.data.template.name === DEFAULT_TEMPLATE_NAME && failure) throw failure;
        return { data: { messages: [{ id: 'wamid.fallback' }] } };
      }
      return { data: {} };
    });
    expect((await request(app).post('/whatsapp/templates/sync').send({})).body.fallbackTemplate.name).toBe(FALLBACK_TEMPLATE_NAME);
    const incident = { incidentName: 'Fire', description: 'Smoke detected', severity: 'high' };
    expect((await sendTemplateAlert(admin._id, incident, ['+919999999999']))[0].status).toBe('accepted');
    let sent = axios.mock.calls.filter(([options]) => options.url.endsWith('/messages')).at(-1)[0].data.template;
    expect(sent.name).toBe(FALLBACK_TEMPLATE_NAME);
    expect(sent.components).toHaveLength(1);
    expect(sent.components[0].parameters).toHaveLength(9);
    expect(sent.components[0].parameters[8].text).toBe('SMOKE DETECTED');
    prepareIncidentImage.mockRejectedValueOnce(new Error('File not found in storage'));
    expect((await sendTemplateAlert(admin._id, { ...incident, Image: '/missing.jpg' }, ['+919999999999']))[0].status).toBe('accepted');
    failure = { response: { data: { error: { code: 131052, message: 'Media unavailable' } } } };
    expect((await sendTemplateAlert(admin._id, { ...incident, Image: '/photo.jpg' }, ['+919999999999']))[0].status).toBe('accepted');
    sent = axios.mock.calls.filter(([options]) => options.url.endsWith('/messages')).at(-1)[0].data.template;
    expect(sent.name).toBe(FALLBACK_TEMPLATE_NAME);
    const before = axios.mock.calls.filter(([options]) => options.url.endsWith('/messages')).length;
    failure = { code: 'ETIMEDOUT', message: 'Unknown send outcome' };
    expect((await sendTemplateAlert(admin._id, { ...incident, Image: '/photo.jpg' }, ['+919999999999']))[0].status).toBe('failed');
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(before + 1);
    expect(await WhatsAppDelivery.countDocuments()).toBe(0);
  });
  it('can send text alerts when only the text default is approved', async () => {
    await configure();
    axios.mockImplementation(async options => ({ data: options.url.endsWith('/message_templates') ? { data: [textTemplate] } : { messages: [{ id: 'wamid.text-only' }] } }));
    const synced = await request(app).post('/whatsapp/templates/sync').send({});
    expect(synced.body).toMatchObject({ enabled: true, selectedTemplate: { name: FALLBACK_TEMPLATE_NAME } });
    expect((await sendTemplateAlert(admin._id, { description: 'No snapshot' }, ['+919999999999']))[0].status).toBe('accepted');
    expect(prepareIncidentImage).not.toHaveBeenCalled();
  });
  it('creates owner-named shared-key requests and rejects duplicates or member requests', async () => {
    const requested = await request(app).post('/whatsapp/shared-key-request').send({ type: 'enable' });
    expect(requested.status).toBe(200);
    expect(requested.body).toMatchObject({ credentialSource: 'own', sharedKeyRequest: { type: 'enable', status: 'pending', adminName: 'wa-test' } });
    expect((await request(app).post('/whatsapp/shared-key-request').send({ type: 'enable' })).status).toBe(409);
    expect((await request(app).post('/whatsapp/shared-key-request').set('x-test-member', 'member').send({ type: 'enable' })).status).toBe(403);
    expect((await request(app).post('/whatsapp/shared-key-request').send({ type: 'cancel' })).status).toBe(409);
  });
  it('uses the centrally managed sender and templates without exposing or copying keys into tenant settings', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1111111'); vi.stubEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', '2222222');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'shared-env-token'); vi.stubEnv('WHATSAPP_APP_SECRET', 'shared-env-secret');
    try {
      await configure();
      await SharedSender.create({ _id: 'default', verifiedAt: new Date(), phoneNumberId: '1111111', businessAccountId: '2222222', apiVersion: 'v24.0', templates: [template], credentials: encryptData({ accessToken: 'shared-db-token', appSecret: 'shared-db-secret' }) });
      const own = (await WhatsAppSettings.findOne({ adminId: admin._id }).select('+credentials')).credentials;
      await WhatsAppSettings.updateOne({ adminId: admin._id }, { $set: { credentialSource: 'env', templates: [], enabled: false } });
      const read = await request(app).get('/whatsapp/settings');
      expect(read.body).toMatchObject({ credentialSource: 'env', configured: true });
      expect(read.body).not.toHaveProperty('phoneNumberId');
      expect(JSON.stringify(read.body)).not.toMatch(/shared-env-token|shared-env-secret|shared-db-token|shared-db-secret/);
      expect((await request(app).put('/whatsapp/settings').send(settings)).status).toBe(409);
      const synced = await request(app).post('/whatsapp/templates/sync').send({});
      expect(synced.body.enabled).toBe(true);
      expect(axios.mock.calls.some(([options]) => options.url.endsWith('/2222222/message_templates'))).toBe(false);
      expect((await request(app).post('/whatsapp/templates').send({})).status).toBe(403);
      const added = await request(app).post('/whatsapp/recipients').send({ name: 'Security', phone: '+919999999999', optedIn: true });
      expect((await request(app).post('/whatsapp/test').send({ recipientId: added.body.recipients[0]._id })).status).toBe(200);
      const call = axios.mock.calls.find(([options]) => options.url.endsWith('/1111111/media'))[0];
      expect(call.headers.Authorization).toBe('Bearer shared-db-token');
      const stored = await WhatsAppSettings.findOne({ adminId: admin._id }).select('+credentials');
      expect(stored.credentials).toBe(own);
      expect(JSON.stringify(stored)).not.toMatch(/shared-env-token|shared-env-secret|shared-db-token|shared-db-secret/);
      await SharedSender.updateOne({ _id: 'default' }, { $set: { phoneNumberId: '3333333', templates: [] } });
      const changedSender = (await request(app).get('/whatsapp/settings')).body;
      expect(changedSender.enabled).toBe(false);
      expect(changedSender.templates).toEqual([]);
      await SharedSender.updateOne({ _id: 'default' }, { $set: { templates: [template] } });
      expect((await request(app).get('/whatsapp/settings')).body.enabled).toBe(true);
      await request(app).put('/whatsapp/enabled').send({ enabled: false });
      expect((await request(app).get('/whatsapp/settings')).body.enabled).toBe(false);
      expect((await request(app).post('/whatsapp/shared-key-request').send({ type: 'cancel' })).body).toMatchObject({ credentialSource: 'env', sharedKeyRequest: { type: 'cancel', status: 'pending' } });
      // Approved cancellation must force a fresh own-sender verification.
      await WhatsAppSettings.updateOne({ adminId: admin._id }, { $set: { credentialSource: 'own', ownReverificationRequired: true, enabled: false, templates: [], 'sharedKeyRequest.status': 'approved' } });
      const before = axios.mock.calls.length;
      expect((await request(app).post('/whatsapp/templates/sync').send({})).status).toBe(400);
      expect(axios.mock.calls.length).toBe(before);
      expect((await request(app).put('/whatsapp/settings').send(settings)).status).toBe(200);
      expect((await request(app).get('/whatsapp/settings')).body.ownReverificationRequired).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it('does not expose or silently fall back to own keys when shared ENV keys are unavailable', async () => {
    await configure();
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', ''); vi.stubEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', '');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', ''); vi.stubEnv('WHATSAPP_APP_SECRET', '');
    try {
      await WhatsAppSettings.updateOne({ adminId: admin._id }, { $set: { credentialSource: 'env', enabled: true } });
      expect((await request(app).get('/whatsapp/settings')).body).toMatchObject({ configured: false, enabled: false, credentialSource: 'env', senderError: expect.any(String) });
      expect((await request(app).post('/whatsapp/templates/sync').send({})).status).toBe(503);
    } finally { vi.unstubAllEnvs(); }
  });
});
