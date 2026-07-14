import Joi from "joi";
import mongoose from "mongoose";

class AccessLogsValidation {
  createSession(body) {
    const schema = Joi.object({
      userId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      adminId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      personName: Joi.string().trim().required(),
      date: Joi.date().optional(),          // should be Date
      timestamp: Joi.date().optional(), // should be Date
      cameraId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      nvrId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      action: Joi.string().optional().allow("").default(""), // matches Mongoose
    });

    return schema.validate(body, { abortEarly: false });
  }
  createAccessLogsValidate(body) {
      const nonEmptyString = Joi.string().trim().min(1);
    const schema = Joi.object({
      userId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      adminId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      personName: Joi.string().trim().required(),
      date: Joi.date().optional(),          // should be Date
      timestamp: Joi.date().optional(), // should be Date
      cameraId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      nvrId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      images: Joi.object({
        face: nonEmptyString.optional(),
        person: nonEmptyString.optional(),
        frame: nonEmptyString.optional(),
      })
      .or("face", "person", "frame") // ✅ at least one must exist
      .required(),
      confidenceScore: Joi.number().optional(),
    });
    return schema.validate(body, { abortEarly: false });
  }
    create(body) {
    const schema = Joi.object({
      adminId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      date: Joi.date().optional(),          // should be Date
      userId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      personName: Joi.string().trim().required(),
      timestamp: Joi.date().optional(), // should be Date
      cameraId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      nvrId: Joi.alternatives().try(
        Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId as string
        Joi.object().instance(mongoose.Types.ObjectId)
      ).allow(null).optional(),
      images: Joi.object({
            face: Joi.string().trim().required(),
            person: Joi.string().trim().optional(),
            frame: Joi.string().trim().optional(),
      }).required(),
    });
    return schema.validate(body, { abortEarly: false });
  }

}

export default new AccessLogsValidation;
