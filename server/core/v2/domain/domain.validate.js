import Joi from "joi";

class DomainValidation {
  registerDomain(body) {
    const schema = Joi.object({
      domainName: Joi.string()
        .uri({ scheme: ["http", "https"] })
        .required(),
      ip: Joi.string()
        .ip({ version: ["ipv4", "ipv6"], cidr: "forbidden" })
        .required()
        .messages({
          "string.base": "ip must be a string.",
          "string.ip": "ip must be a valid IPv4 or IPv6 address.",
          "any.required": "ip is required.",
        }),
      port: Joi.number().integer().min(1).max(65535).required().messages({
        "number.base": "port must be a number.",
        "number.min": "port must be between 1 and 65535.",
        "number.max": "port must be between 1 and 65535.",
        "any.required": "port is required.",
      }),
    });

    return schema.validate(body, { abortEarly: false });
  }
}

export default new DomainValidation();
