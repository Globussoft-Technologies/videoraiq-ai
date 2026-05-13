import Attendance from "./attendance.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import Admin from "../admin/admin.model.js";
import { attendanceSchema } from "./attendance.validate.js";
import mongoose from "mongoose";
import { sendPayloadToUser } from "../../../socket.js";
import authorisedUsers from "../authorizedUsers/authorizedUsers.model.js";
import Channels from "../channels/channels.model.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import config from "config";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
const ImageView = config.get("ImageView");

class AttendanceService {
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
      const channel = await Channels.findById(channelId).populate("nvrId");
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

      if (cameraType === "checkout") {
        if (!existingAttendance) {
          return res
            .status(400)
            .json(Response.errorResp("Cannot checkout before check-in"));
        }
        const hasCheckin =
          Array.isArray(existingAttendance?.events) &&
          existingAttendance.events?.some((e) => e.cameraType === "checkin");

        if (!hasCheckin) {
          return res
            .status(400)
            .json(Response.errorResp("Cannot checkout before check-in"));
        }
      }

      // findOrCreate (upsert)
      const attendance = await Attendance.findOneAndUpdate(
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

  async getAttendance(req, res, _next) {
    try {
      const pipeline = await this.buildAttendancePipeline(req);

      const attendances = await Attendance.aggregate(pipeline);

      const firstAttendance = await Attendance.findOne()
        .sort({ createdAt: 1 })
        .select("createdAt");

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

        let minutesSpent = 0;
        if (firstCheckIn && lastCheckOut) {
          minutesSpent = Math.round(
            (new Date(lastCheckOut.timestamp) -
              new Date(firstCheckIn.timestamp)) /
              (1000 * 60)
          );
        }

        const imageUrls = att.events.map((e) => ({
          images: e?.images,
          cameraType: e?.cameraType,
          timestamp: e?.timestamp,
          cameraName: e?.customName || e?.channelName || null,
          confidenceScore: e?.confidenceScore || null,
        }));

        return {
          employee: att.employee,
          // shift: att.shift,
          // date: att._id.date,
          logInTime: firstCheckIn?.timestamp || null,
          logOutTime: lastCheckOut?.timestamp || null,
          checkinCam:
            firstCheckIn?.customName || firstCheckIn?.channelName || null,
          checkoutCam:
            lastCheckOut?.customName || lastCheckOut?.channelName || null,
          minutesSpent,
          imageUrls,
        };
      });

      const countPipeline = pipeline.filter(
        (stage) => !("$skip" in stage || "$limit" in stage)
      );

      countPipeline.push({ $count: "total" });

      const countResult = await Attendance.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;

      return res.status(200).json(
        Response.userSuccessResp("Attendance summary", {
          attendanceLogs: attendanceSummary,
          total,
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

  async buildAttendancePipeline(req, forExport = false) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const userId = adminId;
      
      let authorizedEmployeeLocations = req?.verified?.authorizedChannel?.employeeLocations || [];
      let { employeeLocations=[]} = req.body;

      //combine authorizedEmployeeLocations and employeeLocations and remove duplicates
      if(employeeLocations?.length){
        employeeLocations = [...authorizedEmployeeLocations,...employeeLocations];
        employeeLocations = [...new Set(employeeLocations)];
      }

      //Include only those authorized employee WHOSE location CONTAINS authorizedEmployeeLocations
      let fetchAllEmployeeswithAuthorizedLocations = [];
      if(employeeLocations?.length){
        fetchAllEmployeeswithAuthorizedLocations = await authorizedUsersModel.find({
          location: { $in: employeeLocations },
          adminId: new mongoose.Types.ObjectId(adminId)
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

      const parseObjectIds = (value) =>
        value
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => new mongoose.Types.ObjectId(id));

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

        // ! Incomplete -  Lookup Shift
        // {
        //   $lookup: {
        //     from: "shifts",
        //     localField: "shiftId",
        //     foreignField: "_id",
        //     as: "shift",
        //   },
        // },
        // { $unwind: { path: "$shift", preserveNullAndEmptyArrays: true } },

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
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
            },
            employee: { $first: "$employee" },
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

        // --- Name filter ---
        ...(name
          ? [
              {
                $match: {
                  "employee.fullName": { $regex: name, $options: "i" },
                },
              },
            ]
          : []),
      ];

      // Apply name filter
      // if (name) {
      //   pipeline.push({
      //     $match: {
      //       "employee.fullName": { $regex: name, $options: "i" },
      //     },
      //   });
      // }

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
          sortStage = {
            "employee.locationId.locationName": sortDirection,
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
        return pipeline;
      }
      pipeline.push({ $skip: parseInt(skip) });
      pipeline.push({ $limit: parseInt(limit) });
      return pipeline;
    } catch (error) {
      logger.error(error);
      throw new Error("Failed to build attendance pipeline: " + error.message);
    }
  }

  async exportAttendance(req, res, _next) {
    try {
      const format = req.query.format || "excel";
      const pipeline = await this.buildAttendancePipeline(req, true);

      const data = await Attendance.aggregate(pipeline);

      if (!data || data.length === 0) {
        return res
          .status(200)
          .json(Response.userSuccessResp("No attendance data to export", []));
      }

      const timezone = req.query.timezone || "UTC";
      if (format === "excel") {
        return this.#exportExcel(res, data, timezone);
      }

      if (format === "pdf") {
        return this.#exportPdf(res, data, timezone);
      }
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
          const ch = await Channels.findById(ev.channel).select("name customName");
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

      // Pair sequential checkouts and checkins
      let pairedLogs = [];
      let currentCheckout = null;

      for (const ev of populatedEvents) {
        if (!currentCheckout && ev.cameraType === "checkout") {
          currentCheckout = ev;
        } else if (currentCheckout && ev.cameraType === "checkin") {
          pairedLogs.push({
            checkout: currentCheckout,
            checkin: ev
          });
          currentCheckout = null; // Clear the checkout so we can look for the next pair
        }
      }

      return res.status(200).json(Response.userSuccessResp("User logs retrieved successfully", {
         employee: attendance.employee,
         date: date,
         logs: pairedLogs
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
