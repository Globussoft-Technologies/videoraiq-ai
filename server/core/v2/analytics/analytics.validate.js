import Joi from "joi";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const commonRangeFields = {
  startDate: Joi.string().trim().regex(dateOnlyPattern).messages({
    'string.pattern.base': 'startDate must be in YYYY-MM-DD format',
  }),
  endDate: Joi.string().trim().regex(dateOnlyPattern).messages({
    'string.pattern.base': 'endDate must be in YYYY-MM-DD format',
  }),
  nvrId: Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(Joi.string().trim())
  ),
  channelId: Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(Joi.string().trim())
  ),
  location: Joi.alternatives().try(
    Joi.string().trim(),
    Joi.array().items(Joi.string().trim())
  ),
};

class AnalyticsValidator {
  detectionVolume(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90).messages({
        'number.base': 'days must be a number',
        'number.min': 'days must be at least 1',
        'number.max': 'days must be at most 90',
      }),
    });

    return schema.validate(query, { abortEarly: false });
  }

  engineShare(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }

  topCameras(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
      limit: Joi.number().integer().min(1).max(50).messages({
        'number.min': 'limit must be at least 1',
        'number.max': 'limit must be at most 50',
      }),
    });

    return schema.validate(query, { abortEarly: false });
  }

  activityHeatmap(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }

  detectionsByHour(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      date: Joi.string().trim().regex(dateOnlyPattern).messages({
        'string.pattern.base': 'date must be in YYYY-MM-DD format',
      }),
    });

    return schema.validate(query, { abortEarly: false });
  }

  sitePerformance(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }

  responseFunnel(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }

  overview(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }

  peakActivity(query) {
    const schema = Joi.object({
      ...commonRangeFields,
      days: Joi.number().integer().min(1).max(90),
    });

    return schema.validate(query, { abortEarly: false });
  }
}

export default new AnalyticsValidator();
