import Joi from "joi";

const objectId = Joi.string().hex().length(24);
const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
  "string.pattern.base": "schedule.time must be HH:mm",
});

const schedule = Joi.object({
  frequency: Joi.string().valid("daily", "weekly", "monthly", "custom").required(),
  time: time.default("00:00"),
  weekday: Joi.number().integer().min(0).max(6).default(1),
  dayOfMonth: Joi.number().integer().min(1).max(28).default(1),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
}).custom((value, helpers) => {
  if (value.frequency === "custom" && (!value.startDate || !value.endDate)) {
    return helpers.error("any.custom", { message: "Custom reports require schedule.startDate and schedule.endDate" });
  }
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    return helpers.error("any.custom", { message: "schedule.endDate must be on or after schedule.startDate" });
  }
  return value;
}, "schedule validation").messages({ "any.custom": "{{#message}}" });

const target = Joi.object({
  scope: Joi.string().valid("organization", "employees", "departments").default("organization"),
  employeeIds: Joi.array().items(objectId).default([]),
  departmentIds: Joi.array().items(objectId).default([]),
}).custom((value, helpers) => {
  if (value.scope === "employees" && !value.employeeIds.length) {
    return helpers.error("any.custom", { message: "target.employeeIds is required for employees scope" });
  }
  if (value.scope === "departments" && !value.departmentIds.length) {
    return helpers.error("any.custom", { message: "target.departmentIds is required for departments scope" });
  }
  return value;
}, "target validation").messages({ "any.custom": "{{#message}}" });

const report = Joi.object({
  title: Joi.string().trim().min(2).max(120).required(),
  recipients: Joi.array().items(Joi.string().email()).min(1).required(),
  schedule: schedule.required(),
  target: target.default(),
  formats: Joi.array().items(Joi.string().valid("pdf", "csv")).min(1).unique().required(),
  enabled: Joi.boolean().default(true),
  sendTestMail: Joi.boolean().default(false),
});

export const createReportSchema = report;
export const updateReportSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120),
  recipients: Joi.array().items(Joi.string().email()).min(1),
  schedule,
  target,
  formats: Joi.array().items(Joi.string().valid("pdf", "csv")).min(1).unique(),
  enabled: Joi.boolean(),
  sendTestMail: Joi.boolean(),
}).min(1);
