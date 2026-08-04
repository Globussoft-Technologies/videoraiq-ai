import Joi from "joi";

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const validateScheduleWindows = (value, helpers) => {
  if (value.mode !== "custom") return value;

  const days = value.days || {};
  let hasWindow = false;

  for (const day of weekdays) {
    const windows = days[day] || [];
    const sorted = windows
      .map((window) => ({
        ...window,
        startMinutes: timeToMinutes(window.start),
        endMinutes: timeToMinutes(window.end),
      }))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      hasWindow = true;

      if (current.startMinutes >= current.endMinutes) {
        return helpers.message(`${day} schedule start must be before end`);
      }

      const next = sorted[index + 1];
      if (next && current.endMinutes > next.startMinutes) {
        return helpers.message(`${day} schedule windows cannot overlap`);
      }
    }
  }

  if (!hasWindow) {
    return helpers.message("Custom schedule must include at least one time window");
  }

  return value;
};

const timeWindowSchema = Joi.object({
  start: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  end: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
});

const daysSchema = Joi.object(
  weekdays.reduce((schema, day) => {
    schema[day] = Joi.array().items(timeWindowSchema).default([]);
    return schema;
  }, {}),
).default({});

const scheduleSchema = Joi.object({
  mode: Joi.string().valid("always", "custom").required(),
  timezone: Joi.when("mode", {
    is: "custom",
    then: Joi.string().trim().required(),
    otherwise: Joi.string().trim().allow(null, "").optional(),
  }),
  days: Joi.when("mode", {
    is: "custom",
    then: daysSchema.required(),
    otherwise: daysSchema.optional(),
  }),
}).custom(validateScheduleWindows);

class DetectionSettingsValidation {
  createDetectionSettingsValidation(body) {
    const schema = Joi.object().keys({
      name: Joi.string().required(),
      settingType: Joi.string().required(),
      channelId: Joi.array().required(),
      NVRId: Joi.string().required(),
      enabled: Joi.boolean().required(),
      settings: Joi.object().required(),
      alerts: Joi.array().default([]) // comment later
    });
    const result = schema.validate(body);
    return result;
  }

  updateDetectionScheduleValidation(body) {
    return scheduleSchema.validate(body, { abortEarly: false });
  }
}
export default new DetectionSettingsValidation();
