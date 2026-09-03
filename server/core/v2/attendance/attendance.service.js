import Attendance from "./attendance.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import Admin from "../admin/admin.model.js";
import { attendanceSchema, attendanceSettingsSchema } from "./attendance.validate.js";
import mongoose from "mongoose";
import { sendPayloadToUser } from "../../../socket.js";
import authorisedUsers from "../authorizedUsers/authorizedUsers.model.js";
import Channels from "../channels/channels.model.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import config from "config";
import MailResponse from "../../../mailService/mail.helper.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import AttendanceSettings from "./attendanceSettings.model.js";
import ShiftModel, {
  SHIFT_DAY_KEYS,
  resolveShiftDay,
} from "../shifts/shifts.model.js";
import {
  ATTENDANCE_STATUS,
  attendanceStatusStage,
  resolveAttendanceSettings,
  shiftJoinStages,
  shiftContextStage,
  shiftOvertimeStage,
  shiftDayBucketExpr,
  DEFAULT_SHIFT_TZ,
} from "./attendanceStatus.js";
// v1's copy, not a duplicate: both versions expose POST /attendance and the CV
// service posts to the v1 one, so the two write paths must pair check-outs
// identically or an overnight shift records differently depending on the route.
import {
  findOpenCheckinToCarryOver,
  resolveCarryOverWindowMs,
} from "../../v1/attendance/checkoutCarryOver.js";
// Reused so Attendance Logs exports render byte-for-byte the same spreadsheet
// layout as the scheduled auto email report (multi-row sessions + totals).
import {
  rowFromAttendance,
  applyPeriodTotals,
  buildCsv,
  buildPdf,
} from "../attendanceAutoEmailReport/attendanceAutoEmailReport.service.js";
const ImageView = config.get("ImageView");

/**
 * Pair sequential checkout→checkin events into breaks, for one employee's
 * events on one day. The first check-in and the last check-out are the
 * bookends and are never themselves part of a break: a checkout can only
 * open a break once the employee has checked in at least once
 * (`hasCheckedIn`), so a stray checkout logged before the day's first real
 * check-in is discarded rather than wrongly paired. Shared by getUserLogs
 * (the per-employee Break Logs dialog) and getAttendance (the break
 * totals shown per row in the Attendance Logs table), so both agree.
 */
function pairBreaks(events) {
  const sorted = [...(events || [])].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  const pairs = [];
  let currentCheckout = null;
  let hasCheckedIn = false;

  for (const ev of sorted) {
    if (ev.cameraType === "checkin") {
      if (currentCheckout) {
        pairs.push({ checkout: currentCheckout, checkin: ev });
        currentCheckout = null;
      }
      hasCheckedIn = true;
    } else if (hasCheckedIn && !currentCheckout && ev.cameraType === "checkout") {
      currentCheckout = ev;
    }
  }
  return pairs;
}

/** Total minutes across all break pairs (each checkin - checkout, floored at 0). */
function breakMinutesFromPairs(pairs) {
  return pairs.reduce((sum, p) => {
    const ms = new Date(p.checkin.timestamp) - new Date(p.checkout.timestamp);
    return sum + (ms > 0 ? Math.round(ms / 60000) : 0);
  }, 0);
}

// Pseudo-statuses for the Absent breakdown tabs. Not ATTENDANCE_STATUS values —
// all three grade as ABSENT, and these only say which kind of absence, so the
// tabs can filter and count the same three groups the Absent tile sums.
const EARLY_LEAVE_STATUS = "early_leave";
const NO_CHECKOUT_STATUS = "no_checkout";

// Left before the half-day mark: has both timestamps, just too few hours
// between them.
const EARLY_LEAVE_MATCH = {
  $and: [
    { $eq: ["$status", ATTENDANCE_STATUS.ABSENT] },
    { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] },
    { $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] },
  ],
};

// Checked in and no check-out ever arrived, past the point where one still
// could. Distinct from Checked In, which is the same row while it is still
// waiting, and from Not Checked In, which never appeared at all.
const NO_CHECKOUT_MATCH = {
  $and: [
    { $eq: ["$status", ATTENDANCE_STATUS.ABSENT] },
    { $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] },
    { $eq: [{ $ifNull: ["$lastCheckOut", null] }, null] },
  ],
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function asObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

function parseObjectIds(value) {
  return value
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
}

