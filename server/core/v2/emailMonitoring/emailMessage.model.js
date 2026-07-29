import mongoose from "mongoose";

/**
 * One document per message, not per event.
 *
 * The dashboard needs both shapes: the KPI cards and the activity table count
 * messages, while the Status Distribution donut counts *events* (one message
 * can be delivered, then opened, then clicked). Keeping the lifecycle in an
 * `events[]` array on the message serves both from a single collection —
 * `$unwind` for the donut, plain `$match` for everything else.
 */

// Webhook events arrive out of order often enough to matter: a late
// `delivered` must not overwrite an `opened` that already landed. Status only
// ever moves forward through this ranking, and a hard failure always wins
// because a bounced message was never really delivered.
const STATUS_RANK = {
  queued: 0,
  received: 1,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  deferred: 5,
  failed: 10,
  bounced: 10,
  spam: 10,
};

export const rankOf = (status) => STATUS_RANK[status] ?? -1;

const emailMessageSchema = new mongoose.Schema(
  {
    // The "organization" in the UI. Null for system mail with no tenant
    // (OTP, password reset), which then only shows under All Organizations.
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

    // SendGrid's x-message-id, used to correlate webhook events back here.
    messageId: { type: String, default: null },

    direction: { type: String, enum: ["sent", "received"], default: "sent" },

    sender: { type: String, default: "" },
    recipient: { type: String, default: "" },
    // Denormalised so the Domain Traffic widget is a plain $group instead of
    // a $split on every document in the range.
    recipientDomain: { type: String, default: "" },

    subject: { type: String, default: "" },
    // Detection type for incident alerts; free-form otherwise. Drives the
    // Top Senders breakdown.
    category: { type: String, default: "" },

    status: {
      type: String,
      enum: Object.keys(STATUS_RANK),
      default: "sent",
    },

    error: { type: String, default: "" },

    events: [
      {
        _id: false,
        type: { type: String },
        at: { type: Date },
        reason: { type: String },
      },
    ],

    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "emailmessages" }
);

// Every dashboard query is "this org, this time window", plus an all-orgs
// variant for superadmin.
emailMessageSchema.index({ adminId: 1, timestamp: -1 });
emailMessageSchema.index({ timestamp: -1 });
emailMessageSchema.index({ messageId: 1 });

export default mongoose.model("EmailMessage", emailMessageSchema);
