import AttendanceSettings, {
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_HALF_DAY_HOURS,
  DEFAULT_GRACE_HOURS,
} from "./attendanceSettings.model.js";
import {
  SHIFT_DAY_KEYS,
  DEFAULT_MAX_OVERTIME_MINUTES,
} from "../shifts/shifts.model.js";

/**
 * The four states an attendance-log row can be in.
 *
 * CHECKED_IN is deliberately not a kind of absence: the employee is on site and
 * the day simply isn't over, so grading it against the full-day threshold would
 * mark everyone absent every morning. It is not permanent either — see the
 * grace window in attendanceStatusStage. A row that never receives a check-out
 * stops claiming the employee is on site once no check-out could still arrive
 * for it, and grades ABSENT from then on.
 */
export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  HALF_DAY: "half_day",
  ABSENT: "absent",
  CHECKED_IN: "checked_in",
};

export const ATTENDANCE_STATUS_LABELS = {
  [ATTENDANCE_STATUS.PRESENT]: "Present",
  [ATTENDANCE_STATUS.HALF_DAY]: "Half Day",
  [ATTENDANCE_STATUS.ABSENT]: "Absent",
  [ATTENDANCE_STATUS.CHECKED_IN]: "Checked In",
};

/** An org's rules, falling back to the defaults when none have been saved. */
export async function resolveAttendanceSettings(adminId) {
  if (!adminId) {
    return {
      fullDayHours: DEFAULT_FULL_DAY_HOURS,
      halfDayHours: DEFAULT_HALF_DAY_HOURS,
      graceHours: DEFAULT_GRACE_HOURS,
    };
  }

  const saved = await AttendanceSettings.findOne({ adminId }).lean();
  return {
    fullDayHours: saved?.fullDayHours ?? DEFAULT_FULL_DAY_HOURS,
    halfDayHours: saved?.halfDayHours ?? DEFAULT_HALF_DAY_HOURS,
    graceHours: saved?.graceHours ?? DEFAULT_GRACE_HOURS,
  };
}

/**
 * Shift-aware grading
 * ===================
 *
 * Without an assigned shift a day is graded purely on how long the employee was
 * on site, against org-wide thresholds — the original behaviour, and still what
 * an unassigned employee gets. With a shift, the same row is graded against
 * that shift's own window: its length sets the full/half-day marks, and the
 * clock times make "late" and "early leave" meaningful for the first time.
 *
 * Every stage below is a no-op for a row whose employee holds no shift, so
 * mixing assigned and unassigned employees in one pipeline is safe and no data
 * migration is needed.
 */

/** Used when neither the admin nor the request names a zone. */
export const DEFAULT_SHIFT_TZ = "Asia/Kolkata";

/** A time this far *before* the shift reference has wrapped past midnight. */
const WRAP_THRESHOLD_MINUTES = 12 * 60;

/** `"HH:MM"` -> minutes since midnight. Null for anything unparseable. */
const hhmmToMinutes = (field) => ({
  $let: {
    vars: {
      h: {
        $convert: {
          input: { $substrCP: [{ $ifNull: [field, ""] }, 0, 2] },
          to: "int",
          onError: null,
          onNull: null,
        },
      },
      m: {
        $convert: {
          input: { $substrCP: [{ $ifNull: [field, ""] }, 3, 2] },
          to: "int",
          onError: null,
          onNull: null,
        },
      },
    },
    in: {
      $cond: [
        { $or: [{ $eq: ["$$h", null] }, { $eq: ["$$m", null] }] },
        null,
        { $add: [{ $multiply: ["$$h", 60] }, "$$m"] },
      ],
    },
  },
});

/**
 * Minutes since midnight of a timestamp, read in the organisation's zone.
 *
 * This is why a timezone has to be threaded through at all: shift times are
 * local wall clock ("09:00") while timestamps are UTC instants. Comparing the
 * two without converting would put every Asia/Kolkata employee 5h30m out —
 * either always late or never late, depending on the shift.
 */
const minutesOfDay = (field, timezone) => ({
  $add: [
    { $multiply: [{ $hour: { date: field, timezone } }, 60] },
    { $minute: { date: field, timezone } },
  ],
});

/** Pull a night-shift timestamp that crossed midnight back onto its shift day. */
const unwrap = (actual, reference) => ({
  $cond: [
    { $lt: [{ $subtract: [actual, reference] }, -WRAP_THRESHOLD_MINUTES] },
    { $add: [actual, 24 * 60] },
    actual,
  ],
});

