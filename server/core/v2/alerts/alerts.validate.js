import Joi from "joi";

class alertValidation {
  getChannel(body) {
    const schema = Joi.object().keys({
    channelId: Joi.string(),
      nvrId: Joi.string().required()
    });

    const result = schema.validate(body);
    return result;
  }

  
  validateCreateAlert(body) {
    const allowedDetections = [
      'countPersons',
      'countVehicles',
      'motionDetection',
      'genericObjectDetection',
      'loiteringWithoutAuth'
    ];
    const schema = Joi.object({
      detectionTypes: Joi.array()
      .items(Joi.string().valid(...allowedDetections))
      .required(),
      emails: Joi.array()
        .items(
          Joi.object({
            value: Joi.string().email().required().allow(null),
            verified: Joi.boolean().default(false)
          })
        )
        .required(),
      phoneNumbers: Joi.array()
        .items(
          Joi.object({
            value: Joi.string()
              .pattern(/^\+?[1-9]\d{1,14}$/).allow(null) // E.164 format
              .required(),
            verified: Joi.boolean().default(false)
          })
        )
        .required(),
      selectedNVRs: Joi.array().items().required(),
      selectedCameras: Joi.array().items().required(),
      removeEmails: Joi.array().items(Joi.string().email()).default([]),
      removePhones: Joi.array().items(Joi.string().pattern(/^\+?[1-9]\d{1,14}$/)).default([]),
      removeDetectionTypes: Joi.array().items(Joi.string()).default([]),
      removeCameras: Joi.array().items(Joi.string().regex(/^[a-f\d]{24}$/i)).default([]),
      removeNVRs: Joi.array().items(Joi.string().regex(/^[a-f\d]{24}$/i)).default([])
    });

    return schema.validate(body);
  }

}
export default new alertValidation();