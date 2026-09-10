import Joi from "joi";

const time = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .messages({ "string.pattern.base": "schedule.time must be HH:mm" });

const schedule = Joi.object({
  frequency: Joi.string().valid("daily", "weekly", "monthly", "custom").required(),
  time: time.default("07:00"),
  weekday: Joi.number().integer().min(0).max(6).default(1),
  dayOfMonth: Joi.number().integer().min(1).max(28).default(1),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
})
  .custom((value, helpers) => {
    if (value.frequency === "custom" && (!value.startDate || !value.endDate)) {
      return helpers.error("any.custom", { message: "Custom reports require schedule.startDate and schedule.endDate" });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      return helpers.error("any.custom", { message: "schedule.endDate must be on or after schedule.startDate" });
    }
    return value;
  }, "schedule validation")
  .messages({ "any.custom": "{{#message}}" });

const target = Joi.object({
  scope: Joi.string().valid("all", "stations").default("all"),
  stations: Joi.array().items(Joi.string().trim()).default([]),
})
  .custom((value, helpers) => {
    if (value.scope === "stations" && !value.stations.length) {
      return helpers.error("any.custom", { message: "target.stations is required for stations scope" });
    }
    return value;
  }, "target validation")
  .messages({ "any.custom": "{{#message}}" });

const FORMATS = ["pdf", "xlsx", "csv"];
const REPORT_TYPES = ["full", "pass", "mismatch", "qrerror"];

const base = {
  title: Joi.string().trim().min(2).max(120),
  recipients: Joi.array().items(Joi.string().email()).min(1),
  schedule,
  target,
  formats: Joi.array().items(Joi.string().valid(...FORMATS)).min(1).unique(),
  reportType: Joi.string().valid(...REPORT_TYPES),
  includeSnapshots: Joi.boolean(),
  // Deprecated — the `reportType` preset (mismatch) now covers this. Still
  // accepted so older clients / stored payloads don't 400; it is ignored.
  mismatchOnly: Joi.boolean().strip(),
  enabled: Joi.boolean(),
  sendTestMail: Joi.boolean().default(false),
};

export const createReportSchema = Joi.object({
  ...base,
  title: base.title.required(),
  recipients: base.recipients.required(),
  schedule: schedule.required(),
  formats: base.formats.required(),
});

export const updateReportSchema = Joi.object(base).min(1);
