import Joi from "joi";

class IncidentsValidator {
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