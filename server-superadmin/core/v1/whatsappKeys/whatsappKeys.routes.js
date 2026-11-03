import { Router } from 'express';
import mongoose from 'mongoose';
import verifySuperAdmin from '../../../middlewares/verifySuperAdmin.js';
import Admin from '../admin/admin.model.js';
import WhatsAppKeyAccess from './whatsappKeys.model.js';
import Sender from './whatsapp.sharedSender.model.js';

const router = Router();
router.use(verifySuperAdmin);
router.get('/', async (req, res, next) => {
  try {
    if (req.query.countOnly === 'true') {
      res.set('Cache-Control', 'no-store');
      return res.json({ pendingCount: await WhatsAppKeyAccess.countDocuments({ 'sharedKeyRequest.status': 'pending' }) });
    }
    const status = req.query.status || 'pending';
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return res.status(400).json({ message: 'Invalid request status' });
    const filter = status === 'all' ? { 'sharedKeyRequest.requestId': { $exists: true } } : { 'sharedKeyRequest.status': status };
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const [rows, total, pendingCount] = await Promise.all([
      WhatsAppKeyAccess.find(filter).select('adminId credentialSource sharedKeyRequest').sort({ 'sharedKeyRequest.requestedAt': -1 }).skip((page - 1) * 25).limit(25).lean(),
      WhatsAppKeyAccess.countDocuments(filter),
      WhatsAppKeyAccess.countDocuments({ 'sharedKeyRequest.status': 'pending' }),
    ]);
    const admins = await Admin.find({ _id: { $in: rows.map(row => row.adminId) } }).select('login name_f name_l email').lean();
    const byId = new Map(admins.map(admin => [String(admin._id), admin]));
    res.set('Cache-Control', 'no-store');
    return res.json({ requests: rows.map(row => ({ ...row, account: byId.get(String(row.adminId)) || null })), total, pendingCount, page });
  } catch (error) { next(error); }
});
router.post('/:adminId/:requestId/decision', async (req, res, next) => {
  try {
    const { adminId, requestId } = req.params;
    if (!mongoose.isValidObjectId(adminId) || !mongoose.isValidObjectId(requestId) || !['approve', 'reject'].includes(req.body?.decision)) return res.status(400).json({ message: 'Invalid request or decision' });
    if (!await Admin.exists({ _id: adminId })) return res.status(404).json({ message: 'Account no longer exists' });
    const filter = { adminId, 'sharedKeyRequest.requestId': requestId, 'sharedKeyRequest.status': 'pending' };
    const row = await WhatsAppKeyAccess.findOne(filter).select('credentialSource sharedKeyRequest').lean();
    if (!row) return res.status(409).json({ message: 'Request was already reviewed or replaced. Refresh the list.' });
    const cancellation = row.sharedKeyRequest.type === 'cancel';
    if ((cancellation && row.credentialSource !== 'env') || (!cancellation && row.credentialSource === 'env')) return res.status(409).json({ message: 'Account key mode changed. Refresh the list.' });
    filter.credentialSource = cancellation ? 'env' : { $ne: 'env' };
    const approve = req.body.decision === 'approve';
    if (approve && !cancellation && !await Sender.exists({ _id: 'default', verifiedAt: { $ne: null },
      credentials: { $type: 'string', $ne: '' }, phoneNumberId: { $type: 'string', $ne: '' }, businessAccountId: { $type: 'string', $ne: '' } })) {
      return res.status(409).json({ message: 'Verify and save the shared WhatsApp sender before approving access.' });
    }
    const changes = { 'sharedKeyRequest.status': approve ? 'approved' : 'rejected',
      'sharedKeyRequest.reviewedAt': new Date(), 'sharedKeyRequest.reviewedBy': req.superAdmin._id };
    if (approve) Object.assign(changes, { credentialSource: cancellation ? 'own' : 'env', enabled: false,
      alertsPaused: cancellation, ownReverificationRequired: cancellation,
      templates: [], selectedTemplate: null, fallbackTemplate: null, lastSyncAt: null, senderIdentity: null });
    const updated = await WhatsAppKeyAccess.updateOne(filter, { $set: changes });
    if (!updated.modifiedCount) return res.status(409).json({ message: 'Request was already reviewed. Refresh the list.' });
    return res.json({ status: approve ? 'approved' : 'rejected' });
  } catch (error) { next(error); }
});
export default router;
