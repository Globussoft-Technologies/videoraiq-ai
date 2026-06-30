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
}

export default new IncidentsValidator();