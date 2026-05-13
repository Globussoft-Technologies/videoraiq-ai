import Joi from "joi";

class LocationValidator {
  createLocation(body) {
    const schema = Joi.object({
      locationName: Joi.string().required().messages({
        "string.empty": "Location Name is required.",
        "any.required": "Location Name is required.",
      }),
      empLocationId: Joi.string().optional().allow(null, "").empty("")  
    });
    return schema.validate(body);
  }

  updateLocation(body) {
    const schema = Joi.object({
      locationName: Joi.string().optional(),
      empLocationId:  Joi.string().optional().allow(null, "").empty("") 
    }).min(1);
    return schema.validate(body);
  }
}

export default new LocationValidator();
