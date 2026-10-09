import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: String, required: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true },
  schedule: {
    type: new mongoose.Schema({
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'], required: true },
      time: { type: String, default: '07:00' },
      weekday: { type: Number, min: 0, max: 6, default: 1 },
      dayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
    }, { _id: false }),
    required: true,
  },
  reportType: { type: String, enum: ['compare', 'absence', 'missed', 'hourly'], required: true },
  recipients: [{ type: String, lowercase: true, trim: true }],
  formats: [{ type: String, enum: ['pdf', 'xlsx'] }],
  enabled: { type: Boolean, default: true },
  // Avoid sending old occurrences immediately when created/re-enabled.
  activeFrom: { type: Date, default: Date.now },
  lastSentAt: { type: Date, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });
schema.index({ adminId: 1, channelId: 1, reportType: 1, title: 1 }, { unique: true, partialFilterExpression: { title: { $type: 'string' } } });

const deliverySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  end: { type: Date, required: true },
  status: { type: String, enum: ['preparing', 'sending', 'sent', 'failed'], required: true },
  token: String,
  leaseUntil: Date,
  sentAt: Date,
  error: String,
}, { timestamps: true });
deliverySchema.index({ scheduleId: 1, end: 1 }, { unique: true });
// Keep delivery history bounded without losing recent duplicate protection.
deliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const Delivery = mongoose.model('SolderReportDelivery', deliverySchema);
export default mongoose.model('SolderAutoEmailReport', schema);