/**
 * Join each row to the shift its employee holds, as `shift`.
 *
 * `shiftIdExpr` differs per pipeline — Attendance Logs already has the whole
 * employee document by this point, Analytics only has the id — so the caller
 * supplies it rather than this guessing.
 */
export function shiftJoinStages(shiftIdExpr) {
  return [
    {
      $lookup: {
        from: "shifts",
        let: { shiftId: shiftIdExpr },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$shiftId"] } } }],
        as: "shift",
      },
    },
    { $unwind: { path: "$shift", preserveNullAndEmptyArrays: true } },
  ];
}

/** Resolve an employee id to their shift, for pipelines without the employee doc. */
export function employeeShiftJoinStages(employeeIdExpr) {
  return [
    {
      $lookup: {
        from: "authorizedusers",
        let: { empId: employeeIdExpr },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$empId"] } } },
          { $project: { shiftId: 1 } },
        ],
        as: "__shiftEmployee",
      },
    },
    { $unwind: { path: "$__shiftEmployee", preserveNullAndEmptyArrays: true } },
    ...shiftJoinStages("$__shiftEmployee.shiftId"),
  ];
}

/**
 * The calendar day a row belongs to.
 *
 * A night shift's day does not end at midnight: a 22:00-06:00 shift worked on
 * the 3rd produces events on both the 3rd and the 4th, and bucketing those by
 * calendar date would split one shift into two half-length days, grading both
 * absent. Rolling the timestamp back by the shift's start time puts the whole
 * shift on the day it started.
 *
 * Only night shifts are rebucketed. Everything else keeps the exact expression
 * the caller was already using (`fallback`), because changing how ordinary rows
 * are bucketed would silently move existing days across date boundaries for
 * every tenant — a far bigger change than this feature is entitled to make.
 *
 * Known boundary: the date-range $match runs before this grouping, so a night
 * shift whose employee checks in *after* midnight is matched into the following
 * day's query while still carrying the previous day's bucket. Its grading is
 * correct either way; only which day's page it appears on shifts.
 */
export function shiftDayBucketExpr(timezone, fallback, dateField = "$createdAt") {
  return {
    $cond: [
      { $eq: [{ $ifNull: ["$shift.isNightShift", false] }, true] },
      {
        $dateToString: {
          format: "%Y-%m-%d",
          timezone,
          date: {
            $subtract: [
              dateField,
              {
                $multiply: [
                  { $ifNull: [hhmmToMinutes("$shift.startTime"), 0] },
                  60 * 1000,
                ],
              },
            ],
          },
        },
      },
      fallback,
    ],
  };
}

/**
 * Derive this row's expectations from its shift: how long the day should be,
 * and how late / how early the employee actually was.
 *
 * Runs after `firstCheckIn`/`lastCheckOut` exist and before
 * `attendanceStatusStage`, which reads the thresholds produced here.
 */
