import Joi from "joi";

// Optional: the recipient's departments, labels only ([] clears them).
const departmentIds = Joi.array().items(Joi.string().hex().length(24)).unique().optional()
  .messages({ "string.hex": "Invalid department", "string.length": "Invalid department" });
// Optional, per detection type: only incidents of these severities, e.g.
// { crowdDetection: ["high"] }. A type left out or empty = every severity.
const severityByType = Joi.object()
  .pattern(/^[A-Za-z0-9_]+$/, Joi.array().items(Joi.string().valid("low", "moderate", "high")).unique())
  .optional();

class recipientValidation {
  createRecipient(body) {
    const schema =   Joi.object({
        email: Joi.string().email().allow(null),
        phoneNumber: Joi.string().pattern(/^[0-9+]{10,15}$/).allow(null),
        fullName:Joi.string().default(null).optional(),
        incidentTypes: Joi.array().items(Joi.string()).optional(),
        departmentIds,
        severityByType,
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
      fullName: Joi.string().trim().min(1).optional(),
      incidentTypes: Joi.array().items(Joi.string()).optional(),
      departmentIds,
      severityByType,
    });

    const result = schema.validate(body);
    return result;
  }
}
export default new recipientValidation();