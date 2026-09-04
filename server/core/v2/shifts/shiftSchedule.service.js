import mongoose from "mongoose";
import Shift from "./shifts.model.js";
import ShiftSchedule from "./shiftSchedule.model.js";
import {
  monthDays,
  monthRange,
  resolveScheduledDay,
} from "../../v1/shifts/shiftSchedule.resolve.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import {
  scheduleQueryValidator,
  scheduleAssignValidator,
  scheduleBulkAssignValidator,
  scheduleClearValidator,
} from "./shiftSchedule.validate.js";

/** Mongo copes with far more, but a bulk range shouldn't build an unbounded op list. */
const BULK_WRITE_CHUNK = 500;

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asObjectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Same case-insensitive location matching the assignment filters use. */
function buildLocationMatch(locations = []) {
  const normalized = [
    ...new Set(locations.map((l) => String(l || "").trim()).filter(Boolean)),
  ];
  if (!normalized.length) return null;
  return { $in: normalized.map((l) => new RegExp(`^${escapeRegex(l)}$`, "i")) };
}

/**
 * The roster the grid draws rows for.
 *
 * Deliberately the employee list, not the schedule collection: the grid has to
 * show everyone — including people with no shift at all, whose row is entirely
 * "+" cells — and an override-only query would silently hide them.
 */
function buildEmployeeQuery(adminId, filters = {}) {
  const query = {
    adminId: asObjectId(adminId),
    liveDemoData: { $ne: true },
  };

  if (!filters.includeSuspended) query.status = { $ne: "suspended" };

  const search = String(filters.search || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    const or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
    // emp_id is numeric, so only match it when the search actually is a number
    // — a $or against a Number path with a regex would throw a CastError.
    if (/^\d+$/.test(search)) or.push({ emp_id: Number(search) });
    query.$or = or;
  }

  const locationMatch = buildLocationMatch(toArray(filters.locations));
  if (locationMatch) query.location = locationMatch;

  const departmentIds = toArray(filters.departmentIds);
  if (departmentIds.length) {
    query.departmentId = { $in: departmentIds.map(asObjectId) };
  }

  const designations = toArray(filters.designations);
  if (designations.length) {
    query.designation = {
      $in: designations.map((d) => new RegExp(`^${escapeRegex(String(d).trim())}$`, "i")),
    };
  }

  return query;
}

/** Only what a grid cell renders — the full shift document per cell would be huge. */
function shiftChip(shift) {
  if (!shift) return null;
  return {
    _id: shift._id,
    name: shift.name,
    color: shift.color,
    startTime: shift.startTime,
    endTime: shift.endTime,
    isNightShift: Boolean(shift.isNightShift),
  };
}

