import Joi from "joi";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

class FaceImagesValidator {
  uploadImages(body) {
    const schema = Joi.object({
      dsId: Joi.string()
        .trim()
        .required()
        .messages({
          'string.base': 'dsId must be a string',
          'string.empty': 'dsId is required',
          'any.required': 'dsId is required',
        }),
      images: Joi.array()
        .items(Joi.string().trim().min(1))
        .min(1)
        .required()
        .messages({
          'array.base': 'images must be an array',
          'array.min': 'At least 1 image path is required',
          'any.required': 'images is required',
        }),
    });

    return schema.validate(body, { abortEarly: false });
  }

  tagFolder(body) {
    const schema = Joi.object({
      dsId: Joi.string()
        .trim()
        .required()
        .messages({
          'string.base': 'dsId must be a string',
          'string.empty': 'dsId is required',
          'any.required': 'dsId is required',
        }),
      authorizedUserId: Joi.string()
        .trim()
        .regex(objectIdPattern)
        .required()
        .messages({
          'string.base': 'authorizedUserId must be a string',
          'string.empty': 'authorizedUserId is required',
          'string.pattern.base': 'authorizedUserId must be a valid id',
          'any.required': 'authorizedUserId is required',
        }),
    });

    return schema.validate(body, { abortEarly: false });
  }

  quickCreateUser(body) {
    const schema = Joi.object({
      firstName: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
          'string.base': 'firstName must be a string',
          'string.empty': 'firstName is required',
          'string.min': 'firstName must be at least 1 character',
          'any.required': 'firstName is required',
        }),
      lastName: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
          'string.base': 'lastName must be a string',
          'string.empty': 'lastName is required',
          'string.min': 'lastName must be at least 1 character',
          'any.required': 'lastName is required',
        }),
      dsId: Joi.string()
        .trim()
        .required()
        .messages({
          'string.base': 'dsId must be a string',
          'string.empty': 'dsId is required',
          'any.required': 'dsId is required',
        }),
      // Optional — every other field on the authorizedUsers schema (password excluded).
      email: Joi.string().trim().allow(null, ''),
      departmentId: Joi.string().trim().regex(objectIdPattern).allow(null, '')
        .messages({ 'string.pattern.base': 'departmentId must be a valid id' }),
      designation: Joi.string().trim().allow(null, ''),
      branch: Joi.string().trim().allow(null, ''),
      shiftId: Joi.string().trim().regex(objectIdPattern).allow(null, '')
        .messages({ 'string.pattern.base': 'shiftId must be a valid id' }),
      numberPlate: Joi.string().trim().allow(null, ''),
      vehicleNumber: Joi.string().trim().allow(null, ''),
      orgId: Joi.number().allow(null),
      emp_id: Joi.number().allow(null),
      empRoleId: Joi.number().allow(null),
      permission: Joi.string().trim().allow(null, ''),
      location: Joi.string().trim().allow(null, ''),
      locationId: Joi.number().allow(null),
      phoneNumber: Joi.string().trim().allow(null, ''),
      address1: Joi.string().trim().allow(null, ''),
      timezone: Joi.string().trim().allow(null, ''),
      profilePics: Joi.array().items(Joi.string().trim()).allow(null),
    });

    return schema.validate(body, { abortEarly: false });
  }

  deleteImages(body) {
    const schema = Joi.object({
      imageIds: Joi.array()
        .items(Joi.string().trim().regex(objectIdPattern))
        .min(1)
        .required()
        .messages({
          'array.base': 'imageIds must be an array',
          'array.min': 'At least 1 imageId is required',
          'any.required': 'imageIds is required',
        }),
    });

    return schema.validate(body, { abortEarly: false });
  }
}

export default new FaceImagesValidator();
