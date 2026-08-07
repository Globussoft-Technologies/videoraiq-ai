import AppError from "../../../utils/appError.js";
import AccessLogs from "./accesslogs.model.js";
import AccessLogsValidation from "./accesslogs.validate.js";
import Response from "../../../utils/response.js";
import userModel from "../authorizedUsers/authorizedUsers.model.js";
import channelModel from "../channels/channels.model.js";
import nvrModel from "../NVR/nvr.model.js";
import adminModel from "../admin/admin.model.js";
import mongoose from "mongoose";
import { sendPayloadToUser } from "../../../socket.js";
import moment from "moment-timezone";
import reworkedAccessLogs from "./reworkedAccesslogs.model.js";
import { ObjectId } from "mongodb";
import departmentModel from "../departments/departments.model.js"
import config from "config";
const accessLogsTimeDifference = config.get("accessLogsTimeDifference");
import OptimizedAccessLogs from "./newAccessLogs.model.js";


class AccessLogsService {
  async createAccessLog(req, res, next) {
    try {
        let body = req.body;
        let { userId, personName, date, timestamp, images ,cameraId,nvrId,adminId} = body;
        let isAdminExist = await adminModel.findOne({ _id: adminId });
        if(!isAdminExist){
          return res.send(Response.userFailResp("Admin not found","Validation failed!"));
        }

        //check if user exist
        let isUserExist = await userModel.findOne({ _id: userId }).populate("departmentId");

        if(!isUserExist){
          personName 
        }else{
          personName = `${isUserExist.firstName} ${isUserExist.lastName}`;
        }

        //check if camera exist
        let isChannelExist = await channelModel.findOne({ _id: cameraId });
        if(!isChannelExist){
          return res.send(Response.userFailResp("Camera not found","Validation failed!"));
        }
        //check if nvr exist
        let isNvrExist = await nvrModel.findOne({ _id: nvrId });
        if(!isNvrExist){
          return res.send(Response.userFailResp("NVR not found","Validation failed!"));
        }

          //validate request body
          let { value, error } = AccessLogsValidation.createAccessLogsValidate(body);
          if (error) {
            return res.send(Response.userFailResp("Validation Error", error.message));
          }

          
          const startOfDay = moment().utc().startOf("day").toDate();
          const endOfDay   = moment().utc().endOf("day").toDate();


          let socketData = {
          ...(userId && { userId }),
          cameraName:isChannelExist?.name || null,
          cameraId:cameraId || null,
          personName,
          firstName:isUserExist?.firstName || null,
          lastName:isUserExist?.lastName || null,
          profilePics:isUserExist?.profilePics || null,
          department:isUserExist?.departmentId?.departmentName || null,
          ...(timestamp && !isNaN(new Date(timestamp).getTime()) && { timestamp: new Date(timestamp) }),
          images

        }

        await sendPayloadToUser(userId, `accessLogs_${adminId}`, socketData);

        // ---------------------------
        // FIND TODAY'S LATEST LOG FOR THIS USER
        // ---------------------------
        let todaysLog = await OptimizedAccessLogs.findOne({
          admin: adminId,
          userId: userId || null,
          date: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ createdAt: -1 }); // IMPORTANT → latest log today

        // ---------------------------
        // BUILD NEW SESSION ENTRY
        // ---------------------------
        const newSession = {
          nvr: nvrId,
          channel: cameraId,
          personName,
          timestamp: timestamp || new Date(),
          images: {
            faceImage: images?.face || "",
            personImage: images?.person || "",
            frameImage: images?.frame || ""
          }
        };

        // ---------------------------
        // CASE 1 — NO DOCUMENT EXISTS TODAY → CREATE NEW
        // ---------------------------
        if (!todaysLog) {
          const created = await OptimizedAccessLogs.create({
            admin: adminId,
            userId: userId || null,
            // A recognized detection (userId present) counts as an identity
            // match — surface it in Tagged Users immediately instead of only
            // via the separate manual tag-user/tag-folder flows.
            tag: false,
            date: startOfDay,
            sessions: [newSession]
          });

          return res.send(Response.userSuccessResp("New access log created", created));
        }

      // ---------------------------
      // CASE 2 — DOCUMENT EXISTS → APPLY TIME DIFFERENCE LOGIC
      // ---------------------------
      const allowedDiff = parseDuration(accessLogsTimeDifference);

      const lastSession = todaysLog?.sessions[todaysLog?.sessions?.length - 1];

      const lastTime = new Date(lastSession.timestamp).getTime();
      const newTime = new Date(newSession.timestamp).getTime();
      const diff = newTime - lastTime;

      if (diff <= allowedDiff) {
        // SAME GROUP → append to existing document. If this session now
        // carries a userId the earlier ones didn't (freshly recognized after
        // being tagged), backfill it onto the doc so it stops showing as
        // Unknown/untagged.
        todaysLog?.sessions?.push(newSession);
        if (userId && !todaysLog.userId) {
          todaysLog.userId = userId;
        }
      } else {
        // NEW GROUP → create a NEW document for today
        const newDoc = await OptimizedAccessLogs.create({
          admin: adminId,
          userId: userId || null,
          tag: false,
          // date: startOfDay,
          sessions: [newSession]
        });

        return res.send(
          Response.userSuccessResp("Access log updated successfully", newDoc)
        );
      }

      await todaysLog.save();

      return res.send(
        Response.userSuccessResp("Access log updated successfully", todaysLog)
      );



    } catch (error) {
      console.log(error);
      next(new AppError(error.message || error, 500));
    }
  }

