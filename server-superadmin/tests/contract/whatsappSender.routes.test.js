import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from 'config';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connectMongo, disconnectMongo, clearCollections } from '../integration/dbSetup.js';
vi.mock('axios', () => ({ default: vi.fn() }));
vi.mock('express-rate-limit', () => ({ default: () => (req, res, next) => next() }));
const { default: axios } = await import('axios');
const { default: routes } = await import('../../core/v1/whatsappKeys/whatsappSender.routes.js');
const { default: Sender } = await import('../../core/v1/whatsappKeys/whatsapp.sharedSender.model.js');
const { default: SuperAdmin } = await import('../../core/v1/superAdmin/superAdmin.model.js');
const { decryptData } = await import('../../utils/cryptoUtils.js');
const { copyWhatsAppAssets } = await import('../../scripts/copy_whatsapp_assets.js');
const { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_LANGUAGE, FALLBACK_TEMPLATE_NAME, FALLBACK_TEMPLATE_BODY } = await import('../../core/v1/whatsappKeys/whatsapp.templateDefinitions.js');
const image = { name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE, status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: DEFAULT_TEMPLATE_BODY }] };
const text = { name: FALLBACK_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE, status: 'APPROVED', components: [{ type: 'BODY', text: FALLBACK_TEMPLATE_BODY }] };
const input = { phoneNumberId: '1111111', businessAccountId: '2222222', apiVersion: 'v24.0', accessToken: 'private-shared-token', appSecret: 'private-shared-secret' };
let app, token;
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections(); vi.resetAllMocks();
  const reviewer = await SuperAdmin.create({ name: 'Reviewer', email: 'sender@test.com', password: 'test-hash' });
  token = jwt.sign({ id: String(reviewer._id), role: 'superAdmin' }, config.get('jwt.secretKey'));
  app = express(); app.use(express.json()); app.use('/sender', routes);
  axios.mockImplementation(async options => ({ data: options.url.endsWith('/phone_numbers') ? { data: [{ id: input.phoneNumberId }] }
    : options.url.endsWith('/message_templates') ? { data: [image, text] } : { id: input.phoneNumberId } }));
});
const save = values => request(app).put('/sender').set('x-access-token', token).send(values || input);
describe('Super Admin shared WhatsApp sender', () => {
  it('requires Super Admin authentication and never accepts tenant sessions', async () => {
    expect((await request(app).get('/sender')).status).toBe(401);
    const tenant = jwt.sign({ id: '111111111111111111111111', role: 'admin' }, config.get('jwt.secretKey'));
    expect((await request(app).put('/sender').set('x-access-token', tenant).send(input)).status).toBe(403);
  });
  it('verifies ownership and encrypts credentials without exposing them in responses', async () => {
    const response = await save();
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/private-shared-token|private-shared-secret|credentials/);
    const stored = await Sender.findById('default').select('+credentials').lean();
    expect(stored.credentials).not.toContain(input.accessToken);
    expect(decryptData(stored.credentials)).toEqual({ accessToken: input.accessToken, appSecret: input.appSecret });
    expect((await save({ ...input, accessToken: '', appSecret: '' })).status).toBe(200);
    expect(decryptData((await Sender.findById('default').select('+credentials')).credentials).accessToken).toBe(input.accessToken);
    expect((await request(app).get('/sender').set('x-access-token', token)).body).not.toHaveProperty('credentials');
  });
  it('does not save credentials for a sender outside the supplied business account', async () => {
    axios.mockResolvedValue({ data: { id: 'other', data: [] } });
    expect((await save()).status).toBe(400);
    expect(await Sender.countDocuments()).toBe(0);
  });
  it('submits exactly the two fixed defaults, syncs approval, and avoids duplicate submission', async () => {
    await save();
    const submitted = [];
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/message_templates') && options.method === 'get') return { data: { data: submitted.map(name => ({ ...(name === DEFAULT_TEMPLATE_NAME ? image : text), status: 'PENDING' })) } };
      if (options.url.endsWith('/message_templates')) { submitted.push(options.data.name); return { data: { id: `id-${submitted.length}` } }; }
      if (options.url.endsWith('/app/uploads')) return { data: { id: 'upload:123' } };
      if (options.url.includes('/upload:123')) return { data: { h: '4:included-image' } };
      return { data: {} };
    });
    const result = await request(app).post('/sender/templates').set('x-access-token', token).send({});
    expect(result.status).toBe(200);
    expect(submitted).toEqual([DEFAULT_TEMPLATE_NAME, FALLBACK_TEMPLATE_NAME]);
    expect(result.body.templates.map(item => item.status)).toEqual(['PENDING', 'PENDING']);
    const posts = axios.mock.calls.filter(([options]) => options.method === 'post' && options.url.endsWith('/message_templates'));
    expect(posts[0][0].data.components[0]).toMatchObject({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4:included-image'] } });
    expect(posts[1][0].data.components).toHaveLength(1);
    expect((await request(app).post('/sender/templates').set('x-access-token', token).send({})).status).toBe(200);
    expect(submitted).toHaveLength(2);
    axios.mockResolvedValue({ data: { data: [image, text] } });
    const synced = await request(app).post('/sender/templates/sync').set('x-access-token', token).send({});
    expect(synced.body.templates.every(item => item.approved)).toBe(true);
    expect((await request(app).post('/sender/templates').set('x-access-token', token).send({ name: 'custom' })).status).toBe(400);
  });
  it('clears old templates on sender changes and rejects a stale sync result', async () => {
    await save();
    await request(app).post('/sender/templates/sync').set('x-access-token', token).send({});
    axios.mockImplementation(async options => {
      if (options.url.endsWith('/phone_numbers')) return { data: { data: [{ id: '3333333' }] } };
      return { data: { id: '3333333' } };
    });
    expect((await save({ ...input, phoneNumberId: '3333333' })).body.templates.every(item => item.status === 'NOT_SUBMITTED')).toBe(true);
    axios.mockImplementation(async () => {
      await Sender.updateOne({ _id: 'default' }, { $inc: { revision: 1 } });
      return { data: { data: [image, text] } };
    });
    expect((await request(app).post('/sender/templates/sync').set('x-access-token', token).send({})).status).toBe(409);
    expect((await Sender.findById('default')).templates).toEqual([]);
  });
  it('packages the same approval image and template definitions used by the main backend', async () => {
    expect(await readFile(new URL('../../core/v1/whatsappKeys/whatsapp.templateDefinitions.js', import.meta.url), 'utf8'))
      .toBe(await readFile(new URL('../../../server/core/v2/whatsapp/whatsapp.templateDefinitions.js', import.meta.url), 'utf8'));
    const root = await mkdtemp(path.join(tmpdir(), 'whatsapp-sender-assets-'));
    try {
      const relative = 'core/v1/whatsappKeys/assets/default-approval.png';
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      const { writeFile } = await import('node:fs/promises');
      const bytes = await readFile(new URL('../../../server/core/v2/whatsapp/assets/default-approval.png', import.meta.url));
      await writeFile(path.join(root, relative), bytes);
      await copyWhatsAppAssets(root);
      expect(await readFile(path.join(root, 'dist', relative))).toEqual(bytes);
      expect(await readFile(new URL('../../core/v1/whatsappKeys/assets/default-approval.png', import.meta.url))).toEqual(bytes);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
