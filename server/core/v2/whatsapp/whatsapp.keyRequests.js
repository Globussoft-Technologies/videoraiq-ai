import mongoose from 'mongoose';
import Admin from '../admin/admin.model.js';
import { WhatsAppSettings } from './whatsapp.model.js';

export async function requestSharedKeys(adminId, type) {
  const admin = await Admin.findById(adminId).select('name_f name_l login').lean();
  if (!admin) throw new Error('Account not found');
  try {
    await WhatsAppSettings.updateOne({ adminId }, { $setOnInsert: { adminId } }, { upsert: true });
  } catch (error) {
    // Another first-time request may have created the same unique tenant row.
    if (error.code !== 11000) throw error;
  }
  const source = type === 'cancel' ? 'env' : 'own';
  const sourceFilter = source === 'own' ? { $ne: 'env' } : 'env';
  const saved = await WhatsAppSettings.findOneAndUpdate({ adminId, credentialSource: sourceFilter,
    'sharedKeyRequest.status': { $ne: 'pending' } }, { $set: { sharedKeyRequest: {
      requestId: new mongoose.Types.ObjectId(), type, status: 'pending', requestedAt: new Date(),
      adminName: [admin.name_f, admin.name_l].filter(Boolean).join(' ') || admin.login,
    } } }, { new: true });
  if (!saved) { const error = new Error('A request is already pending or this action is not available in the current key mode.'); error.statusCode = 409; throw error; }
}
