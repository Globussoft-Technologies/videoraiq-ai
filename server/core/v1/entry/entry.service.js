import logger from "../../../utils/logger.js";
import Entry from "./entry.model.js";
import Admin from "../admin/admin.model.js";
import EntryUser from "./user.model.js";
import Channels from "../channels/channels.model.js";
import { sendPayloadToUser } from "../../../socket.js";
import Response from "../../../utils/response.js";
import { entrySchemaValidation } from "./entry.validate.js";
import mongoose from "mongoose";

import JobsService from "../jobs/jobs.service.js";
import RecipientModel from "../verifyRecipients/recipients.model.js";
import MailHelper from "../../../mailService/mail.helper.js";

class EntryService {
  async register(req, res) {
    try {
      const { firstName, lastName, email, profileImages } = req.body;

      // Basic validation
      if (!firstName || !lastName || !email) {
        return res
          .status(400)
          .json(
            Response.errorResp("firstName, lastName and email are required"),
          );
      }

      // Check if user already exists (by email)
      const existingUser = await EntryUser.findOne({ email });

      if (existingUser) {
        return res
          .status(409)
          .json(Response.errorResp("User already registered"));
      }

      // Create user
      const newUser = await EntryUser.create({
        firstName,
        lastName,
        email,
        profileImages: profileImages || [],
      });

      return res.status(201).json(
        Response.userSuccessResp("User registered successfully", {
          user: newUser,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to register user", error.message));
    }
  }

  async log(req, res) {
    try {
      const { error, value } = entrySchemaValidation.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }

      const { adminId, userId, nvrId, channelId, images } = value;

      // 🔹 Validate Admin
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json(Response.notFoundResp("Admin not found"));
      }

      // 🔹 Validate EntryUser
      const entryUser = await EntryUser.findById(userId);
      if (!entryUser) {
        return res
          .status(404)
          .json(Response.notFoundResp("Entry user not found"));
      }

      // 🔹 Validate Channel (and NVR)
      const channel = await Channels.findById(channelId)
        .populate("nvrId")
        .populate("profile");
      if (!channel) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }

      // 🔹 Create Event Object (aligned with eventSchema)
      const event = {
        timestamp: new Date(),
        nvr: nvrId,
        channel: channelId,
        images,
        // type,
      };

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // 🔹 Upsert Entry (now restricted by day, matching Attendance logic)
      const entry = await Entry.findOneAndUpdate(
        {
          adminId,
          userId,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
        {
          $setOnInsert: {
            adminId,
            userId,
          },
          $push: { events: event },
        },
        { new: true, upsert: true },
      );

      // 🔹 Populate response
      const populatedEntry = await Entry.findById(entry._id)
        .populate("adminId")
        .populate("userId")
        .populate("events.nvr")
        .populate("events.channel");

      // 🔹 Socket Payload
      const socketPayload = {
        message: "New entry event logged",
        entry: {
          id: populatedEntry._id,
          admin: populatedEntry.adminId,
          user: populatedEntry.userId,
          event,
          createdAt: populatedEntry.createdAt,
          updatedAt: populatedEntry.updatedAt,
        },
      };

      await sendPayloadToUser(
        admin?.user_id,
        `entryLog_${admin?._id}`,
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
          await MailHelper.entryLog(
            emailAddresses,
            socketPayload.entry,
            channel.nvrId,
            channel,
          );
        }
      }

      return res.status(201).json(
        Response.userSuccessResp("Entry logged successfully", {
          entry: populatedEntry,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to log hit", error.message));
    }
  }
  async get(req, res) {
    try {
      const pipeline = this.buildEntryPipeline(req);

      const entries = await Entry.aggregate(pipeline);

      const firstEntry = await Entry.findOne()
        .sort({ createdAt: 1 })
        .select("createdAt");

      const entryLogsStartDate = firstEntry?.createdAt || null;

      const countPipeline = pipeline.filter(
        (stage) => !("$skip" in stage || "$limit" in stage),
      );

      countPipeline.push({ $count: "total" });

      const countResult = await Entry.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;

      return res.status(200).json(
        Response.userSuccessResp("Entry summary", {
          entryLogs: entries,
          total,
          entryLogsStartDate,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get entries", error.message));
    }
  }
  buildEntryPipeline(req) {
    try {
      const adminId = req?.verified?.userData?.adminId;
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
      } = req.query;

      // Match only by user and date range
      const matchStage = { adminId: new mongoose.Types.ObjectId(adminId) };

      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(start);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const parseObjectIds = (value) =>
        value
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => new mongoose.Types.ObjectId(id));

      const toObjectIds = (arr) =>
        arr.map((id) => new mongoose.Types.ObjectId(id));

      // channels`
      const authorizedChannelIds = toObjectIds(authorizedChannels);
      const requestedChannelIds = channelId ? parseObjectIds(channelId) : [];

      let effectiveChannelIds = [];

      if (!isAdmin) {
        // NORMAL USER FLOW
        if (requestedChannelIds.length > 0) {
          effectiveChannelIds = requestedChannelIds.filter((reqId) =>
            authorizedChannelIds.some(
              (authId) => authId.toString() === reqId.toString(),
            ),
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
              (authId) => authId.toString() === reqId.toString(),
            ),
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

      const pipeline = [
        { $match: matchStage },
        { $unwind: "$events" }, // break out each event
        { $match: { "events.timestamp": { $gte: start, $lte: end } } }, // filter by event time

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

        // Lookup user
        {
          $lookup: {
            from: "entryusers",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },

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
            "user.fullName": {
              $concat: [
                { $ifNull: ["$user.firstName", ""] },
                " ",
                { $ifNull: ["$user.lastName", ""] },
              ],
            },
          },
        },

        // Group by user per day
        {
          $group: {
            _id: {
              user: "$user._id",
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
            },
            user: { $first: "$user" },
            events: { $push: "$events" },
          },
        },

        // --- Name filter ---
        ...(name
          ? [
              {
                $match: {
                  "user.fullName": { $regex: name, $options: "i" },
                },
              },
            ]
          : []),
      ];

      let sortStage = {};
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      switch (sortField) {
        case "fullname":
          sortStage = { "user.fullName": sortDirection, "user._id": 1 };
          break;
        case "date":
          sortStage = { "_id.date": sortDirection, "user._id": 1 };
          break;

        default:
          sortStage = {
            "_id.date": sortDirection,
            "user._id": 1,
          };
      }

      pipeline.push({ $sort: sortStage });

      // Pagination
      if (req?.query?.export) {
        // for export, no pagination
        return pipeline;
      }
      pipeline.push({ $skip: parseInt(skip) });
      pipeline.push({ $limit: parseInt(limit) });
      return pipeline;
    } catch (error) {
      logger.error(error);
      throw new Error("Failed to build entry pipeline: " + error.message);
    }
  }

  async getUsers(req, res) {
    try {
      const { search } = req.query;
      if (search) {
        const users = await EntryUser.aggregate([
          {
            $addFields: {
              fullName: {
                $concat: [
                  { $ifNull: ["$firstName", ""] },
                  " ",
                  { $ifNull: ["$lastName", ""] },
                ],
              },
            },
          },
          {
            $match: {
              $or: [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
              ],
            },
          },
          { $sort: { firstName: 1 } },
        ]);

        return res.status(200).json(
          Response.userSuccessResp("Users retrieved successfully", {
            users,
          }),
        );
      }

      const users = await EntryUser.find({}).sort({ firstName: 1 });

      return res.status(200).json(
        Response.userSuccessResp("Users retrieved successfully", {
          users,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get users", error.message));
    }
  }

  async getUserEntries(req, res) {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json(Response.errorResp("Invalid user ID"));
      }

      const query = { userId: new mongoose.Types.ObjectId(userId) };

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

      const entries = await Entry.find(query)
        .populate("userId")
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
        Response.userSuccessResp("User entries retrieved successfully", {
          entries,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to get user entries", error.message));
    }
  }
}

export default new EntryService();
