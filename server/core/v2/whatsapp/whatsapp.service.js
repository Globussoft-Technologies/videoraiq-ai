import axios from 'axios';
import config from 'config';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { encryptData, decryptData } from '../../../utils/cryptoUtils.js';
import { WhatsAppSettings, WhatsAppDelivery } from './whatsapp.model.js';
import { buildIncidentWhatsAppMessage, buildIncidentImageUrl } from '../../../messagingService/message.helper.js';

const defaultVersion = () => config.has('WhatsApp.apiVersion') ? config.get('WhatsApp.apiVersion') : 'v24.0';
const graph = async (settings, method, path, data, params) => {
  const { accessToken } = decryptData(settings.credentials);
  const response = await axios({ method, url: `https://graph.facebook.com/${settings.apiVersion}/${path}`,
    data, params, timeout: 20000, headers: { Authorization: `Bearer ${accessToken}` } });
  return response.data;
};
export const isImageTemplate = template => template?.components?.some(item => item.type === 'HEADER' && item.format === 'IMAGE');
export const supportedTemplate = template => {
  if (template.status !== 'APPROVED' || template.parameter_format === 'NAMED') return false;
  const components = template.components || [];
  if (components.some(component => !['BODY', 'FOOTER'].includes(component.type) && !(component.type === 'HEADER' && component.format === 'IMAGE'))) return false;
  if (components.filter(component => component.type === 'HEADER').length > 1) return false;
  const body = components.find(component => component.type === 'BODY')?.text;
  if (!body) return false;
  const variables = [...body.matchAll(/\{\{(.*?)\}\}/g)].map(match => match[1]);
  return variables.length === 1 && variables[0] === '1';
};
export async function publicSettings(adminId) {
  const settings = await WhatsAppSettings.findOne({ adminId });
  if (!settings) return { enabled: false, configured: false, templates: [], recipients: [], apiVersion: defaultVersion() };
  return { enabled: settings.enabled, configured: Boolean(settings.phoneNumberId && settings.businessAccountId),
    phoneNumberId: settings.phoneNumberId, businessAccountId: settings.businessAccountId, apiVersion: settings.apiVersion,
    templates: settings.templates.map(template => ({ ...template, supported: supportedTemplate(template) })),
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
  const selectedStillApproved = templates.some(item => item.name === settings.selectedTemplate?.name && item.language === settings.selectedTemplate?.language && supportedTemplate(item));
  await WhatsAppSettings.updateOne({ adminId }, { $set: { templates, lastSyncAt: new Date(), ...(settings.enabled && !selectedStillApproved ? { enabled: false } : {}) } });
  return publicSettings(adminId);
}
export async function requestTemplate(adminId, { name, language, imageHeader = false, sampleHandle }) {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  if (!settings?.credentials) throw new Error('Configure WhatsApp first');
  await graph(settings, 'post', `${settings.businessAccountId}/message_templates`, {
    name, language, category: 'UTILITY', parameter_format: 'POSITIONAL', components: [...(imageHeader ? [{ type: 'HEADER', format: 'IMAGE', example: { header_handle: [sampleHandle] } }] : []), { type: 'BODY',
      text: 'VideoRAIQ incident alert: {{1}}. Please review the incident in your VideoRAIQ dashboard.',
      example: { body_text: [['High severity fire detected at Reception camera, Main Office, 10:30 AM']] },
    }],
  });
  return syncTemplates(adminId);
}
export async function selectTemplate(adminId, selection) {
  await syncTemplates(adminId);
  const settings = await WhatsAppSettings.findOne({ adminId });
  const template = settings.templates.find(item => item.name === selection.name && item.language === selection.language);
  if (!template || !supportedTemplate(template)) throw new Error('Select an approved template with one body parameter and an optional image header');
  let fallback = null;
  if (isImageTemplate(template) && selection.fallback) {
    fallback = settings.templates.find(item => item.name === selection.fallback?.name && item.language === selection.fallback?.language);
    if (!fallback || !supportedTemplate(fallback) || isImageTemplate(fallback)) throw new Error('Select an approved text-only fallback for incidents without images');
  }
  await WhatsAppSettings.updateOne({ adminId }, { $set: { selectedTemplate: { name: selection.name, language: selection.language }, fallbackTemplate: fallback ? { name: fallback.name, language: fallback.language } : null, enabled: true } });
  return publicSettings(adminId);
}
export async function sendTemplateAlert(adminId, incident, recipients, nvr = {}, channel = {}, timezone) {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+credentials');
  if (!settings) return null; // Preserve legacy sending for accounts without new configuration.
  if (!settings.enabled || !settings.credentials) return [];
  let selected = settings.templates.find(item => item.name === settings.selectedTemplate?.name && item.language === settings.selectedTemplate?.language);
  if (!selected || !supportedTemplate(selected)) throw new Error('WhatsApp alert template is not approved or supported');
  let imageUrl = buildIncidentImageUrl(incident);
  try { const url = new URL(imageUrl); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) imageUrl = ''; } catch { imageUrl = ''; }
  const fallback = settings.templates.find(item => item.name === settings.fallbackTemplate?.name && item.language === settings.fallbackTemplate?.language);
  const missingImage = isImageTemplate(selected) && !imageUrl;
  if (isImageTemplate(selected) && !imageUrl) {
    if (fallback && supportedTemplate(fallback) && !isImageTemplate(fallback)) selected = fallback;
  }
  // Our templates have a single bounded, single-line body parameter.
  const summary = buildIncidentWhatsAppMessage(incident, nvr, channel, timezone).replace(/\s+/g, ' ').slice(0, 800);
  const phones = [...new Set(recipients)];
  const results = [];
  for (const recipient of phones) {
    try {
      if (missingImage && isImageTemplate(selected)) throw new Error('Incident image is missing and no approved text-only fallback is configured');
      const send = current => graph(settings, 'post', `${settings.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', to: recipient.replace(/^\+/, ''), type: 'template',
        template: { name: current.name, language: { code: current.language }, components: [
          ...(isImageTemplate(current) ? [{ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] }] : []),
          { type: 'body', parameters: [{ type: 'text', text: summary }] },
        ] },
      });
      let response;
      let deliveryTemplate = selected;
      try { response = await send(selected); }
      catch (error) {
        const code = error.response?.data?.error?.code;
        // Retry only a definitive media rejection, never timeouts or unknown outcomes.
        if (!isImageTemplate(selected) || ![131052, 131053].includes(code) || !fallback || !supportedTemplate(fallback) || isImageTemplate(fallback)) throw error;
        deliveryTemplate = fallback;
        response = await send(fallback);
      }
      const messageId = response.messages?.[0]?.id;
      if (!messageId) throw new Error('Meta did not return a message ID');
      await WhatsAppDelivery.updateOne({ messageId }, { $setOnInsert: { adminId, messageId, recipient,
        incidentId: incident?._id ? String(incident._id) : undefined, template: deliveryTemplate.name, status: 'accepted', statusAt: new Date(0) } }, { upsert: true });
      results.push({ recipient, messageId, status: 'accepted' });
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      await WhatsAppDelivery.create({ adminId, recipient, template: selected.name, status: 'failed', error: message, statusAt: new Date() });
      results.push({ recipient, status: 'failed', error: message });
    }
  }
  return results;
}
export async function webhook(settings, rawBody, signature, body) {
  const { appSecret } = decryptData(settings.credentials);
  if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const actual = Buffer.from(signature || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  for (const entry of body.entry || []) {
    if (String(entry.id) !== settings.businessAccountId) continue;
    for (const change of entry.changes || []) {
      if (change.value?.metadata?.phone_number_id !== settings.phoneNumberId) continue;
      for (const status of change.value.statuses || []) {
        if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue;
        const statusAt = new Date(Number(status.timestamp) * 1000);
        if (!Number.isFinite(statusAt.getTime())) continue;
        // Do not overwrite a newer status with an out-of-order webhook.
        await WhatsAppDelivery.updateOne({ adminId: settings.adminId, messageId: status.id,
          $or: [{ statusAt: { $lt: statusAt } }, { statusAt: { $exists: false } },
            { statusAt, status: { $in: { sent: ['accepted'], delivered: ['accepted', 'sent'], read: ['accepted', 'sent', 'delivered'], failed: ['accepted', 'sent'] }[status.status] } }] },
          { $set: { status: status.status, statusAt, error: status.errors?.map(item => item.message || item.title).join('; ') || '' } });
      }
    }
  }
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
    await WhatsAppDelivery.updateOne({ messageId }, { $setOnInsert: { adminId, messageId, recipient: recipient.phone, template: sample.name, status: 'accepted', statusAt: new Date(0) } }, { upsert: true });
    return { results: [{ recipient: recipient.phone, messageId, status: 'accepted' }] };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    await WhatsAppDelivery.create({ adminId, recipient: recipient.phone, template: sample.name, status: 'failed', error: message, statusAt: new Date() });
    throw new Error(message);
  }
}
