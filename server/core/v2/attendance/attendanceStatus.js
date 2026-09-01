import AttendanceSettings, {
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_HALF_DAY_HOURS,
  DEFAULT_GRACE_HOURS,
} from "./attendanceSettings.model.js";

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
  const withinOpenWindow = graceEnabled
    ? [{ $lte: [{ $subtract: [now, "$firstCheckIn"] }, openWindowMs] }]
    : [];

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
                  fullDayMinutes,
                ],
              },
              then: ATTENDANCE_STATUS.PRESENT,
            },
            {
              case: {
                $gte: [
                  { $divide: [{ $subtract: ["$lastCheckOut", "$firstCheckIn"] }, 1000 * 60] },
                  halfDayMinutes,
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
