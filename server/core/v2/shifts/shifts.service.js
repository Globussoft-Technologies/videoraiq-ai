import mongoose from "mongoose";
import Shift, {
  SHIFT_DAY_KEYS,
  DEFAULT_MAX_OVERTIME_MINUTES,
  resolveShiftDay,
  weekOffDays,
} from "./shifts.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import {
  createShiftValidator,
  updateShiftValidator,
  assignmentFilterValidator,
  assignmentPreviewValidator,
  unassignValidator,
} from "./shift.validate.js";

/**
 * Colours are assigned rather than picked — the Create Shift form has no colour
 * control, but the attendance roster and the shift chips both paint by colour,
 * so every shift needs one. Cycled by creation order so the first handful of
 * shifts in a tenant are visually distinct.
 */
const SHIFT_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
];

/** Mongo caps how much a single `$in` can carry comfortably. */
const UPDATE_CHUNK_SIZE = 1000;

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

/**
 * Employee `location` is a free-text string rather than a reference, and the
 * same site reaches the collection as "Pune", "pune" and " Pune " depending on
 * which import wrote it. Every other location filter in the codebase matches
 * case-insensitively for that reason, and a bulk assign that missed half a
 * site because of casing would be worse than one that matched nothing.
 */
function buildLocationMatch(locations = []) {
  const normalized = [
    ...new Set(
      locations.map((location) => String(location || "").trim()).filter(Boolean),
    ),
  ];
  if (!normalized.length) return null;
  return {
    $in: normalized.map((location) => new RegExp(`^${escapeRegex(location)}$`, "i")),
  };
}

/**
 * Turn validated assignment filters into an authorizedUsers query.
 *
 * The filters are ANDed: "Pune" + "Engineering" means Pune engineers, not the
 * union. An empty filter set matches every employee under the admin, which is
 * why the write paths require `allEmployees` to be set explicitly before they
 * will act on one.
 */
function buildEmployeeQuery(adminId, filters = {}) {
  const query = {
    adminId: asObjectId(adminId),
    // Demo seed data lives in the same collection behind this flag; a bulk
    // assign must never touch it.
    liveDemoData: { $ne: true },
  };

  if (!filters.includeSuspended) {
    query.status = { $ne: "suspended" };
  }

  const employeeIds = toArray(filters.employeeIds);
  if (employeeIds.length) {
    query._id = { $in: employeeIds.map(asObjectId) };
  }

  const locationMatch = buildLocationMatch(toArray(filters.locations));
  if (locationMatch) {
    query.location = locationMatch;
  }

  const departmentIds = toArray(filters.departmentIds);
  if (departmentIds.length) {
    query.departmentId = { $in: departmentIds.map(asObjectId) };
  }

  return query;
}

/** Shape one shift for the listing table. */
function presentShift(shift, assignedCount = 0) {
  const plain = typeof shift.toObject === "function" ? shift.toObject() : shift;
  const days = Object.fromEntries(
    SHIFT_DAY_KEYS.map((day) => [day, resolveShiftDay(plain, day)]),
  );

  return {
    ...plain,
    // Derived, so a client rendering the table never has to re-implement the
    // legacy-`timings` fallback that `resolveShiftDay` handles.
    workingDays: days,
    weekOffDays: weekOffDays(plain),
    workingDayCount: SHIFT_DAY_KEYS.filter((day) => days[day]?.type !== "off").length,
    // Resolved so the client shows the real number rather than the 0 sentinel.
    effectiveMaxOvertimeMinutes:
      plain.maxOvertimeMinutes || DEFAULT_MAX_OVERTIME_MINUTES,
    assignedEmployees: assignedCount,
  };
}

class ShiftService {
  // ---------------------------------------------------------------- helpers

