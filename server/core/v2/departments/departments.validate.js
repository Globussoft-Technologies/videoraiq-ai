import Joi from "joi";

class DepartmentValidator {
  createDepartment(body) {
    const schema = Joi.object().keys({
        orgId: Joi.string().allow("",null).optional(),

      departmentName: Joi.string()
        .trim()
        .required()
        .messages({
          "string.base": "Department name must be a string",
          "any.required": "Department name is required"
        }),

      description: Joi.string()
        .trim()
        .allow(null, "")
        .messages({
          "string.base": "Description must be a string"
        }),

      empDepartmentId: Joi.number()
        .integer()
        .allow(null)
        .messages({
          "number.base": "empDepartmentId must be a number"
        }),

      isActive: Joi.boolean()
        .default(true)
        .messages({
          "boolean.base": "isActive must be true or false"
        }),

      isImportedFromEMP: Joi.boolean()
        .default(false)
        .messages({
          "boolean.base": "isImportedFromEMP must be true or false"
        }),

      softDelete: Joi.boolean()
        .default(false)
        .messages({
          "boolean.base": "softDelete must be true or false"
        })
    });

    const result = schema.validate(body);
    return result;
  }

  updateDepartment(body) {
    const schema = Joi.object().keys({
      orgId: Joi.string()
        .trim()
        .optional(),

      departmentName: Joi.string()
        .trim()
        .required()
        .messages({
          "string.base": "Department name must be a string",
          "any.required": "Department name is required"
        }),

      description: Joi.string()
        .trim()
        .allow(null, "")
        .messages({
          "string.base": "Description must be a string"
        }),

      empDepartmentId: Joi.number()
        .integer()
        .allow(null)
        .messages({
          "number.base": "empDepartmentId must be a number"
        }),

      isActive: Joi.boolean()
        .default(true)
        .messages({
          "boolean.base": "isActive must be true or false"
        }),

      isImportedFromEMP: Joi.boolean()
        .default(false)
        .messages({
          "boolean.base": "isImportedFromEMP must be true or false"
        }),

      softDelete: Joi.boolean()
        .default(false)
        .messages({
          "boolean.base": "softDelete must be true or false"
        })
    });

    const result = schema.validate(body);
    return result;
  }

}
export default new DepartmentValidator();