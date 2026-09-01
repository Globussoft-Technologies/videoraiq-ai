import Joi from "joi";

// Define Joi schema
export const attendanceSchema = Joi.object({
  cameraType: Joi.string().valid("checkin", "checkout").required().messages({
    "any.required": "cameraType is required",
    "any.only": "Invalid cameraType, must be 'checkin' or 'checkout'",
  }),
  // imageUrl: Joi.string().required().messages({
  //   "any.required": "imageUrl is required",
  //   "string.uri": "imageUrl must be a valid URL",
  // }),
  employeeId: Joi.string().required().messages({
    "any.required": "employeeId is required",
  }),
  userId: Joi.string().required().messages({
    "any.required": "userId is required",
  }),
  nvrId: Joi.string().hex().length(24).required(),
  channelId: Joi.string().hex().length(24).required(),
  images: Joi.object({
    face: Joi.string().allow(""),
    person: Joi.string().allow(""),
    frame: Joi.string().allow(""),
  })
    .or("face", "person", "frame")
    .required()
    .messages({
      "object.missing":
        "At least one image (face, person, or frame) must be provided.",
    }),
  confidenceScore: Joi.number().optional(),
});

// Per-org attendance rules. Quarter-hour precision keeps "7.5 hours" expressible
// without inviting meaningless values like 8.03333.
export const attendanceSettingsSchema = Joi.object({
  fullDayHours: Joi.number().min(0).max(24).multiple(0.25).required().messages({
    "any.required": "fullDayHours is required",
    "number.max": "fullDayHours cannot exceed 24",
    "number.multiple": "fullDayHours must be in steps of 0.25 (15 minutes)",
  }),
  halfDayHours: Joi.number().min(0).max(24).multiple(0.25).required().messages({
    "any.required": "halfDayHours is required",
    "number.max": "halfDayHours cannot exceed 24",
    "number.multiple": "halfDayHours must be in steps of 0.25 (15 minutes)",
  }),
  // Optional, not defaulted: a caller that omits it leaves the saved value
  // alone rather than silently resetting it to the default. Zero is allowed and
  // means "close the day the moment full-day hours are up", which is a valid
  // choice — it just leaves no room for an overnight shift's late check-out.
  graceHours: Joi.number().min(0).max(24).multiple(0.25).optional().messages({
    "number.max": "graceHours cannot exceed 24",
    "number.multiple": "graceHours must be in steps of 0.25 (15 minutes)",
  }),
})
  // A half day longer than a full day would make the Present branch
  // unreachable, so every row would grade as Half Day.
  .custom((value, helpers) =>
    value.halfDayHours > value.fullDayHours
      ? helpers.message("halfDayHours cannot be greater than fullDayHours")
      : value,
  );
