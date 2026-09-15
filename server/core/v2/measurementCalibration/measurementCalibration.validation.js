import Joi from "joi";

const normalizedPoint = Joi.object({
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
});

export const calibrationRequestSchema = Joi.object({
  points: Joi.array().items(normalizedPoint).min(3).max(32).required(),
  min_zone_flat_ratio: Joi.number().min(0.1).max(1).default(0.85),
  inlier_tolerance_mm: Joi.number().min(1).max(100).default(20),
}).options({ allowUnknown: false, stripUnknown: false });

export const calibrationZoneSchema = Joi.object({
  points: Joi.array().items(normalizedPoint).min(0).max(32).required(),
  min_zone_flat_ratio: Joi.number().min(0.1).max(1).default(0.85),
  inlier_tolerance_mm: Joi.number().min(1).max(100).default(20),
}).options({ allowUnknown: false, stripUnknown: false });
