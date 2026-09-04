import Joi from "joi";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const objectId = (label) =>
  Joi.string().pattern(OBJECT_ID).messages({
    "string.pattern.base": `${label} must be a valid id`,
  });

const dateKey = (label) =>
  Joi.string().pattern(DATE_KEY).messages({
    "string.pattern.base": `${label} must be a date in YYYY-MM-DD format`,
  });

/** The grid read: which month, which slice of employees, filtered how. */
export const scheduleQueryValidator = Joi.object({
  month: Joi.string().pattern(MONTH_KEY).required().messages({
    "string.pattern.base": "month must be in YYYY-MM format",
    "any.required": "month is required",
  }),
  search: Joi.string().trim().allow("").max(120).default(""),
  locations: Joi.array().items(Joi.string().trim().min(1)).single().default([]),
  departmentIds: Joi.array().items(objectId("Department id")).single().default([]),
  designations: Joi.array().items(Joi.string().trim().min(1)).single().default([]),
  includeSuspended: Joi.boolean().default(false),
  skip: Joi.number().integer().min(0).default(0),
  // Capped because each employee carries a cell per day of the month; a page
  // of 100 in a 31-day month is already 3,100 cells on the wire.
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(true);

/** One cell. */
export const scheduleAssignValidator = Joi.object({
  employeeId: objectId("Employee id").required(),
  date: dateKey("date").required(),
  // Null assigns "no shift" for that day, which is different from clearing the
  // override — clearing restores the standing shift, this suppresses it.
  shiftId: objectId("Shift id").allow(null).default(null),
  isOff: Joi.boolean().default(false),
  dayType: Joi.string().valid("full", "half").default("full"),
  note: Joi.string().trim().allow("", null).max(200),
});

/** A rectangle of cells: some employees x some dates. */
export const scheduleBulkAssignValidator = Joi.object({
  employeeIds: Joi.array().items(objectId("Employee id")).single().min(1).required(),
  shiftId: objectId("Shift id").allow(null).default(null),
  isOff: Joi.boolean().default(false),
  dayType: Joi.string().valid("full", "half").default("full"),
  // Either an explicit list of dates, or a from/to range.
  dates: Joi.array().items(dateKey("date")).single(),
  from: dateKey("from"),
  to: dateKey("to"),
  // 0=Sunday .. 6=Saturday, matching Date#getDay(). Narrows a range so
  // "weekdays only across September" is a single call.
  weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).single(),
})
  .xor("dates", "from")
  .with("from", "to")
  .custom((value, helpers) => {
    if (value.from && value.to && value.from > value.to) {
      return helpers.error("any.invalid");
    }
    return value;
  })
  // A single .messages() call: a later one replaces an earlier one rather than
  // merging, so every override has to live here. `object.missing` is the case
  // an empty body hits (neither key sent); `object.xor` is both at once.
  .messages({
    "object.missing": "Provide either an explicit `dates` list or a `from`/`to` range",
    "object.xor": "Provide either an explicit `dates` list or a `from`/`to` range, not both",
    "object.with": "`from` requires `to`",
    "any.invalid": "`from` must not be after `to`",
  });

/** Remove overrides so the days inherit the standing shift again. */
export const scheduleClearValidator = Joi.object({
  employeeIds: Joi.array().items(objectId("Employee id")).single().min(1).required(),
  dates: Joi.array().items(dateKey("date")).single(),
  from: dateKey("from"),
  to: dateKey("to"),
})
  .xor("dates", "from")
  .with("from", "to")
  .messages({
    "object.missing": "Provide either an explicit `dates` list or a `from`/`to` range",
    "object.xor": "Provide either an explicit `dates` list or a `from`/`to` range, not both",
    "object.with": "`from` requires `to`",
  });
