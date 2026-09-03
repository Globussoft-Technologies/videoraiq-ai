import Joi from "joi";
import { DAY_TYPES, SHIFT_DAY_KEYS } from "./shifts.model.js";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const time = (label) =>
  Joi.string().pattern(HHMM).messages({
    "string.pattern.base": `${label} must be a 24-hour time in HH:MM format`,
  });

const minutes = (label, max = 24 * 60) =>
  Joi.number().integer().min(0).max(max).messages({
    "number.base": `${label} must be a number of minutes`,
    "number.min": `${label} cannot be negative`,
    "number.max": `${label} cannot exceed ${max} minutes`,
  });

const objectId = (label) =>
  Joi.string().pattern(OBJECT_ID).messages({
    "string.pattern.base": `${label} must be a valid id`,
  });

/**
 * One day of the week. `type` is what the UI's off -> full -> half cycle
 * writes; `start`/`end` are optional overrides for a day that runs a different
 * window from the rest of the shift.
 */
const workingDaySchema = Joi.object({
  type: Joi.string()
    .valid(...DAY_TYPES)
    .required(),
  start: time("Day start time").allow(null, ""),
  end: time("Day end time").allow(null, ""),
});

const workingDaysSchema = Joi.object(
  Object.fromEntries(SHIFT_DAY_KEYS.map((day) => [day, workingDaySchema])),
);

/** Pre-`workingDays` shape. Accepted so older clients keep working. */
const legacyDaySchema = Joi.object({
  enabled: Joi.boolean().required(),
  start: Joi.string().when("enabled", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  end: Joi.string().when("enabled", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

const shiftBody = {
  name: Joi.string().min(3).max(100).messages({
    "string.min": "Shift name must be at least 3 characters",
    "string.max": "Shift name cannot exceed 100 characters",
  }),
  color: Joi.string().max(32),

  startTime: time("Start time"),
  endTime: time("End time"),
  breakMinutes: minutes("Break"),
  graceLateMinutes: minutes("Grace late"),
  graceEarlyMinutes: minutes("Grace early leave"),
  maxOvertimeMinutes: minutes("Max overtime"),

  isNightShift: Joi.boolean(),
  isDefault: Joi.boolean(),
  isActive: Joi.boolean(),

  workingDays: workingDaysSchema,

  // Legacy blocks. Still accepted on the way in; `timings` is regenerated from
  // `workingDays` on save, so sending both means `workingDays` wins.
  timings: Joi.object(
    Object.fromEntries(SHIFT_DAY_KEYS.map((day) => [day, legacyDaySchema])),
  ),
  settings: Joi.object({
    lateLogin: Joi.number().min(0),
    earlyLogout: Joi.number().min(0),
    halfDay: Joi.string().allow("", null),
    overTime: Joi.string().allow("", null),
    halfDayProductiveTime: Joi.string().allow("", null),
    fullDayProductiveTime: Joi.string().allow("", null),
  }),

  note: Joi.string().allow("", null).max(500),
};

export const createShiftValidator = Joi.object({
  ...shiftBody,
  name: shiftBody.name.required(),
});

export const updateShiftValidator = Joi.object(shiftBody).min(1).messages({
  "object.min": "Provide at least one field to update",
});

/**
 * Who a bulk assignment targets.
 *
 * The filters are ANDed, and an empty filter set means "every employee under
 * this admin" — which is why `allEmployees` has to be sent explicitly to use
 * it. Without that flag an assign call with a mistyped/empty filter would
 * silently re-shift the entire org.
 */
const assignmentFilters = {
  employeeIds: Joi.array().items(objectId("Employee id")).single(),
  locations: Joi.array().items(Joi.string().trim().min(1)).single(),
  departmentIds: Joi.array().items(objectId("Department id")).single(),
  allEmployees: Joi.boolean().default(false),
  // false (default) skips employees who already hold a different shift, so a
  // bulk assign can fill in the gaps without stamping over deliberate
  // per-employee overrides.
  overwriteExisting: Joi.boolean().default(true),
  // Suspended staff are excluded unless asked for.
  includeSuspended: Joi.boolean().default(false),
};

export const assignmentFilterValidator = Joi.object(assignmentFilters).custom(
  (value, helpers) => {
    const hasFilter =
      value.employeeIds?.length ||
      value.locations?.length ||
      value.departmentIds?.length;
    if (!hasFilter && !value.allEmployees) {
      return helpers.error("any.custom", {
        message:
          "Select at least one employee, location or department — or set allEmployees to assign to everyone",
      });
    }
    return value;
  },
  "at least one target",
).messages({
  "any.custom":
    "Select at least one employee, location or department — or set allEmployees to assign to everyone",
});

/**
 * Preview takes the same filters plus paging and a name search.
 *
 * `search` is deliberately preview-only. It exists so the assign modal's
 * employee picker can search a large roster server-side; letting it reach the
 * write path would mean a bulk assign could be scoped by a half-typed name.
 */
export const assignmentPreviewValidator = Joi.object({
  ...assignmentFilters,
  search: Joi.string().trim().allow("").max(120).default(""),
  skip: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(200).default(10),
});

export const unassignValidator = Joi.object({
  employeeIds: Joi.array().items(objectId("Employee id")).single().min(1).required(),
});
