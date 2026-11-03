import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { encryptData, decryptData } from '../../../utils/cryptoUtils.js';
import Sender from './whatsapp.sharedSender.model.js';
import { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE, DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_EXAMPLE,
  FALLBACK_TEMPLATE_NAME, FALLBACK_TEMPLATE_BODY, supportedDefaultTemplate, supportedFallbackTemplate } from './whatsapp.templateDefinitions.js';

const supported = template => supportedDefaultTemplate(template) || supportedFallbackTemplate(template);
const conflict = () => Object.assign(new Error('Sender changed during this operation. Refresh and retry.'), { statusCode: 409 });
const graph = async (sender, method, path, data, params) => {
  const { accessToken } = decryptData(sender.credentials);
  const response = await axios({ method, url: `https://graph.facebook.com/${sender.apiVersion}/${path}`, data, params,
    timeout: 20000, headers: { Authorization: `Bearer ${accessToken}` } });
  return response.data;
};
async function configured() {
  const sender = await Sender.findById('default').select('+credentials').lean();
  if (!sender?.credentials || !sender.verifiedAt) throw new Error('Verify and save the shared sender first');
  return sender;
}
export async function publicSender() {
  const sender = await Sender.findById('default').lean();
  const templates = [DEFAULT_TEMPLATE_NAME, FALLBACK_TEMPLATE_NAME].map(name => {
    const template = sender?.templates?.find(item => item.name === name && item.language === DEFAULT_TEMPLATE_LANGUAGE);
    return { name, language: DEFAULT_TEMPLATE_LANGUAGE, status: template?.status || 'NOT_SUBMITTED',
      approved: Boolean(template && supported(template)), body: name === DEFAULT_TEMPLATE_NAME ? DEFAULT_TEMPLATE_BODY : FALLBACK_TEMPLATE_BODY };
  });
  return { configured: Boolean(sender?.verifiedAt), phoneNumberId: sender?.phoneNumberId || '', businessAccountId: sender?.businessAccountId || '',
    apiVersion: sender?.apiVersion || 'v24.0', verifiedAt: sender?.verifiedAt, lastSyncAt: sender?.lastSyncAt, templates,
    submissionComplete: templates.every(item => item.approved || ['PENDING', 'IN_APPEAL'].includes(item.status)) };
}
export async function saveSender(input, reviewerId) {
  const existing = await Sender.findById('default').select('+credentials').lean();
  const secrets = existing?.credentials ? decryptData(existing.credentials) : {};
  if (input.accessToken) secrets.accessToken = input.accessToken;
  if (input.appSecret) secrets.appSecret = input.appSecret;
  if (!secrets.accessToken || !secrets.appSecret) throw new Error('Access token and Meta App Secret are required');
  const candidate = { phoneNumberId: input.phoneNumberId, businessAccountId: input.businessAccountId,
    apiVersion: input.apiVersion, credentials: encryptData(secrets) };
  const phone = await graph(candidate, 'get', candidate.phoneNumberId, undefined, { fields: 'id' });
  let after, belongs = false;
  for (let page = 0; page < 20; page++) {
    const response = await graph(candidate, 'get', `${candidate.businessAccountId}/phone_numbers`, undefined, { fields: 'id', limit: 100, after });
    if (response.data?.some(item => String(item.id) === String(phone.id) && String(phone.id) === candidate.phoneNumberId)) { belongs = true; break; }
    if (!response.paging?.next) break;
    after = response.paging.cursors?.after;
    if (!after) break;
  }
  if (!belongs) throw new Error('The sender does not belong to this WhatsApp Business Account');
  const changed = !existing || existing.phoneNumberId !== candidate.phoneNumberId || existing.businessAccountId !== candidate.businessAccountId;
  try {
    const updated = await Sender.findOneAndUpdate({ _id: 'default', ...(existing ? { revision: existing.revision } : {}) }, {
      $set: { ...candidate, verifiedAt: new Date(), updatedBy: reviewerId, ...(changed ? { templates: [], lastSyncAt: null } : {}) },
      $inc: { revision: 1 },
    }, { upsert: !existing, new: true });
    if (!updated) throw conflict();
  } catch (error) { if (error.code === 11000) throw conflict(); throw error; }
  return publicSender();
}
export async function syncSenderTemplates() {
  const sender = await configured();
  const templates = []; let after;
  for (let page = 0; page < 20; page++) {
    const response = await graph(sender, 'get', `${sender.businessAccountId}/message_templates`, undefined,
      { fields: 'id,name,status,language,category,components,parameter_format', limit: 100, after });
    templates.push(...(response.data || []));
    if (!response.paging?.next) break;
    after = response.paging.cursors?.after;
    if (!after || page === 19) throw new Error('Template list could not be synced completely');
  }
  const updated = await Sender.updateOne({ _id: 'default', revision: sender.revision }, { $set: { templates, lastSyncAt: new Date() } });
  if (!updated.matchedCount) throw conflict();
  return publicSender();
}
async function sampleHandle(sender) {
  const buffer = await readFile(new URL('./assets/default-approval.png', import.meta.url));
  const session = await graph(sender, 'post', 'app/uploads', undefined, { file_length: buffer.length, file_type: 'image/png', file_name: 'incident-sample.png' });
  if (!/^upload:[a-zA-Z0-9_?=:.&%+\/-]+$/.test(session.id || '')) throw new Error('Meta did not return a valid upload session');
  const { accessToken } = decryptData(sender.credentials);
  const response = await axios({ method: 'post', url: `https://graph.facebook.com/${sender.apiVersion}/${session.id}`, data: buffer, timeout: 30000,
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' } });
  if (!response.data?.h) throw new Error('Meta did not return a sample image handle');
  return response.data.h;
}
export async function submitSenderTemplates() {
  await syncSenderTemplates();
  const sender = await configured();
  const errors = [];
  for (const name of [DEFAULT_TEMPLATE_NAME, FALLBACK_TEMPLATE_NAME]) {
    const existing = sender.templates.find(item => item.name === name && item.language === DEFAULT_TEMPLATE_LANGUAGE);
    if (existing && (supported(existing) || ['PENDING', 'IN_APPEAL'].includes(existing.status))) continue;
    try {
      if (!await Sender.exists({ _id: 'default', revision: sender.revision })) throw conflict();
      const image = name === DEFAULT_TEMPLATE_NAME;
      const components = [
        ...(image ? [{ type: 'HEADER', format: 'IMAGE', example: { header_handle: [await sampleHandle(sender)] } }] : []),
        { type: 'BODY', text: image ? DEFAULT_TEMPLATE_BODY : FALLBACK_TEMPLATE_BODY,
          example: { body_text: [image ? DEFAULT_TEMPLATE_EXAMPLE : DEFAULT_TEMPLATE_EXAMPLE.filter((_, index) => index !== 8)] } },
      ];
      if (!await Sender.exists({ _id: 'default', revision: sender.revision })) throw conflict();
      await graph(sender, 'post', existing?.id || `${sender.businessAccountId}/message_templates`, {
        ...(existing?.id ? {} : { name, language: DEFAULT_TEMPLATE_LANGUAGE, parameter_format: 'POSITIONAL' }), category: 'UTILITY', components,
      });
    } catch (error) { if (error.statusCode === 409) throw error; errors.push(name); }
  }
  const result = await syncSenderTemplates();
  if (errors.length) throw new Error(`Could not submit ${errors.join(', ')}. Sync and retry the remaining template.`);
  return result;
}