  async getAccessLogs(req, res, next) {
      try {
        const adminId = req.verified?.userData?.adminId;
        if (!adminId) {
          return res.status(400).json(Response.errorResp("Missing adminId"));
        }

        let { skip = 0, limit = 10, startDate, endDate, searchQuery, departmentIds, channelIds, nvrIds } = req.body;
        skip = Number(skip);
        limit = Number(limit);

        let { sortOrder = "desc", sortField = "lastCreatedAt" } = req.query;

        if (!sortOrder || !sortField) {
          sortOrder = "desc";
          sortField = "lastCreatedAt";
        }

        // --------------------------
        // Validate department IDs
        // --------------------------
        if (departmentIds?.length) {
          const found = await departmentModel.countDocuments({ _id: { $in: departmentIds } });
          if (found !== departmentIds.length) {
            return res.send(Response.errorResp("Incorrect department", "Validation failed"));
          }
        }

        // --------------------------
        // MATCH FILTER
        // --------------------------
        let match = { admin: new ObjectId(adminId) };

        // Date filter
        if (!startDate && !endDate) {
          match.createdAt = {
            $gte: moment.tz("Asia/Kolkata").startOf("day").toDate(),
            $lte: moment.tz("Asia/Kolkata").endOf("day").toDate()
          };
        } else {
          match.createdAt = {};
          if (startDate) match.createdAt.$gte = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
          if (endDate) match.createdAt.$lte = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();
        }

        // --------------------------
        // FETCH RAW DOCUMENTS
        // --------------------------
        let logs = await OptimizedAccessLogs.find(match)
          .populate({
            path: "userId",
            model: "authorizedUsers",
            populate: {
              path: "departmentId",
              model: "Department"
            }
          })
          .lean();

        // --------------------------
        // IN-MEMORY FILTERING
        // --------------------------
        let result = [];

        logs.forEach(doc => {
          if (!doc) return;

          let user = doc.userId;

          // Department Filter
          if (departmentIds?.length) {
            const deptId = String(user?.departmentId?._id || "");
            if (!departmentIds.includes(deptId)) return;
          }

          // Filter sessions inside the doc
          let filteredSessions = doc.sessions || [];

          // NVR filter
          if (nvrIds?.length) {
            filteredSessions = filteredSessions.filter(s => nvrIds.includes(String(s.nvr)));
          }

          // Channel filter
          if (channelIds?.length) {
            filteredSessions = filteredSessions.filter(s => channelIds.includes(String(s.channel)));
          }

          if (filteredSessions.length === 0) return;

          // Search by userName
          if (searchQuery) {
            const name = user?.userName || "";
            if (!name.toLowerCase().includes(searchQuery.toLowerCase())) return;
          }

          // FINAL RESULT FORMAT (Same as OLD Code)
          result.push({
            logId: doc._id,
            admin: doc.admin,
            date: doc.date,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,

            userId: user?._id,
            lastCreatedAt: filteredSessions?.[filteredSessions.length - 1]?.timestamp, // same as old: lastCreatedAt
            sessions: filteredSessions,

            userInfo: {
              _id: user?._id,
              userName: user?.userName,
              email: user?.email,
              phone: user?.phone,
              profilePics: user?.profilePics,
              lastCreatedAt: filteredSessions?.[filteredSessions.length - 1]?.timestamp
            },

            department: {
              _id: user?.departmentId?._id,
              departmentName: user?.departmentId?.departmentName
            }
          });
        });

        // --------------------------
        // SORT LOGIC (same as old)
        // --------------------------
        result.sort((a, b) => {
          const valA = getValue(a, sortField);
          const valB = getValue(b, sortField);

          if (valA === undefined || valB === undefined) return 0;

          if (typeof valA === "string" && typeof valB === "string") {
            return sortOrder === "asc"
              ? valA.localeCompare(valB)
              : valB.localeCompare(valA);
          }

          if (valA instanceof Date && valB instanceof Date) {
            return sortOrder === "asc" ? valA - valB : valB - valA;
          }

          return sortOrder === "asc"
            ? valA > valB ? 1 : -1
            : valA < valB ? 1 : -1;
        });

        // --------------------------
        // PAGINATION
        // --------------------------
        const total = result.length;
        const paginated = result.slice(skip, skip + limit);

        let accessLogsStartDate = await OptimizedAccessLogs.findOne({ admin: new ObjectId(adminId) }).sort({ createdAt: 1 }).select("createdAt");

        // --------------------------
        // RESPONSE
        // --------------------------
        return res.send(
          Response.userSuccessResp("Access logs fetched successfully", {
            accessLogsStartDate,
            total,
            skip,
            limit,
            usersLogs: paginated
          })
        );

  } catch (error) {
    console.log(error);
    next(new AppError(error.message || error, 500));
  }
  }


