import Joi from "joi";

class IncidentsValidator {
  getChannel(body) {
    const schema = Joi.object().keys({
    channelId: Joi.string().required(),
    });

    const result = schema.validate(body);
    return result;
  }

}
export default new IncidentsValidator();