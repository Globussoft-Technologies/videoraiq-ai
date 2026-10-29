import mongoose from 'mongoose';
import { invalidateApiCache } from '../../../services/apiCache.service.js';

// Effective-dated baseline changes; explicit day overrides take precedence.
const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, required: true },
  from: { type: String, required: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, default: null },
  assignedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
schema.index({ adminId: 1, employee: 1, from: 1 }, { unique: true });
schema.plugin(invalidateApiCache, { domains: ['schedule'] });
export default mongoose.model('ShiftEffectiveAssignment', schema);
