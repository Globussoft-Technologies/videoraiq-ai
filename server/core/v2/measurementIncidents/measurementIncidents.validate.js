import Joi from "joi";

const nonEmptyObject = Joi.object().min(1).unknown(true);
const imageReference = Joi.alternatives().try(
  Joi.string().trim().max(4096),
  Joi.object({
    url: Joi.string().trim().max(4096).optional(),
    storagePath: Joi.string().trim().max(4096).optional(),
    filename: Joi.string().trim().max(512).optional(),
  }).or("url", "storagePath").unknown(true),
);

export const processMeasurementSchema = Joi.object({
  stationId: Joi.string().trim().max(100).required(),
  qrImagePath: Joi.string().trim().max(2048).required(),
  operatorId: Joi.string().trim().max(100).optional(),
  payload: Joi.object().unknown(true).default({}),
}).unknown(false);

export const createQrMeasurementSchema = Joi.object({
  stationId: Joi.string().trim().max(100).required(),
  qrImagePath: Joi.string().trim().max(2048).required(),
  qrImage: imageReference.optional(),
  operatorId: Joi.string().trim().max(100).optional(),
  qrMetadata: Joi.object({
    sku: Joi.string().trim().max(200).required(),
  }).min(1).unknown(true).required(),
  qrResponse: Joi.object().unknown(true).optional(),
}).unknown(false);

export const dsMeasurementResponseSchema = Joi.object({
  qrMetadata: nonEmptyObject.required(),
  measuredData: nonEmptyObject.required(),
  measurementImage: imageReference.optional(),
  processedAt: Joi.date().iso().optional(),
}).unknown(true);

export const measurementStatusSchema = Joi.object({
  status: Joi.string().valid("accepted", "rejected").required(),
}).unknown(false);

export const measurementDataUpdateSchema = Joi.object({
  measuredData: nonEmptyObject.required(),
  measurementImage: imageReference.optional(),
  processedAt: Joi.date().iso().optional(),
}).unknown(false);

export const measurementBySkuUpdateSchema = Joi.object({
  measuredData: nonEmptyObject.required(),
  measurementImage: imageReference.optional(),
  processedAt: Joi.date().iso().optional(),
  stationId: Joi.string().trim().max(100).optional(),
}).unknown(false);

export const measurementSkuSchema = Joi.string().trim().max(200).required();

export const measurementBySkuQuerySchema = Joi.object({
  stationId: Joi.string().trim().max(100).optional(),
  status: Joi.string().valid("pending", "accepted", "rejected").optional(),
}).unknown(false);

export const measurementIncidentListSchema = Joi.object({
  stationId: Joi.string().trim().max(100).optional(),
  status: Joi.string().valid("pending", "accepted", "rejected").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(80),
}).unknown(false);

export function validationMessages(error) {
  return error.details.map((detail) => detail.message);
}
