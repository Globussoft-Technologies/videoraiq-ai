import Joi from "joi";
import { scheduleSchema } from "../detectionSettings/detectionSettings.validate.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

const objectId = Joi.string().hex().length(24);

const detectorNames = Object.keys(DETECTION_TYPES);

/**
 * A camera's membership of a global schedule.
 *
 * `enabled` is ENROLMENT, not runtime state: false un-enrols the camera (it
 * reverts to its own camera-specific schedule) without deleting the row.
 */
const cameraSchema = Joi.object({
  channelId: objectId.required(),
  enabled: Joi.boolean().default(true),
});

const createSchema = Joi.object({
  nvrId: objectId.required(),
  name: Joi.string().trim().max(120).allow(null, "").default(null),
  enabled: Joi.boolean().default(true),
  // Reuses the camera-schedule rules verbatim, so a global schedule cannot
  // express a window a camera schedule would have rejected.
  schedule: scheduleSchema.required(),
  cameras: Joi.array().items(cameraSchema).default([]),
  // Empty = every detector configured on the enrolled cameras.
  detectors: Joi.array()
    .items(Joi.string().valid(...detectorNames))
    .unique()
    .default([]),
});

// Same shape, every field optional.
//
// Server-managed fields are stripped rather than rejected so a client can PUT
// back an object it just GET'd (the UI does read-modify-write) without a 400.
// Stripping also makes nvrId immutable: a schedule can never jump to another
// NVR and strand the cameras it was enrolling. Genuinely unknown keys still
// fail validation, so typos are caught.
const serverManaged = Joi.any().strip();

const updateSchema = Joi.object({
  name: Joi.string().trim().max(120).allow(null, ""),
  enabled: Joi.boolean(),
  schedule: scheduleSchema,
  cameras: Joi.array().items(cameraSchema),
  detectors: Joi.array()
    .items(Joi.string().valid(...detectorNames))
    .unique(),

  _id: serverManaged,
  nvrId: serverManaged,
  userId: serverManaged,
  createdAt: serverManaged,
  updatedAt: serverManaged,
  __v: serverManaged,
})
  .min(1)
  .messages({ "object.min": "Provide at least one field to update" });

class GlobalScheduleValidation {
  createValidation(body) {
    return createSchema.validate(body, { abortEarly: false });
  }

  updateValidation(body) {
    return updateSchema.validate(body, { abortEarly: false });
  }
}

export default new GlobalScheduleValidation();
