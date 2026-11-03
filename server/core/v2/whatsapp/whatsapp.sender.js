import config from 'config';
import { encryptData } from '../../../utils/cryptoUtils.js';
import { WhatsAppSettings } from './whatsapp.model.js';

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
// ENV credentials are resolved at runtime and are never saved to the tenant row.
export function resolveSender(settings) {
  if (!settings) return settings;
  const value = settings.toObject?.() || { ...settings };
  if (value.credentialSource === 'env') {
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