function employeeFullName(employee = {}) {
  return `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim();
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocationMatch(locations = []) {
  const normalized = [...new Set(
    (Array.isArray(locations) ? locations : [])
      .map((location) => String(location || "").trim())
      .filter(Boolean)
  )];

  if (!normalized.length) return null;
  return {
    $in: normalized.map((location) => new RegExp(`^${escapeRegex(location)}$`, "i")),
  };
}

/**
 * The zone shift wall-clock times are read in.
 *
 * Shift times are local ("09:00") and timestamps are UTC instants, so grading
 * late/early needs a zone. The admin's own IANA setting is the right answer;
 * a request may override it (the export already accepts one), and everything
 * falls back to the same default the Analytics reports use.
 */
async function resolveShiftTimezone(adminId, requested) {
  if (requested && moment.tz.zone(requested)) return requested;
  const admin = adminId
    ? await Admin.findById(adminId).select("timezone").lean()
    : null;
  const configured = admin?.timezone;
  return configured && moment.tz.zone(configured) ? configured : DEFAULT_SHIFT_TZ;
}

function shiftExpectsEmployeeOnDate(shift, date) {
  if (!shift) return true;
  if (shift.isActive === false) return false;
  const dayKey = SHIFT_DAY_KEYS[new Date(date).getDay()];
  // `resolveShiftDay` reads the current `workingDays` block and falls back to
  // the legacy `timings` one, so this stays correct for shifts saved either
  // side of the Shift Management rework. A half day still expects the
  // employee on site, so only an explicit "off" excuses them.
  const dayConfig = resolveShiftDay(shift, dayKey);
  if (!dayConfig) return true;
  return dayConfig.type !== "off";
}

function sortNotCheckedInRows(rows, sortField = "checkin", sortOrder = "desc") {
  const direction = sortOrder === "asc" ? 1 : -1;
  const valueFor = (row) => {
    switch (sortField) {
      case "fullname":
        return row.employee?.fullName || employeeFullName(row.employee);
      case "department":
        return row.employee?.departmentId?.departmentName || "";
      case "location":
        return row.employee?.location || "";
      case "date":
        return row.date || "";
      case "checkin":
      case "checkout":
      default:
        return row.employee?.fullName || employeeFullName(row.employee);
    }
  };

  return [...rows].sort((a, b) => {
    const left = valueFor(a);
    const right = valueFor(b);
    const compare = collator.compare(String(left || ""), String(right || ""));
    if (compare !== 0) return compare * direction;
    return collator.compare(String(a.employee?._id || ""), String(b.employee?._id || ""));
  });
}

class AttendanceService {
  async buildNotCheckedInDataset(req, { applyName = false } = {}) {
    const adminId = req?.verified?.userData?.adminId;
    if (!adminId) {
      throw new Error("Missing admin context");
    }

    const memberId = req?.verified?.userData?.memberId;
    const { name = "", startDate, endDate } = req.query || {};
    const targetDate =
      startDate || endDate || req?.query?.date || moment().format("YYYY-MM-DD");

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const authorizedEmployeeLocations =
      req?.verified?.authorizedChannel?.employeeLocations || [];
    const requestedLocations = Array.isArray(req?.body?.employeeLocations)
      ? req.body.employeeLocations
      : [];
    const employeeLocations = [
      ...new Set([...authorizedEmployeeLocations, ...requestedLocations]),
    ];

    const rosterQuery = {
      adminId: asObjectId(adminId),
      status: { $ne: 'suspended' },
    };

    const locationMatch = buildLocationMatch(employeeLocations);
    if (locationMatch) {
      rosterQuery.location = locationMatch;
    }

    if (req?.query?.departmentIds) {
      rosterQuery.departmentId = {
        $in: req.query.departmentIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (applyName && name) {
      rosterQuery.$expr = {
        $regexMatch: {
          input: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
            },
          },
          regex: name,
          options: "i",
        },
      };
    }

    const roster = await authorizedUsersModel
      .find(rosterQuery)
      .setOptions({ memberId })
      .populate({ path: "departmentId", select: "departmentName" })
      .lean();

    const shiftIds = [
      ...new Set(
        roster
          .map((employee) => employee?.shiftId)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];
    const shifts = shiftIds.length
      ? await ShiftModel.find({
          _id: { $in: shiftIds.map((id) => asObjectId(id)) },
        })
          .select("name color timings workingDays startTime endTime isActive")
          .lean()
      : [];
    const shiftMap = new Map(
      shifts.map((shift) => [String(shift._id), shift])
    );
    const rosterWithShifts = roster.map((employee) => ({
      ...employee,
      shiftId: employee?.shiftId
        ? shiftMap.get(String(employee.shiftId)) || null
        : null,
    }));

    const expectedEmployees = rosterWithShifts.filter((employee) =>
      shiftExpectsEmployeeOnDate(employee.shiftId, startOfDay)
    );
    const expectedEmployeeIds = expectedEmployees.map((employee) => employee._id);

    const attendances = expectedEmployeeIds.length
      ? await Attendance.find({
          user: asObjectId(adminId),
          employee: { $in: expectedEmployeeIds },
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        })
          .select("employee events")
          .lean()
      : [];

    const checkedInEmployeeIds = new Set(
      attendances
        .filter(
          (attendance) =>
            Array.isArray(attendance?.events) &&
            attendance.events.some((event) => event.cameraType === "checkin")
        )
        .map((attendance) => String(attendance.employee))
    );

    const rows = expectedEmployees
      .filter((employee) => !checkedInEmployeeIds.has(String(employee._id)))
      .map((employee) => ({
        employee: {
          ...employee,
          fullName: employeeFullName(employee),
        },
        date: targetDate,
        logInTime: null,
        logOutTime: null,
        checkinCam: "-",
        checkoutCam: "-",
        minutesSpent: 0,
        status: "not_checked_in",
        breakMinutes: 0,
        breakCount: 0,
        imageUrls: [],
      }));

    return {
      rows,
      totalEmployees: rosterWithShifts.length,
      targetDate,
    };
  }

  async logAttendance(req, res, _next) {
    try {
      const { error, value } = attendanceSchema.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }
      const {
        cameraType,
        employeeId,
        userId,
        nvrId,
        channelId,
        images,
        confidenceScore = 0,
      } = value;

      const user = await Admin.findById(userId);

      if (!user) {
        return res.status(404).json(Response.notFoundResp("Admin not found"));
      }

      const isEmployeeExist = await authorisedUsers.findOne({
        _id: employeeId,
        adminId: userId,
      });
      if (!isEmployeeExist) {
        return res
          .status(404)
          .json(
            Response.notFoundResp(
              "Employee not found or employee does not belong to this admin"
            )
          );
      }
      const channel = await Channels.findById(channelId).setOptions({ includeInactive: true }).populate("nvrId");
      if (!channel) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }

      const event = {
        cameraType,
        timestamp: new Date(),
        images,
        nvr: nvrId,
        channel: channelId,
        confidenceScore: confidenceScore || 0,
      };

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const existingAttendance = await Attendance.findOne({
        user: user?._id,
        employee: employeeId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      });

      // Set only when this check-out belongs to a shift that started yesterday
      // and has to be appended to that day's row instead of today's. Null on
      // every ordinary event, which is every event that isn't a check-out
      // arriving with no open check-in today — so the common paths below run
      // exactly as they always have, with no extra queries.
      let carriedOverRow = null;

      if (cameraType === "checkout") {
        const hasCheckin =
          Array.isArray(existingAttendance?.events) &&
          existingAttendance.events?.some((e) => e.cameraType === "checkin");

        if (!hasCheckin) {
          // A shift crossing midnight logs its check-out on the day AFTER its
          // check-in, where there is no row to close. Rejecting it here is what
          // lost every overnight shift's hours permanently. Close yesterday's
          // still-open row instead — see checkoutCarryOver.js.
          carriedOverRow = await findOpenCheckinToCarryOver({
            userId: user?._id,
            employeeId,
            startOfDay,
            windowMs: await resolveCarryOverWindowMs(user?._id),
          });

          if (!carriedOverRow) {
            return res
              .status(400)
              .json(Response.errorResp("Cannot checkout before check-in"));
          }
        }
      }

      // findOrCreate (upsert)
      const attendance = carriedOverRow
        ? await Attendance.findByIdAndUpdate(
            carriedOverRow._id,
            { $push: { events: event } },
            { new: true }
          )
        : await Attendance.findOneAndUpdate(
        {
          user: user?._id,
          employee: employeeId,
          // nvr: nvrId,
          // channel: channelId,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
        {
          $setOnInsert: {
            user: user?._id,
            employee: employeeId,
            // shiftId: isEmployeeExist.shiftId,
            // nvr: nvrId,
            // channel: channelId,
          },
          $push: { events: event },
        },
        { new: true, upsert: true }
      );

      const populatedAttendance = await Attendance.findById(
        attendance._id
      ).populate({
        path: "employee",
        populate: {
          path: "departmentId",
        },
      });
      // .populate("nvr")
      // .populate("channel");

      const socketPayload = {
        message: "New attendance event logged",
        attendance: {
          id: populatedAttendance._id,
          employee: populatedAttendance.employee,
          // nvr: populatedAttendance.nvr,
          channelId: channel?._id,
          channelName: channel?.name,
          event: {
            ...event,
            // timestamp: this.#formatDateTime(event.timestamp),
            timestamp: event?.timestamp,
          },
          createdAt: populatedAttendance.createdAt,
          updatedAt: populatedAttendance.updatedAt,
        },
      };

      await sendPayloadToUser(
        user?.user_id,
        `attendanceLog_${user?._id}`,
        socketPayload
      );

      // Best-effort: notify the admin via email that a person was detected.
      // Fire-and-forget — failures here must not affect the attendance flow.
      if (user?.email) {
        const employeeName = [
          populatedAttendance?.employee?.firstName,
          populatedAttendance?.employee?.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        const mailData = {
          _id: populatedAttendance?._id,
          incidentName: "Person Detected",
          timeOfIncident: event?.timestamp,
          zone: channel?.name || "N/A",
          severity: "low",
          description: `${employeeName || "A person"} detected at ${
            channel?.name || "camera"
          } (${cameraType}).`,
          Image: Array.isArray(images) ? images[0] : images,
          count: 1,
        };

        MailResponse.personDetected(
          user.email,
          mailData,
          "countPersons",
          channel?.nvrId,
          channel,
          user?.timezone
        ).catch((err) =>
          logger.error(
            "personDetected email (attendance) error:",
            err?.message || err
          )
        );
      }

      return res
        .status(201)
        .json(Response.userSuccessResp("Attendance logged", { attendance }));
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to log attendance", error.message));
    }
  }

  /**
   * The KPI-tile status tally as one $group stage, covering the whole
   * filtered range (no name search, no pagination) — same shape/values as
   * getAttendance's countPipeline used to compute in its own separate
   * aggregate() call. Extracted so it can run as a $facet branch instead.
   */
  attendanceStatusCountStage() {
    const countByStatus = (status) => ({
      $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] },
    });

    return {
      $group: {
        _id: null,
        present: countByStatus(ATTENDANCE_STATUS.PRESENT),
        halfDay: countByStatus(ATTENDANCE_STATUS.HALF_DAY),
        // The two ways a row with a check-in still grades absent, counted apart
        // because they are different situations and the Absent breakdown tabs
        // name them differently. Before the grace timeout only the first could
        // happen, so `earlyLeave` alone covered it; now a row that never
        // received a check-out also grades ABSENT, and calling that "left early"
        // would be untrue — they never left at all as far as we know.
        earlyLeave: { $sum: { $cond: [EARLY_LEAVE_MATCH, 1, 0] } },
        noCheckout: { $sum: { $cond: [NO_CHECKOUT_MATCH, 1, 0] } },
        checkedIn: countByStatus(ATTENDANCE_STATUS.CHECKED_IN),
        // Duration-agnostic: "did this employee check in/out at all today",
        // regardless of what status that graded to. Feeds the Check In /
        // Checkout tiles and the roster-based Absent count below — same
        // shape /analytics/attendance-presence already returns.
        checkinLogs: {
          $sum: { $cond: [{ $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] }, 1, 0] },
        },
        checkoutLogs: {
          $sum: { $cond: [{ $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] }, 1, 0] },
        },
      },
    };
  }

  async getAttendance(req, res, _next) {
    try {
      if (req?.query?.status === "not_checked_in") {
        return this.getNotCheckedInAttendance(req, res);
      }

      const { pipeline, countPipeline } = await this.buildAttendancePipeline(req);

      // pipeline and countPipeline share the exact same expensive prefix —
      // $match, $unwind, four $lookups, $group, then the status/time filters
      // (countPipeline IS that prefix; pipeline is that prefix + name filter +
      // sort + skip/limit). Below, running them as three separate
      // Attendance.aggregate() calls repeated that whole unwind+lookup+group
      // fan-out three times per request (and the frontend calls this endpoint
      // twice per filter change — once for the page, once for the KPI tiles
      // — so six times total), which is what made multi-week/month ranges
      // slow. $facet runs the shared prefix ONCE and branches into three cheap
      // tails off the same intermediate result set instead.
      //
      // The unauthorized-channel/NVR short-circuit returns a bare
      // `[{ $match: { _id: null } }]` array rather than
      // `{ pipeline, countPipeline }` (a pre-existing quirk elsewhere in this
      // file) — this guard throws in that case exactly as the old
      // three-aggregate code implicitly did (aggregate(undefined) would throw
      // there too, caught by the outer try/catch).
      if (!Array.isArray(pipeline) || !Array.isArray(countPipeline)) {
        throw new Error("Failed to build attendance pipeline");
      }
      const tailStages = pipeline.slice(countPipeline.length);
      const statusCountStage = this.attendanceStatusCountStage();

      const summaryBreakdownReq = {
        ...req,
        query: {
          ...(req.query || {}),
          name: "",
        },
      };

      const [[facetResult], firstAttendance, notCheckedInSummary] = await Promise.all([
        Attendance.aggregate([
          ...countPipeline,
          {
            $facet: {
              rows: tailStages,
              rowCount: [
                ...tailStages.filter((stage) => !("$sort" in stage || "$skip" in stage || "$limit" in stage)),
                { $count: "total" },
              ],
              statusCounts: [statusCountStage],
            },
          },
        ]).collation({ locale: "en", strength: 2 }),
        Attendance.findOne().sort({ createdAt: 1 }).select("createdAt"),
        this.buildNotCheckedInDataset(summaryBreakdownReq),
      ]);

      const attendances = facetResult?.rows || [];
      const total = facetResult?.rowCount?.[0]?.total || 0;
      const counts = facetResult?.statusCounts?.[0] || {};
      const attendanceLogsStartDate = firstAttendance?.createdAt || null;

      if (!attendances || attendances.length === 0) {
        Response.userSuccessResp("Attendance summary", {
          attendanceLogs: [],
          total: 0,
          attendanceLogsStartDate,
        });
      }
      // Group by employee
      const attendanceSummary = attendances.map((att) => {
        const checkIns = att.events.filter((e) => e.cameraType === "checkin");
        const checkOuts = att.events.filter((e) => e.cameraType === "checkout");

        const firstCheckIn = checkIns.length
          ? checkIns.sort(
              (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
            )[0]
          : null;

        const lastCheckOut = checkOuts.length
          ? checkOuts
              .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
              .at(-1)
          : null;

        const imageUrls = att.events.map((e) => ({
          images: e?.images,
          cameraType: e?.cameraType,
          timestamp: e?.timestamp,
          cameraName: e?.customName || e?.channelName || null,
          confidenceScore: e?.confidenceScore || null,
        }));

        // Same checkout→checkin pairing the Break Logs dialog uses (see
        // pairBreaks above), so the total shown per row in this table and the
        // per-break detail behind the dialog can never disagree.
        const breakPairs = pairBreaks(att.events);

        return {
          employee: att.employee,
          date: att._id?.date || null,
          // The assigned shift and what it implied for this particular day.
          // Null throughout for an employee with no shift, which is how the
          // client tells "on time" from "no shift to be late against".
          shift: att.shift
            ? {
                _id: att.shift._id,
                name: att.shift.name,
                color: att.shift.color,
                startTime: att.shift.startTime,
                endTime: att.shift.endTime,
              }
            : null,
          shiftName: att.shiftName ?? null,
          shiftStartTime: att.shiftStartTime ?? null,
          shiftEndTime: att.shiftEndTime ?? null,
          shiftDayType: att.shiftDayType ?? null,
          isNightShift: att.isNightShift ?? null,
          // Minutes past the grace period, not raw minutes past the start
          // time — an arrival inside the grace reads as 0, never as "a bit
          // late", which is the whole point of configuring a grace.
          lateMinutes: att.lateMinutes ?? null,
          earlyLeaveMinutes: att.earlyLeaveMinutes ?? null,
          overtimeMinutes: att.overtimeMinutes ?? null,
          isLate: att.shift ? Boolean(att.isLate) : false,
          isEarlyLeave: att.shift ? Boolean(att.isEarlyLeave) : false,
          isWeekOff: att.shift ? Boolean(att.isWeekOff) : false,
          logInTime: firstCheckIn?.timestamp || null,
          logOutTime: lastCheckOut?.timestamp || null,
          checkinCam:
            firstCheckIn?.customName || firstCheckIn?.channelName || null,
          checkoutCam:
            lastCheckOut?.customName || lastCheckOut?.channelName || null,
          // Both come from the pipeline rather than being recomputed here, so
          // the number shown in the table and the number the status was graded
          // from can never disagree.
          minutesSpent: att.minutesSpent || 0,
          status: att.status || ATTENDANCE_STATUS.ABSENT,
          breakMinutes: breakMinutesFromPairs(breakPairs),
          breakCount: breakPairs.length,
          imageUrls,
        };
      });

      // total and counts (KPI tile status tally, covering the whole filtered
      // range regardless of the search box — see the note on countPipeline in
      // buildAttendancePipeline) both came out of the single $facet call above,
      // run concurrently with notCheckedInSummary, instead of two further full
      // re-aggregations over the same range plus a separate sequential await.
      const checkinLogs = counts.checkinLogs || 0;
      const checkoutLogs = counts.checkoutLogs || 0;
      const totalEmployees = notCheckedInSummary.totalEmployees || 0;
      const earlyLeave = counts.earlyLeave || 0;
      // Rows whose check-out never arrived and can no longer arrive. A third
      // way to be absent, and the third tab in the Absent breakdown.
      const noCheckout = counts.noCheckout || 0;
      const notCheckedIn = notCheckedInSummary.rows.length;
      const absent = earlyLeave + noCheckout + notCheckedIn;

      return res.status(200).json(
        Response.userSuccessResp("Attendance summary", {
          attendanceLogs: attendanceSummary,
          total,
          totalEmployees,
          statusCounts: {
            present: counts.present || 0,
            halfDay: counts.halfDay || 0,
            absent,
            checkedIn: counts.checkedIn || 0,
            earlyLeave,
            noCheckout,
            notCheckedIn,
            checkinLogs,
            checkoutLogs,
          },
          attendanceLogsStartDate,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get attendance", error.message));
    }
  }

  async getNotCheckedInAttendance(req, res) {
    try {
      const {
        skip = 0,
        limit = 10,
        sortField = "checkin",
        sortOrder = "desc",
      } = req.query;
      const { rows, totalEmployees } = await this.buildNotCheckedInDataset(req, {
        applyName: true,
      });
      const sortedRows = sortNotCheckedInRows(rows, sortField, sortOrder);
      const total = sortedRows.length;
      const pagedRows = req?.query?.export
        ? sortedRows
        : sortedRows.slice(Number.parseInt(skip, 10), Number.parseInt(skip, 10) + Number.parseInt(limit, 10));

      return res.status(200).json(
        Response.userSuccessResp("Attendance summary", {
          attendanceLogs: pagedRows,
          total,
          totalEmployees,
          statusCounts: {
            present: 0,
            halfDay: 0,
            absent: total,
            checkedIn: 0,
            earlyLeave: 0,
            notCheckedIn: total,
            checkinLogs: 0,
            checkoutLogs: 0,
          },
          attendanceLogsStartDate: null,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get attendance", error.message));
    }
  }

  /**
   * This org's attendance rules. Returns the defaults rather than 404-ing when
   * nothing has been saved yet, so the settings form always has values to show
   * and the grading below always has thresholds to use.
   */
  async getAttendanceSettings(req, res, _next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const settings = await resolveAttendanceSettings(adminId);

      return res
        .status(200)
        .json(Response.userSuccessResp("Attendance settings fetched successfully", settings));
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to fetch attendance settings", error.message));
    }
  }

  /**
   * Upsert this org's rules. Changing them re-grades history on the next read:
   * status is derived at query time from first check-in / last check-out, never
   * stored on the attendance row, so there is nothing to backfill.
   */
  async updateAttendanceSettings(req, res, _next) {
    try {
      const { error, value } = attendanceSettingsSchema.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.send(
          Response.validationFailResp(error.message, "Validation Failed!")
        );
      }

      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.errorResp("Missing admin context"));
      }

      const settings = await AttendanceSettings.findOneAndUpdate(
        { adminId: new mongoose.Types.ObjectId(adminId) },
        {
          $set: {
            fullDayHours: value.fullDayHours,
            halfDayHours: value.halfDayHours,
            // Only when the caller sent one. Writing `undefined` here would
            // wipe a saved grace window for any client still posting just the
            // two original fields.
            ...(value.graceHours === undefined ? {} : { graceHours: value.graceHours }),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.status(200).json(
        Response.userSuccessResp("Attendance settings updated successfully", {
          fullDayHours: settings.fullDayHours,
          halfDayHours: settings.halfDayHours,
          graceHours: settings.graceHours,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update attendance settings", error.message));
    }
  }

  async buildAttendancePipeline(req, forExport = false) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const userId = adminId;
      
      let authorizedEmployeeLocations = req?.verified?.authorizedChannel?.employeeLocations || [];
      let { employeeLocations=[]} = req.body;
      employeeLocations = [
        ...new Set([
          ...(Array.isArray(authorizedEmployeeLocations) ? authorizedEmployeeLocations : []),
          ...(Array.isArray(employeeLocations) ? employeeLocations : []),
        ]),
      ];

      //Include only those authorized employee WHOSE location CONTAINS authorizedEmployeeLocations
      let fetchAllEmployeeswithAuthorizedLocations = [];
      const locationMatch = buildLocationMatch(employeeLocations);
      if (locationMatch) {
        fetchAllEmployeeswithAuthorizedLocations = await authorizedUsersModel.find({
          location: locationMatch,
          adminId: new mongoose.Types.ObjectId(adminId),
          status: { $ne: 'suspended' }
        }).distinct("_id");
      }

      let authorizedChannels = req?.verified?.authorizedChannel?.channels || [];
      let authorizedNvrs = req?.verified?.authorizedChannel?.nvrIds || [];
      const isAdmin =
        !req?.verified?.userData?.roleId && !req?.verified?.userData?.memberId;

      const {
        name,
        nvrId,
        channelId,
        startDate,
        endDate,
        sortOrder = "desc",
        sortField = "checkin",
        skip = 0,
        limit = 10,
        fromTime,
        toTime,
        timeType = "checkin",
        status,
      } = req.query;

      const formattedFromTime = fromTime ? fromTime.padStart(5, "0") : null;
      const formattedToTime = toTime ? toTime.padStart(5, "0") : null;

      // Match only by user and date range
      const matchStage = { user: new mongoose.Types.ObjectId(userId) };

      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(start);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      matchStage.createdAt = { $gte: start, $lte: end };

      // Apply the location filtering restriction if employeeLocations is provided
      if (employeeLocations?.length) {
        matchStage.employee = { $in: fetchAllEmployeeswithAuthorizedLocations.map(id => new mongoose.Types.ObjectId(id)) };
      }

      // if (nvrId) matchStage.nvr = new mongoose.Types.ObjectId(nvrId);
      // if (channelId)
      //   matchStage.channel = new mongoose.Types.ObjectId(channelId);

      const toObjectIds = (arr) =>
        arr.map((id) => new mongoose.Types.ObjectId(id));

      const nvrIds = nvrId ? parseObjectIds(nvrId) : [];
      const channelIds = channelId ? parseObjectIds(channelId) : [];

      // channels`
      const authorizedChannelIds = toObjectIds(authorizedChannels);
      const requestedChannelIds = channelId ? parseObjectIds(channelId) : [];

      let effectiveChannelIds = [];

      if (!isAdmin) {
        // NORMAL USER FLOW
        if (requestedChannelIds.length > 0) {
          effectiveChannelIds = requestedChannelIds.filter((reqId) =>
            authorizedChannelIds.some(
              (authId) => authId.toString() === reqId.toString()
            )
          );
        } else {
          effectiveChannelIds = authorizedChannelIds;
        }
      } else {
        // ADMIN FLOW
        effectiveChannelIds = requestedChannelIds; // admin can filter anything
      }

      if (
        !isAdmin &&
        requestedChannelIds.length > 0 &&
        effectiveChannelIds.length === 0
      ) {
        return [{ $match: { _id: null } }];
      }

      // nvrs filtering based on authorized nvrs
      const authorizedNvrIds = toObjectIds(authorizedNvrs);
      const requestedNvrIds = nvrId ? parseObjectIds(nvrId) : [];

      let effectiveNvrIds = [];

      if (!isAdmin) {
        if (requestedNvrIds.length > 0) {
          effectiveNvrIds = requestedNvrIds.filter((reqId) =>
            authorizedNvrIds.some(
              (authId) => authId.toString() === reqId.toString()
            )
          );
        } else {
          effectiveNvrIds = authorizedNvrIds;
        }
      } else {
        effectiveNvrIds = requestedNvrIds;
      }

      if (
        !isAdmin &&
        requestedNvrIds.length > 0 &&
        effectiveNvrIds.length === 0
      ) {
        return [{ $match: { _id: null } }];
      }

      // This org's Present / Half Day / Absent thresholds, read once per
      // pipeline build and baked into the aggregation below.
      const attendanceRules = await resolveAttendanceSettings(adminId);
      const shiftTimezone = await resolveShiftTimezone(adminId, req.query?.timezone);

      const pipeline = [
        { $match: matchStage },
        { $unwind: "$events" }, // break out each event

        // optional filtering by NVR/Channel
        ...(effectiveNvrIds.length
          ? [
              {
                $match: {
                  "events.nvr": { $in: effectiveNvrIds },
                },
              },
            ]
          : []),
        ...(effectiveChannelIds.length
          ? [
              {
                $match: {
                  "events.channel": { $in: effectiveChannelIds },
                },
              },
            ]
          : []),

        // Lookup Employee
        {
          $lookup: {
            from: "authorizedusers",
            localField: "employee",
            foreignField: "_id",
            as: "employee",
          },
        },
        { $unwind: "$employee" },

        // Lookup Department
        {
          $lookup: {
            from: "departments",
            localField: "employee.departmentId",
            foreignField: "_id",
            as: "department",
          },
        },
        { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
        { $addFields: { "employee.departmentId": "$department" } },

        // Lookup Shift. Rows whose employee holds no shift keep a null `shift`
        // and go on being graded by the org-wide duration thresholds.
        ...shiftJoinStages("$employee.shiftId"),

        ...(req.query.departmentIds
          ? [
              {
                $match: {
                  "employee.departmentId._id": {
                    $in: req.query.departmentIds
                      .split(",")
                      .map((id) => new mongoose.Types.ObjectId(id)),
                  },
                },
              },
            ]
          : []),

        // Lookup Channel info from event
        {
          $lookup: {
            from: "channels",
            localField: "events.channel",
            foreignField: "_id",
            as: "eventChannel",
          },
        },
        {
          $unwind: { path: "$eventChannel", preserveNullAndEmptyArrays: true },
        },

        // Lookup NVR (optional)
        {
          $lookup: {
            from: "nvrs",
            localField: "events.nvr",
            foreignField: "_id",
            as: "eventNvr",
          },
        },
        { $unwind: { path: "$eventNvr", preserveNullAndEmptyArrays: true } },

        {
          $addFields: {
            "events.channelName": "$eventChannel.name",
            "events.customName": "$eventChannel.customName",
            "events.nvrName": "$eventNvr.name",
            "employee.fullName": {
              $concat: [
                { $ifNull: ["$employee.firstName", ""] },
                " ",
                { $ifNull: ["$employee.lastName", ""] },
              ],
            },
          },
        },

        // Group by employee per day
        {
          $group: {
            _id: {
              employee: "$employee._id",
              date: shiftDayBucketExpr(shiftTimezone, {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              }),
            },
            employee: { $first: "$employee" },
            shift: { $first: "$shift" },
            events: { $push: "$events" },
          },
        },

        {
          $addFields: {
            firstCheckIn: {
              $min: {
                $map: {
                  input: {
                    $filter: {
                      input: "$events",
                      as: "ev",
                      cond: { $eq: ["$$ev.cameraType", "checkin"] },
                    },
                  },
                  as: "checkinEvent",
                  in: "$$checkinEvent.timestamp",
                },
              },
            },
            lastCheckOut: {
              $max: {
                $map: {
                  input: {
                    $filter: {
                      input: "$events",
                      as: "ev",
                      cond: { $eq: ["$$ev.cameraType", "checkout"] },
                    },
                  },
                  as: "checkoutEvent",
                  in: "$$checkoutEvent.timestamp",
                },
              },
            },
          },
        },

        // Derive minutesSpent + Present / Half Day / Absent / Checked In from
        // this org's configured thresholds. Placed immediately after
        // firstCheckIn/lastCheckOut so every stage below — and every caller
        // that reuses this pipeline — can read `status`.
        ...shiftContextStage(shiftTimezone),
        attendanceStatusStage(attendanceRules),
        shiftOvertimeStage(),

        // --- Status filter (Present / Half Day / Absent / Checked In) ---
        // Validated against the known set rather than passed through raw, so
        // a bad value falls back to "no filter" instead of matching nothing.
        // `checkin`/`checkout` are duration-agnostic pseudo-statuses (not part
        // of ATTENDANCE_STATUS) backing the Check In / Checkout tiles: "has
        // this employee checked in/out at all today", regardless of what
        // status that graded to.
        ...(status === "checkin"
          ? [{ $match: { firstCheckIn: { $ne: null } } }]
          : status === "checkout"
          ? [{ $match: { lastCheckOut: { $ne: null } } }]
          : status === EARLY_LEAVE_STATUS
          ? [
              {
                $match: {
                  status: ATTENDANCE_STATUS.ABSENT,
                  firstCheckIn: { $ne: null },
                  // Both timestamps present, so this really is "left early".
                  // Without this the tab would also list rows that timed out
                  // with no check-out at all, which is the tab beside it.
                  lastCheckOut: { $ne: null },
                },
              },
            ]
          : status === NO_CHECKOUT_STATUS
          ? [
              {
                $match: {
                  status: ATTENDANCE_STATUS.ABSENT,
                  firstCheckIn: { $ne: null },
                  lastCheckOut: null,
                },
              },
            ]
          : status && Object.values(ATTENDANCE_STATUS).includes(status)
          ? [{ $match: { status } }]
          : []),

        // --- Time Filter ---
        ...(fromTime || toTime
          ? [
              {
                $match: {
                  $expr: {
                    $and: [
                      // Filter based on timeType (checkin or checkout)
                      ...(fromTime
                        ? [
                            {
                              $gte: [
                                {
                                  $dateToString: {
                                    format: "%H:%M",
                                    date:
                                      timeType === "checkout"
                                        ? "$lastCheckOut"
                                        : "$firstCheckIn",
                                  },
                                },
                                fromTime.padStart(5, "0"),
                              ],
                            },
                          ]
                        : []),
                      ...(toTime
                        ? [
                            {
                              $lte: [
                                {
                                  $dateToString: {
                                    format: "%H:%M",
                                    date:
                                      timeType === "checkout"
                                        ? "$lastCheckOut"
                                        : "$firstCheckIn",
                                  },
                                },
                                toTime.padStart(5, "0"),
                              ],
                            },
                          ]
                        : []),
                    ],
                  },
                },
              },
            ]
          : []),
      ];

      // Snapshot before the free-text name search is applied, so the KPI
      // tile counts in getAttendance() reflect the full date-range/filtered
      // set regardless of what's typed in the search box — only the table
      // rows below should narrow by name.
      const countPipeline = pipeline.slice();

      // --- Name filter ---
      if (name) {
        pipeline.push({
          $match: { "employee.fullName": { $regex: name, $options: "i" } },
        });
      }

      // --- Sorting (asc or desc) ---
      // const sortDirection = sortOrder === "desc" ? -1 : 1;
      // pipeline.push({
      //   $sort: { "employee.fullName": sortDirection },
      // });

      let sortStage = {};
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      switch (sortField) {
        case "fullname":
          sortStage = { "employee.fullName": sortDirection, "employee._id": 1 };
          break;
        case "location":
          // Employee location is stored as a plain string field (`location`) on
          // authorizedusers — there is no `locationId` lookup in this pipeline,
          // so sorting must target `employee.location` directly.
          sortStage = {
            "employee.location": sortDirection,
            "employee._id": 1,
          };
          break;
        case "department":
          sortStage = {
            "employee.departmentId.departmentName": sortDirection,
            "employee._id": 1,
          };
          break;
        case "date":
          sortStage = { "_id.date": sortDirection, "employee._id": 1 };
          break;
        case "checkin":
          sortStage = {
            firstCheckIn: sortDirection,
            "_id.date": sortDirection,
            "employee._id": 1,
          };
          break;
        case "checkout":
          sortStage = {
            lastCheckOut: sortDirection,
            "_id.date": sortDirection,
            "employee._id": 1,
          };
          break;
        default:
          sortStage = {
            firstCheckIn: sortDirection,
            "_id.date": sortDirection,
            "employee._id": 1,
          };
      }

      pipeline.push({ $sort: sortStage });

      // Pagination
      if (req?.query?.export) {
        // for export, no pagination
        return { pipeline, countPipeline };
      }
      pipeline.push({ $skip: parseInt(skip) });
      pipeline.push({ $limit: parseInt(limit) });
      return { pipeline, countPipeline };
    } catch (error) {
      logger.error(error);
      throw new Error("Failed to build attendance pipeline: " + error.message);
    }
  }

  // Reshape one grouped pipeline document (employee + events pushed per
  // employee-day) into the raw-ish shape `rowFromAttendance` in the auto email
  // report service expects, so Attendance Logs exports the *exact* spreadsheet
  // layout recipients get in the scheduled report — day line + one sub-row per
  // extra check-in/check-out session + a per-employee-day total row.
  // The pipeline already resolved each event's camera name onto
  // `channelName` / `customName`; nest it back under `channel` for eventCamera().
  #groupedDocToReportInput(doc) {
    const events = (doc.events || []).map((event) => ({
      cameraType: event.cameraType,
      timestamp: event.timestamp,
      images: event.images,
      channel: { customName: event.customName, name: event.channelName },
    }));
    return {
      // `date` column is derived from createdAt; the group key holds the day.
      createdAt: doc._id?.date ? new Date(`${doc._id.date}T00:00:00Z`) : new Date(),
      employee: doc.employee || null,
      events,
    };
  }

  async exportAttendance(req, res, _next) {
    try {
      const format = String(req.query.format || "excel").toLowerCase();

      // "Not Checked In" is roster-derived (those employees have no attendance
      // document at all), so the session-based report layout can't represent
      // it. The Attendance Logs grid shows it via a separate code path.
      if (req.query.status === "not_checked_in") {
        return res
          .status(200)
          .json(Response.userSuccessResp("The Not Checked In view can't be exported as a report", []));
      }

      const built = await this.buildAttendancePipeline(req, true);
      // Unauthorized channel/NVR request → buildAttendancePipeline returns a
      // bare `[{ $match: { _id: null } }]` array instead of `{ pipeline }`.
      // Treat that (and any other non-standard shape) as "nothing to export".
      const pipeline = Array.isArray(built?.pipeline) ? built.pipeline : null;
      if (!pipeline) {
        return res.status(200).json(Response.userSuccessResp("No attendance data to export", []));
      }

      // Match on-screen ordering: case-insensitive alphabetical sort.
      const data = await Attendance.aggregate(pipeline).collation({
        locale: "en",
        strength: 2,
      });

      const adminId = req?.verified?.userData?.adminId;
      const timezone = req.query.timezone || "UTC";
      const rules = await resolveAttendanceSettings(adminId);
      const start = req.query.startDate ? moment(req.query.startDate).format("DD MMM YYYY") : "";
      const end = req.query.endDate ? moment(req.query.endDate).format("DD MMM YYYY") : start;
      const label = start ? `${start} – ${end}` : "Attendance Logs";

      const rows = (data || [])
        .map((doc) => this.#groupedDocToReportInput(doc))
        .filter((item) => item.employee)
        .map((item) => rowFromAttendance(item, timezone, rules));
      applyPeriodTotals(rows);

      // Nothing matched the filters — return a plain JSON message instead of an
      // empty file. The client sniffs the blob's type and shows this as a toast.
      if (!rows.length) {
        return res.status(200).json(Response.userSuccessResp("No attendance data to export", []));
      }

      const report = { formats: [format] };
      if (format === "pdf") {
        const buffer = await buildPdf({ report, rows, label, timezone });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=AttendanceReport.pdf");
        return res.end(buffer);
      }

      // CSV (opens in Excel / Sheets, with clickable image hyperlinks).
      const buffer = buildCsv({ report, rows, label, timezone });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=AttendanceReport.csv");
      return res.end(buffer);
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to export attendance", error.message));
    }
  }

  async getUserLogs(req, res, _next) {
    try {
      const { employeeId, date } = req.body;
      if (!employeeId || !date) {
        return res.status(400).json(Response.errorResp("employeeId and date are required"));
      }

      const adminId = req?.verified?.userData?.adminId;
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const attendance = await Attendance.findOne({
        user: new mongoose.Types.ObjectId(adminId),
        employee: new mongoose.Types.ObjectId(employeeId),
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      }).populate({
        path: "employee"
      });

      if (!attendance) {
        return res.status(200).json(Response.userSuccessResp("No logs found for this user on the selected date", []));
      }

      const sortedEvents = attendance.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Fetch channel info for each event
      const populatedEvents = await Promise.all(sortedEvents.map(async (ev) => {
        let cameraName = "Unknown";
        if (ev.channel) {
          const ch = await Channels.findById(ev.channel).setOptions({ includeInactive: true }).select("name customName");
          if (ch) {
            cameraName = ch.customName || ch.name;
          }
        }
        return {
          cameraType: ev.cameraType,
          timestamp: ev.timestamp,
          confidenceScore: ev.confidenceScore,
          images: ev.images,
          cameraName
        };
      }));

      const pairedLogs = pairBreaks(populatedEvents);

      // Bookends: the day's earliest check-in and latest check-out — the two
      // events pairBreaks() deliberately excludes from every break pair.
      const checkinEvents = populatedEvents.filter((ev) => ev.cameraType === "checkin");
      const checkoutEvents = populatedEvents.filter((ev) => ev.cameraType === "checkout");
      const firstCheckIn = checkinEvents[0] || null;
      const lastCheckOut = checkoutEvents.length ? checkoutEvents[checkoutEvents.length - 1] : null;

      return res.status(200).json(Response.userSuccessResp("User logs retrieved successfully", {
         employee: attendance.employee,
         date: date,
         firstCheckIn,
         lastCheckOut,
         logs: pairedLogs,
         breakMinutes: breakMinutesFromPairs(pairedLogs),
      }));

    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to get user logs", error.message));
    }
  }

  async #exportExcel(res, attendances, timezone) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance");

    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Employee", key: "employee", width: 25 },
      { header: "Department", key: "department", width: 20 },
      { header: "Check-in Time", key: "checkin", width: 20 },
      { header: "Check-out Time", key: "checkout", width: 20 },
      { header: "Time Spent", key: "timeSpent", width: 18 },
      { header: "Check-in Frequency", key: "checkinCount", width: 20 },
      { header: "Check-out Frequency", key: "checkoutCount", width: 22 },
      { header: "Check-in Camera", key: "checkinCam", width: 25 },
      { header: "Check-out Camera", key: "checkoutCam", width: 25 },
      { header: "Face Image", key: "faceImage", width: 30 },
      { header: "Person Image", key: "personImage", width: 30 },
      { header: "Frame Image", key: "frameImage", width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };
    attendances.forEach((att) => {
      const checkIns = att.events.filter((e) => e.cameraType === "checkin");
      const checkOuts = att.events.filter((e) => e.cameraType === "checkout");

      const firstCheckIn = checkIns.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      )[0];

      const lastCheckOut = checkOuts
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .at(-1);

      const checkinCount = checkIns.length;
      const checkoutCount = checkOuts.length;

      let timeSpent = "-";
      if (firstCheckIn && lastCheckOut) {
        const diffMs =
          new Date(lastCheckOut.timestamp) - new Date(firstCheckIn.timestamp);

        if (diffMs > 0) {
          const totalMinutes = Math.floor(diffMs / 60000);
          const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
          const minutes = String(totalMinutes % 60).padStart(2, "0");
          timeSpent = `${hours}:${minutes}`;
        }
      }

      const row = sheet.addRow({
        date: firstCheckIn?.timestamp
          ? moment(firstCheckIn.timestamp).tz(timezone).format("DD/MM/YYYY")
          : lastCheckOut?.timestamp
          ? moment(lastCheckOut.timestamp).tz(timezone).format("DD/MM/YYYY")
          : "-",
        employee: att.employee.fullName,
        department: att.employee.departmentId?.departmentName || "-",
        timeSpent,
        checkinCount,
        checkoutCount,
        checkin: firstCheckIn
          ? this.#formatWithTimezone(firstCheckIn.timestamp, timezone)
          : "-",

        checkout: lastCheckOut
          ? this.#formatWithTimezone(lastCheckOut.timestamp, timezone)
          : "-",
        // minutes,
        checkinCam:
          firstCheckIn?.customName || firstCheckIn?.channelName || "-",
        checkoutCam:
          lastCheckOut?.customName || lastCheckOut?.channelName || "-",
        faceImage: firstCheckIn?.images?.face
          ? {
              text: "View Image",
              hyperlink: `${ImageView}${firstCheckIn.images.face}`,
            }
          : "-",

        personImage: firstCheckIn?.images?.person
          ? {
              text: "View Image",
              hyperlink: `${ImageView}${firstCheckIn.images.person}`,
            }
          : "-",

        frameImage: firstCheckIn?.images?.frame
          ? {
              text: "View Image",
              hyperlink: `${ImageView}${firstCheckIn.images.frame}`,
            }
          : "-",
      });

      // Face image link styling
      if (firstCheckIn?.images?.face) {
        row.getCell("faceImage").font = {
          color: { argb: "FF0000FF" }, // blue
          underline: true,
        };
      }

      // Person image link styling
      if (firstCheckIn?.images?.person) {
        row.getCell("personImage").font = {
          color: { argb: "FF0000FF" },
          underline: true,
        };
      }

      // Frame image link styling
      if (firstCheckIn?.images?.frame) {
        row.getCell("frameImage").font = {
          color: { argb: "FF0000FF" },
          underline: true,
        };
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  async #exportPdf(res, attendances, timezone) {
    const doc = new PDFDocument({
      size: "A2", // 👈 BIGGER than A4
      layout: "landscape", // 👈 maximum width
      margin: 30,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=attendance.pdf");

    doc.pipe(res);

    /* ------------------ TITLE ------------------ */
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("Attendance Report", { align: "center" });

    doc.moveDown(1.5);

    /* ------------------ TABLE CONFIG ------------------ */
    const startX = doc.page.margins.left;
    let startY = doc.y;

    const rowHeight = 22;

    const columns = [
      { header: "ID", width: 40 },
      { header: "Date", width: 60 },
      { header: "Employee", width: 160 },
      { header: "Department", width: 160 },
      { header: "Check-in Time", width: 80 },
      { header: "Check-out Time", width: 90 },
      { header: "Time Spent", width: 70 },
      { header: "Check-in Frequency", width: 100 },
      { header: "Check-out Frequency", width: 110 },
      { header: "Check-in Camera", width: 160 },
      { header: "Check-out Camera", width: 160 },
      { header: "Face Image", width: 100 },
      { header: "Person Image", width: 100 },
      { header: "Frame Image", width: 100 },
    ];

    /* ------------------ HEADER ROW ------------------ */
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9);

    columns.forEach((col) => {
      doc.rect(x, startY, col.width, rowHeight).stroke();
      doc.text(col.header, x + 5, startY + 6, {
        width: col.width - 10,
        align: "left",
      });
      x += col.width;
    });

    startY += rowHeight;

    /* ------------------ DATA ROWS ------------------ */
    doc.font("Helvetica").fontSize(9);

    attendances.forEach((att, index) => {
      const checkIns = att.events.filter((e) => e.cameraType === "checkin");
      const checkOuts = att.events.filter((e) => e.cameraType === "checkout");

      const firstCheckIn = checkIns.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      )[0];

      const lastCheckOut = checkOuts
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .at(-1);

      let timeSpent = "-";
      if (firstCheckIn && lastCheckOut) {
        const diff =
          new Date(lastCheckOut.timestamp) - new Date(firstCheckIn.timestamp);

        if (diff > 0) {
          const mins = Math.floor(diff / 60000);
          timeSpent = `${String(Math.floor(mins / 60)).padStart(
            2,
            "0"
          )}:${String(mins % 60).padStart(2, "0")}`;
        }
      }

      const row = [
        index + 1,
        firstCheckIn?.timestamp
          ? moment(firstCheckIn.timestamp).tz(timezone).format("DD/MM/YYYY")
          : lastCheckOut?.timestamp
          ? moment(lastCheckOut.timestamp).tz(timezone).format("DD/MM/YYYY")
          : "-",
        att.employee.fullName,
        att.employee.departmentId?.departmentName || "-",
        firstCheckIn
          ? this.#formatWithTimezone(firstCheckIn.timestamp, timezone)
          : "-",
        lastCheckOut
          ? this.#formatWithTimezone(lastCheckOut.timestamp, timezone)
          : "-",
        timeSpent,
        checkIns.length,
        checkOuts.length,
        firstCheckIn?.customName || firstCheckIn?.channelName || "-",
        lastCheckOut?.customName || lastCheckOut?.channelName || "-",
        firstCheckIn?.images?.face
          ? `${ImageView}${firstCheckIn.images.face}`
          : null,
        firstCheckIn?.images?.person
          ? `${ImageView}${firstCheckIn.images.person}`
          : null,
        firstCheckIn?.images?.frame
          ? `${ImageView}${firstCheckIn.images.frame}`
          : null,
      ];

      /* ---------- PAGE BREAK ---------- */
      if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage({ size: "A2", layout: "landscape", margin: 30 });
        startY = doc.page.margins.top;

        // redraw header
        let hx = startX;
        doc.font("Helvetica-Bold");
        columns.forEach((col) => {
          doc.rect(hx, startY, col.width, rowHeight).stroke();
          doc.text(col.header, hx + 5, startY + 6, {
            width: col.width - 10,
          });
          hx += col.width;
        });
        startY += rowHeight;
        doc.font("Helvetica");
      }

      /* ---------- DRAW ROW ---------- */
      let cx = startX;

      row.forEach((cell, i) => {
        const colWidth = columns[i].width;

        doc.rect(cx, startY, colWidth, rowHeight).stroke();

        if (i === 0) {
          doc.text(String(cell), cx, startY + 6, {
            width: colWidth,
            align: "center",
            lineBreak: false, // 👈 important
          });
        }

        // Image link columns (last 3)
        else if (i >= columns.length - 3) {
          if (cell) {
            doc
              .fillColor("blue")
              .text("View Image", cx + 5, startY + 6, {
                width: colWidth - 10,
                link: cell,
                underline: true,
              })
              .fillColor("black");
          } else {
            doc.text("-", cx + 5, startY + 6, {
              width: colWidth - 10,
            });
          }
        } else {
          doc.text(String(cell), cx + 5, startY + 6, {
            width: colWidth - 10,
          });
        }

        cx += colWidth;
      });

      startY += rowHeight;
    });

    doc.end();
  }

  #formatWithTimezone(date, timezone) {
    return moment(date).tz(timezone).format("hh:mm A"); // 11:37 AM
  }
}
export default new AttendanceService();
