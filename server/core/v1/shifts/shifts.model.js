import mongoose from "mongoose";

/**
 * Day keys in `Date#getDay()` order, so `SHIFT_DAY_KEYS[date.getDay()]` maps a
 * calendar date straight onto a shift's working-day entry. Exported because the
 * attendance roster does exactly that lookup.
 */
export const SHIFT_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** What a single day of the week is worth. The UI cycles off -> full -> half. */
export const DAY_TYPES = ["off", "full", "half"];

/** The week a shift gets when neither `workingDays` nor `timings` says otherwise. */
export const DEFAULT_WORKING_WEEK = Object.freeze({
  sunday: "off",
  monday: "full",
  tuesday: "full",
  wednesday: "full",
  thursday: "full",
  friday: "full",
  saturday: "off",
});

/** `maxOvertimeMinutes: 0` means "use the system default", which is 12 hours. */
export const DEFAULT_MAX_OVERTIME_MINUTES = 12 * 60;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * One day of a shift's week.
 *
 * `start`/`end` are optional per-day overrides — a shift whose Saturday runs
 * shorter than the rest of the week sets them there and leaves every other day
 * inheriting the shift-level `startTime`/`endTime`. Most shifts never set them.
 */
const dayConfigSchema = new mongoose.Schema(
  {
    type: { type: String, enum: DAY_TYPES, default: "off" },
    start: { type: String, default: null },
    end: { type: String, default: null },
  },
  { _id: false },
);

/** Legacy per-day shape. Still written (mirrored from `workingDays`) — see below. */
const legacyDaySchema = new mongoose.Schema(
  {
    start: String,
    end: String,
    enabled: Boolean,
  },
  { _id: false },
);

const ShiftSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional since the Shift Management form has no colour picker; the
    // service assigns one from a fixed palette so the listing and the
    // attendance roster (which selects `color`) always have something to paint.
    color: {
      type: String,
      default: "#6366f1",
    },

    // ---- Shift window -------------------------------------------------
    // The canonical window for every working day. A day that needs a different
    // window overrides it in `workingDays.<day>.start/end`.
    startTime: { type: String, default: "09:00", match: HHMM },
    endTime: { type: String, default: "18:00", match: HHMM },

    // Unpaid break inside the window. Subtracted from the payable duration, so
    // a 09:00-18:00 shift with a 60-minute break is an 8-hour day.
    breakMinutes: { type: Number, default: 60, min: 0, max: 24 * 60 },

    // ---- Tolerances ---------------------------------------------------
    // Minutes past `startTime` an employee may check in without being late.
    graceLateMinutes: { type: Number, default: 0, min: 0, max: 24 * 60 },
    // Minutes before `endTime` an employee may check out without being early.
    graceEarlyMinutes: { type: Number, default: 0, min: 0, max: 24 * 60 },

    // How long past the shift end an open check-in is still treated as active,
    // so a forgotten check-out (or genuine overtime that rolls past midnight)
    // is still paired with its check-in rather than being written off. 0 means
    // fall back to DEFAULT_MAX_OVERTIME_MINUTES.
    maxOvertimeMinutes: { type: Number, default: 0, min: 0, max: 24 * 60 },

    // ---- Flags --------------------------------------------------------
    // Derived on save when `endTime <= startTime` (the window crosses
    // midnight), but settable by hand for a shift that ends exactly at 00:00.
    isNightShift: { type: Boolean, default: false },

    // The shift new employees inherit when none is assigned. At most one per
    // admin — enforced in the service, which clears the flag on the others.
    isDefault: { type: Boolean, default: false },

    // ---- Week ---------------------------------------------------------
    // Deliberately without schema defaults: a default here is
    // indistinguishable from a real value once the document is loaded, so a
    // pre-rework shift (which has `timings` and no `workingDays`) would come
    // back claiming a Mon-Fri week and quietly override its own timings. The
    // pre-validate hook below fills every day in instead, from `timings` when
    // there is one and from DEFAULT_WORKING_WEEK otherwise.
    workingDays: {
      sunday: { type: dayConfigSchema },
      monday: { type: dayConfigSchema },
      tuesday: { type: dayConfigSchema },
      wednesday: { type: dayConfigSchema },
      thursday: { type: dayConfigSchema },
      friday: { type: dayConfigSchema },
      saturday: { type: dayConfigSchema },
    },

    // ---- Legacy (kept in sync, do not write directly) -------------------
    // `timings` predates `workingDays` and is still read by the attendance
    // "not checked in" roster and by shifts created before this schema. The
    // pre-validate hook below mirrors `workingDays` into it on every write, so
    // old readers keep working without a data migration. New code should read
    // `workingDays` via `resolveShiftDay`.
    timings: {
      monday: legacyDaySchema,
      tuesday: legacyDaySchema,
      wednesday: legacyDaySchema,
      thursday: legacyDaySchema,
      friday: legacyDaySchema,
      saturday: legacyDaySchema,
      sunday: legacyDaySchema,
    },

    // Also legacy. `lateLogin`/`earlyLogout` are mirrored from
    // `graceLateMinutes`/`graceEarlyMinutes`; the productive-time fields have
    // no new-schema equivalent and are passed through untouched.
    settings: {
      lateLogin: { type: Number, default: 0 },
      earlyLogout: { type: Number, default: 0 },
      halfDay: { type: String },
      overTime: { type: String },
      halfDayProductiveTime: { type: String },
      fullDayProductiveTime: { type: String },
    },

    note: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// The listing filters by admin and sorts newest-first; the name regex search
