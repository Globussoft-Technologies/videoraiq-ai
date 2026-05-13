import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * 1: Basics
 */
const timeSlotSchema = new Schema(
  { startTime: { type: String }, endTime: { type: String } },
  { _id: false },
);

const basicsSchema = new Schema(
  {
    profileName: { type: String, required: true },
    timeZone: { type: String, default: "UTC" },
    days: {
      monday: [timeSlotSchema],
      tuesday: [timeSlotSchema],
      wednesday: [timeSlotSchema],
      thursday: [timeSlotSchema],
      friday: [timeSlotSchema],
      saturday: [timeSlotSchema],
      sunday: [timeSlotSchema],
    },
  },
  { _id: false },
);

/**
 * 2: Notification
 */
const notificationSchema = new Schema(
  {
    notify: { type: String, enum: ["Digest", "Instant"], default: "Digest" },
    digestEveryMinutes: { type: Number, default: 15 },

    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "recipients" }], // list of webhook/email/phone

    channels: {
      _id: false,
      email: { type: Boolean, default: false },
      smsWhatsapp: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
      webhook: { type: Boolean, default: false },
    },

    webhooks: [
      {
        _id: false,
        url: String,
        method: { type: String, default: "POST" },
        body: { type: String, default: "" },
      },
    ],
    enableQuietHours: { type: Boolean, default: false },
    quietFrom: { type: String }, // "HH:mm"
    quietTo: { type: String },
    // quietMode: { type: String, enum: ["Digest only", "Mute", "Allow"] },

    // Retention & Storm Control
    // maxNotificationsPerDay: {
    //   _id: false,
    //   low: { type: Number, default: 24 }, // every hour
    //   moderate: { type: Number, default: 48 }, // every 30 mins
    //   high: { type: Number, default: 0 }, // every 15 mins
    //   critical: { type: Number, default: 3 }, // every 1 min
    // },

    // stormControl: {
    //   _id: false,
    //   perMinuteCap: { type: Number, default: 0 },
    //   perDayCap: { type: Number, default: 0 },
    //   onCap: {
    //     type: String,
    //     enum: ["Digest only", "Pause"],
    //     default: "Digest only",
    //   },
    //   critical: { type: Number, default: 0 },
    // },
  },
  { _id: false },
);

/**
 * 3: Evidence & Severity
 */
const evidenceSeveritySchema = new Schema(
  {
    evidenceType: {
      type: String,
      enum: ["Snapshot", "Video", "None"],
      default: "Snapshot",
    },
    time: { type: Number, default: 15 },
    storage: { type: mongoose.Schema.Types.ObjectId, ref: "storages" },
  },
  { _id: false },
);

/**
 * 4: Default detection settings
 */
const defaultDetectionSettingsSchema = new Schema(
  {
    authorisedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "authorizedUsers",
      },
    ],
    // objects: [{ type: String, _id: false }], // e.g. ["Person", "Vehicle"]
    objects: {
      personalProtectiveEquipment: [
        { _id: false, name: String, notify: Boolean, enable: Boolean },
      ],
      crowdDetection: [
        { _id: false, name: String, notify: Boolean, enable: Boolean },
      ],
    },
  },
  { _id: false },
);

/**
 * Main Profile schema
 */
const profileSchema = new Schema(
  {
    userType: {
      type: String,
      required: true,
      enum: ["Admin", "users"], // either Admin or User
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType", // dynamically references based on userType
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    status: { type: String, enum: ["Active", "Inactive"], default: "Inactive" },
    basics: basicsSchema,
    notification: notificationSchema,
    evidenceSeverity: evidenceSeveritySchema,
    defaultDetectionSettings: defaultDetectionSettingsSchema,
  },
  { timestamps: true },
);

export default mongoose.model("Profile", profileSchema);
