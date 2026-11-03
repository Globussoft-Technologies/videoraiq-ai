import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE, DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_EXAMPLE, isDefaultTemplate, supportedDefaultTemplate, buildDefaultTemplateValues } from './whatsapp.defaultTemplate.js';
import config from 'config';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { encryptData, decryptData } from '../../../utils/cryptoUtils.js';
import { WhatsAppSettings } from './whatsapp.model.js';
import { prepareIncidentImage } from './whatsapp.incidentMedia.js';
import logger from '../../../utils/logger.js';

const defaultVersion = () => config.has('WhatsApp.apiVersion') ? config.get('WhatsApp.apiVersion') : 'v24.0';
const graph = async (settings, method, path, data, params) => {
  const { accessToken } = decryptData(settings.credentials);
  const response = await axios({ method, url: `https://graph.facebook.com/${settings.apiVersion}/${path}`,
    data, params, timeout: 20000, headers: { Authorization: `Bearer ${accessToken}` } });
  return response.data;
};
export const isImageTemplate = template => template?.components?.some(item => item.type === 'HEADER' && item.format === 'IMAGE');
export const supportedTemplate = supportedDefaultTemplate;
const defaultTemplateInfo = templates => {
  const template = templates.find(isDefaultTemplate);
  return { name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE, body: DEFAULT_TEMPLATE_BODY,
    status: template?.status || 'NOT_SUBMITTED', approved: Boolean(template && supportedTemplate(template)) };
};
export async function publicSettings(adminId) {
  const settings = await WhatsAppSettings.findOne({ adminId });
  if (!settings) return { enabled: false, configured: false, templates: [], recipients: [], defaultTemplate: defaultTemplateInfo([]), apiVersion: defaultVersion() };
  return { enabled: settings.enabled, configured: Boolean(settings.phoneNumberId && settings.businessAccountId),
    phoneNumberId: settings.phoneNumberId, businessAccountId: settings.businessAccountId, apiVersion: settings.apiVersion,
    defaultTemplate: defaultTemplateInfo(settings.templates), templates: settings.templates.map(template => ({ ...template, supported: supportedTemplate(template) })),
    selectedTemplate: settings.selectedTemplate, fallbackTemplate: settings.fallbackTemplate, recipients: settings.recipients, lastSyncAt: settings.lastSyncAt };
}
export async function saveSettings(adminId, input) {
  const existing = await WhatsAppSettings.findOne({ adminId }).select('+credentials +webhookVerifyToken');
  const secrets = existing?.credentials ? decryptData(existing.credentials) : {};
  if (input.accessToken) secrets.accessToken = input.accessToken;
  if (input.appSecret) secrets.appSecret = input.appSecret;
  if (!secrets.accessToken || !secrets.appSecret) throw new Error('Access token and Meta App Secret are required');
  const candidate = { phoneNumberId: input.phoneNumberId, businessAccountId: input.businessAccountId,
    apiVersion: input.apiVersion || defaultVersion(), credentials: encryptData(secrets) };
  // Verify credentials and that the sender belongs to this WhatsApp Business Account.
  const phone = await graph(candidate, 'get', input.phoneNumberId, undefined, { fields: 'id' });
  let after; let belongs = false;
  for (let page = 0; page < 20; page++) {
    const list = await graph(candidate, 'get', `${input.businessAccountId}/phone_numbers`, undefined, { fields: 'id', limit: 100, after });
    if (list.data?.some(item => item.id === phone.id)) { belongs = true; break; }
    if (!list.paging?.next) break;
    after = list.paging.cursors?.after;
    if (!after) break;
  }
  if (!belongs) throw new Error('The sender does not belong to this WhatsApp Business Account');
  const changed = existing && (existing.businessAccountId !== input.businessAccountId || existing.phoneNumberId !== input.phoneNumberId);
  await WhatsAppSettings.findOneAndUpdate({ adminId }, { $set: { ...candidate, enabled: false,
    ...(changed ? { templates: [], selectedTemplate: null, fallbackTemplate: null, lastSyncAt: null } : {}),
    webhookVerifyToken: existing?.webhookVerifyToken || randomBytes(24).toString('hex'),
  } }, { upsert: true });
  return publicSettings(adminId);
}
export async function syncTemplates(adminId) {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  if (!settings?.credentials) throw new Error('Configure WhatsApp first');
  const templates = []; let after;
  for (let page = 0; page < 20; page++) {
    const response = await graph(settings, 'get', `${settings.businessAccountId}/message_templates`, undefined,
      { fields: 'id,name,status,language,category,components,parameter_format', limit: 100, after });
    templates.push(...(response.data || []));
    if (!response.paging?.next) break;
    after = response.paging.cursors?.after;
    if (!after || page === 19) throw new Error('Template list is too large to sync completely');
  }
  const approved = templates.find(supportedTemplate);
  await WhatsAppSettings.updateOne({ adminId }, { $set: { templates, lastSyncAt: new Date(),
    selectedTemplate: approved ? { name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE } : null,
    fallbackTemplate: null, enabled: Boolean(approved) && !settings.alertsPaused } });
  return publicSettings(adminId);
}
const approvalImage = () => readFile(new URL('./assets/default-approval.png', import.meta.url));
export async function requestTemplate(adminId) {
  await syncTemplates(adminId);
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  const existing = settings.templates.find(isDefaultTemplate);
  if (existing && (supportedTemplate(existing) || ['PENDING', 'IN_APPEAL'].includes(existing.status))) return publicSettings(adminId);
  const sample = await uploadTemplateSample(adminId, { buffer: await approvalImage(), mimetype: 'image/png' });
  const components = [{ type: 'HEADER', format: 'IMAGE', example: { header_handle: [sample.handle] } },
    { type: 'BODY', text: DEFAULT_TEMPLATE_BODY, example: { body_text: [DEFAULT_TEMPLATE_EXAMPLE] } }];
  await graph(settings, 'post', existing?.id || `${settings.businessAccountId}/message_templates`, {
    ...(existing?.id ? {} : { name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE, parameter_format: 'POSITIONAL' }),
    category: 'UTILITY', components,
  });
  return syncTemplates(adminId);
}
export async function selectTemplate(adminId) {
  await syncTemplates(adminId);
  const settings = await WhatsAppSettings.findOne({ adminId });
  if (!settings.templates.some(supportedTemplate)) throw new Error('The default incident template must be approved. Submit it for approval, then sync.');
  await WhatsAppSettings.updateOne({ adminId }, { $set: { selectedTemplate: { name: DEFAULT_TEMPLATE_NAME, language: DEFAULT_TEMPLATE_LANGUAGE }, fallbackTemplate: null, alertsPaused: false, enabled: true } });
  return publicSettings(adminId);
}
export async function sendTemplateAlert(adminId, incident, recipients, nvr = {}, channel = {}, timezone, testImageId) {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  if (!settings) return null; // Preserve legacy sending for accounts without new configuration.
  if (!settings.enabled || !settings.credentials) {
    logger.info('[WHATSAPP_SKIP] Alerts paused or sender unconfigured', { adminId: String(adminId), incidentId: String(incident?._id || '') });
    return [];
  }
  const selected = settings.templates.find(supportedTemplate);
  if (!selected || !supportedTemplate(selected)) throw new Error('WhatsApp alert template is not approved or supported');
  const phones = [...new Set(recipients)];
  if (!phones.length) {
    logger.info('[WHATSAPP_SKIP] No selected opted-in recipients', { adminId: String(adminId), incidentId: String(incident?._id || '') });
    return [];
  }
  const results = [];
  let imageId = testImageId;
  let messageIncident = incident;
  try {
    if (!imageId) {
      if (!incident.Image) throw new Error('Incident image is missing; the default image template requires an incident snapshot');
      const media = await prepareIncidentImage(incident._id, adminId);
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', media.mimetype);
      form.append('file', new Blob([media.buffer], { type: media.mimetype }), media.mimetype === 'image/png' ? 'incident.png' : 'incident.jpg');
      const uploaded = await graph(settings, 'post', `${settings.phoneNumberId}/media`, form);
      if (!uploaded.id) throw new Error('Meta did not return an incident image ID');
      imageId = uploaded.id;
      messageIncident = { ...incident, Image: media.url };
    }
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    logger.error('[WHATSAPP_IMAGE_ERROR] Could not prepare incident snapshot', { incidentId: String(incident?._id || ''), metaCode: error.response?.data?.error?.code, errorMessage: String(message).replace(/https?:\/\/\S+/g, '[url]') });
    return phones.map(recipient => ({ recipient, status: 'failed', error: message }));
  }
  const values = buildDefaultTemplateValues(messageIncident, nvr, channel, timezone);
  for (const recipient of phones) {
    try {
      const send = current => graph(settings, 'post', `${settings.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', to: recipient.replace(/^\+/, ''), type: 'template',
        template: { name: current.name, language: { code: current.language }, components: [
          ...(isImageTemplate(current) ? [{ type: 'header', parameters: [{ type: 'image', image: { id: imageId } }] }] : []),
          { type: 'body', parameters: values.map(text => ({ type: 'text', text })) },
        ] },
      });
      const response = await send(selected);
      const messageId = response.messages?.[0]?.id;
      if (!messageId) throw new Error('Meta did not return a message ID');
      logger.info('[WHATSAPP_ACCEPTED] Meta accepted incident alert', { incidentId: String(incident?._id || ''), template: selected.name });
      results.push({ recipient, messageId, status: 'accepted' });
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      logger.error('[WHATSAPP_SEND_ERROR] Meta rejected incident alert', { incidentId: String(incident?._id || ''), metaCode: error.response?.data?.error?.code, errorMessage: String(message).replace(/https?:\/\/\S+/g, '[url]') });
      results.push({ recipient, status: 'failed', error: message });
    }
  }
  return results;
}
export async function webhook(settings, rawBody, signature) {
  const { appSecret } = decryptData(settings.credentials);
  if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const actual = Buffer.from(signature || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  // Acknowledge signed callbacks from existing Meta subscriptions without storing delivery history.
  return true;
}

export async function uploadTemplateSample(adminId, file) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.mimetype)) throw new Error('Choose a JPEG or PNG sample image');
  const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
  const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!(file.mimetype === 'image/jpeg' ? jpeg : png)) throw new Error('The file contents do not match a JPEG or PNG image');
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  if (!settings?.credentials) throw new Error('Configure WhatsApp first');
  const session = await graph(settings, 'post', 'app/uploads', undefined, { file_length: file.buffer.length, file_type: file.mimetype, file_name: jpeg ? 'incident-sample.jpg' : 'incident-sample.png' });
  if (!/^upload:[a-zA-Z0-9_?=:.&%+\/-]+$/.test(session.id || '')) throw new Error('Meta did not return a valid upload session');
  const { accessToken } = decryptData(settings.credentials);
  const response = await axios({ method: 'post', url: `https://graph.facebook.com/${settings.apiVersion}/${session.id}`,
    data: file.buffer, timeout: 30000, headers: { Authorization: `OAuth ${accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' } });
  if (!response.data?.h) throw new Error('Meta did not return a sample image handle');
  return { handle: response.data.h };
}

// Meta's sample is available only through an explicit test action, never alert selection.
export async function sendSampleMessage(adminId, recipientId) {
  await syncTemplates(adminId);
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  const recipient = settings?.recipients.find(item => String(item._id) === recipientId && item.optedInAt);
  if (!recipient) throw new Error('Choose an opted-in recipient');
  const sample = settings.templates.find(item => item.name === 'hello_world' && item.status === 'APPROVED' &&
    !item.components?.some(component => /\{\{/.test(component.text || '') || !['BODY', 'FOOTER', 'HEADER'].includes(component.type) || (component.type === 'HEADER' && component.format !== 'TEXT')));
  if (!sample) throw new Error('An approved hello_world sample template is not available for this account');
  try {
    const response = await graph(settings, 'post', `${settings.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to: recipient.phone.replace(/^\+/, ''), type: 'template',
      template: { name: sample.name, language: { code: sample.language } },
    });
    const messageId = response.messages?.[0]?.id;
    if (!messageId) throw new Error('Meta did not return a message ID');
    return { results: [{ recipient: recipient.phone, messageId, status: 'accepted' }] };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    throw new Error(message);
  }
}

// Explicit test messages use the bundled sample; live alerts always use the incident image.
export async function sendTestAlert(adminId, recipientId) {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  const recipient = settings?.recipients.find(item => String(item._id) === recipientId && item.optedInAt);
  if (!recipient || !settings.enabled) throw new Error('Enable alerts and choose an opted-in recipient');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'image/png');
  form.append('file', new Blob([await approvalImage()], { type: 'image/png' }), 'incident-sample.png');
  const media = await graph(settings, 'post', `${settings.phoneNumberId}/media`, form);
  if (!media.id) throw new Error('Meta did not return a test image ID');
  return { results: await sendTemplateAlert(adminId, { incidentType: 'deskAbsence', incidentName: 'Test incident', severity: 'low',
    timeOfIncident: new Date(), zone: 'Test zone', description: 'WhatsApp alert setup test (sample image)' }, [recipient.phone], {}, {}, undefined, media.id) };
}
