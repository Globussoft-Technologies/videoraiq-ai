import Joi from "joi";

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const validateScheduleWindows = (value, helpers) => {
  if (value.mode !== "custom") return value;

  const days = value.days || {};
  let hasWindow = false;

  for (const day of weekdays) {
    const windows = days[day] || [];
    const sorted = windows
      .map((window) => ({
        ...window,
        startMinutes: timeToMinutes(window.start),
        endMinutes: timeToMinutes(window.end),
      }))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      hasWindow = true;

      if (current.startMinutes >= current.endMinutes) {
        return helpers.message(`${day} schedule start must be before end`);
      }

      const next = sorted[index + 1];
      if (next && current.endMinutes > next.startMinutes) {
        return helpers.message(`${day} schedule windows cannot overlap`);
      }
    }
  }

  if (!hasWindow) {
    return helpers.message("Custom schedule must include at least one time window");
  }

  return value;
};

const timeWindowSchema = Joi.object({
  start: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  end: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
});

const daysSchema = Joi.object(
  weekdays.reduce((schema, day) => {
    schema[day] = Joi.array().items(timeWindowSchema).default([]);
    return schema;
  }, {}),
).default({});

const scheduleSchema = Joi.object({
  mode: Joi.string().valid("always", "custom").required(),
  timezone: Joi.when("mode", {
    is: "custom",
    then: Joi.string().trim().required(),
    otherwise: Joi.string().trim().allow(null, "").optional(),
  }),
  days: Joi.when("mode", {
    is: "custom",
    then: daysSchema.required(),
    otherwise: daysSchema.optional(),
  }),
}).custom(validateScheduleWindows);

const thresholdFieldsBySettingType = {
  personalProtectiveEquipmentSettings: [
    "person_threshold",
    "vest_threshold",
    "helmet_threshold",
  ],
  foodServicePPEDetectionSettings: [
    "person_threshold",
    "emp_floor",
    "glove_floor",
    "apron_floor",
  ],
  crowdDetectionSettings: ["person_threshold"],
  lineCrossingSettings: ["person_threshold"],
  countPersonsSettings: ["person_threshold"],
  unauthorizedAccessSettings: ["person_threshold"],
  deskAbsenceSettings: ["person_threshold"],
  tableOccupancyDetectionSettings: ["person_threshold"],
  loiteringDetectionSettings: ["person_threshold"],
  countVehiclesSettings: ["vehicle_threshold"],
  vehicleObstructionSettings: ["vehicle_threshold"],
  vehicleTypeDetectionSettings: ["vehicle_threshold", "forklift_threshold"],
  vehicleDetectionSettings: ["plate_confidence", "ocr_min_confidence"],
  mobilePhoneDetectionSettings: ["mobile_phone_confidence"],
};

const thresholdFieldNames = new Set(
  Object.values(thresholdFieldsBySettingType).flat(),
);

const detectorThresholdAliasesBySettingType = {
  foodServicePPEDetectionSettings: ["foodServicePPEDetection"],
  unauthorizedAccessSettings: ["zoneIntrusionSettings"],
  deskAbsenceSettings: ["deskAbsenceDetection"],
  tableOccupancyDetectionSettings: ["tableOccupancySettings"],
  vehicleDetectionSettings: ["numberPlateDetectionSettings"],
};

class DetectionSettingsValidation {
  createDetectionSettingsValidation(body) {
    const schema = Joi.object().keys({
      name: Joi.string().required(),
      settingType: Joi.string().required(),
      channelId: Joi.array().required(),
      NVRId: Joi.string().required(),
      enabled: Joi.boolean().required(),
      settings: Joi.object().required(),
      alerts: Joi.array().default([]) // comment later
    });
    const result = schema.validate(body);
    return result;
  }

  updateDetectionScheduleValidation(body) {
    return scheduleSchema.validate(body, { abortEarly: false });
  }

  validateConfidenceThresholds(settingType, settings = {}) {
    const allowedFields = new Set(thresholdFieldsBySettingType[settingType] || []);

    for (const [field, value] of Object.entries(settings || {})) {
      if (!thresholdFieldNames.has(field)) continue;

      if (!allowedFields.has(field)) {
        return {
          error: {
            message: `${field} is not allowed for ${settingType}`,
          },
        };
      }

      if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
        return {
          error: {
            message: `${field} must be a number between 0 and 1`,
          },
        };
      }
    }

    return { error: null };
  }

  extractModelThresholds(settingType, modelThresholds = {}) {
    const fields = thresholdFieldsBySettingType[settingType] || [];
    const detectorKeys = [
      settingType,
      ...(detectorThresholdAliasesBySettingType[settingType] || []),
    ];

    return detectorKeys.reduce((thresholds, detectorKey) => {
      const detectorThresholds = modelThresholds?.[detectorKey];
      if (!detectorThresholds || typeof detectorThresholds !== "object") {
        return thresholds;
      }

      fields.forEach((field) => {
        const value = detectorThresholds[field];
        if (typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 1) {
          thresholds[field] = value;
        }
      });

      return thresholds;
    }, {});
  }
}
export default new DetectionSettingsValidation();
