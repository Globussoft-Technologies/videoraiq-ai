import Joi from "joi";

const common = {
  label: Joi.string().trim().max(80).allow(""),
  provider: Joi.string().valid("nas", "aws", "gcp", "oracle").required(),
};

export const storageConfigSchema = Joi.object({
  ...common,
  host: Joi.when("provider", { is: "nas", then: Joi.string().trim().required(), otherwise: Joi.forbidden() }),
  port: Joi.when("provider", { is: "nas", then: Joi.number().integer().min(1).max(65535).default(22), otherwise: Joi.forbidden() }),
  username: Joi.when("provider", { is: "nas", then: Joi.string().trim().required(), otherwise: Joi.forbidden() }),
  password: Joi.when("provider", { is: "nas", then: Joi.string().allow("").optional(), otherwise: Joi.forbidden() }),
  basePath: Joi.when("provider", { is: "nas", then: Joi.string().trim().required(), otherwise: Joi.forbidden() }),
  region: Joi.when("provider", { is: "nas", then: Joi.forbidden(), otherwise: Joi.string().trim().required() }),
  bucket: Joi.when("provider", { is: "nas", then: Joi.forbidden(), otherwise: Joi.string().trim().required() }),
  accessKeyId: Joi.when("provider", { is: "nas", then: Joi.forbidden(), otherwise: Joi.string().trim().allow("").optional() }),
  secretAccessKey: Joi.when("provider", { is: "nas", then: Joi.forbidden(), otherwise: Joi.string().allow("").optional() }),
  sessionToken: Joi.when("provider", { is: "aws", then: Joi.string().allow("").optional(), otherwise: Joi.forbidden() }),
  namespace: Joi.when("provider", { is: "oracle", then: Joi.string().trim().allow("").optional(), otherwise: Joi.forbidden() }),
  endpoint: Joi.when("provider", { is: "nas", then: Joi.forbidden(), otherwise: Joi.string().uri().allow("").optional() }),
  forcePathStyle: Joi.when("provider", { is: "aws", then: Joi.boolean().optional(), otherwise: Joi.forbidden() }),
});
