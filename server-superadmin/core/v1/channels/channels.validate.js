import Joi from "joi";

class ChannelValidator {
  getChannel(body) {
    const schema = Joi.object().keys({
    channelId: Joi.string(),
      nvrId: Joi.string().required()
    });

    const result = schema.validate(body);
    return result;
  }
  updateChannel(body) {
    const schema = Joi.object().keys({
      channelId: Joi.string().required(),
      nvrId: Joi.string().required(),
      name: Joi.string(),
      isActive: Joi.boolean(),
      channelNumber: Joi.number(),
      resolution: Joi.string(),
      streamUrl: Joi.string(),
    });

    const result = schema.validate(body);
    return result;
  }
  deleteChannel(body) {
    const schema = Joi.object().keys({
      channelId: Joi.string().required(),
      nvrId: Joi.string().required()
    });

    const result = schema.validate(body);
    return result;
  }

  validateUpdateChannelConfig(body) {
    const schema = Joi.object({
      videoLinkRequirement: Joi.boolean().required(),
      video_min_length: Joi.number().allow(null),
      video_max_length: Joi.number().allow(null),
      level_of_importance: Joi.string().valid('low', 'medium', 'high').required(),
      alertThreshold: Joi.number().integer().min(0),
      faceAuth: Joi.boolean(),
      videoResolution: Joi.array()
        .items(Joi.number().positive().required()),
      referencePoints: Joi.object({
          zone_1: Joi.array()
            .items(
              Joi.array()
                .length(2)
                .items(Joi.number().required())
                .required()
            ),
          zone_2: Joi.array()
            .items(
              Joi.array()
                .length(2)
                .items(Joi.number().required())
                .required()
            )
        }).default({})
    });
  
    const result = schema.validate(body);
    return result;
  }
}
export default new ChannelValidator();