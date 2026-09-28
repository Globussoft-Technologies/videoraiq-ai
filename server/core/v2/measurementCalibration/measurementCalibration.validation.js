import Joi from "joi";

const normalizedPoint = Joi.object({
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
});

const rectangleMinMm = Math.max(1, Number(process.env.RECTANGLE_ZONE_MIN_MM) || 300);
const rectangleMaxMm = Math.max(rectangleMinMm, Number(process.env.RECTANGLE_ZONE_MAX_MM) || 6000);

const runPoints = Joi.array().items(normalizedPoint).when("zone_type", {
  is: "rectangle",
  then: Joi.array().items(normalizedPoint).length(4).required(),
  otherwise: Joi.array().items(normalizedPoint).min(3).max(32).required(),
});

const draftPoints = Joi.array().items(normalizedPoint).when("zone_type", {
  is: "rectangle",
  then: Joi.array().items(normalizedPoint).max(4).required(),
  otherwise: Joi.array().items(normalizedPoint).max(32).required(),
});

const rectangleDimension = Joi.number().min(rectangleMinMm).max(rectangleMaxMm);

export const calibrationRequestSchema = Joi.object({
  zone_type: Joi.string().valid("polygon", "rectangle").default("polygon"),
  points: runPoints,
  zone_length_mm: rectangleDimension.when("zone_type", {
    is: "rectangle",
    then: rectangleDimension.required(),
    otherwise: Joi.forbidden(),
  }),
  zone_breadth_mm: rectangleDimension.when("zone_type", {
    is: "rectangle",
    then: rectangleDimension.required(),
    otherwise: Joi.forbidden(),
  }),
  min_zone_flat_ratio: Joi.number().min(0.1).max(1).default(0.85),
  inlier_tolerance_mm: Joi.number().min(1).max(100).default(20),
}).options({ allowUnknown: false, stripUnknown: false });

export const calibrationZoneSchema = Joi.object({
  zone_type: Joi.string().valid("polygon", "rectangle").default("polygon"),
  points: draftPoints,
  zone_length_mm: rectangleDimension.when("zone_type", {
    is: "rectangle",
    then: rectangleDimension.optional(),
    otherwise: Joi.forbidden(),
  }),
  zone_breadth_mm: rectangleDimension.when("zone_type", {
    is: "rectangle",
    then: rectangleDimension.optional(),
    otherwise: Joi.forbidden(),
  }),
  min_zone_flat_ratio: Joi.number().min(0.1).max(1).default(0.85),
  inlier_tolerance_mm: Joi.number().min(1).max(100).default(20),
}).options({ allowUnknown: false, stripUnknown: false });

export const rectangleZoneBounds = { min: rectangleMinMm, max: rectangleMaxMm };
