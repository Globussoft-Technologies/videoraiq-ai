import Joi from "joi";
import mongoose from "mongoose";

class AuthUsersValidator {
  createAuthUser(body) {
    const schema = Joi.object({
      firstName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'First name must be a string',
          'string.empty': 'First name is required',
          'string.min': 'First name must be at least 1 characters',
          'any.required': 'First name is required',
        }),

      lastName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'Last name must be a string',
          'string.empty': 'Last name is required',
          'string.min': 'Last name must be at least 1 characters',
          'any.required': 'Last name is required',
        }),

      email: Joi.string()
        .trim()
        .email()
        .messages({
          'string.email': 'Email must be a valid email',
          'any.required': 'Email is required',
        }),

      profilePics: Joi.array()
        .items(
          Joi.string()
            .messages({
              'string.uri': 'Each profile picture must be a valid URL',
            })
        )
        .min(1)
        .required()
        .messages({
          'array.base': 'Profile pictures must be an array',
          'array.min': 'At least 1 profile picture URL is required',
          'any.required': 'Profile pictures are required',
        }),
        
        // ✅ roles as array of ObjectIds
        roleIds: Joi.array(),

        location: Joi.string().default(null),

        // ✅ departmentId as single ObjectId
        departmentId: Joi.alternatives().try(
          Joi.string(),
          Joi.object().instance(mongoose.Types.ObjectId)
        )
        .allow(null)
        .default(null),
        password: Joi.string().required()
    });

    return schema.validate(body, { abortEarly: false });
  }

  updateAuthUser(body) {
    const schema = Joi.object({
      firstName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'First name must be a string',
          'string.empty': 'First name is required',
          'string.min': 'First name must be at least 1 characters',
          'any.required': 'First name is required',
        }),

      lastName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'Last name must be a string',
          'string.empty': 'Last name is required',
          'string.min': 'Last name must be at least 1 characters',
          'any.required': 'Last name is required',
        }),

      email: Joi.string()
        .trim()
        .email()
        .messages({
          'string.email': 'Email must be a valid email',
          'any.required': 'Email is required',
        }),

      profilePics: Joi.array()
        .items(
          Joi.string()
            .messages({
              'string.uri': 'Each profile picture must be a valid URL',
            })
        ),
        designation: Joi.string().default(null),
        branch: Joi.string().default(null),
        
        // ✅ roles as array of ObjectIds
        roleIds: Joi.array(),

        location: Joi.string().default(null),

        // ✅ departmentId as single ObjectId
        departmentId: Joi.alternatives().try(
          Joi.string(),
          Joi.object().instance(mongoose.Types.ObjectId)
        )
        .allow(null)
        .default(null),

    });

    return schema.validate(body, { abortEarly: false });
  }


  createAuthUserBulk(body) {
    const schema = Joi.object({
      users: Joi.array().items({
      firstName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'First name must be a string',
          'string.empty': 'First name is required',
          'string.min': 'First name must be at least 1 characters',
          'any.required': 'First name is required',
        }),
      lastName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'Last name must be a string',
          'string.empty': 'Last name is required',
          'string.min': 'Last name must be at least 1 characters',
          'any.required': 'Last name is required',
        }),
      userName: Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.base': 'User name must be a string',
          'string.empty': 'User name is required',
          'string.min': 'User name must be at least 1 characters',
          'any.required': 'User name is required',
        }),
      email: Joi.string()
        .trim()
        .email()
        .messages({
          'string.email': 'Email must be a valid email',
          'any.required': 'Email is required',
        })
    })});
    return schema.validate(body, { abortEarly: false });
  }
}

export default new AuthUsersValidator();
