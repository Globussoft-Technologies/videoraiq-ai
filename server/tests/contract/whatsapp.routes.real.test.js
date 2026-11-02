import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { connectMongo, disconnectMongo, clearCollections } from '../integration/dbSetup.js';
vi.mock('axios', () => ({ default: vi.fn() }));
vi.mock('../../middlewares/verifyToken.js', () => ({ default: (req, res, next) => {
  req.verified = { userData: { adminId: globalThis.__WA_ADMIN_ID__, memberId: req.get('x-test-member') || undefined } }; next();
} }));
const { default: express } = await import('express');
const { default: routes } = await import('../../core/v2/whatsapp/whatsapp.routes.js');
const { default: axios } = await import('axios');
const { default: Admin } = await import('../../core/v1/admin/admin.model.js');
const { WhatsAppSettings, WhatsAppDelivery } = await import('../../core/v2/whatsapp/whatsapp.model.js');
const { sendIncidentWhatsApp } = await import('../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js');
const { supportedTemplate, sendTemplateAlert } = await import('../../core/v2/whatsapp/whatsapp.service.js');
let app, admin;
const template = { id: 'template1', name: 'incident_alert', language: 'en_US', status: 'APPROVED', components: [{ type: 'BODY', text: 'Incident: {{1}}. Please review.' }] };
const settings = { phoneNumberId: '1234567', businessAccountId: '7654321', apiVersion: 'v24.0', accessToken: 'secret-test-access-token', appSecret: 'secret-test-app-secret' };
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections(); vi.resetAllMocks();
  admin = await Admin.create({ user_id: 'wa-test', login: 'wa-test', email: 'wa@test.com' });
  globalThis.__WA_ADMIN_ID__ = String(admin._id);
  app = express(); app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } })); app.use('/whatsapp', routes);
  axios.mockImplementation(async options => {
    if (options.url.endsWith('/phone_numbers')) return { data: { data: [{ id: settings.phoneNumberId }] } };
    if (options.url.endsWith('/message_templates')) return { data: { data: [template] } };
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
    expect((await request(app).get('/whatsapp/deliveries')).body.deliveries).toEqual([]);
  });
  it('rejects a sender from another business account', async () => {
    axios.mockResolvedValue({ data: { id: 'other', data: [] } });
    expect((await request(app).put('/whatsapp/settings').send(settings)).status).toBe(400);
    expect(await WhatsAppSettings.countDocuments()).toBe(0);
  });
  it('submits the fixed alert template and syncs Meta approval status', async () => {
    await configure();
    const response = await request(app).post('/whatsapp/templates').send({ name: 'my_incident_alert', language: 'en_US' });
    expect(response.status).toBe(200);
    const submitted = axios.mock.calls.find(([options]) => options.method === 'post' && options.url.endsWith('/message_templates'))[0];
    expect(submitted.data).toMatchObject({ name: 'my_incident_alert', category: 'UTILITY', components: [{ type: 'BODY', text: expect.stringContaining('{{1}}') }] });
    expect(response.body.templates[0].supported).toBe(true);
  });
  it('cannot enable pending or unsupported templates', async () => {
    await configure();
    axios.mockImplementation(async () => ({ data: { data: [{ ...template, status: 'PENDING' }] } }));
    expect((await request(app).put('/whatsapp/template').send({ name: template.name, language: template.language })).status).toBe(400);
    expect(supportedTemplate({ ...template, components: [...template.components, { type: 'HEADER', format: 'VIDEO' }] })).toBe(false);
    expect(supportedTemplate({ ...template, components: [{ type: 'BODY', text: '{{1}} {{2}}' }] })).toBe(false);
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
    expect(call.data.template.components[0].parameters[0].text).not.toMatch(/[\r\n]/);
    expect(await WhatsAppDelivery.countDocuments({ status: 'accepted' })).toBe(1);
    await request(app).put('/whatsapp/enabled').send({ enabled: false });
    expect(await sendTemplateAlert(admin._id, {}, ['+919999999999'])).toEqual([]);
  });
  it('routes incidents to the configured account recipients even without legacy phone selections', async () => {
    await enable();
    await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: true });
    const result = await sendIncidentWhatsApp({ incidentName: 'Fire', severity: 'high' }, [], {}, {}, 'UTC', admin._id);
    expect(result[0].status).toBe('accepted');
    expect(axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'))).toHaveLength(1);
  });
  it('pauses alerts when template approval is revoked on sync', async () => {
    await enable();
    axios.mockResolvedValue({ data: { data: [{ ...template, status: 'REJECTED' }] } });
    const response = await request(app).post('/whatsapp/templates/sync').send({});
    expect(response.body.enabled).toBe(false);
  });
  it('verifies callbacks and accepts only correctly signed delivery updates', async () => {
    await enable();
    const details = (await request(app).get('/whatsapp/webhook-config')).body;
    const challenge = await request(app).get(`/whatsapp/webhook/${admin._id}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': details.verifyToken, 'hub.challenge': '123' });
    expect(challenge.text).toBe('123');
    await WhatsAppDelivery.create({ adminId: admin._id, messageId: 'wamid.test', status: 'accepted', statusAt: new Date(1000) });
    const body = { entry: [{ id: settings.businessAccountId, changes: [{ value: { metadata: { phone_number_id: settings.phoneNumberId }, statuses: [{ id: 'wamid.test', status: 'delivered', timestamp: '2000' }] } }] }] };
    const raw = JSON.stringify(body);
    expect((await request(app).post(`/whatsapp/webhook/${admin._id}`).send(body)).status).toBe(403);
    const signature = 'sha256=' + createHmac('sha256', settings.appSecret).update(raw).digest('hex');
    expect((await request(app).post(`/whatsapp/webhook/${admin._id}`).set('x-hub-signature-256', signature).set('Content-Type', 'application/json').send(raw)).status).toBe(200);
    expect((await WhatsAppDelivery.findOne({ messageId: 'wamid.test' })).status).toBe('delivered');
  });
  it('submits an image header sample and sends each incident snapshot with an approved fallback', async () => {
    await configure();
    const imageTemplate = { ...template, name: 'incident_photo', components: [{ type: 'HEADER', format: 'IMAGE' }, ...template.components] };
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/message_templates')) return { data: { data: [template, imageTemplate] } };
      if (options.url.endsWith('/messages')) return { data: { messages: [{ id: options.data.template.name === 'incident_photo' ? 'wamid.photo' : 'wamid.text' }] } };
      return { data: {} };
    });
    const submitted = await request(app).post('/whatsapp/templates').send({ name: 'incident_photo', language: 'en_US', imageHeader: true, sampleHandle: '4:sample-handle' });
    expect(submitted.status).toBe(200);
    const payload = axios.mock.calls.find(([options]) => options.method === 'post' && options.url.endsWith('/message_templates'))[0].data;
    expect(payload.components[0]).toEqual({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4:sample-handle'] } });
    expect((await request(app).put('/whatsapp/template').send({ name: 'incident_photo', language: 'en_US' })).status).toBe(400);
    expect((await request(app).put('/whatsapp/template').send({ name: 'incident_photo', language: 'en_US', fallback: { name: template.name, language: template.language } })).status).toBe(200);
    await sendTemplateAlert(admin._id, { Image: 'https://media.example.com/incident.jpg' }, ['+919999999999']);
    const imageSend = axios.mock.calls.find(([options]) => options.url.endsWith('/messages'))[0].data;
    expect(imageSend.template.components[0]).toEqual({ type: 'header', parameters: [{ type: 'image', image: { link: 'https://media.example.com/incident.jpg' } }] });
    await sendTemplateAlert(admin._id, {}, ['+919999999999']);
    const calls = axios.mock.calls.filter(([options]) => options.url.endsWith('/messages'));
    expect(calls.at(-1)[0].data.template.name).toBe(template.name);
    expect(calls.at(-1)[0].data.template.components).toHaveLength(1);
    axios.mockRejectedValueOnce({ response: { data: { error: { code: 131052, message: 'Media download failed' } } } });
    const recovered = await sendTemplateAlert(admin._id, { Image: 'https://media.example.com/broken.jpg' }, ['+919999999999']);
    expect(recovered[0].status).toBe('accepted');
    expect(axios.mock.calls.at(-1)[0].data.template.name).toBe(template.name);
    const before = axios.mock.calls.length;
    axios.mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Unknown delivery outcome' });
    const timeout = await sendTemplateAlert(admin._id, { Image: 'https://media.example.com/slow.jpg' }, ['+919999999999']);
    expect(timeout[0].status).toBe('failed');
    expect(axios.mock.calls.length).toBe(before + 1);

  });
  it('uploads a sample image to Meta without accepting arbitrary download URLs', async () => {
    await configure();
    axios.mockImplementation(async options => ({ data: options.url.includes('app/uploads') ? { id: 'upload:123' } : { h: '4:uploaded' } }));
    const result = await request(app).post('/whatsapp/templates/sample').attach('file', Buffer.from([255, 216, 255, 217]), { filename: 'sample.jpg', contentType: 'image/jpeg' });
    expect(result.status).toBe(200);
    expect(result.body.handle).toBe('4:uploaded');
    expect((await request(app).post('/whatsapp/templates/sample').attach('file', Buffer.from('not-image'), { filename: 'bad.jpg', contentType: 'image/jpeg' })).status).toBe(400);
  });
  it('sends hello_world only through the sample action while live alerts remain paused', async () => {
    await configure();
    const added = await request(app).post('/whatsapp/recipients').send({ name: 'Test', phone: '+919999999999', optedIn: true });
    const sample = { name: 'hello_world', language: 'en_US', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello world' }] };
    axios.mockImplementation(async options => ({ data: options.url.endsWith('/message_templates') ? { data: [sample] } : { messages: [{ id: 'wamid.sample' }] } }));
    const response = await request(app).post('/whatsapp/test-sample').send({ recipientId: added.body.recipients[0]._id });
    expect(response.status).toBe(200);
    const sent = axios.mock.calls.find(([options]) => options.url.endsWith('/messages'))[0];
    expect(sent.data.template).toEqual({ name: 'hello_world', language: { code: 'en_US' } });
    expect((await WhatsAppSettings.findOne({ adminId: admin._id })).enabled).toBe(false);
    expect((await request(app).put('/whatsapp/template').send({ name: 'hello_world', language: 'en_US' })).status).toBe(400);
  });
  it('records the actual Meta send error for each failed recipient', async () => {
    await enable(); axios.mockRejectedValue({ response: { data: { error: { message: 'Recipient is not in allowed list' } } } });
    const result = await sendTemplateAlert(admin._id, {}, ['+919999999999']);
    expect(result[0]).toMatchObject({ status: 'failed', error: 'Recipient is not in allowed list' });
  });
});
