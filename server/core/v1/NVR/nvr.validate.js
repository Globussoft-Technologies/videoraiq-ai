import Joi from "joi";

class NVRValidation {
  createNvr(body) {
    const schema = Joi.object().keys({
      userId: Joi.string().required(),

      nvrName: Joi.string().required().trim().messages({
        "any.required": "nvrName is required.",
      }),

      ipAddress: Joi.string()
        .ip({ version: ["ipv4", "ipv6"] })
        .required()
        .messages({
          "string.ip": "ipAddress must be a valid IPv4 or IPv6 address.",
          "any.required": "ipAddress is required.",
        }),

      port: Joi.number().integer().min(1).max(65535).required().messages({
        "number.base": "port must be a number.",
        "number.min": "port must be between 1 and 65535.",
        "number.max": "port must be between 1 and 65535.",
        "any.required": "port is required.",
      }),

      username: Joi.string().allow("", null), // optional
      password: Joi.string().allow("", null), // optional

      model: Joi.string().allow("", null), // optional
      location: Joi.string().allow("", null), // optional

      isOnline: Joi.boolean().default(false), // optional (server-side maintained)
      lastChecked: Joi.date().allow(null), // optional (server-side maintained)
    });

    const result = schema.validate(body); //Return all validation errors in the response
    return result;
  }
  getNvr(body) {
    const schema = Joi.object().keys({
      nvrId: Joi.string().required().messages({
        "any.required": "nvrId is required.",
      }),
    });

    const result = schema.validate(body);
    return result;
  }
  registerNVR(data) {
    return Joi.object({
      ip: Joi.string()
        .ip({ version: ["ipv4"], cidr: "forbidden" })
        .required(),
      port: Joi.number().port().required(),
      rtspPort: Joi.number().port().required(),
      nvrName: Joi.string()
        .min(1)
        .pattern(/^[^<>"'`\\(){}[\]]+$/) // Disallow script-related characters
        .required()
        .messages({
          "string.pattern.base":
            "nvrName must not contain script-related characters.",
        }),
      username: Joi.string().min(1).required(),
      password: Joi.string().min(1).required(),
      brand: Joi.string().required(),
      location: Joi.string().required().trim().messages({
        "any.required": "Location is required.",
      }),
      streamEndpoint: Joi.when("brand", {
        is: "camera",
        then: Joi.string().min(1).required(),
        otherwise: Joi.optional(),
      }),
    }).validate(data);
  }

  updateNVR(data) {
    return Joi.object({
      ip: Joi.string().required(),
      port: Joi.number().port().required(),
      rtspPort: Joi.number().port().required(),
      nvrName: Joi.string()
        .min(1)
        .pattern(/^[^<>"'`\\(){}[\]]+$/) // Disallow script-related characters
        .required()
        .messages({
          "string.pattern.base":
            "nvrName must not contain script-related characters.",
        }),
      username: Joi.string().min(1).required(),
      oldPassword: Joi.string().allow("").required(),
      newPassword: Joi.string().allow("").required(),
      brand: Joi.string().allow("").required(),
      location: Joi.string().required().trim().messages({
        "any.required": "Location is required.",
      }),
    }).validate(data);
  }
  getChannel(body) {
    const schema = Joi.object().keys({
      channelId: Joi.string().required(),
    });

    const result = schema.validate(body);
    return result;
  }
  nvrSchema() {
    return Joi.object({
      nvrName: Joi.string().required().messages({
        "string.base": "nvrName must be a string",
        "any.required": "nvrName is required",
      }),
      brand: Joi.string()
        .valid("hikvision", "cpplus", "dahua", "prama")
        .required()
        .messages({
          "any.only": "brand must be one of hikvision, cpplus, dahua, prama",
          "any.required": "brand is required",
        }),
      deviceName: Joi.string().allow("").optional(),
      location: Joi.string().allow("").optional(),
      domain: Joi.string().uri().required().messages({
        "string.uri": "domain must be a valid URI",
        "any.required": "domain is required",
      }),
      localNvrId: Joi.string().required().messages({
        "string.base": "localNvrId must be a string",
        "any.required": "localNvrId is required",
      }),
    });
  }
  cameraSchema() {
    return Joi.object({
      name: Joi.string().required().messages({
        "string.base": "name must be a string",
        "any.required": "name is required",
      }),
      streamingPath: Joi.string().required().messages({
        "string.uri": "streamingPath must be a string",
        "any.required": "streamingPath is required",
      }),
      localChannelId: Joi.string().required().messages({
        "string.base": "localChannelId must be a string",
        "any.required": "localChannelId is required",
      }),
    });
  }
  registerNvrMetadataSchema(body) {
    return Joi.object({
      nvr: this.nvrSchema().required().messages({
        "any.required": "NVR metadata is required",
      }),
      cameras: Joi.array()
        .items(this.cameraSchema())
        .min(1)
        .required()
        .messages({
          "array.min": "At least one camera must be provided",
          "any.required": "Cameras list is required",
        }),
    }).validate(body);
  }
  updateNvrLocalSchema(body) {
    return Joi.object({
      nvrName: Joi.string().optional(),
      brand: Joi.string()
        .valid("hikvision", "cpplus", "dahua", "prama")
        .optional(),
      deviceName: Joi.string().allow("").optional(),
      location: Joi.string().allow("").optional(),
      domain: Joi.string().uri().optional(),
      cameras: Joi.array().items(this.cameraSchema()).optional(),
    }).validate(body);
  }
}

export default new NVRValidation();
