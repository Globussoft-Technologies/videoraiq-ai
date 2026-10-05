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

const validateContentSelection = (value, helpers) => {
  if (value.contentType === "incidents") {
    if (!value.incidentTypes?.length) {
      return helpers.error("any.custom", { message: "Select at least one incident type" });
    }
    if (value.target?.scope && value.target.scope !== "organization") {
      return helpers.error("any.custom", { message: "Audience filtering is only available for attendance reports" });
    }
    if ((value.formats || []).some((format) => format === "breakPdf" || format === "breakXlsx")) {
      return helpers.error("any.custom", { message: "Break log formats are only available for attendance reports" });
    }
  }
  return value;
};

const report = Joi.object({
  title: Joi.string().trim().min(2).max(120).required(),
  contentType: Joi.string().valid("attendance", "incidents").default("attendance"),
  incidentTypes: Joi.array().items(Joi.string().trim().min(1).max(120)).unique().default([]),
  pdfLayout: Joi.string().valid("list", "grid").default("list"),
  recipients: Joi.array().items(Joi.string().email()).min(1).required(),
  schedule: schedule.required(),
  target: target.default(),
  formats: Joi.array().items(Joi.string().valid("pdf", "csv", "xlsx", "breakPdf", "breakXlsx")).min(1).unique().required(),
  enabled: Joi.boolean().default(true),
  sendTestMail: Joi.boolean().default(false),
}).custom(validateContentSelection, "report content validation").messages({ "any.custom": "{{#message}}" });

export const createReportSchema = report;
export const updateReportSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120),
  contentType: Joi.string().valid("attendance", "incidents"),
  incidentTypes: Joi.array().items(Joi.string().trim().min(1).max(120)).min(1).unique(),
  pdfLayout: Joi.string().valid("list", "grid"),
  recipients: Joi.array().items(Joi.string().email()).min(1),
  schedule,
  target,
  formats: Joi.array().items(Joi.string().valid("pdf", "csv", "xlsx", "breakPdf", "breakXlsx")).min(1).unique(),
  enabled: Joi.boolean(),
  sendTestMail: Joi.boolean(),
}).min(1);
