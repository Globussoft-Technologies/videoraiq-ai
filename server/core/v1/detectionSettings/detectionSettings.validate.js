import Joi from "joi";
import {
  WEEKDAYS as weekdays,
  findScheduleConflict,
  hasAnyWindow,
  isValidTimezone,
} from "../../../utils/scheduleWindows.js";

/**
 * Window rules now live in utils/scheduleWindows.js, shared with the runtime
 * evaluator (services/detectionSchedule.resolver.js) and re-exported to the
 * NVR-level global schedule. Keeping one implementation is what guarantees a
 * schedule cannot pass validation under one set of rules and then be evaluated
 * under another - the exact way an overnight range used to be accepted by the
 * UI and silently ignored by the scheduler.
 *
 * What changed for callers: a window whose end is before its start is no longer
 * an error, it is an overnight range (22:00 -> 08:00 = "until 08:00 tomorrow").
 * start === end stays rejected, so nobody gets a 24-hour window by accident.
 * Overlap detection now accounts for the minutes an overnight range occupies on
 * the following day. Normal same-day windows validate exactly as before,
 * touching boundaries included.
 */
const validateScheduleWindows = (value, helpers) => {
  if (value.mode !== "custom") return value;

  const days = value.days || {};

  if (!hasAnyWindow(days)) {
    return helpers.message("Custom schedule must include at least one time window");
  }

  const conflict = findScheduleConflict(days);
  if (conflict) return helpers.message(conflict.message);

  return value;
};

/**
 * A zone the runtime cannot resolve must not reach storage: the one-minute
 * schedule runner projects every schedule through Intl, which throws a
 * RangeError on an unknown zone. Probing the runtime (rather than matching a
 * hardcoded list) accepts the same aliases admin.service.js updateTimezone
 * does, so "Asia/Calcutta" keeps working wherever the ICU build knows it.
 */
const ianaTimezone = (value, helpers) =>
  isValidTimezone(value)
    ? value
    : helpers.message(`${value} is not a valid IANA timezone`);

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
    // .allow(null, "") short-circuits Joi's rule chain, so in "always" mode an
    // absent zone still skips the probe below - only a real string is checked.
    then: Joi.string().trim().required().custom(ianaTimezone),
    otherwise: Joi.string().trim().allow(null, "").optional().custom(ianaTimezone),
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

const lineCrossingCountModes = new Set(["entry", "exit", "all"]);

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

  validateLineCrossingSettings(settingType, settings = {}) {
    if (settingType !== "lineCrossingSettings") {
      return { error: null };
    }

    if (settings.inside_reference_point !== undefined) {
      const point = settings.inside_reference_point;
      const isValidPoint =
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((value) => typeof value === "number" && Number.isFinite(value));

      if (!isValidPoint) {
        return {
          error: {
            message:
              "inside_reference_point must be an array of exactly two numbers",
          },
        };
      }
    }

    if (settings.count_mode !== undefined && !lineCrossingCountModes.has(settings.count_mode)) {
      return {
        error: {
          message: "count_mode must be entry, exit, or all",
        },
      };
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
