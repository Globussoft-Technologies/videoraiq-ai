import Shift from "./shifts.model.js";
import logger from "../../../utils/logger.js";
import {
  createShiftValidator,
  updateShiftValidator,
} from "./shift.validate.js";
import Response from "../../../utils/response.js";

class ShiftService {
  async createShift(req, res, _next) {
    try {
      const { error, value } = createShiftValidator.validate(req.body, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json(
          Response.errorResp(
            "Failed to create shift",
            error.details.map((err) => err.message)
          )
        );
      }
      const shift = await Shift.create({
        ...value,
        adminId: req.verified.userData.adminId,
      });
      return res.status(201).json(
        Response.userSuccessResp("Shift created successfully", {
          shift,
        })
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
      const { skip = 0, limit = 10, name = "" } = req.query;

      const query = {
        name: { $regex: name, $options: "i" },
      };

      const [shifts, total] = await Promise.all([
        Shift.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
        Shift.countDocuments(query),
      ]);

      return res.status(200).json(
        Response.userSuccessResp("Shifts retrieved successfully", {
          shifts,
          total,
        })
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
      const shift = await Shift.findById(req.params.id);
      return res.status(200).json(
        Response.userSuccessResp("Shifts retrieved successfully", {
          shift,
        })
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
            error.details.map((err) => err.message)
          )
        );
      }
      const shift = await Shift.findByIdAndUpdate(
        req.params.id,
        {
          ...value,
          adminId: req.verified.userData.adminId,
        },
        { new: true, runValidators: true }
      );

      if (!shift) {
        return res.status(400).json(Response.errorResp("Shift not found", {}));
      }

      return res.status(200).json(
        Response.userSuccessResp("Shift updated successfully", {
          shift,
        })
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
      const shift = await Shift.findByIdAndDelete(req.params.id);
      return res.status(201).json(
        Response.userSuccessResp("Shift deleted successfully", {
          shift,
        })
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
      const shifts = await Shift.find({ adminId }, { _id: 1, name: 1 }).sort({
        createdAt: -1,
      });
      return res.status(200).json(
        Response.userSuccessResp("Shift list retrieved successfully", {
          shifts,
        })
      );
    } catch (error) {
      logger.error("Error getting shift list:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to get shift list", error?.message));
    }
  }
}

export default new ShiftService();
