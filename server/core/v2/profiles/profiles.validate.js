import Joi from "joi";
import moment from "moment-timezone";
const validTimezones = moment.tz.names();

// 1: Basics
const timeSlotValidator = Joi.object({
  startTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
  endTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
});

const basicsValidator = Joi.object({
  profileName: Joi.string().required(),
  timeZone: Joi.string()
    .valid(...validTimezones)
    .default("UTC")
    .messages({
      "any.only": "timeZone must be a valid IANA timezone (e.g., Asia/Kolkata)",
    }),

  days: Joi.object({
    monday: Joi.array().items(timeSlotValidator).default([]),
    tuesday: Joi.array().items(timeSlotValidator).default([]),
    wednesday: Joi.array().items(timeSlotValidator).default([]),
    thursday: Joi.array().items(timeSlotValidator).default([]),
    friday: Joi.array().items(timeSlotValidator).default([]),
    saturday: Joi.array().items(timeSlotValidator).default([]),
    sunday: Joi.array().items(timeSlotValidator).default([]),
  }).required(),
});

// 2: Notification
const notificationValidator = Joi.object({
  notify: Joi.string().valid("Digest", "Instant").default("Digest"),
  digestEveryMinutes: Joi.number().min(1).default(15),

  recipients: Joi.array().items(Joi.string().hex().length(24)).optional(),

  channels: Joi.object({
    email: Joi.boolean().default(false),
    smsWhatsapp: Joi.boolean().default(false),
    push: Joi.boolean().default(false),
    webhook: Joi.boolean().default(false),
  }),

  webhooks: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      method: Joi.string()
        .valid("GET", "POST", "PUT", "DELETE")
        .default("POST"),
      body: Joi.string().allow("").default(""),
    })
  ),

  enableQuietHours: Joi.boolean().default(false),
  quietFrom: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .optional(),
  quietTo: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .optional(),
  // quietMode: Joi.string().valid("Digest only", "Mute", "Allow"),
  // maxNotificationsPerDay: Joi.object({
  //   low: Joi.number().default(24),
  //   moderate: Joi.number().default(48),
  //   high: Joi.number().default(0),
  //   critical: Joi.number().default(3),
  // }),

  // stormControl: Joi.object({
  //   perMinuteCap: Joi.number().default(0),
  //   perDayCap: Joi.number().default(0),
  //   onCap: Joi.string().valid("Digest only", "Pause").default("Digest only"),
  //   critical: Joi.number().default(0),
  // }),
});

// 3: Evidence & Severity
const evidenceSeverityValidator = Joi.object({
  evidenceType: Joi.string()
    .valid("Snapshot", "Video", "None")
    .default("Snapshot"),

  time: Joi.number().min(1).default(15),
  storage: Joi.string().hex().length(24),
});

// 4: Default Detection Settings
const detectionObjectItemValidator = Joi.object({
  name: Joi.string().required(),
  notify: Joi.boolean().required(),
  enable: Joi.boolean().required(),
});

const defaultDetectionSettingsValidator = Joi.object({
  authorisedUsers: Joi.array().items(Joi.string().hex().length(24)).optional(),

  objects: Joi.object({
    personalProtectiveEquipment: Joi.array()
      .items(detectionObjectItemValidator)
      .optional(),

    crowdDetection: Joi.array().items(detectionObjectItemValidator).optional(),
  }).required(),
});

// Main Profile
export const createProfileValidator = Joi.object({
  userType: Joi.string().valid("Admin", "users").required(),
  user: Joi.string().hex().length(24).required(),
  createdBy: Joi.string().hex().length(24).required(),
  //   status: Joi.string().valid("Active", "Inactive").default("Inactive"),

  basics: basicsValidator.required(),
  notification: notificationValidator.required(),
  evidenceSeverity: evidenceSeverityValidator.required(),
  defaultDetectionSettings: defaultDetectionSettingsValidator,
});

export const editProfileValidator = Joi.object({
  user: Joi.string().hex().length(24),
  userType: Joi.string().valid("Admin", "users"),
  // status: Joi.string().valid("Active", "Inactive"),

  basics: basicsValidator, // all optional
  notification: notificationValidator,
  evidenceSeverity: evidenceSeverityValidator,
  defaultDetectionSettings: defaultDetectionSettingsValidator,
});
