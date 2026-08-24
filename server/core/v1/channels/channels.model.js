import mongoose from "mongoose";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
import config from "config";
const APP_ENV = config.get("APP_ENV");

let ChannelSchema;

// The {mode, timezone, days} shape used by the per-camera detection schedule
// below. Exported (not inlined) so the NVR-level global schedule in
// core/v1/globalSchedule/globalSchedule.model.js persists the identical shape
// instead of redeclaring it — the two are evaluated by the same resolver.
export const detectionScheduleSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["always", "custom"],
      default: "always",
    },
    timezone: {
      type: String,
      default: null,
    },
    days: {
      monday: [{ start: String, end: String, _id: false }],
      tuesday: [{ start: String, end: String, _id: false }],
      wednesday: [{ start: String, end: String, _id: false }],
      thursday: [{ start: String, end: String, _id: false }],
      friday: [{ start: String, end: String, _id: false }],
      saturday: [{ start: String, end: String, _id: false }],
      sunday: [{ start: String, end: String, _id: false }],
    },
  },
  { _id: false },
);

const detectionSettingSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DetectionSetting",
      default: null,
    },
    enabled: Boolean,
    schedule: {
      type: detectionScheduleSchema,
      default: undefined,
    },
    /**
     * MANUAL OVERRIDE — a human toggled this detector against what the
     * governing schedule wanted.
     *
     * Without these two fields a manual toggle is indistinguishable from the
     * drift the one-minute runner exists to correct, so the runner reverts it
     * within the minute. Recording the intent, and when it lapses, is what
     * lets the toggle win for the rest of the current window.
     *
     * overrideState  what the human chose (mirrors `enabled` at toggle time)
     * overrideUntil  the instant the schedule would next have changed the
     *                state anyway; past that the override is inert and the
     *                schedule silently takes back over. Absent on every
     *                document written before this feature, which reads as
     *                "no override" — existing schedules are unaffected.
     */
    overrideState: {
      type: Boolean,
      default: undefined,
    },
    overrideUntil: {
      type: Date,
      default: undefined,
    },
  },
  { _id: false }, // prevent nested _id creation
);
//newchanges



const detectionFields = {
  countPersonsSettings: detectionSettingSchema,
  motionDetectionSettings: detectionSettingSchema,
  genericObjectDetectionSettings: detectionSettingSchema,
  countVehiclesSettings: detectionSettingSchema,
  loiteringWithoutAuthSettings: detectionSettingSchema,
  loiteringWithAuthSettings: detectionSettingSchema,
  unauthorizedAccessSettings: detectionSettingSchema,
  lineCrossingSettings: detectionSettingSchema,
  fireSmokeDetectionSettings: detectionSettingSchema,
  weaponDetectionSettings: detectionSettingSchema,
  unattendedBaggageDetectionSettings: detectionSettingSchema,
  personalProtectiveEquipmentSettings: detectionSettingSchema,
  crowdDetectionSettings: detectionSettingSchema,
  doorDetectionSettings: detectionSettingSchema,
  lightDetectionSettings: detectionSettingSchema,
  vehicleDetectionSettings: detectionSettingSchema,
  deskAbsenceSettings: detectionSettingSchema,
  guardAbsenceSettings: detectionSettingSchema,
  conveyorDetectionSettings: detectionSettingSchema,
  crusherDetectionSettings: detectionSettingSchema,
  waterSpillageDetectionSettings: detectionSettingSchema,
  loiteringDetectionSettings: detectionSettingSchema,
  vehicleTypeDetectionSettings: detectionSettingSchema,
  tableOccupancyDetectionSettings: detectionSettingSchema,
  foodServicePPEDetectionSettings: detectionSettingSchema,
  vehicleObstructionSettings: detectionSettingSchema,
  mobilePhoneDetectionSettings: detectionSettingSchema,
  carModelDetectionSettings: detectionSettingSchema,
};

// ! old
const cloudSchema = new mongoose.Schema(
  {
    nvrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NVR",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    channelId: String,
    rtspChannels: [Object],
    name: String,
    ipAddress: String,
    model: String,
    serialNumber: String,
    firmwareVersion: String,
    streamEndpoint: {
      type: String,
      required: true,
    },
    isAdded: {
      type: Boolean,
      default: false,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // 🔍 Detection features
    detections: detectionFields,

    // 🟡 Detection status: 0 = pending, 1 = approved, 2 = rejected
    detectionStatus: {
      type: Number,
      enum: [0, 1, 2],
      default: 0,
    },
    // 🎮 Control status: 0 = stop, 1 = start
    control: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    customName: String,
    department: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    checkType: {
      type: String,
      enum: ["checkin", "checkout", "none"],
      default: "none",
    },
    alerts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "recipients",
        }
      ],
      default: []
    }
  },
  { timestamps: true },
);

// ! new
const localSchema = new mongoose.Schema(
  {
    nvrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NVR",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    streamingPath: {
      type: String,
      required: true,
    },
    localChannelId: {
      type: String,
      required: true,
    },
    name: String,
    isAdded: {
      type: Boolean,
      default: false,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },

    // 🔍 Detection features
    detections: detectionFields,

    // 🟡 Detection status: 0 = pending, 1 = approved, 2 = rejected
    detectionStatus: {
      type: Number,
      enum: [0, 1, 2],
      default: 0,
    },
    // 🎮 Control status: 0 = stop, 1 = start
    control: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    customName: String,
    department: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    checkType: {
      type: String,
      enum: ["checkin", "checkout", "none"],
      default: "none",
    },
    // 📨 Alerts
    alerts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "recipients",
        }
      ],
      default: []
    }
  },
  { timestamps: true },
);

if (APP_ENV === "cloud") {
  ChannelSchema = cloudSchema;
} else {
  ChannelSchema = localSchema;
}

ChannelSchema.pre("save", function (next) {
  try {
    const detectionFields = Object.keys(this.detections || {});

    // Check if any detection is enabled
    const anyEnabled = detectionFields.some(
      (field) => this.detections?.[field]?.enabled === true,
    );

    // Set control based on detections
    this.control = anyEnabled ? 1 : 0;

    next();
  } catch (err) {
    next(err);
  }
});

const applyChannelFilters = async function () {
  const memberId = this.options?.memberId;
  const includeInactive = this.options?.includeInactive;

  // Only filter by isAdded if not explicitly including inactive channels
  if (!includeInactive) {
    const existingQuery = this.getQuery();
    this.where({
      $and: [existingQuery, { isAdded: true }],
    });
  }

  // No member → allow full access
  if (!memberId) return;

  // Fetch allowed channels
  const authorized = await authorizedChannelsModel.findOne({
    userId: memberId,
  });
  if (!authorized) return;

  const allowed = authorized.channels; // ensure correct field

  // If allowed list empty → block all results
  if (!Array.isArray(allowed) || allowed.length === 0) {
    this.where({ _id: { $in: [] } });
    return;
  }

  // --- MERGE EXISTING QUERY WITH AUTHORIZATION FILTER ---
  const existingQuery = this.getQuery();

  this.where({
    $and: [existingQuery, { _id: { $in: allowed } }],
  });
};

ChannelSchema.pre(/^find/, applyChannelFilters);
ChannelSchema.pre('countDocuments', applyChannelFilters);

ChannelSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isAdded: true });
};

ChannelSchema.statics.findByIdActive = function (id) {
  return this.findById(id).where({ isAdded: true });
};

export default mongoose.model("Channel", ChannelSchema);