class ShiftScheduleService {
  /**
   * The monthly grid: a page of employees, every day of the month, and the
   * resolved cell for each.
   *
   * Three queries regardless of month length or employee count — the page of
   * employees, their overrides for the month, and the shift catalogue — rather
   * than anything per-cell.
   */
  async getSchedule(req, res, _next) {
    try {
      const { error, value } = scheduleQueryValidator.validate(
        { ...req.query, ...req.body },
        { abortEarly: false },
      );
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to load schedule",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const days = monthDays(value.month);
      const range = monthRange(value.month);
      if (!days.length) {
        return res
          .status(400)
          .json(Response.errorResp("Failed to load schedule", ["Invalid month"]));
      }

      const employeeQuery = buildEmployeeQuery(adminId, value);

      const [employees, total] = await Promise.all([
        authorizedUsersModel
          .find(employeeQuery, {
            firstName: 1,
            lastName: 1,
            email: 1,
            emp_id: 1,
            designation: 1,
            location: 1,
            departmentId: 1,
            shiftId: 1,
            status: 1,
          })
          .setOptions({ memberId })
          .populate("departmentId", "departmentName")
          .sort({ firstName: 1, lastName: 1, _id: 1 })
          .skip(value.skip)
          .limit(value.limit)
          .lean(),
        authorizedUsersModel.countDocuments(employeeQuery, { memberId }),
      ]);

      const employeeIds = employees.map((employee) => employee._id);

      const [overrides, shifts] = await Promise.all([
        employeeIds.length
          ? ShiftSchedule.find({
              adminId: asObjectId(adminId),
              employee: { $in: employeeIds },
              date: { $gte: range.start, $lte: range.end },
            }).lean()
          : [],
        // The whole catalogue, not just assigned ones: the legend lists every
        // shift an admin can pick, and the cell editor needs the same list.
        Shift.find({ adminId: asObjectId(adminId) })
          .sort({ isDefault: -1, createdAt: -1 })
          .lean(),
      ]);

      const shiftsById = new Map(shifts.map((shift) => [String(shift._id), shift]));
      const overridesByEmployee = new Map();
      for (const override of overrides) {
        const key = String(override.employee);
        if (!overridesByEmployee.has(key)) overridesByEmployee.set(key, new Map());
        overridesByEmployee.get(key).set(override.date, override);
      }

      const rows = employees.map((employee) => {
        const standingShift = employee.shiftId
          ? shiftsById.get(String(employee.shiftId)) || null
          : null;
        const employeeOverrides = overridesByEmployee.get(String(employee._id));

        const cells = {};
        for (const day of days) {
          const resolved = resolveScheduledDay({
            override: employeeOverrides?.get(day.key),
            standingShift,
            weekday: day.weekday,
            shiftsById,
          });
          cells[day.key] = {
            type: resolved.type,
            source: resolved.source,
            note: resolved.note,
            shift: shiftChip(resolved.shift),
          };
        }

        return {
          _id: employee._id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          employeeCode: employee.emp_id ?? null,
          designation: employee.designation || null,
          location: employee.location || null,
          department: employee.departmentId?.departmentName || null,
          status: employee.status,
          standingShift: shiftChip(standingShift),
          cells,
        };
      });

      return res.status(200).json(
        Response.userSuccessResp("Schedule retrieved successfully", {
          month: value.month,
          days,
          employees: rows,
          total,
          // Drives the legend and the cell editor's picker.
          shifts: shifts.map(shiftChip),
        }),
      );
    } catch (error) {
      logger.error("Error loading shift schedule:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to load schedule", error?.message));
    }
  }

  /** Assign, change or mark off a single employee-day. */
  async assignDay(req, res, _next) {
    try {
      const { error, value } = scheduleAssignValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to update schedule",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const employee = await authorizedUsersModel
        .findOne({ _id: asObjectId(value.employeeId), adminId: asObjectId(adminId) })
        .setOptions({ memberId })
        .select("_id");
      if (!employee) {
        return res.status(404).json(Response.notFoundResp("Employee not found", {}));
      }

      const shift = await this.#resolveShift(adminId, value.shiftId);
      if (value.shiftId && !shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      const saved = await ShiftSchedule.findOneAndUpdate(
        { adminId: asObjectId(adminId), employee: employee._id, date: value.date },
        {
          $set: {
            shiftId: shift?._id || null,
            isOff: Boolean(value.isOff),
            dayType: value.isOff ? "off" : value.dayType || "full",
            note: value.note || null,
            assignedBy: adminId,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      return res.status(200).json(
        Response.userSuccessResp("Schedule updated successfully", {
          employeeId: employee._id,
          date: value.date,
          cell: {
            type: saved.isOff ? "off" : shift ? saved.dayType : "none",
            source: "override",
            note: saved.note,
            shift: shiftChip(shift),
          },
        }),
      );
    } catch (error) {
      logger.error("Error assigning scheduled day:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to update schedule", error?.message));
    }
  }

  /**
   * Assign a shift across a date range for many employees at once.
   *
   * `weekdays` narrows the range — "night shift, Mon-Fri, all of September"
   * is one call rather than twenty-two.
   */
  async bulkAssign(req, res, _next) {
    try {
      const { error, value } = scheduleBulkAssignValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to update schedule",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const shift = await this.#resolveShift(adminId, value.shiftId);
      if (value.shiftId && !shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      const employees = await authorizedUsersModel
        .find(
          {
            _id: { $in: value.employeeIds.map(asObjectId) },
            adminId: asObjectId(adminId),
          },
          { _id: 1 },
        )
        .setOptions({ memberId })
        .lean();

      if (!employees.length) {
        return res
          .status(404)
          .json(Response.notFoundResp("No matching employees found", {}));
      }

      const dates = this.#datesInRange(value);
      if (!dates.length) {
        return res
          .status(400)
          .json(
            Response.errorResp("Failed to update schedule", [
              "The selected weekdays don't occur in that date range",
            ]),
          );
      }

      const operations = [];
      for (const employee of employees) {
        for (const date of dates) {
          operations.push({
            updateOne: {
              filter: { adminId: asObjectId(adminId), employee: employee._id, date },
              update: {
                $set: {
                  shiftId: shift?._id || null,
                  isOff: Boolean(value.isOff),
                  dayType: value.isOff ? "off" : value.dayType || "full",
                  assignedBy: adminId,
                },
              },
              upsert: true,
            },
          });
        }
      }

      let written = 0;
      for (let i = 0; i < operations.length; i += BULK_WRITE_CHUNK) {
        const result = await ShiftSchedule.bulkWrite(
          operations.slice(i, i + BULK_WRITE_CHUNK),
          { ordered: false },
        );
        written += (result?.upsertedCount || 0) + (result?.modifiedCount || 0);
      }

      return res.status(200).json(
        Response.userSuccessResp(
          `${employees.length} employee${employees.length === 1 ? "" : "s"} scheduled across ${dates.length} day${dates.length === 1 ? "" : "s"}`,
          {
            employees: employees.length,
            days: dates.length,
            cellsWritten: written,
          },
        ),
      );
    } catch (error) {
      logger.error("Error bulk-assigning schedule:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to update schedule", error?.message));
    }
  }

  /**
   * Drop overrides so the days fall back to the standing shift.
   *
   * Deliberately distinct from assigning "no shift": clearing restores
   * inheritance, which is what an admin undoing a mistake actually wants.
   */
  async clearDays(req, res, _next) {
    try {
      const { error, value } = scheduleClearValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to clear schedule",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const employees = await authorizedUsersModel
        .find(
          {
            _id: { $in: value.employeeIds.map(asObjectId) },
            adminId: asObjectId(adminId),
          },
          { _id: 1 },
        )
        .setOptions({ memberId })
        .lean();

      const result = await ShiftSchedule.deleteMany({
        adminId: asObjectId(adminId),
        employee: { $in: employees.map((employee) => employee._id) },
        ...(value.dates?.length
          ? { date: { $in: value.dates } }
          : { date: { $gte: value.from, $lte: value.to } }),
      });

      return res.status(200).json(
        Response.userSuccessResp("Schedule cleared successfully", {
          cleared: result?.deletedCount || 0,
        }),
      );
    } catch (error) {
      logger.error("Error clearing schedule:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to clear schedule", error?.message));
    }
  }

  /** Distinct designations, so the Role filter offers only real values. */
  async getDesignations(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const values = await authorizedUsersModel.distinct("designation", {
        adminId: asObjectId(adminId),
        designation: { $nin: [null, ""] },
      });
      return res.status(200).json(
        Response.userSuccessResp("Designations retrieved successfully", {
          designations: values.sort((a, b) => String(a).localeCompare(String(b))),
        }),
      );
    } catch (error) {
      logger.error("Error getting designations:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get designations", error?.message));
    }
  }

  // ---------------------------------------------------------------- helpers

  async #resolveShift(adminId, shiftId) {
    if (!shiftId) return null;
    return Shift.findOne({ _id: asObjectId(shiftId), adminId: asObjectId(adminId) }).lean();
  }

  /** Expand from/to (plus optional weekday filter) into date keys. */
  #datesInRange({ from, to, dates, weekdays }) {
    if (dates?.length) return [...new Set(dates)].sort();

    const out = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const allowed = weekdays?.length ? new Set(weekdays) : null;

    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      if (!allowed || allowed.has(cursor.getUTCDay())) out.push(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }
}

export default new ShiftScheduleService();
