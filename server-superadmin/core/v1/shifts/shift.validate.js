import Joi from "joi";

const daySchema = Joi.object({
  enabled: Joi.boolean().required(),
  start: Joi.string().when("enabled", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  end: Joi.string().when("enabled", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const createShiftValidator = Joi.object({
  name: Joi.string().min(3).required(),
  color: Joi.string().required(),

  timings: Joi.object({
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema,
    sunday: daySchema,
  }).required(),

  settings: Joi.object({
    lateLogin: Joi.number().min(0).optional(),
    earlyLogout: Joi.number().min(0).optional(),
    halfDay: Joi.string().optional(),
    overTime: Joi.string().optional(),
    halfDayProductiveTime: Joi.string().optional(),
    fullDayProductiveTime: Joi.string().optional(),
  }).optional(),

  note: Joi.string().allow("").optional(),
});

export const updateShiftValidator = createShiftValidator.fork(
  Object.keys(createShiftValidator.describe().keys),
  (schema) => schema.optional()
);
