import config from 'config';
import { encryptData, decryptData } from '../../../utils/cryptoUtils.js';
import { WhatsAppSettings } from './whatsapp.model.js';
import SharedSender from './whatsapp.sharedSender.model.js';
import { DEFAULT_TEMPLATE_NAME, FALLBACK_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE, supportedDefaultTemplate, supportedFallbackTemplate } from './whatsapp.templateDefinitions.js';

function envValue(name, key) {
  return process.env[name] || (config.has(`WhatsApp.${key}`) ? config.get(`WhatsApp.${key}`) : '');
}
export function environmentSender() {
  const sender = {
    phoneNumberId: envValue('WHATSAPP_PHONE_NUMBER_ID', 'phoneNumberId'),
    businessAccountId: envValue('WHATSAPP_BUSINESS_ACCOUNT_ID', 'businessAccountId'),
    apiVersion: envValue('WHATSAPP_API_VERSION', 'apiVersion') || 'v24.0',
    accessToken: envValue('WHATSAPP_ACCESS_TOKEN', 'accessToken'),
    appSecret: envValue('WHATSAPP_APP_SECRET', 'appSecret'),
  };
  if (!sender.phoneNumberId || !sender.businessAccountId || !sender.accessToken || !sender.appSecret) {
    const error = new Error('Shared WhatsApp sender is not configured. Contact the Super Admin.');
    error.statusCode = 503; throw error;
  }
  return sender;
}
// Prefer the Super Admin sender. ENV remains a legacy fallback only while no
// central sender exists. Neither source is copied into a tenant's saved keys.
export async function resolveSender(settings) {
  if (!settings) return settings;
  const value = settings.toObject?.() || { ...settings };
  if (value.credentialSource === 'env') {
    const shared = await SharedSender.findById('default').select('+credentials').lean();
    if (shared) {
      if (!shared.verifiedAt || !shared.credentials || !shared.phoneNumberId || !shared.businessAccountId || !shared.apiVersion) throw new Error('Shared sender must be verified in Super Admin settings');
      const secrets = decryptData(shared.credentials);
      if (!secrets.accessToken || !secrets.appSecret) throw new Error('Shared sender credentials are incomplete');
      value.phoneNumberId = shared.phoneNumberId; value.businessAccountId = shared.businessAccountId;
      value.apiVersion = shared.apiVersion; value.credentials = shared.credentials;
      value.templates = shared.templates.filter(item => [DEFAULT_TEMPLATE_NAME, FALLBACK_TEMPLATE_NAME].includes(item.name)
        && item.language === DEFAULT_TEMPLATE_LANGUAGE);
      const approved = shared.templates.find(supportedDefaultTemplate) || shared.templates.find(supportedFallbackTemplate);
      const fallback = shared.templates.find(supportedFallbackTemplate);
      value.selectedTemplate = approved ? { name: approved.name, language: approved.language } : null;
      value.fallbackTemplate = fallback ? { name: fallback.name, language: fallback.language } : null;
      value.enabled = Boolean(approved) && !value.alertsPaused;
      value.lastSyncAt = shared.lastSyncAt;
      value.sharedSenderManaged = true;
      return value;
    }
    const sender = environmentSender();
    value.phoneNumberId = sender.phoneNumberId;
    value.businessAccountId = sender.businessAccountId;
    value.apiVersion = sender.apiVersion;
    value.credentials = encryptData({ accessToken: sender.accessToken, appSecret: sender.appSecret });
  } else if (value.ownReverificationRequired) {
    value.credentials = null;
    value.enabled = false;
  }
  if (value.senderIdentity && value.senderIdentity !== `${value.phoneNumberId}:${value.businessAccountId}`) {
    value.templates = []; value.selectedTemplate = null; value.enabled = false;
  }
  return value;
}
export async function senderSettings(adminId) {
  return resolveSender(await WhatsAppSettings.findOne({ adminId }).select('+credentials'));
}
