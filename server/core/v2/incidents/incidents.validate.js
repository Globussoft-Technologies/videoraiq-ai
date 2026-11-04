import Joi from "joi";
import { HYGIENE_CATEGORIES } from "../../../constants/hygieneDetection.js";

class IncidentsValidator {
  validateGenderAgeIncident(body) {
    if (!["genderAgeDetection", "genderAgeCount"].includes(body?.incidentType)) return { error: null };
    const count = Joi.number().integer().min(0);
    const fields = body.incidentType === "genderAgeCount" ? {
      femaleCount: count.required(), maleCount: count.required(),
      timeOfIncident: Joi.string().isoDate(),
      triggerNotification: Joi.boolean().valid(false),
      zones: Joi.array().items(Joi.object({
        zone_idx: count.required(), zone: Joi.string().trim().required(),
        female_count: count.required(), male_count: count.required(),
      })).unique("zone_idx"),
    } : {
      timeOfIncident: Joi.string().isoDate().required(),
      incidentName: Joi.string().trim().required(),
      description: Joi.string().allow(""),
      Image: Joi.string().trim().required(),
      targetGender: Joi.string().valid("Male", "Female").required(),
      zoneIdx: count, violatorCount: count,
      violatingTrackIds: Joi.array().items(count),
      details: Joi.array().items(Joi.object({
        track_id: count, bbox: Joi.array().items(Joi.number()).length(4),
        gender: Joi.string().valid("Male", "Female"),
        confidence: Joi.number().min(0).max(1), age: Joi.number().min(0),
      })),
    };
    const objectId = Joi.string().hex().length(24);
    return Joi.object({
      ...fields, adminId: objectId.required(), nvrId: objectId.required(),
      cameraId: objectId, channelId: objectId,
    }).or("cameraId", "channelId").unknown(true).validate(body, { convert: false });
  }

  validateEmotionIncident(body) {
    if (body?.incidentType !== "emotionDetection") return { error: null };
    return Joi.object({
      timeOfIncident: Joi.string().isoDate().required(),
      incidentName: Joi.string().trim().required(),
      Image: Joi.string().trim().required(),
    }).unknown(true).validate(body, { convert: false });
  }

  validateHygieneIncident(body) {
    if (body?.incidentType !== "hygieneSanitationFoodSafetyDetection") return { error: null };
    return Joi.object({
      selectedCategories: Joi.array().items(Joi.string().valid(...HYGIENE_CATEGORIES)).unique(),
      violationCount: Joi.number().integer().min(0),
      violations: Joi.array().items(Joi.object({
        category: Joi.string().valid(...HYGIENE_CATEGORIES).required(),
        categoryName: Joi.string(),
        description: Joi.string(),
        confidence: Joi.number().min(0).max(1),
        severity: Joi.string().valid("low", "medium", "moderate", "high"),
      })),
    }).unknown(true).validate(body, { convert: false });
  }

  getChannel(body) {
    const schema = Joi.object().keys({
      channelId: Joi.string().required(),
    });

    const result = schema.validate(body);
    return result;
  }

  deleteIncidentsByAdminAndDateRange(body) {
    const schema = Joi.object().keys({
      startDate: Joi.string()
        .optional()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .messages({
          "string.pattern.base": "startDate must be in YYYY-MM-DD format",
        }),
      endDate: Joi.string()
        .optional()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .messages({
          "string.pattern.base": "endDate must be in YYYY-MM-DD format",
        }),
    });

    return schema.validate(body);
  }

  editIncidentDetails(body) {
    const schema = Joi.object().keys({
      incidentType: Joi.string().optional(),
      nvrId: Joi.string().optional(),
      channelId: Joi.string().optional(),
      count: Joi.number().optional().min(0),
      objectsDetected: Joi.array().optional(),
      atoB: Joi.number().optional(),
      btoA: Joi.number().optional(),
      croudCount: Joi.number().optional().min(0),
      helmetCount: Joi.number().optional().min(0),
      currentStatus: Joi.string().optional(),
      personPresent: Joi.boolean().optional(),
      personCount: Joi.number().optional().min(0),
      zoneName: Joi.string().optional(),
      vehicleType: Joi.string().optional(),
      vehicleNumber: Joi.string().optional(),
      licensePlate: Joi.string().optional(),
      vehicleColor: Joi.string().optional(),
      confidence: Joi.number().optional().min(0).max(1),
      detectTime: Joi.date().optional(),
      ppe: Joi.object().optional(),
      timeOfIncident: Joi.date().optional(),
      detectionStatus: Joi.number().optional().valid(0, 1, 2),
      incidentName: Joi.string().optional(),
    }).unknown(true); // Allow additional fields not explicitly defined

    return schema.validate(body);
  }
}

export default new IncidentsValidator();