export function shiftContextStage(timezone) {
  const hasShift = { $ne: [{ $ifNull: ["$shift", null] }, null] };

  const startMinutes = hhmmToMinutes("$shift.startTime");
  const endMinutes = hhmmToMinutes("$shift.endTime");

  // Wrap a night shift's end past midnight so the span stays positive.
  const spanMinutes = {
    $let: {
      vars: { s: startMinutes, e: endMinutes },
      in: {
        $cond: [
          { $or: [{ $eq: ["$$s", null] }, { $eq: ["$$e", null] }] },
          null,
          {
            $cond: [
              { $gt: ["$$e", "$$s"] },
              { $subtract: ["$$e", "$$s"] },
              { $subtract: [{ $add: ["$$e", 24 * 60] }, "$$s"] },
            ],
          },
        ],
      },
    },
  };

  // What this row's weekday is worth on that shift: off / half / full.
  const dayType = {
    $let: {
      vars: { dow: { $dayOfWeek: { date: "$firstCheckIn", timezone } } },
      in: {
        $switch: {
          branches: SHIFT_DAY_KEYS.map((key, index) => ({
            case: { $eq: ["$$dow", index + 1] },
            then: { $ifNull: ["$shift.workingDays." + key + ".type", "full"] },
          })),
          default: "full",
        },
      },
    },
  };

  return [
    {
      $addFields: {
        shiftName: { $cond: [hasShift, "$shift.name", null] },
        shiftStartTime: { $cond: [hasShift, "$shift.startTime", null] },
        shiftEndTime: { $cond: [hasShift, "$shift.endTime", null] },
        isNightShift: {
          $cond: [hasShift, { $ifNull: ["$shift.isNightShift", false] }, null],
        },
        shiftStartMinutes: { $cond: [hasShift, startMinutes, null] },
        shiftEndMinutes: { $cond: [hasShift, endMinutes, null] },
        shiftSpanMinutes: { $cond: [hasShift, spanMinutes, null] },
        shiftDayType: {
          $cond: [
            {
              $and: [
                hasShift,
                { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] },
              ],
            },
            dayType,
            null,
          ],
        },
      },
    },
    {
      $addFields: {
        // Paid time the shift asks for: its window less the unpaid break.
        shiftPayableMinutes: {
          $cond: [
            { $eq: [{ $ifNull: ["$shiftSpanMinutes", null] }, null] },
            null,
            {
              $max: [
                0,
                {
                  $subtract: [
                    "$shiftSpanMinutes",
                    { $ifNull: ["$shift.breakMinutes", 0] },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        // A day configured as a half day only asks for half the hours, so
        // working it in full has to grade Present rather than Half Day.
        expectedFullDayMinutes: {
          $cond: [
            { $eq: [{ $ifNull: ["$shiftPayableMinutes", null] }, null] },
            null,
            {
              $cond: [
                { $eq: ["$shiftDayType", "half"] },
                { $divide: ["$shiftPayableMinutes", 2] },
                "$shiftPayableMinutes",
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        expectedHalfDayMinutes: {
          $cond: [
            { $eq: [{ $ifNull: ["$expectedFullDayMinutes", null] }, null] },
            null,
            { $divide: ["$expectedFullDayMinutes", 2] },
          ],
        },
        // How long an open check-in keeps claiming the employee is on site:
        // the shift window plus its own overtime allowance, replacing the
        // org-wide grace for anyone who holds a shift.
        openWindowMs: {
          $cond: [
            { $eq: [{ $ifNull: ["$shiftSpanMinutes", null] }, null] },
            null,
            {
              $multiply: [
                {
                  $add: [
                    "$shiftSpanMinutes",
                    {
                      $cond: [
                        { $gt: [{ $ifNull: ["$shift.maxOvertimeMinutes", 0] }, 0] },
                        "$shift.maxOvertimeMinutes",
                        DEFAULT_MAX_OVERTIME_MINUTES,
                      ],
                    },
                  ],
                },
                60 * 1000,
              ],
            },
          ],
        },
        lateMinutes: {
          $cond: [
            {
              $and: [
                hasShift,
                { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] },
                { $ne: [{ $ifNull: ["$shiftStartMinutes", null] }, null] },
              ],
            },
            {
              $max: [
                0,
                {
                  $subtract: [
                    unwrap(
                      minutesOfDay("$firstCheckIn", timezone),
                      "$shiftStartMinutes",
                    ),
                    {
                      $add: [
                        "$shiftStartMinutes",
                        { $ifNull: ["$shift.graceLateMinutes", 0] },
                      ],
                    },
                  ],
                },
              ],
            },
            null,
          ],
        },
        earlyLeaveMinutes: {
          $cond: [
            {
              $and: [
                hasShift,
                { $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] },
                { $ne: [{ $ifNull: ["$shiftEndMinutes", null] }, null] },
              ],
            },
            {
              $max: [
                0,
                {
                  $subtract: [
                    {
                      $subtract: [
                        "$shiftEndMinutes",
                        { $ifNull: ["$shift.graceEarlyMinutes", 0] },
                      ],
                    },
                    unwrap(
                      minutesOfDay("$lastCheckOut", timezone),
                      "$shiftEndMinutes",
                    ),
                  ],
                },
              ],
            },
            null,
          ],
        },
      },
    },
  ];
}

/**
 * Overtime plus the late / early / week-off flags.
 *
 * Separate from `shiftContextStage` because it needs `minutesSpent`, which
 * `attendanceStatusStage` is the one to produce.
 */
export function shiftOvertimeStage() {
  return {
    $addFields: {
      overtimeMinutes: {
        $cond: [
          { $eq: [{ $ifNull: ["$shiftPayableMinutes", null] }, null] },
          null,
          { $max: [0, { $subtract: ["$minutesSpent", "$shiftPayableMinutes"] }] },
        ],
      },
      isLate: { $gt: [{ $ifNull: ["$lateMinutes", 0] }, 0] },
      isEarlyLeave: { $gt: [{ $ifNull: ["$earlyLeaveMinutes", 0] }, 0] },
      isWeekOff: { $eq: [{ $ifNull: ["$shiftDayType", null] }, "off"] },
    },
  };
}

/**
 * Aggregation stage deriving `minutesSpent` and `status` from the row's own
 * first check-in and last check-out.
 *
 * This runs inside the pipeline rather than in JS afterwards for two reasons:
 * the Attendance Logs page needs to filter and sort by status without pulling
 * every row into memory, and /analytics/attendance-presence reuses this very
 * pipeline and collapses it with a $group — so it can only count by status if
 * the database knows the status.
 *
 * Grading is on elapsed time (last check-out minus first check-in), matching
 * how `minutesSpent` has always been computed on this screen.
 *
 * The thresholds it grades against are per-row when `shiftContextStage` has
 * run: an employee on a 10:00-19:00 shift with a 90-minute break owes 7h30m,
 * not the org-wide 8h. Rows with no shift — and pipelines that never join one —
 * fall back to the org settings passed in here.
 */
export function attendanceStatusStage({
  fullDayHours,
  halfDayHours,
  graceHours,
  now = new Date(),
}) {
  const fullDayMinutes = Math.round(Number(fullDayHours || 0) * 60);
  const halfDayMinutes = Math.round(Number(halfDayHours || 0) * 60);

  const hasCheckIn = { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] };
  const hasCheckOut = { $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] };

  // How long a row with no check-out may go on claiming the employee is still
  // on site: their own check-in plus the full day they owe plus the grace on
  // top. Deliberately the same window checkoutCarryOver.js pairs a late
  // check-out within, so the two can never disagree — while a check-out could
  // still arrive and complete this row, the row is never yet graded absent, and
  // the moment it grades absent no check-out can still arrive to contradict it.
  //
  // `now` is baked in at pipeline-build time rather than read as $$NOW so every
  // branch of one request grades against a single instant. Omitting graceHours
  // disables the timeout entirely, which is the pre-grace behaviour.
  const graceEnabled = graceHours != null;
  const openWindowMs = Math.max(
    0,
    Math.round((Number(fullDayHours || 0) + Number(graceHours || 0)) * 60 * 60 * 1000),
  );

  // An employee holding a shift is graded against that shift's own window;
  // everyone else keeps the org-wide thresholds. `shiftContextStage` sets these
  // three fields, so a pipeline that doesn't run it behaves exactly as before.
  const fullDayThreshold = { $ifNull: ["$expectedFullDayMinutes", fullDayMinutes] };
  const halfDayThreshold = { $ifNull: ["$expectedHalfDayMinutes", halfDayMinutes] };
  const openWindow = { $ifNull: ["$openWindowMs", graceEnabled ? openWindowMs : null] };

  // A null window means no timeout at all — the pre-grace behaviour, kept for
  // an org that has explicitly cleared graceHours and assigns no shifts.
  const withinOpenWindow = [
    {
      $or: [
        { $eq: [openWindow, null] },
        { $lte: [{ $subtract: [now, "$firstCheckIn"] }, openWindow] },
      ],
    },
  ];

  return {
    $addFields: {
      minutesSpent: {
        $cond: [
          { $and: [hasCheckIn, hasCheckOut] },
          {
            $max: [
              0,
              {
                $round: [
                  { $divide: [{ $subtract: ["$lastCheckOut", "$firstCheckIn"] }, 1000 * 60] },
                  0,
                ],
              },
            ],
          },
          0,
        ],
      },
      status: {
        $switch: {
          branches: [
            // On site, day not finished — but only while a check-out could
            // still arrive. Past the window this case stops matching and the
            // row falls through: $subtract on a null lastCheckOut yields null,
            // both duration branches are false, and the default grades it
            // ABSENT. That is the whole timeout; no extra branch is needed.
            {
              case: {
                $and: [hasCheckIn, { $not: [hasCheckOut] }, ...withinOpenWindow],
              },
              then: ATTENDANCE_STATUS.CHECKED_IN,
            },
            // A check-out with no check-in is malformed data, not a worked day.
            { case: { $not: [hasCheckIn] }, then: ATTENDANCE_STATUS.ABSENT },
            {
              case: {
                $gte: [
                  { $divide: [{ $subtract: ["$lastCheckOut", "$firstCheckIn"] }, 1000 * 60] },
                  fullDayThreshold,
                ],
              },
              then: ATTENDANCE_STATUS.PRESENT,
            },
            {
              case: {
                $gte: [
                  { $divide: [{ $subtract: ["$lastCheckOut", "$firstCheckIn"] }, 1000 * 60] },
                  halfDayThreshold,
                ],
              },
              then: ATTENDANCE_STATUS.HALF_DAY,
            },
          ],
          // Checked in and out, but under the half-day threshold.
          default: ATTENDANCE_STATUS.ABSENT,
        },
      },
    },
  };
}
