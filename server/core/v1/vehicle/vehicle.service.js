import logger from "../../../utils/logger.js";
import VehicleLog from "./vehicle.log.model.js";
import Admin from "../admin/admin.model.js";
import Vehicle from "./vehicle.model.js";
import Channels from "../channels/channels.model.js";
import { sendPayloadToUser } from "../../../socket.js";
import Response from "../../../utils/response.js";
import { vehicleLogValidation } from "./vehicle.validate.js";
import mongoose from "mongoose";

import JobsService from "../jobs/jobs.service.js";
import RecipientModel from "../verifyRecipients/recipients.model.js";
import MailHelper from "../../../mailService/mail.helper.js";

class VehicleService {
  async log(req, res) {
    try {
      const { error, value } = vehicleLogValidation.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }

      const { adminId, vehicleNumber, nvrId, channelId, images } = value;

      // 🔹 Validate Admin
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json(Response.notFoundResp("Admin not found"));
      }

      // 🔹 Find or Create Vehicle
      let vehicle = await Vehicle.findOne({
        vehicleNumber: vehicleNumber.toUpperCase(),
      });
      if (!vehicle) {
        vehicle = await Vehicle.create({
          vehicleNumber: vehicleNumber.toUpperCase(),
        });
      }

      // 🔹 Validate Channel (and NVR)
      const channel = await Channels.findById(channelId)
        .populate("nvrId")
        .populate("profile");
      if (!channel) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }

      // 🔹 Create Event Object
      const event = {
        timestamp: new Date(),
        nvr: nvrId,
        channel: channelId,
        images,
      };

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // 🔹 Upsert Vehicle Log
      const log = await VehicleLog.findOneAndUpdate(
        {
          adminId,
          vehicleId: vehicle._id,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
        {
          $setOnInsert: {
            adminId,
            vehicleId: vehicle._id,
          },
          $push: { events: event },
        },
        { new: true, upsert: true },
      );

      // 🔹 Populate response
      const populatedLog = await VehicleLog.findById(log._id)
        .populate("adminId")
        .populate("vehicleId")
        .populate("events.nvr")
        .populate("events.channel");

      // 🔹 Socket Payload
      const socketPayload = {
        message: "New vehicle entry event logged",
        entry: {
          id: populatedLog._id,
          admin: populatedLog.adminId,
          vehicle: populatedLog.vehicleId,
          event,
          createdAt: populatedLog.createdAt,
          updatedAt: populatedLog.updatedAt,
        },
      };

      await sendPayloadToUser(
        admin?.user_id,
        `vehicleLog_${admin?._id}`,
        socketPayload,
      );

      // 🔹 Notification System
      if (
        channel?.profile &&
        (await JobsService.handleProfileNotification(
          channel.profile,
          channelId,
        ))
      ) {
        const emailRecipients = await RecipientModel.find({
          _id: { $in: channel.profile.notification?.recipients },
          type: "email",
        })
          .select("value -_id")
          .lean();

        const emailAddresses = emailRecipients.map(
          (recipient) => recipient.value,
        );

        if (
          emailAddresses.length &&
          channel.profile.notification?.channels?.email
        ) {
          await MailHelper.vehicleLog(
            emailAddresses,
            socketPayload.entry,
            channel.nvrId,
            channel,
          );
        }
      }

      return res.status(201).json(
        Response.userSuccessResp("Vehicle entry logged successfully", {
          entry: populatedLog,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to log vehicle entry", error.message));
    }
  }

  async getVehicles(req, res) {
    try {
      const { search } = req.query;
      if (search) {
        const vehicles = await Vehicle.find({
          vehicleNumber: { $regex: search, $options: "i" },
        }).sort({ vehicleNumber: 1 });

        return res.status(200).json(
          Response.userSuccessResp("Vehicles retrieved successfully", {
            vehicles,
          }),
        );
      }

      const vehicles = await Vehicle.find({}).sort({ vehicleNumber: 1 });

      return res.status(200).json(
        Response.userSuccessResp("Vehicles retrieved successfully", {
          vehicles,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get vehicles", error.message));
    }
  }

  async getVehicleEntries(req, res) {
    try {
      const { vehicleId } = req.params;
      const { startDate, endDate } = req.query;

      if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        return res.status(400).json(Response.errorResp("Invalid vehicle ID"));
      }

      const query = { vehicleId: new mongoose.Types.ObjectId(vehicleId) };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          query.createdAt.$gte = start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      const entries = await VehicleLog.find(query)
        .populate("vehicleId")
        .populate({
          path: "events.nvr",
          select: "nvrName location",
        })
        .populate({
          path: "events.channel",
          select: "name customName",
        })
        .sort({ createdAt: -1 });

      return res.status(200).json(
        Response.userSuccessResp("Vehicle entries retrieved successfully", {
          entries,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(
          Response.errorResp("Failed to get vehicle entries", error.message),
        );
    }
  }
}

export default new VehicleService();
