import moment from "moment-timezone";
import mongoose from "mongoose";
import Attendance from "../core/v1/attendance/attendance.model.js";
import Shift, { resolveShiftDay, toMinutes } from "../core/v1/shifts/shifts.model.js";
import Schedule from "../core/v1/shifts/shiftSchedule.model.js";
import { Incident } from "../core/v1/incidents/incidents.model.js";
import { sendPayloadToUser } from "../socket.js";
import MailResponse from "../mailService/mail.helper.js";
import logger from "../utils/logger.js";

const LateArrival = Incident.discriminators?.lateArrival || Incident.discriminator(
  "lateArrival", new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "authorizedUsers" },
    attendanceDate: String,
    shiftId: mongoose.Schema.Types.ObjectId,
    expectedArrival: Date,
    graceDeadline: Date,
    lateMinutes: Number,
  }),
);

// Pure calculation, also used for schedule overrides and overnight starts.
export function arrivalExpectation({ shift, override, date, timezone, arrivedAt }) {
  if (!shift || shift.isActive === false || override?.isOff) return null;
  const day = resolveShiftDay(shift, moment.tz(date, timezone).format("dddd").toLowerCase());
  if ((override ? override.dayType : day?.type) === "off") return null;
  const start = day?.start || shift.startTime;
  if (toMinutes(start) === null) return null;
  const expectedArrival = moment.tz(`${date} ${start}`, "YYYY-MM-DD HH:mm", timezone);
  const graceDeadline = expectedArrival.clone().add(shift.graceLateMinutes || 0, "minutes");
  const delta = new Date(arrivedAt).getTime() - graceDeadline.valueOf();
  return { date, shiftId: shift._id, shiftName: shift.name, startTime: start, expectedArrival: expectedArrival.toDate(),
    graceDeadline: graceDeadline.toDate(), isLate: delta > 0,
    lateMinutes: Math.max(0, Math.ceil(delta / 60000)) };
}

/** Both ingestion versions call this after saving. Notification failures never reject attendance. */
export async function processLateArrival({ attendance, employee, admin, channel, event }) {
  if (event.cameraType !== "checkin") return;
  try {
    const timezone = moment.tz.zone(admin.timezone) ? admin.timezone : "Asia/Kolkata";
    const today = moment(event.timestamp).tz(timezone).format("YYYY-MM-DD");
    const yesterday = moment.tz(today, timezone).subtract(1, "day").format("YYYY-MM-DD");
    const overrides = await Schedule.find({ adminId: admin._id, employee: employee._id,
      date: { $in: [today, yesterday] } }).lean();
    const shifts = await Shift.find({ adminId: admin._id,
      _id: { $in: [employee.shiftId, ...overrides.map(o => o.shiftId)].filter(Boolean) } }).lean();
    const resolve = (date) => {
      const override = overrides.find(o => o.date === date);
      const id = override ? override.shiftId : employee.shiftId;
      const shift = shifts.find(s => String(s._id) === String(id));
      return { shift, override, expectation: arrivalExpectation({ shift, override, date, timezone, arrivedAt: event.timestamp }) };
    };
    let selected = resolve(today);
    const previous = resolve(yesterday);
    // After-midnight arrivals belong to yesterday's overnight window.
    if (previous.expectation && toMinutes(previous.shift.endTime) <= toMinutes(previous.shift.startTime)) {
      const end = moment.tz(`${today} ${previous.shift.endTime}`, "YYYY-MM-DD HH:mm", timezone);
      if (moment(event.timestamp).isBefore(end)) selected = previous;
    }
    const expectation = selected.expectation;
    if (!expectation) return;
    const start = moment.tz(expectation.date, timezone).startOf("day");
    const night = toMinutes(selected.shift.endTime) <= toMinutes(selected.shift.startTime);
    if (night) start.add((toMinutes(selected.shift.startTime) + toMinutes(selected.shift.endTime)) / 2, "minutes");
    const end = start.clone().add(1, "day");
    // Read all saved events, not just this request: a lunch return must never alert.
    const rows = await Attendance.find({ user: admin._id, employee: employee._id,
      "events.timestamp": { $gte: start.toDate(), $lt: end.toDate() } }).select("events").lean();
    const checkins = rows.flatMap(r => r.events || []).filter(e => e.cameraType === "checkin" &&
      new Date(e.timestamp) >= start.toDate() && new Date(e.timestamp) < end.toDate());
    const first = checkins.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
    if (!first) return;
    const result = arrivalExpectation({ ...selected, date: expectation.date, timezone, arrivedAt: first.timestamp });
    await Attendance.updateOne({ _id: attendance._id }, { $set: { arrivalAssessment: result } });
    attendance.arrivalAssessment = result;
    if (!result.isLate) return;
    // A deterministic Mongo _id makes concurrent camera requests and both API versions idempotent.
    const { createHash } = await import("node:crypto");
    const id = new mongoose.Types.ObjectId(createHash("sha256")
      .update(`lateArrival:${admin._id}:${employee._id}:${result.date}`).digest("hex").slice(0, 24));
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(" ");
    const data = { timeOfIncident: first.timestamp, incidentName: "Late Arrival",
      description: `${name || "Employee"} arrived ${result.lateMinutes} minute(s) after the grace deadline.`,
      userId: String(admin.user_id), nvrId: first.nvr || event.nvr, channelId: first.channel || event.channel,
      severity: "low", employee: employee._id, attendanceDate: result.date,
      shiftId: result.shiftId, expectedArrival: result.expectedArrival,
      graceDeadline: result.graceDeadline, lateMinutes: result.lateMinutes,
      Image: first.images?.frame || first.images?.person || first.images?.face || null };
    let write;
    try { write = await LateArrival.updateOne({ _id: id }, { $setOnInsert: data }, { upsert: true }); }
    catch (error) { if (error.code === 11000) return; throw error; }
    if (!write.upsertedCount) return;
    const saved = { ...data, _id: id, incidentType: "lateArrival" };
    await Promise.allSettled([
      sendPayloadToUser(admin.user_id, `cameradetection_${admin._id}`, saved),
      ...(admin.email && admin.emailAlertsEnabled !== false ? [MailResponse.personDetected(
        admin.email, saved, "lateArrival", channel.nvrId, channel, timezone)] : []),
    ]).then(results => results.forEach(r => {
      if (r.status === "rejected") logger.error("Late arrival notification failed:", r.reason);
    }));
  } catch (error) { logger.error("Late arrival processing failed:", error); }
}