// rides the same index. Not unique — existing tenants may already hold
// duplicate names, so the service does a case-insensitive check instead.
ShiftSchema.index({ adminId: 1, createdAt: -1 });
ShiftSchema.index({ adminId: 1, name: 1 });
// Resolving "which shift do unassigned employees get" is a single-doc lookup.
ShiftSchema.index({ adminId: 1, isDefault: 1 });

/** "HH:MM" -> minutes since midnight, or null if it isn't a valid time. */
export function toMinutes(value) {
  const match = HHMM.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Read a shift's entry for one day, understanding both schemas.
 *
 * Returns `{ type, start, end }` with `start`/`end` resolved against the
 * shift-level window. Falls back to the legacy `timings` block for documents
 * written before `workingDays` existed, and finally to a working full day so a
 * half-configured shift never silently excuses everyone from attendance.
 */
export function resolveShiftDay(shift, dayKey) {
  if (!shift || !dayKey) return null;

  const configured = shift.workingDays?.[dayKey];
  if (configured?.type) {
    return {
      type: configured.type,
      start: configured.start || shift.startTime || null,
      end: configured.end || shift.endTime || null,
    };
  }

  const legacy = shift.timings?.[dayKey];
  if (legacy && typeof legacy.enabled === "boolean") {
    return {
      type: legacy.enabled ? "full" : "off",
      start: legacy.start || shift.startTime || null,
      end: legacy.end || shift.endTime || null,
    };
  }

  return { type: "full", start: shift.startTime || null, end: shift.endTime || null };
}

/** Day keys the shift does not expect the employee on. */
export function weekOffDays(shift) {
  return SHIFT_DAY_KEYS.filter((day) => resolveShiftDay(shift, day)?.type === "off");
}

/**
 * Keep the legacy blocks and the derived flags in step with the canonical
 * fields. Runs on `create`/`save`; the service routes every write through those
 * rather than through `findOneAndUpdate`, so the mirrors can never drift.
 */
ShiftSchema.pre("validate", function syncDerivedFields() {
  const start = toMinutes(this.startTime);
  const end = toMinutes(this.endTime);

  // A window that doesn't advance has wrapped past midnight.
  if (start !== null && end !== null && !this.isModified("isNightShift")) {
    this.isNightShift = end <= start;
  }

  // Legacy -> canonical, first. A caller (or an existing document) that only
  // has `timings` has to end up with the `workingDays` it implies, otherwise
  // the canonical-to-legacy mirror below would overwrite it with defaults.
  // Anything the caller set on `workingDays` wins.
  for (const day of SHIFT_DAY_KEYS) {
    if (this.workingDays?.[day]?.type) continue;

    const legacy = this.timings?.[day];
    if (legacy && typeof legacy.enabled === "boolean") {
      this.set(`workingDays.${day}`, {
        type: legacy.enabled ? "full" : "off",
        start: legacy.start || null,
        end: legacy.end || null,
      });
    } else {
      this.set(`workingDays.${day}`, { type: DEFAULT_WORKING_WEEK[day] });
    }
  }

  for (const day of SHIFT_DAY_KEYS) {
    const resolved = resolveShiftDay(this, day);
    if (!resolved) continue;
    // Legacy readers only understand worked/not-worked, so a half day reads as
    // enabled — the employee is still expected on site.
    this.set(`timings.${day}`, {
      start: resolved.start || undefined,
      end: resolved.end || undefined,
      enabled: resolved.type !== "off",
    });
  }

  this.set("settings.lateLogin", this.graceLateMinutes || 0);
  this.set("settings.earlyLogout", this.graceEarlyMinutes || 0);
});

export default mongoose.model("Shift", ShiftSchema);