  /**
   * Employees per shift in one aggregation rather than a count per row, so the
   * listing stays a fixed two queries however many shifts a tenant has.
   */
  async #assignedCounts(adminId, shiftIds = []) {
    if (!shiftIds.length) return new Map();
    const rows = await authorizedUsersModel.aggregate([
      {
        $match: {
          adminId: asObjectId(adminId),
          shiftId: { $in: shiftIds.map(asObjectId) },
          liveDemoData: { $ne: true },
        },
      },
      { $group: { _id: "$shiftId", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  /** At most one default shift per admin. */
  async #clearOtherDefaults(adminId, exceptId) {
    await Shift.updateMany(
      {
        adminId: asObjectId(adminId),
        isDefault: true,
        ...(exceptId ? { _id: { $ne: asObjectId(exceptId) } } : {}),
      },
      { $set: { isDefault: false } },
    );
  }

  /** Case-insensitive duplicate-name guard, scoped to the admin. */
  async #nameTaken(adminId, name, exceptId) {
    const existing = await Shift.findOne({
      adminId: asObjectId(adminId),
      name: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i"),
      ...(exceptId ? { _id: { $ne: asObjectId(exceptId) } } : {}),
    }).select("_id");
    return Boolean(existing);
  }

  /**
   * Resolve a filter set to employee ids.
   *
   * Goes through `find` (not straight to `updateMany`) for two reasons: the
   * authorizedUsers pre-find hook applies the caller's own location
   * restrictions there and nowhere else, so a restricted member must not be
   * able to bulk-assign outside their sites; and it gives an exact target list
   * to report back and to chunk the write over.
   */
  async #resolveTargets(adminId, filters, memberId, { excludeShiftId } = {}) {
    const query = buildEmployeeQuery(adminId, filters);
    if (excludeShiftId) {
      // Skip anyone already on this shift so `modified` reflects real changes.
      query.shiftId = { $ne: asObjectId(excludeShiftId) };
    }
    if (filters.overwriteExisting === false) {
      // Only fill the gaps — leave deliberate per-employee shifts alone.
      query.shiftId = { $in: [null] };
    }
    return authorizedUsersModel
      .find(query, { _id: 1 })
      .setOptions({ memberId })
      .lean();
  }

  /** Assign in bounded chunks so one huge tenant can't build a giant `$in`. */
  async #applyShift(employeeIds, shiftId) {
    let modified = 0;
    for (let i = 0; i < employeeIds.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = employeeIds.slice(i, i + UPDATE_CHUNK_SIZE);
      const result = await authorizedUsersModel.updateMany(
        { _id: { $in: chunk } },
        { $set: { shiftId } },
      );
      modified += result?.modifiedCount ?? 0;
    }
    return modified;
  }

  // ------------------------------------------------------------------- CRUD

