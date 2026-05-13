import Joi from "joi";

class recipientValidation {
  createRecipient(body) {
    const schema =   Joi.object({
        email: Joi.string().email().allow(null),
        phoneNumber: Joi.string().pattern(/^[0-9+]{10,15}$/).allow(null),
        fullName:Joi.string().default(null).optional(),
        incidentTypes: Joi.array().items(Joi.string()).optional()
      });

    const result = schema.validate(body);
    return result;
  }
  recentRecipient(body) {
    const schema =   Joi.object({
        email: Joi.string().email().allow(null),
        phoneNumber: Joi.string().pattern(/^[0-9+]{10,15}$/).allow(null),
      });

    const result = schema.validate(body);
    return result;
  }

  updateRecipient(body) {
    const schema = Joi.object({
      incidentTypes: Joi.array().items(Joi.string()).optional()
    });

    const result = schema.validate(body);
    return result;
  }
}
export default new recipientValidation();