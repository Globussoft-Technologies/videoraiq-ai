import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const recipientSchema = new Schema({
  adminId: {
    type: Types.ObjectId,
    required: true,
    ref: 'admins'
  },
  type: {
    type: String,
    enum: ['email', 'phone'],
    required: true
  },
  fullName:{
    type:String,
    default:null
  },
  value: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifyOTP:{
    type:String
  },
  otpExpireDate: {
    type: Date
  },
  // Detection types this recipient subscribes to: alerts of these types from
  // every camera. Empty = only detections they are selected on, any type.
  incidentTypes: {
    type: [String],
    default: []
  },
  // Labels: the departments this recipient belongs to. Only used to find them
  // in a detection's Select Recipients; they never change which alerts they get.
  departmentIds: {
    type: [{ type: Types.ObjectId, ref: 'Department' }],
    default: []
  },
  // Per detection type: the incident severities to email about, e.g.
  // { crowdDetection: ['high'] }. A type missing or empty = every severity.
  // Keys are the same incident keys as incidentTypes. Validated by Joi.
  severityByType: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // The login user (Users page) this row belongs to. Name and email follow
  // the user; the alert subscriptions above stay admin-owned.
  // Kept in sync by userRecipients.js.
  userId: {
    type: Types.ObjectId,
    ref: 'users',
    default: undefined
  },
  // true = created for the user, so it is deleted with them. Absent = an admin
  // added it before the user existed; it is only unlinked when the user goes.
  autoCreated: {
    type: Boolean,
    default: undefined
  }
}, { timestamps: true });

// One recipient per user. Only rows holding a real user id count, so the many
// unlinked rows never collide.
recipientSchema.index(
  { adminId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);

const RecipientModel = model('recipients', recipientSchema);
export default RecipientModel;

/** 'low' | 'moderate' | 'high', or null. Legacy "Medium"/"HIGH" spellings included. */
export const normalizeSeverity = (value) => {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'medium') return 'moderate';
  return ['low', 'moderate', 'high'].includes(s) ? s : null;
};

// Subscription keys older recipient forms saved for these incident types (they
// never matched an incident). Still honoured so those recipients get alerted
// without being re-saved; the form now saves the real type.
const LEGACY_SUBSCRIPTION_KEYS = {
  personalProtectiveEquipment: ['personProtectiveEquipment'],
  loadingUnloadingStockCountingDetection: ['loadingUnloadingStockCounting'],
};

const subscriptionKeys = (detectionType) => [detectionType, ...(LEGACY_SUBSCRIPTION_KEYS[detectionType] || [])];

/**
 * Who an incident's alert goes to. Two ways, verified recipients only:
 * - selectedRecipientsQuery: ticked on the detection (its Select Recipients,
 *   `ids`). Their Detection Types must be empty or include the incident's
 *   type. Email and phone (WhatsApp).
 * - subscribedRecipientsQuery: their Detection Types include the incident's
 *   type, from every camera. Email only.
 * Both honour the severities a recipient picked for the type: none picked =
 * every severity, and an incident of unknown severity (`severity` null) is not
 * dropped. Used by both alert.events.js (v1 and v2).
 */
const noLimitOr = (path, match) => ({
  $or: [{ [path]: { $exists: false } }, { [path]: { $size: 0 } }, { [path]: match }],
});
const severityFits = (detectionType, severity) =>
  (severity ? [noLimitOr(`severityByType.${detectionType}`, severity)] : []);

export const selectedRecipientsQuery = ({ ids, type = 'email', detectionType, severity = null }) => ({
  _id: { $in: ids || [] },
  type,
  verified: true,
  $and: [
    noLimitOr('incidentTypes', { $in: subscriptionKeys(detectionType) }),
    ...severityFits(detectionType, severity),
  ],
});

export const subscribedRecipientsQuery = ({ adminId, detectionType, severity = null }) => ({
  adminId,
  type: 'email',
  verified: true,
  incidentTypes: { $in: subscriptionKeys(detectionType) },
  ...(severity ? { $and: severityFits(detectionType, severity) } : {}),
});

