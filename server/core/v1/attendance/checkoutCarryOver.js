import Attendance from "./attendance.model.js";
import AttendanceSettings, {
  DEFAULT_FULL_DAY_HOURS,
  DEFAULT_GRACE_HOURS,
} from "./attendanceSettings.model.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Closing a shift that started yesterday.
 *
 * Attendance rows are bucketed by the calendar day the document was created on,
 * so a shift running 22:00 -> 06:00 logs its check-out on the day AFTER its
 * check-in, where there is no row to close. logAttendance used to reject that
 * check-out outright ("Cannot checkout before check-in") and the night's hours
 * were lost for good: the row sat as a check-in with no check-out forever, and
 * the check-out timestamp was never written anywhere.
 *
 * Instead, close yesterday's still-open row. It keeps its own createdAt, so the
 * whole shift stays bucketed on the day it started and grades on real elapsed
 * time — no change is needed in the aggregation pipeline, on the Attendance Logs
 * page, in Analytics, or in the exports. They all read the same document.
 *
 * Shared by both versions' write paths because they are the same code and the
 * CV service posts to /api/v1/attendance (see ATTENDANCE_LOG_API).
 */

/**
 * How long after a check-in a check-out can still be paired with it.
 *
 * The same window that decides when a day stops waiting for a check-out, on
 * purpose: while a check-out can still be carried over, the day is never yet
 * written off, and the moment it is written off no check-out can arrive to
 * contradict that. One number, so the two can't drift apart.
 */
export async function resolveCarryOverWindowMs(adminId) {
  const fallback = (DEFAULT_FULL_DAY_HOURS + DEFAULT_GRACE_HOURS) * MS_PER_HOUR;
  if (!adminId) return fallback;

  const saved = await AttendanceSettings.findOne({ adminId })
    .select("fullDayHours graceHours")
    .lean();
  if (!saved) return fallback;

  const fullDayHours = saved.fullDayHours ?? DEFAULT_FULL_DAY_HOURS;
  const graceHours = saved.graceHours ?? DEFAULT_GRACE_HOURS;
  return (Number(fullDayHours) + Number(graceHours)) * MS_PER_HOUR;
}

/** Earliest check-in timestamp on a row, or null if it has none. */
function firstCheckInAt(row) {
  const times = (Array.isArray(row?.events) ? row.events : [])
    .filter((event) => event?.cameraType === "checkin" && event?.timestamp)
    .map((event) => new Date(event.timestamp).getTime())
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.min(...times) : null;
}

/**
 * The most recent row from before today that is still open — has a check-in and
 * no check-out — and whose check-in is recent enough to still be paired with.
 *
 * The `createdAt >= now - windowMs` bound does the day-scoping on its own: a
 * window shorter than 24h can never reach further back than yesterday, and it
 * collapses to an empty range late in the day, when nothing from yesterday could
 * still be inside the window anyway. It also lets the existing
 * { user, employee, createdAt } index serve the lookup directly.
 *
 * The stale-row guard matters: without it, someone who simply forgot to check
 * out yesterday would have this morning's walk past a check-out camera close
 * that row as a 24-hour shift.
 *
 * Returns null when there is nothing safe to carry over, and the caller rejects
 * the check-out exactly as it always did.
 */
export async function findOpenCheckinToCarryOver({
  userId,
  employeeId,
  startOfDay,
  windowMs,
  now = Date.now(),
}) {
  if (!userId || !employeeId || !startOfDay || !(windowMs > 0)) return null;

  const windowStart = new Date(now - windowMs);
  if (windowStart >= startOfDay) return null;

  const candidate = await Attendance.findOne({
    user: userId,
    employee: employeeId,
    createdAt: { $gte: windowStart, $lt: startOfDay },
    "events.cameraType": "checkin",
    events: { $not: { $elemMatch: { cameraType: "checkout" } } },
  })
    .sort({ createdAt: -1 })
    .select("_id events");

  if (!candidate) return null;

  // Bounded on the event timestamp too, not just the document's createdAt —
  // that is the time the day is actually graded from.
  const openedAt = firstCheckInAt(candidate);
  if (openedAt == null || now - openedAt > windowMs) return null;

  return candidate;
}
