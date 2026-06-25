import Joi from 'joi';

class PermissionValidation {
    createPermission(body) {
        const permissionObjectSchema = Joi.object()
            .pattern(
                Joi.string().regex(/^[a-zA-Z0-9_-]+$/), // Custom keys for permission attributes like `view`, `create`, etc.
                Joi.boolean().required() // All values must be boolean
            )
            .required()
            .messages({
                "object.pattern.key": "Permission attributes must be alphanumeric with optional underscores or dashes.",
                "boolean.base": "Permission attribute values must be boolean.",
            });

        const schema = Joi.object().keys({
            permissionName: Joi.string()
                .required()
                .min(1)
                .max(30)
                .trim(true),
            permissionConfig: Joi.object()
                .pattern(
                    Joi.string().regex(/^[a-zA-Z0-9_-]+$/), // Custom permission names like `customPermission1`, `featureX`
                    Joi.alternatives().try(
                        permissionObjectSchema,
                        Joi.object().pattern(
                            Joi.string().regex(/^[a-zA-Z0-9_-]+$/),
                            permissionObjectSchema
                        ).required()
                    )
                )
                .required()
                .min(1) // At least one permission must be defined
                .messages({
                    "object.pattern.key": "Permission Config keys must be alphanumeric with optional underscores or dashes.",
                    "object.base": "Permission Config must be a valid object.",
                }),
        });

        const result = schema.validate(body, { abortEarly: false });
        return result;
    }
    
    
    updatePermission(body) {
        const booleanValueSchema = Joi.object()
            .pattern(
                Joi.string().regex(/^[a-zA-Z0-9_-]+$/),
                Joi.boolean().required()
            )
            .messages({
                "object.pattern.key": "Permission attributes must be alphanumeric with optional underscores or dashes.",
                "boolean.base": "Permission attribute values must be boolean.",
            });

        const nestedValueSchema = Joi.object()
            .pattern(
                Joi.string().regex(/^[a-zA-Z0-9_-]+$/),
                booleanValueSchema
            )
            .messages({
                "object.pattern.key": "Nested permission keys must be alphanumeric with optional underscores or dashes.",
            });

        const schema = Joi.object().keys({
            permissionName: Joi.string()
                .min(1)
                .max(30)
                .trim(true)
                .optional(),
            permissionConfig: Joi.object()
                .pattern(
                    Joi.string().regex(/^[a-zA-Z0-9_-]+$/),
                    Joi.alternatives().try(
                        booleanValueSchema,
                        nestedValueSchema
                    )
                )
                .min(1)
                .messages({
                    "object.pattern.key": "Permission Config keys must be alphanumeric with optional underscores or dashes.",
                    "object.base": "Permission Config must be a valid object.",
                })
                .optional(),
        });

        const result = schema.validate(body, { abortEarly: false });
        return result;
    }
    fetchActivityLogs(body) {
        const schema = Joi.object().keys({
            skipValue: Joi.number().integer(),
            limitValue: Joi.number().integer(),
            orderby: Joi.string(),
        });
        const result = schema.validate(body);
        return result;
    }

    additionalPermission(body) {
        const schema = Joi.object()
            .keys({
                view: Joi.boolean().required().default(false),
                create: Joi.boolean().required().default(false),
                edit: Joi.boolean().required().default(false),
                delete: Joi.boolean().required().default(false),
            })
            .required();
        const result = schema.validate(body);
        return result;
    }

    updateBulkPermission(body){
        const schema = Joi.object()
        .keys({
            permissionConfig:Joi.array().items(Joi.object({
                    moduleName:Joi.string().required(),
                    view:Joi.boolean().default(false),
                    create:Joi.boolean().default(false),
                    edit:Joi.boolean().default(false),
                    delete:Joi.boolean().default(false)
            }))
        })
        const result = schema.validate(body);
        return result;
    }
}
export default new PermissionValidation();
