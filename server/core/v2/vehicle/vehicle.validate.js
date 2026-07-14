import Joi from "joi";

export const vehicleLogValidation = Joi.object({
  adminId: Joi.string().required().messages({
    "any.required": "adminId is required",
  }),
  vehicleNumber: Joi.string().required().messages({
    "any.required": "vehicleNumber is required",
  }),
  nvrId: Joi.string().hex().length(24).required(),
  channelId: Joi.string().hex().length(24).required(),
  images: Joi.object({
    vehicle: Joi.string().required().messages({
      "any.required": "vehicle image is required",
    }),
  }).required(),
});

export const vehicleSearchValidation = Joi.object({
  search: Joi.string().allow(""),
});