  async createShift(req, res, _next) {
    try {
      const { error, value } = createShiftValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to create shift",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;

      if (await this.#nameTaken(adminId, value.name)) {
        return res
          .status(400)
          .json(
            Response.errorResp("Failed to create shift", [
              `A shift named "${value.name.trim()}" already exists`,
            ]),
          );
      }

      if (!value.color) {
        const existingCount = await Shift.countDocuments({ adminId: asObjectId(adminId) });
        value.color = SHIFT_PALETTE[existingCount % SHIFT_PALETTE.length];
      }

      // The first shift a tenant creates becomes the default unless told
      // otherwise, so an org that never touches the toggle still has one.
      if (value.isDefault === undefined) {
        value.isDefault = !(await Shift.exists({ adminId: asObjectId(adminId) }));
      }

      const shift = await Shift.create({ ...value, adminId });

      if (shift.isDefault) {
        await this.#clearOtherDefaults(adminId, shift._id);
      }

      return res.status(201).json(
        Response.userSuccessResp("Shift created successfully", {
          shift: presentShift(shift, 0),
        }),
      );
    } catch (error) {
      logger.error("Error creating shift:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to create shift", error?.message));
    }
  }

  async getAllShifts(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const { skip = 0, limit = 10, name = "", isActive } = req.query;

      // Scoped to the caller's tenant. Without this every admin read every
      // other tenant's shifts, and `/shifts/:id` let them edit and delete them.
      const query = { adminId: asObjectId(adminId) };
      if (name) {
        query.name = { $regex: escapeRegex(name), $options: "i" };
      }
      if (isActive === "true" || isActive === "false") {
        query.isActive = isActive === "true";
      }

      const [shifts, total] = await Promise.all([
        Shift.find(query)
          .sort({ isDefault: -1, createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(Number(limit) || 10),
        Shift.countDocuments(query),
      ]);

      const counts = await this.#assignedCounts(
        adminId,
        shifts.map((shift) => shift._id),
      );

      return res.status(200).json(
        Response.userSuccessResp("Shifts retrieved successfully", {
          shifts: shifts.map((shift) =>
            presentShift(shift, counts.get(String(shift._id)) || 0),
          ),
          total,
        }),
      );
    } catch (error) {
      logger.error("Error getting shifts:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get shifts", error?.message));
    }
  }

  async getShiftById(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const shift = await Shift.findOne({
        _id: req.params.id,
        adminId: asObjectId(adminId),
      });

      if (!shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      const counts = await this.#assignedCounts(adminId, [shift._id]);

      return res.status(200).json(
        Response.userSuccessResp("Shifts retrieved successfully", {
          shift: presentShift(shift, counts.get(String(shift._id)) || 0),
        }),
      );
    } catch (error) {
      logger.error("Error getting shift by id:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get shift by id", error?.message));
    }
  }

  async updateShift(req, res, _next) {
    try {
      const { error, value } = updateShiftValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to update shift",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const shift = await Shift.findOne({
        _id: req.params.id,
        adminId: asObjectId(adminId),
      });

      if (!shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      if (value.name && (await this.#nameTaken(adminId, value.name, shift._id))) {
        return res
          .status(400)
          .json(
            Response.errorResp("Failed to update shift", [
              `A shift named "${value.name.trim()}" already exists`,
            ]),
          );
      }

      // Assigned rather than `findByIdAndUpdate` so the pre-validate hook runs
      // and the legacy `timings`/`settings` mirrors stay in step.
      for (const [key, next] of Object.entries(value)) {
        if (key === "workingDays") {
          for (const day of SHIFT_DAY_KEYS) {
            if (next[day]) shift.set(`workingDays.${day}`, next[day]);
          }
          continue;
        }
        if (key === "timings" && !value.workingDays) {
          // A caller still speaking the legacy shape. Clear the canonical day
          // first, or the hook — which lets `workingDays` win — would keep the
          // stored week and silently drop the update.
          for (const day of Object.keys(next)) {
            shift.set(`workingDays.${day}`, undefined);
          }
        }
        shift.set(key, next);
      }

      await shift.save();

      if (shift.isDefault) {
        await this.#clearOtherDefaults(adminId, shift._id);
      }

      const counts = await this.#assignedCounts(adminId, [shift._id]);

      return res.status(200).json(
        Response.userSuccessResp("Shift updated successfully", {
          shift: presentShift(shift, counts.get(String(shift._id)) || 0),
        }),
      );
    } catch (error) {
      logger.error("Error updating shift:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to update shift", error?.message));
    }
  }

  async deleteShift(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const shift = await Shift.findOne({
        _id: req.params.id,
        adminId: asObjectId(adminId),
      });

      if (!shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      // Unassign before deleting, otherwise the employees keep a `shiftId`
      // pointing at a document that no longer exists and the attendance roster
      // silently treats them as having no shift anyway — just with a dangling
      // reference nobody can see or clear from the UI.
      const unassigned = await authorizedUsersModel.updateMany(
        { adminId: asObjectId(adminId), shiftId: shift._id },
        { $set: { shiftId: null } },
      );

      await shift.deleteOne();

      return res.status(200).json(
        Response.userSuccessResp("Shift deleted successfully", {
          shift,
          unassignedEmployees: unassigned?.modifiedCount ?? 0,
        }),
      );
    } catch (error) {
      logger.error("Error deleting shift:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to delete shift", error?.message));
    }
  }

  async getShiftList(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const shifts = await Shift.find(
        { adminId: asObjectId(adminId), isActive: true },
        { _id: 1, name: 1, color: 1, startTime: 1, endTime: 1, isDefault: 1, isNightShift: 1 },
      ).sort({ isDefault: -1, createdAt: -1 });

      return res.status(200).json(
        Response.userSuccessResp("Shift list retrieved successfully", { shifts }),
      );
    } catch (error) {
      logger.error("Error getting shift list:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get shift list", error?.message));
    }
  }

  // ------------------------------------------------------------- assignment

  /**
   * Who a given filter set would hit, without writing anything.
   *
   * Deliberately permissive where the write paths are not: an empty filter set
   * previews the whole org, which is how the Bulk Assign modal shows a running
   * count as the admin narrows down. Committing that same empty filter still
   * requires `allEmployees`.
   */
  async previewAssignment(req, res, _next) {
    try {
      const { error, value } = assignmentPreviewValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to preview assignment",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;
      const query = buildEmployeeQuery(adminId, value);

      // Layered on here rather than inside buildEmployeeQuery so the search
      // can never reach the assign path — see assignmentPreviewValidator.
      if (value.search) {
        const regex = new RegExp(escapeRegex(value.search), "i");
        query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
      }

      const [employees, matched] = await Promise.all([
        authorizedUsersModel
          .find(query, {
            firstName: 1,
            lastName: 1,
            email: 1,
            location: 1,
            departmentId: 1,
            shiftId: 1,
            status: 1,
          })
          .setOptions({ memberId })
          .populate("departmentId", "departmentName")
          .populate("shiftId", "name color startTime endTime")
          .sort({ firstName: 1, _id: 1 })
          .skip(value.skip)
          .limit(value.limit)
          .lean(),
        authorizedUsersModel.countDocuments(query, { memberId }),
      ]);

      const alreadyAssigned = await authorizedUsersModel.countDocuments(
        { ...query, shiftId: { $ne: null } },
        { memberId },
      );

      return res.status(200).json(
        Response.userSuccessResp("Assignment preview generated", {
          matched,
          alreadyAssigned,
          unassigned: matched - alreadyAssigned,
          employees,
        }),
      );
    } catch (error) {
      logger.error("Error previewing shift assignment:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to preview assignment", error?.message));
    }
  }

  /**
   * Assign one shift to everyone a filter set matches.
   *
   * Individual assignment is the same call with `employeeIds` — there is no
   * separate single-assign path, so the tenant scoping, the member location
   * restrictions and the "already on this shift" skip can't drift apart
   * between the two.
   */
  async assignShift(req, res, _next) {
    try {
      const { error, value } = assignmentFilterValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to assign shift",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const shift = await Shift.findOne({
        _id: req.params.id,
        adminId: asObjectId(adminId),
      }).select("_id name isActive");

      if (!shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }
      if (!shift.isActive) {
        return res
          .status(400)
          .json(
            Response.errorResp("Failed to assign shift", [
              "This shift is inactive — reactivate it before assigning staff",
            ]),
          );
      }

      const targets = await this.#resolveTargets(adminId, value, memberId, {
        excludeShiftId: shift._id,
      });
      const employeeIds = targets.map((employee) => employee._id);
      const modified = await this.#applyShift(employeeIds, shift._id);

      return res.status(200).json(
        Response.userSuccessResp(
          modified
            ? `${modified} employee${modified === 1 ? "" : "s"} assigned to ${shift.name}`
            : "No employees needed updating — they are already on this shift",
          {
            shiftId: shift._id,
            shiftName: shift.name,
            matched: employeeIds.length,
            modified,
          },
        ),
      );
    } catch (error) {
      logger.error("Error assigning shift:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to assign shift", error?.message));
    }
  }

  /** Clear the shift on specific employees. */
  async unassignShift(req, res, _next) {
    try {
      const { error, value } = unassignValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to unassign shift",
            error.details.map((err) => err.message),
          ),
        );
      }

      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;

      const targets = await authorizedUsersModel
        .find(
          {
            adminId: asObjectId(adminId),
            _id: { $in: value.employeeIds.map(asObjectId) },
          },
          { _id: 1 },
        )
        .setOptions({ memberId })
        .lean();

      const modified = await this.#applyShift(
        targets.map((employee) => employee._id),
        null,
      );

      return res.status(200).json(
        Response.userSuccessResp("Shift unassigned successfully", {
          matched: targets.length,
          modified,
        }),
      );
    } catch (error) {
      logger.error("Error unassigning shift:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to unassign shift", error?.message));
    }
  }

  /** Paginated roster for one shift — the "N employees" drill-down. */
  async getShiftEmployees(req, res, _next) {
    try {
      const adminId = req.verified.userData.adminId;
      const memberId = req.verified.userData.memberId;
      const { skip = 0, limit = 10, search = "" } = req.query;

      const shift = await Shift.findOne({
        _id: req.params.id,
        adminId: asObjectId(adminId),
      }).select("_id name");

      if (!shift) {
        return res.status(404).json(Response.notFoundResp("Shift not found", {}));
      }

      const query = {
        adminId: asObjectId(adminId),
        shiftId: shift._id,
        liveDemoData: { $ne: true },
      };

      if (search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), "i");
        query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
      }

      const [employees, total] = await Promise.all([
        authorizedUsersModel
          .find(query, {
            firstName: 1,
            lastName: 1,
            email: 1,
            location: 1,
            departmentId: 1,
            designation: 1,
            status: 1,
          })
          .setOptions({ memberId })
          .populate("departmentId", "departmentName")
          .sort({ firstName: 1, _id: 1 })
          .skip(Number(skip) || 0)
          .limit(Number(limit) || 10)
          .lean(),
        authorizedUsersModel.countDocuments(query, { memberId }),
      ]);

      return res.status(200).json(
        Response.userSuccessResp("Shift employees retrieved successfully", {
          shiftId: shift._id,
          shiftName: shift.name,
          employees,
          total,
        }),
      );
    } catch (error) {
      logger.error("Error getting shift employees:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get shift employees", error?.message));
    }
  }
}

export default new ShiftService();