    async createAccessLogRecord(req,res,next){
     try {
        let body = req.body;
        let { userId, personName, date, timestamp, images ,cameraId,nvrId,adminId, confidenceScore = 0} = body;
        let isAdminExist = await adminModel.findOne({ _id: adminId });
        if(!isAdminExist){
          return res.send(Response.userFailResp("Admin not found","Validation failed!"));
        }

        //check if user exist
        let isUserExist = await userModel.findOne({ _id: userId }).populate("departmentId");

        if(!isUserExist){
          personName 
        }else{
          personName = `${isUserExist.firstName} ${isUserExist.lastName}`;
        }

        //check if camera exist
        let isChannelExist = await channelModel.findOne({ _id: cameraId });
        if(!isChannelExist){
          return res.send(Response.userFailResp("Camera not found","Validation failed!"));
        }
        //check if nvr exist
        let isNvrExist = await nvrModel.findOne({ _id: nvrId });
        if(!isNvrExist){
          return res.send(Response.userFailResp("NVR not found","Validation failed!"));
        }

          //validate request body
          let { value, error } = AccessLogsValidation.createAccessLogsValidate(body);
          if (error) {
            return res.send(Response.userFailResp("Validation Error", error.message));
          }

          
          const startOfDay = moment().utc().startOf("day").toDate();
          const endOfDay   = moment().utc().endOf("day").toDate();


          let socketData = {
          ...(userId && { userId }),
          cameraName:isChannelExist?.name || null,
          cameraId:cameraId || null,
          personName,
          firstName:isUserExist?.firstName || null,
          lastName:isUserExist?.lastName || null,
          profilePics:isUserExist?.profilePics || null,
          department:isUserExist?.departmentId?.departmentName || null,
          ...(timestamp && !isNaN(new Date(timestamp).getTime()) && { timestamp: new Date(timestamp) }),
          images

        }

        await sendPayloadToUser(userId, `accessLogs_${adminId}`, socketData);

        // ---------------------------
        // FIND TODAY'S LATEST LOG FOR THIS USER
        // ---------------------------
        if(isUserExist) {
          let todaysLog = await OptimizedAccessLogs.findOne({
            admin: adminId,
            userId: userId || null,
            date: { $gte: startOfDay, $lte: endOfDay }
          }).sort({ createdAt: -1 }); // IMPORTANT → latest log today
  
          // ---------------------------
          // BUILD NEW SESSION ENTRY
          // ---------------------------
          const newSession = {
            nvr: nvrId,
            channel: cameraId,
            personName,
            timestamp: timestamp || new Date(),
            images: {
              faceImage: images?.face,
              personImage: images?.person,
              frameImage: images?.frame
            },
            confidenceScore: confidenceScore || 0
          };
  
          // ---------------------------
          // CASE 1 — NO DOCUMENT EXISTS TODAY → CREATE NEW
          // ---------------------------
          if (!todaysLog) {
            const created = await OptimizedAccessLogs.create({
              admin: adminId,
              userId: userId || null,
              // Reached only inside the isUserExist branch, so userId is a
              // real recognized identity — mark it tagged immediately.
              tag: false,
              // date: startOfDay,
              sessions: [newSession]
            });
            return res.send(Response.userSuccessResp("New access log created", created));
        }


          // ---------------------------
          // CASE 2 — DOCUMENT EXISTS → APPLY TIME DIFFERENCE LOGIC
          // ---------------------------
          const allowedDiff = parseDuration(accessLogsTimeDifference);

          const lastSession = todaysLog?.sessions[todaysLog?.sessions?.length - 1];

          const lastTime = new Date(lastSession.timestamp).getTime();
          const newTime = new Date(newSession.timestamp).getTime();
          const diff = newTime - lastTime;

          if (diff <= allowedDiff) {
            // SAME GROUP → append to existing document. Backfill userId/tag
            // in case this doc was first created before the person was
            // recognized/tagged (started out as Unknown).
            todaysLog?.sessions?.push(newSession);
            if (!todaysLog.userId) todaysLog.userId = userId;
          } else {
            // NEW GROUP → create a NEW document for today
            const newDoc = await OptimizedAccessLogs.create({
              admin: adminId,
              userId: userId || null,
              tag: false,
              // date: startOfDay,
              sessions: [newSession]
            });

            return res.send(
              Response.userSuccessResp("Access log updated successfully", newDoc)
            );
          }

          await todaysLog.save();

          return res.send(
            Response.userSuccessResp("Access log updated successfully", todaysLog)
          );

        }else if(!isUserExist){
          //For Unknown people create new document
          const newSession = {
            nvr: nvrId,
            channel: cameraId,
            personName,
            timestamp: timestamp || new Date(),
            images: {
              faceImage: images?.face || "",
              personImage: images?.person || "",
              frameImage: images?.frame || ""
            },
            confidenceScore: confidenceScore || 0
          };
          const created = await OptimizedAccessLogs.create({
              admin: adminId,
              userId: userId || null,
              // date: startOfDay,
              sessions: [newSession]
            });
          return res.send(Response.userSuccessResp("New access log created", created));
        }



    }catch(error){
      console.log(error);
      next(new AppError(error.message || error, 500));
    }
  }

async getLogs(req, res, next) {
      try {
        const adminId = req.verified?.userData?.adminId;
        let memberId = req.verified?.userData?.memberId;
        let authorizedChannels = req?.verified?.authorizedChannel?.channels || [];
        let authorizedEmployeeLocations = req?.verified?.authorizedChannel?.employeeLocations || [];

        if (!adminId) {
          return res.status(400).json(Response.errorResp("Missing adminId"));
        }

        let { skip = 0, limit = 10, startDate, endDate, searchQuery, departmentIds, channelIds, nvrIds ,removeUnknown, fromTime, toTime,isExport=false,employeeLocations=[],tag} = req.body;
        const shouldRemoveUnknown = ["true", true, 1, "1", "yes"].includes(removeUnknown);
        skip = Number(skip);
        limit = Number(limit);

        if(employeeLocations?.length){
          employeeLocations = [...authorizedEmployeeLocations,...employeeLocations];
          employeeLocations = [...new Set(employeeLocations)];
        }
        const normalizedEmployeeLocations = [...new Set(
          (employeeLocations || [])
            .map((item) => String(item).trim().toLowerCase())
            .filter(Boolean)
        )];

        let { sortOrder = "desc", sortField = "lastCreatedAt" } = req.query;

        const formattedFromTime = fromTime ? fromTime.padStart(5, "0") : null;
        const formattedToTime = toTime ? toTime.padStart(5, "0") : null;

        let fromDateTime, toDateTime;

        if (startDate && endDate && formattedFromTime && formattedToTime) {
          fromDateTime = moment(startDate)
            .set({
              hour: moment(formattedFromTime, "HH:mm").hour(),
              minute: moment(formattedFromTime, "HH:mm").minute(),
              second: 0,
              millisecond: 0
            })
            .toDate();

          toDateTime = moment(endDate)
            .set({
              hour: moment(formattedToTime, "HH:mm").hour(),
              minute: moment(formattedToTime, "HH:mm").minute(),
              second: 59,
              millisecond: 999
            })
            .toDate();
        }

        if (!sortOrder || !sortField) {
          sortOrder = "desc";
          sortField = "lastCreatedAt";
        }

        if (departmentIds?.length) {
          const found = await departmentModel.countDocuments({ _id: { $in: departmentIds } });
          if (found !== departmentIds.length) {
            return res.send(Response.errorResp("Incorrect department", "Validation failed"));
          }
        }

        // Fetch authorized employees by location
        let authorizedEmployeeIds = [];
        if(employeeLocations?.length){
          authorizedEmployeeIds = await userModel.find({employeeLocationId:{$in:employeeLocations},adminId:new ObjectId(adminId)}).distinct("_id");
        }
        let locationEmployeeIds = [];
        let locationNvrIds = [];
        if (normalizedEmployeeLocations.length) {
          const locationRegexes = normalizedEmployeeLocations.map((item) => new RegExp(`^${item}$`, "i"));
          [locationEmployeeIds, locationNvrIds] = await Promise.all([
            userModel.distinct("_id", {
              adminId: new ObjectId(adminId),
              location: { $in: locationRegexes },
            }),
            nvrModel.distinct("_id", {
              userId: new ObjectId(adminId),
              location: { $in: locationRegexes },
            }),
          ]);
        }
        const authorizedUserIds = shouldRemoveUnknown
          ? await userModel.distinct("_id", { adminId: new ObjectId(adminId) })
          : [];

        // Convert department IDs to ObjectIds
        const deptObjectIds = departmentIds?.length ? departmentIds.map(id => new ObjectId(id)) : [];
        const channelObjectIds = channelIds?.length ? channelIds.map(id => new ObjectId(id)) : [];
        const nvrObjectIds = [
          ...(nvrIds?.length ? nvrIds.map(id => new ObjectId(id)) : []),
          ...locationNvrIds.map((id) => new ObjectId(id)),
        ];
        const authChannelObjectIds = authorizedChannels.map(id => new ObjectId(id));

        // ponytail: with no nvr/channel filter the session $filter below is a
        // no-op ($and of all-true) that still rewrites every doc's sessions
        // array, and the $max after it is what forced a blocking in-memory sort
        // over the whole range. Without it, the stored lastCreatedAt is already
        // exact, so match/sort/skip/limit all come off
        // {admin, lastCreatedAt, createdAt} and only the returned page is read.
        const sessionFilterActive = Boolean(
          nvrObjectIds.length ||
          (memberId !== undefined && authChannelObjectIds.length) ||
          channelObjectIds.length
        );

        // Build aggregation pipeline with optimized session filtering
        const pipeline = [
          {
            $match: {
              admin: new ObjectId(adminId),
              createdAt: {
                $gte: !startDate ? moment.tz("Asia/Kolkata").startOf("day").toDate() : moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate(),
                $lte: !endDate ? moment.tz("Asia/Kolkata").endOf("day").toDate() : moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate()
              },
              // Both the empty-sessions check and the session-time filter read
              // the indexed field when sessions aren't being filtered.
              ...(sessionFilterActive ? {} : {
                lastCreatedAt: fromDateTime && toDateTime
                  ? { $gte: fromDateTime, $lte: toDateTime }
                  : { $ne: null }
              })
            }
          },

          // Remove unknown users if requested
          ...(shouldRemoveUnknown
            ? [{ $match: { userId: { $in: authorizedUserIds.map((id) => new ObjectId(id)) } } }]
            : []),


          // tag: true → tagged only | tag: false → untagged + old docs | tag: null/omitted → all
          ...(tag === null || tag === undefined ? [] : tag ? [{ $match: { tag: true } }] : [{ $match: { $or: [{ tag: false }, { tag: { $exists: false } }] } }]),

          // Filter by authorized locations
          ...(authorizedEmployeeIds.length ? [{ $match: { userId: { $in: authorizedEmployeeIds.map(id => new ObjectId(id)) } } }] : []),

          // Filter sessions using $filter before unwind
          ...(sessionFilterActive ? [
            {
              $addFields: {
                sessions: {
                  $filter: {
                    input: "$sessions",
                    as: "session",
                    cond: {
                      $and: [
                        ...(nvrObjectIds.length ? [{ $in: ["$$session.nvr", nvrObjectIds] }] : [true]),
                        ...(memberId !== undefined && authChannelObjectIds.length ? [{ $in: ["$$session.channel", authChannelObjectIds] }] : [true]),
                        ...(channelObjectIds.length ? [{ $in: ["$$session.channel", channelObjectIds] }] : [true])
                      ]
                    }
                  }
                }
              }
            },

            // Remove docs with no sessions after filtering
            { $match: { "sessions.0": { $exists: true } } },
          ] : []),
        ];

        // Only the filtered path has to recompute lastCreatedAt — filtering
        // sessions can lower the max, so the stored value no longer applies.
        if (sessionFilterActive) {
          pipeline.push({ $addFields: { lastCreatedAt: { $max: "$sessions.timestamp" } } });

          // Time filter
          if (fromDateTime && toDateTime) {
            pipeline.push({ $match: { lastCreatedAt: { $gte: fromDateTime, $lte: toDateTime } } });
          }
        }

        // Add sorting and pagination
        const sortMap = {
          "lastCreatedAt": "lastCreatedAt",
          "userInfo.userName": "userInfo.userName",
          "department.departmentName": "departmentInfo.departmentName"
        };

        const sortField_ = sortMap[sortField] || "lastCreatedAt";
        const sortDir = sortOrder === "asc" ? 1 : -1;

        // Lookup user and department
        const lookupStages = [
          {
            $lookup: {
              from: "authorizedusers",
              localField: "userId",
              foreignField: "_id",
              as: "userInfo"
            }
          },
          { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "departments",
              localField: "userInfo.departmentId",
              foreignField: "_id",
              as: "departmentInfo"
            }
          },
          { $unwind: { path: "$departmentInfo", preserveNullAndEmptyArrays: true } },

          ...(locationEmployeeIds.length
            ? [{ $match: { userId: { $in: locationEmployeeIds.map((id) => new ObjectId(id)) } } }]
            : []),

          // Filter by department
          ...(deptObjectIds.length ? [
            { $match: { "departmentInfo._id": { $in: deptObjectIds } } }
          ] : []),

          // Search filter
          ...(searchQuery ? [
            {
              $match: {
                $or: [
                  { "userInfo.userName": { $regex: searchQuery, $options: "i" } },
                  { "sessions.personName": { $regex: searchQuery, $options: "i" } }
                ]
              }
            }
          ] : []),
        ];

        // The joins are only needed up front when they feed a filter or the
        // sort. Otherwise they run after $skip/$limit, so we join one page of
        // docs instead of every doc in the date range.
        const lookupFirst = deptObjectIds.length > 0 || !!searchQuery || sortField_ !== "lastCreatedAt";
        if (lookupFirst) pipeline.push(...lookupStages);

        // The fast path's $match and $sort line up with
        // {admin, lastCreatedAt, createdAt}, so the planner picks it unaided.
        // Deliberately left unhinted: hinting an index that hasn't been built
        // yet is a hard error, and this query has to stay correct (just slower)
        // during the window before the backfill migration finishes.
        const hintFiltered = (agg) =>
          sessionFilterActive ? agg.hint({ admin: 1, createdAt: -1 }) : agg;

        // Get total count before pagination
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await hintFiltered(OptimizedAccessLogs.aggregate(countPipeline));
        const total = countResult[0]?.total || 0;

        pipeline.push({ $sort: { [sortField_]: sortDir } });

        if(!isExport) {
          pipeline.push({ $skip: skip });
          pipeline.push({ $limit: limit });
        }

        if (!lookupFirst) pipeline.push(...lookupStages);

        // sessions[].channel is stored as a bare ObjectId, but the Access Logs
        // and Tagged Users tables both read sessions[0].channel.name for the
        // Camera column. Resolve it to { _id, name } here. Purely presentational
        // — it feeds no filter and no sort, so it always runs after $skip/$limit
        // and joins the page being returned rather than the whole range.
        pipeline.push(
          {
            $lookup: {
              from: "channels",
              localField: "sessions.channel",
              foreignField: "_id",
              as: "channelInfo"
            }
          },
          {
            $set: {
              sessions: {
                $map: {
                  input: "$sessions",
                  as: "s",
                  in: {
                    $mergeObjects: [
                      "$$s",
                      {
                        channel: {
                          $let: {
                            vars: {
                              ch: {
                                $arrayElemAt: [
                                  {
                                    $filter: {
                                      input: "$channelInfo",
                                      as: "c",
                                      cond: { $eq: ["$$c._id", "$$s.channel"] }
                                    }
                                  },
                                  0
                                ]
                              }
                            },
                            in: { _id: "$$s.channel", name: "$$ch.name" }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        );

        // Add project stage to format response
        pipeline.push({
          $project: {
            logId: "$_id",
            admin: 1,
            date: 1,
            createdAt: 1,
            updatedAt: 1,
            userId: "$userInfo._id",
            lastCreatedAt: 1,
            tag: 1,
            sessions: 1,
            userInfo: {
              _id: "$userInfo._id",
              userName: "$userInfo.userName",
              email: "$userInfo.email",
              phone: "$userInfo.phone",
              profilePics: "$userInfo.profilePics",
              // Both tables render these two; they were never projected, so the
              // Location and Employee ID columns always fell back to '--'.
              location: "$userInfo.location",
              emp_id: "$userInfo.emp_id",
              lastCreatedAt: "$lastCreatedAt"
            },
            department: {
              _id: "$departmentInfo._id",
              departmentName: "$departmentInfo.departmentName"
            }
          }
        });

        const logs = await hintFiltered(OptimizedAccessLogs.aggregate(pipeline));

        let accessLogsStartDate = await OptimizedAccessLogs.findOne({ admin: new ObjectId(adminId) }).sort({ createdAt: 1 }).select("createdAt");

        return res.send(
          Response.userSuccessResp("Access logs fetched successfully", {
            accessLogsStartDate,
            total,
            skip,
            limit,
            usersLogs: logs
          })
        );

  } catch (error) {
      console.log(error);
      next(new AppError(error.message || error, 500));
    }
  }

  async getUserSessionReport(req, res, next) {
  try {
    const { userId, startDate, endDate } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Match condition
    let match = {
      userId: new ObjectId(userId)
    };

    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Fetch logs
    const logs = await OptimizedAccessLogs.find(match)
      .select("sessions userId date")
      .lean();

    // 🔁 Flatten all sessions
    let allSessions = [];

    logs.forEach(log => {
      if (log.sessions?.length) {
        allSessions.push(...log.sessions);
      }
    });

    // 🧠 Sort by timestamp
    allSessions.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    // 🔗 Pair sessions
    let result = [];

    for (let i = 0; i < allSessions.length; i += 2) {
      const checkIn = allSessions[i];
      const checkOut = allSessions[i + 1];

      if (!checkOut) break; // unmatched case

      const inTime = new Date(checkIn.timestamp);
      const outTime = new Date(checkOut.timestamp);

      const durationMs = outTime - inTime;

      result.push({
        checkIn: inTime,
        checkOut: outTime,
        durationMinutes: Math.floor(durationMs / (1000 * 60)),
        durationReadable: formatDuration(durationMs)
      });
    }

    return res.json({
      totalSessions: result.length,
      sessions: result
    });

  } catch (err) {
    next(err);
  }
}

  // async createAccessLogRecord(req,res,next){
  //   try{
  //       let body = req.body;
  //       let { userId, personName, date, timestamp, images ,cameraId,nvrId,adminId} = body;
  //       let isAdminExist = await adminModel.findOne({ _id: adminId });
  //       if(!isAdminExist){
  //         return res.send(Response.userFailResp("Admin not found","Validation failed!"));
  //       }

  //       //check if user exist
  //       let isUserExist = await userModel.findOne({ _id: userId }).populate("departmentId");

  //       if(!isUserExist){
  //         personName 
  //       }else{
  //         personName = `${isUserExist.firstName} ${isUserExist.lastName}`;
  //       }

  //       //check if camera exist
  //       let isChannelExist = await channelModel.findOne({ _id: cameraId });
  //       if(!isChannelExist){
  //         return res.send(Response.userFailResp("Camera not found","Validation failed!"));
  //       }
  //       //check if nvr exist
  //       let isNvrExist = await nvrModel.findOne({ _id: nvrId });
  //       if(!isNvrExist){
  //         return res.send(Response.userFailResp("NVR not found","Validation failed!"));
  //       }

  //         //validate request body
  //         let { value, error } = AccessLogsValidation.createAccessLogsValidate(body);
  //         if (error) {
  //           return res.send(Response.userFailResp("Validation Error", error.message));
  //         }



  //       const startOfDay = moment().utc().startOf("day").toDate();
  //       const endOfDay   = moment().utc().endOf("day").toDate();


  //       let socketData = {
  //       ...(userId && { userId }),
  //       cameraName:isChannelExist?.name || null,
  //       cameraId:cameraId || null,
  //       personName,
  //       firstName:isUserExist?.firstName || null,
  //       lastName:isUserExist?.lastName || null,
  //       profilePics:isUserExist?.profilePics || null,
  //       department:isUserExist?.departmentId?.departmentName || null,
  //       ...(timestamp && !isNaN(new Date(timestamp).getTime()) && { timestamp: new Date(timestamp) }),
  //       images

  //     }

  //     await sendPayloadToUser(userId, `accessLogs_${adminId}`, socketData);

  //         let todaysAccessLogs = await reworkedAccessLogs.findOne({
  //           admin: adminId,
  //           createdAt: { $gte: startOfDay, $lte: endOfDay },
  //         });
          

  //         // 8️⃣ Prepare new session entry
  //         const newSession = {
  //           nvr: nvrId,
  //           channel: cameraId,
  //           personName,
  //           timestamp: timestamp || new Date(),
  //           images: {
  //             faceImage: images?.face || "",
  //             personImage: images?.person || "",
  //             frameImage: images?.frame || "",
  //           },
  //         };
          
  //           // 9️⃣ If no access log found → create one
  //           if (!todaysAccessLogs) {
  //             todaysAccessLogs = new reworkedAccessLogs({
  //               admin: adminId,
  //               date: startOfDay,
  //               usersLogs: [{
  //                 userId: userId || null,
  //                 lastCreatedAt: new Date(),
  //                 sessions: [newSession],
  //               }],
  //             });

  //             await todaysAccessLogs.save();
  //             return res.send(Response.userSuccessResp("New Access Log created", todaysAccessLogs));
  //           }

  //           // Find existing user entry
  //           const existingUser = todaysAccessLogs?.usersLogs?.filter(
  //             (u) => u.userId?.toString() === (userId ? userId.toString() : null)
  //           );

  //           // CASE 1: No user found → create new entry
  //           if (existingUser?.length === 0) {
  //             todaysAccessLogs?.usersLogs?.push({
  //               userId: userId || null,
  //               lastCreatedAt: new Date(),
  //               sessions: [newSession],
  //             });
  //           }
  //           // CASE 2: User exists → check session count
  //           else {
              
  //             const allowedDiff = parseDuration(accessLogsTimeDifference);
  //             const lastUserEntry = existingUser[existingUser?.length - 1];
  //             if (lastUserEntry?.sessions?.length > 0) {
  //               const lastSession = lastUserEntry.sessions[lastUserEntry.sessions.length - 1];

  //               const lastTime = new Date(lastSession.timestamp).getTime();
  //               const newTime  = new Date(newSession.timestamp).getTime();

  //               const diff = newTime - lastTime;

  //               if (diff <= allowedDiff) {
  //                 // Add to existing user's last group (within allowed time window)
  //                 lastUserEntry.sessions.push(newSession);
  //               } else {
  //                 // Time exceeded → create a new group
  //                 todaysAccessLogs?.usersLogs?.push({
  //                   userId: userId || null,
  //                   lastCreatedAt: new Date(),
  //                   sessions: [newSession],
  //                 });
  //               }
  //             }
  //           }

  //           await todaysAccessLogs.save();

  //           // Send success response
  //           return res.send(
  //             Response.userSuccessResp(
  //               "Access log updated successfully",
  //               todaysAccessLogs
  //             )
  //           );


  //   }catch(error){
  //     console.log(error);
  //     next(new AppError(error.message || error, 500));
  //   }
  // }

  // async getLogs(req, res, next) {
  //   try {
  //     const adminId = req.verified?.userData?.adminId;
  //     if (!adminId) {
  //       return res.status(400).json(Response.errorResp("Missing adminId"));
  //     }

  //     let { skip = 0, limit = 10, startDate, endDate, searchQuery, departmentIds, channelIds, nvrIds } = req.body;
  //     skip = Number(skip);
  //     limit = Number(limit);

  //     let { sortOrder = "desc", sortField = "lastCreatedAt" } = req.query;

  //     if(sortOrder===""&&sortField===""){
  //       sortOrder = "desc"
  //       sortField = "lastCreatedAt"
  //     }

  //     // Validate department IDs
  //     if (departmentIds?.length) {
  //       const found = await departmentModel.countDocuments({ _id: { $in: departmentIds } });
  //       if (found !== departmentIds.length) {
  //         return res.send(Response.errorResp("Incorrect department", "Validation failed"));
  //       }
  //     }

  //     // --------------------------
  //     // MATCH FILTER
  //     // --------------------------
  //     const match = { admin: new ObjectId(adminId) };

  //     // Date filter
  //     if (!startDate && !endDate) {
  //       match.createdAt = {
  //         $gte: moment.tz("Asia/Kolkata").startOf("day").toDate(),
  //         $lte: moment.tz("Asia/Kolkata").endOf("day").toDate()
  //       };
  //     } else {
  //       match.createdAt = {};
  //       if (startDate) match.createdAt.$gte = moment.tz(startDate, "Asia/Kolkata").startOf("day").toDate();
  //       if (endDate) match.createdAt.$lte = moment.tz(endDate, "Asia/Kolkata").endOf("day").toDate();
  //     }

  //     // --------------------------
  //     // FETCH RAW DOCUMENTS (NO AGGREGATION)
  //     // --------------------------
  //     let logs = await reworkedAccessLogs
  //       .find(match)
  //       .populate({
  //         path: "usersLogs.userId",
  //         model: "authorizedUsers",
  //         populate: {
  //           path: "departmentId",
  //           model: "Department"
  //         }
  //       })
  //       .lean();


  //     // --------------------------
  //     // IN-MEMORY FILTERING
  //     // --------------------------
  //     let result = [];

  //     logs.forEach(log => {
  //       log.usersLogs.forEach(userLog => {
  //         if (!userLog) return;

  //         // Filter by department
  //         if (departmentIds?.length) {
  //           const deptId = String(userLog?.userId?.departmentId?._id || "");
  //           if (!departmentIds.includes(deptId)) return;
  //         }

  //         // Filter Sessions
  //         let filteredSessions = userLog.sessions || [];

  //         // NVR Filter
  //         if (nvrIds?.length) {
  //           filteredSessions = filteredSessions.filter(s =>
  //             nvrIds.includes(String(s.nvr))
  //           );
  //         }

  //         // Channel Filter
  //         if (channelIds?.length) {
  //           filteredSessions = filteredSessions.filter(s =>
  //             channelIds.includes(String(s.channel))
  //           );
  //         }

  //         if (filteredSessions.length === 0) return;

  //         // Search filter (on userName)
  //         if (searchQuery) {
  //           const name = userLog.userId?.userName || "";
  //           if (!name.toLowerCase().includes(searchQuery.toLowerCase())) return;
  //         }
          

  //         // Push final formatted object
  //         result.push({
  //           logId: log._id,
  //           admin: log.admin,
  //           date: log.date,
  //           createdAt: log.createdAt,
  //           updatedAt: log.updatedAt,
  //           userId: userLog.userId?._id,
  //           lastCreatedAt: userLog.lastCreatedAt,
  //           sessions: filteredSessions,
  //           userInfo: {
  //             _id: userLog.userId?._id,
  //             userName: userLog.userId?.userName,
  //             email: userLog.userId?.email,
  //             phone: userLog.userId?.phone,
  //             profilePics: userLog.userId?.profilePics,
  //             lastCreatedAt:userLog.userId?.lastCreatedAt
  //           },
  //           department: {
  //             _id: userLog.userId?.departmentId?._id,
  //             departmentName: userLog.userId?.departmentId?.departmentName
  //           }
  //         });
  //       });
  //     });

  //     // --------------------------
  //     // SORT & PAGINATION
  //     // --------------------------
  //     result.sort((a, b) => {
  //       const valA = getValue(a, sortField);
  //       const valB = getValue(b, sortField);

  //       // Handle missing values
  //       if (valA === undefined || valB === undefined) return 0;

  //       // String sort
  //       if (typeof valA === "string" && typeof valB === "string") {
  //         return sortOrder === "asc"
  //           ? valA.localeCompare(valB)
  //           : valB.localeCompare(valA);
  //       }

  //       // Date sort
  //       if (valA instanceof Date && valB instanceof Date) {
  //         return sortOrder === "asc"
  //           ? valA - valB
  //           : valB - valA;
  //       }

  //       // Number or fallback
  //       return sortOrder === "asc"
  //         ? valA > valB ? 1 : -1
  //         : valA < valB ? 1 : -1;
  //     });


  //     const total = result.length;
  //     const paginated = result.slice(skip, skip + limit);

  //     let accessLogsStartDate = await reworkedAccessLogs.findOne().sort({ createdAt: 1 }).select("createdAt");

  //     if(result?.length===0){
  //       return res.send(
  //         Response.userFailResp("No Access Logs Found", {
  //         accessLogsStartDate,
  //         total,
  //         skip,
  //         limit,
  //         usersLogs: paginated,
  //       }))
  //     }

  //     // --------------------------
  //     // RESPONSE
  //     // --------------------------
  //     return res.send(
  //       Response.userSuccessResp("Access logs fetched successfully", {
  //         accessLogsStartDate,
  //         total,
  //         skip,
  //         limit,
  //         usersLogs: paginated,
  //       })
  //     );
  //   } catch (error) {
  //     console.log(error);
  //     next(new AppError(error.message || error, 500));
  //   }
  // }


  
  
  
}
  
const parseDuration = (duration) => {
  // Handle numeric input (treat as milliseconds)
  if (typeof duration === 'number') {
    return duration;
  }

  const value = parseInt(duration);
  if (duration.endsWith("s")) return value * 1000;         // seconds
  if (duration.endsWith("m")) return value * 60 * 1000;    // minutes
  if (duration.endsWith("h")) return value * 60 * 60 * 1000; // hours
  return value; // fallback (already ms)
};

const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
};

const getValue = (obj, path) => {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

export default new AccessLogsService();
