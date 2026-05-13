import Joi from "joi";

// Define Joi schema
export const entrySchemaValidation = Joi.object({
  // type: Joi.string().valid("user", "vehicle").required().messages({
  //   "any.required": "type is required",
  //   "any.only": "Invalid cameraType, must be 'user' or 'vehicle'",
  // }),
  adminId: Joi.string().required().messages({
    "any.required": "adminId is required",
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
    // vehicle: Joi.string().allow(""),
  })
    .or("face", "person", "frame")
    .required()
    .messages({
      "object.missing":
        "At least one image (face, person, frame) must be provided.",
    }),
});
