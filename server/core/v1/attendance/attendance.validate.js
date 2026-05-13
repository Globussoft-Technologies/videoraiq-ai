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
