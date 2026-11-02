import multer from 'multer';
import { Router } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Admin from '../admin/admin.model.js';
import verifyToken from '../../../middlewares/verifyToken.js';
import { WhatsAppSettings, WhatsAppDelivery } from './whatsapp.model.js';
import * as service from './whatsapp.service.js';

const router = Router();
// Public Meta callbacks. Signature verification uses the exact JSON bytes.
router.get('/webhook/:adminId', async (req, res) => {
  try {
  if (!mongoose.isValidObjectId(req.params.adminId)) return res.sendStatus(404);
  const settings = await WhatsAppSettings.findOne({ adminId: req.params.adminId }).select('+webhookVerifyToken');
  if (settings?.webhookVerifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === settings.webhookVerifyToken) return res.send(String(req.query['hub.challenge'] || ''));
  return res.sendStatus(403);
  } catch { return res.sendStatus(500); }
});
router.post('/webhook/:adminId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.adminId)) return res.sendStatus(404);
    const settings = await WhatsAppSettings.findOne({ adminId: req.params.adminId }).select('+credentials');
    if (!settings?.credentials || !await service.webhook(settings, req.rawBody, req.get('x-hub-signature-256'), req.body)) return res.sendStatus(403);
    return res.sendStatus(200);
  } catch { return res.sendStatus(500); }
});
router.use(verifyToken);
router.use(async (req, res, next) => {
  // Credentials and recipient consent are managed by the account owner only.
  if (!req.verified?.userData?.adminId || req.verified.userData.memberId || req.verified.userData.system) return res.status(403).json({ message: 'Only the account owner can manage WhatsApp alerts' });
  try {
    if (!await Admin.exists({ _id: req.verified.userData.adminId })) return res.sendStatus(403);
  } catch (error) { return next(error); }
  res.set('Cache-Control', 'no-store');
  req.whatsappAdminId = req.verified.userData.adminId;
  next();
});
router.use(rateLimit({ windowMs: 60000, max: 40 }));
const run = (schema, handler) => async (req, res) => {
  try {
    const input = schema ? await schema.validateAsync(req.body, { abortEarly: false }) : {};
    return res.json(await handler(req.whatsappAdminId, input, req));
  } catch (error) {
    return res.status(error.response?.status === 429 ? 429 : 400).json({ message: error.response?.data?.error?.message || error.message });
  }
};
const numericId = Joi.string().trim().pattern(/^\d{5,30}$/).required();
const settingsSchema = Joi.object({ phoneNumberId: numericId, businessAccountId: numericId,
  apiVersion: Joi.string().pattern(/^v\d{1,2}\.0$/).required(), accessToken: Joi.string().max(4096).allow(''), appSecret: Joi.string().max(256).allow('') });
router.get('/settings', run(null, service.publicSettings));
router.put('/settings', run(settingsSchema, service.saveSettings));
router.post('/templates/sync', run(Joi.object({}), service.syncTemplates));
router.post('/templates/sample', (req, res, next) => {
  multer({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('file')(req, res, error => error ? res.status(400).json({ message: 'Choose one JPEG or PNG up to 5 MB' }) : next());
}, run(null, (adminId, input, req) => service.uploadTemplateSample(adminId, req.file)));
router.post('/templates', run(Joi.object({ imageHeader: Joi.boolean().default(false), sampleHandle: Joi.when('imageHeader', { is: true, then: Joi.string().max(4096).required(), otherwise: Joi.forbidden() }), name: Joi.string().pattern(/^[a-z][a-z0-9_]{2,100}$/).required(), language: Joi.string().pattern(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).required() }), service.requestTemplate));
router.put('/template', run(Joi.object({ fallback: Joi.object({ name: Joi.string().required(), language: Joi.string().required() }), name: Joi.string().max(512).required(), language: Joi.string().max(20).required() }), service.selectTemplate));
router.put('/enabled', run(Joi.object({ enabled: Joi.boolean().required() }), async (adminId, { enabled }) => {
  if (enabled) throw new Error('Select an approved template to enable WhatsApp alerts');
  await WhatsAppSettings.updateOne({ adminId }, { $set: { enabled: false } });
  return service.publicSettings(adminId);
}));
router.post('/recipients', run(Joi.object({ name: Joi.string().trim().min(1).max(100).required(), phone: Joi.string().pattern(/^\+[1-9]\d{7,14}$/).required(), optedIn: Joi.boolean().valid(true).required() }), async (adminId, input) => {
  const settings = await WhatsAppSettings.findOne({ adminId });
  if (!settings) throw new Error('Configure WhatsApp first');
  if (settings.recipients.length >= 100) throw new Error('Maximum 100 WhatsApp recipients');
  if (settings.recipients.some(item => item.phone === input.phone)) throw new Error('This number is already added');
  settings.recipients.push({ name: input.name, phone: input.phone, optedInAt: new Date() });
  await settings.save();
  return service.publicSettings(adminId);
}));
router.delete('/recipients/:id', run(null, async (adminId, input, req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new Error('Invalid recipient');
  await WhatsAppSettings.updateOne({ adminId }, { $pull: { recipients: { _id: req.params.id } } });
  return service.publicSettings(adminId);
}));
router.post('/test-sample', run(Joi.object({ recipientId: Joi.string().hex().length(24).required() }), (adminId, { recipientId }) => service.sendSampleMessage(adminId, recipientId)));
router.post('/test', run(Joi.object({ recipientId: Joi.string().hex().length(24).required() }), async (adminId, { recipientId }) => {
  const settings = await WhatsAppSettings.findOne({ adminId });
  const recipient = settings?.recipients.find(item => String(item._id) === recipientId && item.optedInAt);
  if (!recipient || !settings.enabled) throw new Error('Enable alerts and choose an opted-in recipient');
  return { results: await service.sendTemplateAlert(adminId, { incidentName: 'Test incident', severity: 'low', timeOfIncident: new Date(), description: 'WhatsApp alert setup test' }, [recipient.phone]) };
}));
router.get('/webhook-config', run(null, async adminId => {
  const settings = await WhatsAppSettings.findOne({ adminId }).select('+webhookVerifyToken');
  return { path: `/api/v2/whatsapp/webhook/${adminId}`, verifyToken: settings?.webhookVerifyToken || '', field: 'messages' };
}));
router.get('/deliveries', run(null, async adminId => ({ deliveries: await WhatsAppDelivery.find({ adminId }).sort({ createdAt: -1 }).limit(30).select('-__v -expiresAt').lean() })));
export default router;
