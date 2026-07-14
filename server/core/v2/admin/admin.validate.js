import Joi from "joi";
import mongoose from "mongoose";

class UserValidation {
  createUser(body) {
    const schema = Joi.object().keys({
    adminId: Joi.alternatives().try(
            Joi.string(),
            Joi.object().instance(mongoose.Types.ObjectId)
          )
          .allow(null)
          .default(null),
      fullName: Joi.string().trim(true).min(1).required(),
      firstName: Joi.string().trim(true).min(1).required(),
      lastName: Joi.string().trim(true).min(1).required(),
      email: Joi.string().lowercase(),
      phoneNumber: Joi.string().default(null).allow(null),
      age: Joi.number().integer().positive().default(0),
      gender: Joi.string().default(null),
      password: Joi.string().default(null),

      // ✅ roles as array of ObjectIds
      roleId: Joi.alternatives().try(
        Joi.string(),
        Joi.object().instance(mongoose.Types.ObjectId)
      )
      .allow(null)
      .default(null),

      location: Joi.string().default(null),

      // ✅ departmentId as single ObjectId
      departmentId: Joi.alternatives().try(
        Joi.string(),
        Joi.object().instance(mongoose.Types.ObjectId)
      )
      .allow(null)
      .default(null),

      address1: Joi.string().allow(null),
      address2: Joi.string().default(null),
      zipCode: Joi.string().default(null),
      city: Joi.string().default(null),
      state: Joi.string().default(null),
      country: Joi.string().default(null),
      orgId: Joi.string(),
      emp_id: Joi.string(),
      timezone: Joi.string(),
    });

    const result = schema.validate(body, { abortEarly: false });
    return result;
  }
}

export default new UserValidation();
