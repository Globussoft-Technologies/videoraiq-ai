import AttendanceSettings, {
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_HALF_DAY_HOURS,
} from "./attendanceSettings.model.js";

/**
 * The four states an attendance-log row can be in.
 *
 * CHECKED_IN is deliberately not a kind of absence: the employee is on site and
 * the day simply isn't over, so grading it against the full-day threshold would
 * mark everyone absent every morning.
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
    return { fullDayHours: DEFAULT_FULL_DAY_HOURS, halfDayHours: DEFAULT_HALF_DAY_HOURS };
  }

  const saved = await AttendanceSettings.findOne({ adminId }).lean();
  return {
    fullDayHours: saved?.fullDayHours ?? DEFAULT_FULL_DAY_HOURS,
    halfDayHours: saved?.halfDayHours ?? DEFAULT_HALF_DAY_HOURS,
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
export function attendanceStatusStage({ fullDayHours, halfDayHours }) {
  const fullDayMinutes = Math.round(Number(fullDayHours || 0) * 60);
  const halfDayMinutes = Math.round(Number(halfDayHours || 0) * 60);

  const hasCheckIn = { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] };
  const hasCheckOut = { $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] };

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
            // On site, day not finished.
            {
              case: { $and: [hasCheckIn, { $not: [hasCheckOut] }] },
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
