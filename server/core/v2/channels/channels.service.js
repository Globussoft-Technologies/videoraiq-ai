import Channel from "./channels.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import NVR from "../NVR/nvr.model.js";
import channelsValidate from "./channels.validate.js";
import mongoose from "mongoose";
import { decrypt } from "../../../utils/cryptoUtils.js";
import DigestFetch from "digest-fetch";
import { parseXml } from "../../../utils/xmlParse.js";
import {
  DETECTION_TYPES,
  toPopulateDetections,
} from "../../../constants/detectionTypes.js";
import { DetectionSetting } from "../detectionSettings/detectionSettings.model.js";
import DeleteService from "../../../services/delete.service.js";
import AuthorizedUsers from "../authorizedUsers/authorizedUsers.model.js";
import {
  buildRTSPUrl,
  buildStreamingUrl,
  generatePlayBackUrl,
  getStreamingUrl,
  killCurrentPlayBack,
} from "../../../utils/rtspStream.js";
import adminModel from "../admin/admin.model.js";
import departmentsModel from "../departments/departments.model.js";
import pythonService from "../../../services/python.service.js";
import DetectionSettingService from "../detectionSettings/detectionSettings.service.js";
import DetectionSettingsValidation from "../detectionSettings/detectionSettings.validate.js";
import Recipient from "../verifyRecipients/recipients.model.js";
import config from "config"
const APP_ENV = config.get("APP_ENV");
const rtsp_host = config.get("RTSPStream.host");

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim());

const resolveAdminObjectId = async ({
  adminId,
  userId,
  channelUserId,
}) => {
  if (isMongoObjectId(adminId)) return String(adminId);

  const resolvedUserId = [userId, channelUserId]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!resolvedUserId) return adminId ? String(adminId) : undefined;

  const admin = await adminModel.findOne({ user_id: resolvedUserId }).select("_id").lean();
  return admin?._id ? String(admin._id) : (adminId ? String(adminId) : undefined);
};

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCaseInsensitiveLocationMatch(values = []) {
  const normalized = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

  if (!normalized.length) return { $in: [] };
  return {
    $in: normalized.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i")),
  };
}

const updateModelThresholds = async (detectionSetting, backendResponse) => {
  const thresholds = DetectionSettingsValidation.extractModelThresholds(
    detectionSetting?.settingType,
    backendResponse?.model_thresholds,
  );

  if (!Object.keys(thresholds).length) return;

  const currentModelThresholds =
    detectionSetting.modelThresholds?.toObject?.()
    || detectionSetting.modelThresholds
    || {};

  detectionSetting.modelThresholds = {
    ...currentModelThresholds,
    ...thresholds,
  };
  detectionSetting.markModified("modelThresholds");
  await detectionSetting.save();
};

class ChannelService {
  async updateChannel(req, res, _next) {
    try {
      const cameraId = req.params.id;
      const updates = { ...req.body };

      let existingChannel = await Channel.findById(cameraId);
      if (!existingChannel) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }

      const detectionFields = Object.keys(DETECTION_TYPES);

      if (updates?.detections) {
        const detectionFields = Object.keys(DETECTION_TYPES);

        for (const field of detectionFields) {
          const updateValue = updates.detections[field];

          if (
            updateValue !== undefined &&
            typeof updateValue.enabled === "boolean"
          ) {
            const linkedSettingId = existingChannel.detections?.[field]?.id;

            // ✅ 1. If enabling but no linked setting, throw error
            if (updateValue.enabled === true && !linkedSettingId) {
              return res
                .status(400)
                .json(
                  Response.userFailResp(
                    `Cannot enable ${DETECTION_TYPES[field]}: No Detection Setting is linked to this channel.`
                  )
                );
            }

            // ✅ 2. Update the enabled flag in DetectionSetting
            if (linkedSettingId) {
              existingChannel.detections[field].enabled = updateValue?.enabled;
            }
          }
        }

        delete updates.detections; // prevent overwrite
      }

      if (
        typeof updates?.control === "number" &&
        (updates.control === 0 || updates.control === 1)
      ) {
        const newEnabledState = updates.control === 1;

        for (const field of detectionFields) {
          if (existingChannel.detections?.[field]?.id) {
            existingChannel.detections[field].enabled = newEnabledState;
          }
        }
      }

      if ("profile" in updates) {
        if (updates.profile === null || updates.profile === "") {
          // User wants to remove profile
          existingChannel.profile = undefined; // or null, based on schema
        } else {
          // User provided a new profile value
          existingChannel.profile = updates.profile;
        }
        delete updates.profile;
      }

      if ("customName" in updates) {
        if (updates.customName === null || updates.customName === "") {
          existingChannel.customName = undefined; // or null, depending on your schema default
        } else {
          existingChannel.customName = updates.customName;
        }
        delete updates.customName;
      }

      if (Array.isArray(updates?.department) && updates.department.length > 0) {
        existingChannel.department = updates.department;
        delete updates.department;
      }

      if (updates?.checkType) {
        const allowedTypes = ["checkin", "checkout", "none"];
        if (!allowedTypes.includes(updates.checkType)) {
          return res
            .status(400)
            .json(Response.userFailResp("Invalid checkType value"));
        }

        if (String(existingChannel.userId) === "32") {
          return res
            .status(403)
            .json(Response.userFailResp("This operation is not allowed."));
        }

        const attendanceAdminId = await resolveAdminObjectId({
          adminId: req?.verified?.userData?.adminId,
          userId: req?.verified?.userData?.user_id,
          channelUserId: existingChannel?.userId,
        });

        existingChannel.checkType = updates.checkType;

        // if (updates.checkType !== "none") {
        if (
          updates.checkType === "checkin" ||
          updates.checkType === "checkout"
        ) {
          await pythonService.registerChannel(
            existingChannel,
            updates.checkType,
            attendanceAdminId
          );
        }

        if (updates.checkType === "none") {
          await pythonService.stopDetection(cameraId, attendanceAdminId);
        }

        delete updates.checkType;
      }

      if (updates?.alerts?.length) {
        
        const validRecipients = await Recipient.find({
          _id: { $in: updates.alerts.map(id => new mongoose.Types.ObjectId(id)) },
          verified: true
        }).select("_id");
        
        if (validRecipients.length !== updates.alerts.length) {
          return res
            .status(400)
            .json(Response.userFailResp("Invalid alert IDs provided"));
        }

        const alerts = validRecipients.map(r => r._id);
        existingChannel.alerts = alerts;
        delete updates.alerts;
      }
      // ✅ Calculate final control state
      // const anyEnabled = detectionFields.some(
      //   (field) => existingChannel.detections?.[field]?.enabled === true
      // );
      // existingChannel.control = anyEnabled ? 1 : 0;

      // ✅ Apply other updates
      Object.assign(existingChannel, updates);

      
      
      const updatedCamera = await existingChannel.save();

      return res.status(200).json(
        Response.userSuccessResp("Channel updated successfully", {
          channel: updatedCamera,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update channel", error.message));
    }
  }

  async getAllChannels(req, res, _next) {
    try {
      let { user_id, adminId, memberId } = req?.verified?.userData;
      let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
      const {
        nvrId,
        _id,
        search,
        skip = 0,
        limit = 6,
        location = "",
        department = "",
        camType = "",
        engines = "",
      } = req.query;

      let adminData = await adminModel.findOne({ _id: adminId });
      user_id = adminData?.user_id;

      if (!user_id) {
        return res
          .status(400)
          .json(Response.errorResp("Missing required userId"));
      }
      // let nvrData = {};

      const filter = { userId: user_id };

      if (camType) {
        const types = camType.split(",").map((t) => t.trim());

        filter.checkType = types.length === 1 ? types[0] : { $in: types };
      }

      if (engines) {
        const selectedEngines = (Array.isArray(engines) ? engines : engines.split(","))
          .map((engine) => String(engine || "").trim())
          .filter(Boolean)
          .filter((engine) => Object.prototype.hasOwnProperty.call(DETECTION_TYPES, engine));

        if (selectedEngines.length > 0) {
          filter.$and = [
            ...(Array.isArray(filter.$and) ? filter.$and : []),
            {
              $or: selectedEngines.map((engine) => ({
                [`detections.${engine}.enabled`]: true,
              })),
            },
          ];
        }
      }

      if (_id) {
        const ids = Array.isArray(_id) ? _id : _id.split(",");
        filter._id = { $in: ids };
      }

      if (nvrId) {
        const nvrIds = Array.isArray(nvrId) ? nvrId : nvrId.split(",");
        filter.nvrId = { $in: nvrIds };
        // const nvr = await NVR.findById(nvrId).lean();
        // nvrData = nvr || {};
      }

      // if (search) {
      //   const searchRegex = new RegExp(search, "i");
      //   filter.$or = [{ name: searchRegex }, { customName: searchRegex }];
      // }

      if (search) {
        const searchRegex = new RegExp(search, "i");

        // 1️⃣ Match NVRs by name or location
        const matchedNvrs = await NVR.find({
          userId: user_id,
          $or: [{ nvrName: searchRegex }, { location: searchRegex }],
        })
          .select("_id")
          .lean();

        const matchedNvrIds = matchedNvrs.map((n) => n._id.toString());

        // 2️⃣ Match Departments by name
        const matchedDepartments = await departmentsModel
          .find({
            departmentName: searchRegex,
          })
          .select("_id")
          .lean();

        const matchedDeptIds = matchedDepartments.map((d) => d._id.toString());

        // 3️⃣ Combine all searchable fields
        filter.$or = [
          { name: searchRegex }, // Channel name
          { customName: searchRegex }, // Custom channel name
          ...(matchedNvrIds.length > 0
            ? [{ nvrId: { $in: matchedNvrIds } }]
            : []), // NVR name or location
          ...(matchedDeptIds.length > 0
            ? [{ department: { $in: matchedDeptIds } }]
            : []), // Department name
        ];
      }

      if (location && location !== "") {
        const locations = Array.isArray(location)
          ? location
          : location.split(",");

        const nvrs = await NVR.find({
          location: buildCaseInsensitiveLocationMatch(locations),
          userId: user_id,
        })
          .select("_id")
          .lean();

        if (nvrs.length === 0) {
          return res.status(200).json(
            Response.userSuccessResp("No channels found for this location", {
              total: 0,
              channels: [],
            })
          );
        }

        const locationNvrIds = nvrs.map((n) => n._id.toString());

        // ✅ if nvrId also provided, intersect both
        if (nvrId) {
          const inputNvrIds = (
            Array.isArray(nvrId) ? nvrId : nvrId.split(",")
          ).map(String);
          const validNvrIds = inputNvrIds.filter((id) =>
            locationNvrIds.includes(id)
          );

          if (validNvrIds.length === 0) {
            // No overlap between provided nvrId and location
            return res.status(200).json(
              Response.userSuccessResp(
                "No channels found for given NVR and location",
                {
                  total: 0,
                  channels: [],
                }
              )
            );
          }

          filter.nvrId = { $in: validNvrIds };
        } else {
          filter.nvrId = { $in: locationNvrIds };
        }
      }

      if (department && department !== "") {
        const deptIds = Array.isArray(department)
          ? department
          : department.split(",");
        filter.department = { $in: deptIds };
      }

      if (authorizedChannel.length > 0 && memberId) {
        if (filter._id) {
          // Convert filter IDs to ObjectId
          const filterIds = filter._id.$in.map(
            (id) => new mongoose.Types.ObjectId(id)
          );

          // Intersect
          const finalIds = authorizedChannel.filter((id) =>
            filterIds.some((fId) => fId.equals(id))
          );

          filter._id = { $in: finalIds };
        } else {
          filter._id = { $in: authorizedChannel };
        }
      }

      // Step 1: Fetch channels with top-level populate and lean
      const channels = await Channel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate("nvrId")
        .populate("profile")
        .populate(toPopulateDetections)
        .populate("department")
        .lean();

      // Step 2: Collect all authorisedUser IDs
      const userIdsSet = new Set();

      channels.forEach((channel) => {
        const settingsList = [
          channel?.detections?.loiteringWithAuthSettings,
          channel?.detections?.unauthorizedAccessSettings,
          channel?.detections?.lineCrossingSettings,
        ];

        for (const settings of settingsList) {
          const authorisedUsers = settings?.settings?.authorisedUsers || [];
          authorisedUsers.forEach((id) => userIdsSet.add(id.toString()));
        }
      });

      const userIds = Array.from(userIdsSet);
      const authorisedUsersMap = {};

      // Step 3: Fetch all authorisedUsers in one query
      if (userIds.length > 0) {
        const authorisedUsers = await AuthorizedUsers.find({
          _id: { $in: userIds },
        }).lean();
        authorisedUsers.forEach((user) => {
          authorisedUsersMap[user._id.toString()] = user;
        });
      }

      // Step 4: Replace IDs with full user objects
      channels.forEach((channel) => {
        const settingsList = [
          channel?.detections?.loiteringWithAuthSettings,
          channel?.detections?.unauthorizedAccessSettings,
          channel?.detections?.lineCrossingSettings,
        ];

        for (const settings of settingsList) {
          if (settings?.settings?.authorisedUsers) {
            settings.settings.authorisedUsers =
              settings.settings.authorisedUsers.map(
                (id) => authorisedUsersMap[id.toString()] || id
              );
          }
        }
      });

      const total = await Channel.countDocuments(filter);

      // Append streamingUrl
      const enrichedChannels = await Promise.all(
        channels.map(async (channel) => {
          const streamingUrl = await buildStreamingUrl(channel.nvrId, channel);
          // const nvr = channel.nvrId;

          // const uid = `${nvr?._id}-${channel?._id}`;
          // const streamEndpoint = channel?.streamEndpoint;
          // const mainStream =
          //   channel?.rtspChannels?.length > 0 ? channel.rtspChannels[0].id : "";

          // const rtspUrl = `rtsp://${nvr.username}:${decrypt(
          //   nvr.password
          // )}@${decrypt(nvr.ip)}:${nvr.rtspPort}${streamEndpoint}${mainStream}`;

          // !old
          // const rtspUrl = buildRTSPUrl(nvr, channel, "main");
          // const streamingUrl = await getStreamingUrl(uid, rtspUrl);

          // !new
          // const streamingUrl = `${nvr?.domain}/${channel?.streamingPath}`;

          return {
            ...channel,
            streamingUrl,
          };
        })
      );

      return res.status(200).json(
        Response.userSuccessResp("Channels retrieved successfully", {
          total,
          channels: enrichedChannels,
          // nvr: nvrData,
        })
      );
    } catch (err) {
      logger.error(err);
      return res
        .status(500)
        .json(
          Response.notFoundResp("Failed to retrieve channels", err.message)
        );
    }
  }

  async getChannelById(req, res, _next) {
    try {
      let { user_id, adminId } = req?.verified?.userData;
      const { id } = req.params;
      if (!id) {
        return res.status(400).json(Response.errorResp("Missing required id"));
      }

      let adminData = await adminModel.findOne({ _id: adminId });
      user_id = adminData?.user_id;

      const channel = await Channel.findOne({ _id: id })
        .populate("nvrId")
        .populate({
          path: "profile",
          populate: [
            { path: "createdBy" },
            { path: "defaultDetectionSettings.authorisedUsers" },
          ],
        })
        .populate(toPopulateDetections)
        .populate("department")
        .lean();
      if (!channel) {
        return res.status(404).json(Response.errorResp("Channel not found"));
      }
      return res.status(200).json(
        Response.userSuccessResp("Channel retrieved successfully", {
          channel,
        })
      );
    } catch (err) {
      logger.error(err);
      return res
        .status(500)
        .json(Response.notFoundResp("Failed to retrieve channel", err.message));
    }
  }

  async getChannelsByNvr(req, res, _next) {
    try {
      const isSystem = req?.verified?.userData?.system || false;
      let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
      let memberId = req?.verified?.userData?.memberId;

      const { nvrId } = req.params;
      if (!nvrId) {
        return res
          .status(400)
          .json(Response.errorResp("Missing required nvrId"));
      }
      // Build query dynamically
      const query = { nvrId };
      if (memberId && !isSystem) {
        query._id = { $in: authorizedChannel };
      }

      const channels = await Channel.find(query)
        .populate(toPopulateDetections)
        .lean();
      const nvr = await NVR.findById(nvrId);

      // const nvrUsername = nvr?.username;
      // const nvrPassword = decrypt(nvr?.password);
      // const nvrIp = decrypt(nvr?.ip);
      // const rtspPort = nvr?.rtspPort;

      const enrichedChannels = await Promise.all(
        channels.map(async (channel) => {
          // const uid = `${nvr?._id}-${channel?._id}`;
          // const streamEndpoint = channel?.streamEndpoint;
          // const mainStream =
          //   channel?.rtspChannels.length > 0
          //     ? channel?.rtspChannels[0]?.id
          //     : "";

          // !old
          // const rtspUrl = buildRTSPUrl(nvr, channel, "main");
          // const streamingUrl = await getStreamingUrl(uid, rtspUrl);

          // !new
          // const streamingUrl = `${nvr?.domain}/${channel?.streamingPath}`;

          const streamingUrl = await buildStreamingUrl(nvr, channel);
          return {
            ...channel,
            streamingUrl,
          };
        })
      );

      let modifiedChannels = enrichedChannels;
      if (isSystem) {
        modifiedChannels = enrichedChannels.map((channel) => {
          let detections = channel?.detections
            ? Object.values(channel?.detections)
            : [];
          if (detections.length > 0) {
            detections = detections.map((detection) => {
              if (detection?.id) {
                return {
                  ...detection.id,
                  settings: {
                    ...detection?.id?.settings,
                    referencePoints:
                      detection?.id?.settings?.referencePoints?.[
                        channel?._id
                      ] || {},
                  },
                  enabled: detection?.enabled || false,
                };
              }
              return detection;
            });
          }
          return {
            cameraId: channel?._id,
            name: channel?.name,
            streamingUrl: channel?.streamingUrl,
            nvrId: channel?.nvrId,
            detections,
            userId: channel?.userId,
          };
        });
      }

      const finalPayload = {
        channels: modifiedChannels,
      };

      if (!isSystem) {
        finalPayload.nvr = nvr;
      }

      return res
        .status(200)
        .json(
          Response.userSuccessResp(
            "Channels retrieved successfully",
            finalPayload
          )
        );
    } catch (err) {
      console.log(err);
      logger.error(err);
      return res
        .status(500)
        .json(Response.errorResp("Failed to retrieve channels", err.message));
    }
  }

  async deleteChannel(req, res, _next) {
    try {
      const cameraId = req.params.id;

      const deletedCamera = await Channel.findByIdAndDelete(cameraId);
      // const deletedCamera = await DeleteService.deleteChannel(cameraId);

      if (!deletedCamera) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }
      return res
        .status(200)
        .json(Response.userSuccessResp("Channels deleted successfully"));
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.notFoundResp("Failed to delete channel", error.message));
    }
  }

  async bulkUpdateChannels(req, res, _next) {
    try {
      const { ids, inReview, control, profile } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json(Response.userFailResp("Channel IDs are required in an array."));
      }

      const updateFields = {};
      // if (typeof inReview === "boolean") updateFields["inReview"] = inReview;
      if ([0, 1].includes(control)) updateFields["control"] = control;

      if (profile) updateFields["profile"] = profile;

      if (Object.keys(updateFields).length === 0) {
        return res
          .status(400)
          .json(Response.userFailResp("No valid fields provided to update."));
      }

      const bulkOps = [];

      const channels = await Channel.find({ _id: { $in: ids } });

      for (const channel of channels) {
        const update = { $set: { ...updateFields } };

        if ([0, 1].includes(control)) {
          const updatedDetections = {};
          const detections = channel.detections || {};

          for (const key of Object.keys(detections)) {
            const detection = detections[key];
            if (detection?.id) {
              updatedDetections[key] = {
                ...detection,
                enabled: control === 1,
              };
            }
          }

          update.$set["detections"] = updatedDetections;
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: channel._id },
            update,
          },
        });
      }

      if (bulkOps.length === 0) {
        return res
          .status(404)
          .json(Response.userFailResp("No matching channels found."));
      }

      const result = await Channel.bulkWrite(bulkOps);

      return res.status(200).json(
        Response.userSuccessResp("Channels updated successfully", {
          modifiedCount: result.modifiedCount,
          channels: result,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(
          Response.notFoundResp("Failed to update channels", error.message)
        );
    }
  }
  async updateChannelConfiguration(req, res, _next) {
    try {
      const { id: cameraId, detectionKey } = req.query;
      const updates = req.body;

      let { value, error } = channelsValidate.validateUpdateChannelConfig(
        updates.settings
      );
      if (error)
        return res.send(Response.userFailResp("Validation Failed", error));

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(cameraId)) {
        return res.send(
          Response.userFailResp("Validation Failed", "Invalid camera ID")
        );
      }

      const updatePath = `detections.${detectionKey}`;

      const updateFields = {
        [`${updatePath}.enabled`]: updates.enabled,
        [`${updatePath}.settings.videoLinkRequirement`]:
          updates.settings.videoLinkRequirement,
        [`${updatePath}.settings.video_min_length`]:
          updates.settings.video_min_length,
        [`${updatePath}.settings.video_max_length`]:
          updates.settings.video_max_length,
        [`${updatePath}.settings.level_of_importance`]:
          updates.settings.level_of_importance,
        [`${updatePath}.settings.alertThreshold`]:
          updates.settings.alertThreshold,
        [`${updatePath}.settings.faceAuth`]: updates.settings.faceAuth,
        [`${updatePath}.settings.videoResolution`]:
          updates.settings.videoResolution,
        [`${updatePath}.settings.referencePoints`]:
          updates.settings.referencePoints || {},
      };

      // Update and return the updated detection config only
      const updatedChannel = await Channel.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(cameraId) },
        { $set: updateFields },
        {
          new: true,
          projection: { [`detections.${detectionKey}`]: 1, _id: 0 },
        }
      );

      if (!updatedChannel) {
        return res.send(
          Response.userFailResp("Validation Failed", "Channel not found")
        );
      }

      return res.status(200).json(
        Response.userSuccessResp("Channel updated successfully", {
          updatedDetection: updatedChannel.detections?.[detectionKey] || null,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update channel", error.message));
    }
  }

  async getPlaybackUrl(req, res, _next) {
    try {
      const { channelId, startTime, endTime, sessionId } = req.body;

      if (!channelId || !startTime || !sessionId) {
        return res
          .status(400)
          .json(Response.userFailResp("Missing required parameters"));
      }

      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res
          .status(400)
          .json(Response.userFailResp("Invalid channel ID"));
      }

      const channel = await Channel.findById(channelId);
      if (!channel || !channel.nvrId) {
        return res
          .status(404)
          .json(Response.notFoundResp("Channel or NVR not found"));
      }

      const nvr = await NVR.findById(channel.nvrId);
      if (!nvr) {
        return res.status(404).json(Response.notFoundResp("NVR not found"));
      }

      const brand = (nvr.brand || "").toLowerCase();

      // Tiandy: build RTSP playback URL directly from NVR — no external media server needed
      if (brand === "tiandy") {
        const ip = decrypt(nvr.ip);
        const username = nvr.username || "admin";
        const password = decrypt(nvr.password);
        const rtspPort = nvr.rtspPort || 554;
        const chId = channel.channelId;
        // normalise compact format 20260611T000000Z → 2026-06-11T00:00:00Z
        const normalise = (t) => /^\d{8}T\d{6}Z$/.test(t)
          ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T${t.slice(9,11)}:${t.slice(11,13)}:${t.slice(13,15)}Z`
          : t;
        const start = new Date(normalise(startTime)).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
        const end   = new Date(normalise(endTime)).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
        const playbackUrl = `rtsp://${username}:${password}@${ip}:${rtspPort}/${chId}/1?starttime=${start}&endtime=${end}`;
        return res.status(200).json(
          Response.userSuccessResp("Playback URL retrieved successfully", { playbackUrl })
        );
      }

      const camera_id = APP_ENV === 'local' ? channel?.localChannelId :`${channel.nvrId}-${channel._id}`;

      // const nvrId = channel.nvrId;
      // const allChannels = await Channel.find({ nvrId });
      // await Promise.all(
      //   allChannels.map((ch) => killCurrentPlayBack(`${ch.nvrId}-${ch._id}`))
      // );
      const rtspUrl = await generatePlayBackUrl(
        sessionId,
        camera_id,
        startTime,
        endTime,
        channel?.userId
      );

      return res.status(200).json(
        Response.userSuccessResp("Playback URL retrieved successfully", {
          playbackUrl: APP_ENV === 'local' ? `${rtsp_host}/${rtspUrl}` : rtspUrl,
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(
          Response.errorResp("Failed to retrieve playback URL", error.message)
        );
    }
  }
  async getPlaybackTimeline(req, res, _next) {
    try {
      const { nvrId, cameraId, channel, startTime, endTime } = req.body;
      if (!nvrId || !cameraId || !channel || !startTime || !endTime) {
        return res
          .status(400)
          .json(Response.userFailResp("Missing required fields"));
      }

      const nvr = await NVR.findById(nvrId);
      const camera = await Channel.findById(cameraId);

      if (!nvr || !camera) {
        return res
          .status(404)
          .json(Response.notFoundResp("NVR or Camera not found"));
      }

      const username = nvr.username || "admin";
      const password = decrypt(nvr.password);
      const ip = decrypt(nvr.ip);
      const brand = (nvr.brand || "").toLowerCase(); // hikvision, dahua, prama
      const port = nvr?.port || 80;

      const client = new DigestFetch(username, password);

      // Format start and end time
      const formattedStart = new Date(startTime).toISOString();
      const formattedEnd = new Date(endTime).toISOString();

      // Build XML for Hikvision
      const hikvisionXml = `<?xml version="1.0" encoding="utf-8"?>
        <CMSearchDescription>
          <searchID>${crypto.randomUUID()}</searchID>
          <trackList><trackID>${channel}</trackID></trackList>
          <timeSpanList>
            <timeSpan>
              <startTime>${formattedStart}</startTime>
              <endTime>${formattedEnd}</endTime>
            </timeSpan>
          </timeSpanList>
          <maxResults>100</maxResults>
          <searchResultPostion>0</searchResultPostion>
          <metadataList>
            <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
          </metadataList>
        </CMSearchDescription>`;

      let url = "";
      let headers = {};
      let body = "";

      if (brand === "hikvision" || brand === "prama" || brand === "tiandy") {
        url = `http://${ip}:${port}/ISAPI/ContentMgmt/search`;
        headers = { "Content-Type": "application/xml" };
        body = hikvisionXml;
      } else if (brand === "dahua") {
        // Implement Dahua-specific logic here
        return res
          .status(501)
          .json(Response.userFailResp("Dahua support not implemented yet"));
      } else {
        return res.status(400).json(Response.userFailResp("Unsupported brand"));
      }

      const response = await client.fetch(url, {
        method: "POST",
        headers,
        body,
      });

      const responseText = await response.text();
      const parsedXml = await parseXml(responseText);

      return res.status(200).json(
        Response.userSuccessResp("Playback timeline fetched successfully", {
          timeline: parsedXml,
        })
      );
    } catch (error) {
      logger.error("Error in getPlaybackTimeline", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to retrieve playback timeline",
            error.message
          )
        );
    }
  }
  async getPlaybackWithFilters(req, res, _next) {
    try {
      const { filter } = req.query;
      let memberId = req?.verified?.userData?.memberId;

      let { user_id, adminId } = req?.verified?.userData;
      let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
      let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
      let authorizedDepartments =
        req?.verified?.authorizedChannel?.departmentIds || [];

      if (!filter) {
        return res
          .status(400)
          .json(Response.userFailResp("Missing required filter parameters"));
      }
      if (!memberId) {
        if (filter === "locations") {
          let Locations = await NVR.find({ userId: user_id }).select(
            "_id location"
          );
          return res.send(
            Response.SuccessResp("Locations fetched successfully", Locations)
          );
        }
        if (filter === "departments") {
          let Departments = await departmentsModel
            .find({ adminId })
            .select("_id departmentName");
          return res.send(
            Response.SuccessResp(
              "Departments fetched successfully",
              Departments
            )
          );
        }
        if (filter === "nvrs") {
          let NVRs = await NVR.find({ userId: user_id }).select(
            "_id nvrName location model departmentIds"
          );
          return res.send(
            Response.SuccessResp("NVRs fetched successfully", NVRs)
          );
        }
        if (filter === "channels") {
          let Channels = await Channel.find({ userId: user_id }).select(
            "_id name nvrId"
          );
          return res.send(
            Response.SuccessResp("Channels fetched successfully", Channels)
          );
        }
      } else {
        if (filter === "locations") {
          let Locations = await NVR.find({
            _id: { $in: authorizedNVRs },
          }).select("_id location");
          return res.send(
            Response.SuccessResp("Locations fetched successfully", Locations)
          );
        }
        if (filter === "departments") {
          let Departments = await departmentsModel
            .find({ _id: { $in: authorizedDepartments } })
            .select("_id departmentName");
          return res.send(
            Response.SuccessResp(
              "Departments fetched successfully",
              Departments
            )
          );
        }
        if (filter === "nvrs") {
          let NVRs = await NVR.find({ _id: { $in: authorizedNVRs } }).select(
            "_id nvrName location model departmentIds"
          );
          return res.send(
            Response.SuccessResp("NVRs fetched successfully", NVRs)
          );
        }
        if (filter === "channels") {
          let Channels = await Channel.find({
            _id: { $in: authorizedChannel },
          }).select("_id name nvrId");
          return res.send(
            Response.SuccessResp("Channels fetched successfully", Channels)
          );
        }
      }
    } catch (error) {
      logger.error("Error in getPlaybackWithFilters", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to retrieve playback with filters",
            error.message
          )
        );
    }
  }

  async getFilterAllChannels(req, res, _next) {
    try {
      let { user_id, adminId, memberId } = req?.verified?.userData;
      let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
      const {
        nvrId,
        _id,
        search,
        location = "",
        department = "",
        camType = "",
      } = req.query;

      let adminData = await adminModel.findOne({ _id: adminId });
      user_id = adminData?.user_id;

      if (!user_id) {
        return res
          .status(400)
          .json(Response.errorResp("Missing required userId"));
      }
      // let nvrData = {};

      const filter = { userId: user_id };

      if (camType) {
        const types = camType.split(",").map((t) => t.trim());

        filter.checkType = types.length === 1 ? types[0] : { $in: types };
      }

      if (_id) {
        const ids = Array.isArray(_id) ? _id : _id.split(",");
        filter._id = { $in: ids };
      }

      if (nvrId) {
        const nvrIds = Array.isArray(nvrId) ? nvrId : nvrId.split(",");
        filter.nvrId = { $in: nvrIds };
        // const nvr = await NVR.findById(nvrId).lean();
        // nvrData = nvr || {};
      }

      if (search) {
        const searchRegex = new RegExp(search, "i");

        // 1️⃣ Match NVRs by name or location
        const matchedNvrs = await NVR.find({
          userId: user_id,
          $or: [{ nvrName: searchRegex }, { location: searchRegex }],
        })
          .select("_id")
          .lean();

        const matchedNvrIds = matchedNvrs.map((n) => n._id.toString());

        // 2️⃣ Match Departments by name
        const matchedDepartments = await departmentsModel
          .find({
            departmentName: searchRegex,
          })
          .select("_id")
          .lean();

        const matchedDeptIds = matchedDepartments.map((d) => d._id.toString());

        // 3️⃣ Combine all searchable fields
        filter.$or = [
          { name: searchRegex }, // Channel name
          { customName: searchRegex }, // Custom channel name
          ...(matchedNvrIds.length > 0
            ? [{ nvrId: { $in: matchedNvrIds } }]
            : []), // NVR name or location
          ...(matchedDeptIds.length > 0
            ? [{ department: { $in: matchedDeptIds } }]
            : []), // Department name
        ];
      }

      if (location && location !== "") {
        const locations = Array.isArray(location)
          ? location
          : location.split(",");

        const nvrs = await NVR.find({
          location: buildCaseInsensitiveLocationMatch(locations),
          userId: user_id,
        })
          .select("_id")
          .lean();

        if (nvrs.length === 0) {
          return res.status(200).json(
            Response.userSuccessResp("No channels found for this location", {
              total: 0,
              channels: [],
            })
          );
        }

        const locationNvrIds = nvrs.map((n) => n._id.toString());

        // ✅ if nvrId also provided, intersect both
        if (nvrId) {
          const inputNvrIds = (
            Array.isArray(nvrId) ? nvrId : nvrId.split(",")
          ).map(String);
          const validNvrIds = inputNvrIds.filter((id) =>
            locationNvrIds.includes(id)
          );

          if (validNvrIds.length === 0) {
            // No overlap between provided nvrId and location
            return res.status(200).json(
              Response.userSuccessResp(
                "No channels found for given NVR and location",
                {
                  total: 0,
                  channels: [],
                }
              )
            );
          }

          filter.nvrId = { $in: validNvrIds };
        } else {
          filter.nvrId = { $in: locationNvrIds };
        }
      }

      if (department && department !== "") {
        const deptIds = Array.isArray(department)
          ? department
          : department.split(",");
        filter.department = { $in: deptIds };
      }
      if (authorizedChannel.length > 0 && memberId) {
        filter._id = filter._id
          ? {
              $in: authorizedChannel.filter((id) =>
                filter._id.$in.includes(id)
              ),
            }
          : { $in: authorizedChannel };
      }

      // Step 1: Fetch channels with top-level populate and lean
      const channels = await Channel.find(filter)
        .setOptions({ includeInactive: true })
        .sort({ createdAt: -1 })
        .populate("nvrId")
        .lean();

      // Append streamingUrl
      const enrichedChannels = await Promise.all(
        channels.map(async (channel) => {
          // const nvr = channel.nvrId;

          // const uid = `${nvr?._id}-${channel?._id}`;
          // !old
          // const rtspUrl = buildRTSPUrl(nvr, channel, "main");
          // const streamingUrl = await getStreamingUrl(uid, rtspUrl);

          // !new
          // const streamingUrl = `${nvr?.domain}/${channel?.streamingPath}`;

          const streamingUrl = await buildStreamingUrl(channel.nvrId, channel)
          return {
            _id: channel?._id,
            name: channel?.name,
            nvrId: channel?.nvrId?._id,
            customName: channel?.customName,
            channelId: channel?.channelId,
            rtspChannels: channel?.rtspChannels,
            streamingUrl,
          };
        })
      );

      return res.status(200).json(
        Response.userSuccessResp("Channels retrieved successfully", {
          total: enrichedChannels.length,
          channels: enrichedChannels,
          // nvr: nvrData,
        })
      );
    } catch (err) {
      logger.error(err);
      return res
        .status(500)
        .json(
          Response.notFoundResp("Failed to retrieve channels", err.message)
        );
    }
  }

  async getNvrCameraDetections(req, res, _next) {
    try {
      const requestedAdminId = req?.params?.adminId || req?.query?.adminId;
      let { memberId } = req?.verified?.userData || {};
      const authorizedChannel = req?.verified?.authorizedChannel?.channels || [];

      if (!requestedAdminId) {
        return res
          .status(400)
          .json(Response.errorResp("Missing required adminId"));
      }

      const adminData = await adminModel.findOne({ _id: requestedAdminId });
      const userId = adminData?.user_id;

      if (!userId) {
        return res
          .status(404)
          .json(Response.notFoundResp("Admin not found"));
      }

      const filter = { userId };

      if (authorizedChannel.length > 0 && memberId) {
        filter._id = { $in: authorizedChannel };
      }

      const channels = await Channel.find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .populate("nvrId", "_id nvrName")
        .lean();

      const groupedByNvr = new Map();

      for (const channel of channels) {
        const detections = Object.entries(channel?.detections || {})
          .filter(([, detectionConfig]) => detectionConfig?.enabled === true)
          .map(([detectionKey]) => DETECTION_TYPES[detectionKey] || detectionKey);

        if (channel?.control !== 1 || detections.length === 0) {
          continue;
        }

        const nvrId = channel?.nvrId?._id?.toString() || "unassigned";

        if (!groupedByNvr.has(nvrId)) {
          groupedByNvr.set(nvrId, {
            nvrId: channel?.nvrId?._id || null,
            nvrName: channel?.nvrId?.nvrName || "Unknown NVR",
            cameras: [],
          });
        }

        groupedByNvr.get(nvrId).cameras.push({
          cameraId: channel?._id,
          cameraName: channel?.customName || channel?.name || "Unnamed Camera",
          detections,
        });
      }

      return res.status(200).json(
        Response.userSuccessResp("NVR camera detections retrieved successfully", {
          totalNvrs: groupedByNvr.size,
          nvrs: Array.from(groupedByNvr.values()),
        })
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to retrieve NVR camera detections",
            error.message
          )
        );
    }
  }
  async toggleDetection(req, res, _next) {
    try {
      const { channelId, detectionType, enable } = req.body;
      const adminId = await resolveAdminObjectId({
        adminId: req?.verified?.userData?.adminId,
        userId: req?.verified?.userData?.user_id,
      });
      const userId = req?.verified?.userData?.user_id;
      if (!channelId || !detectionType || typeof enable !== "boolean") {
        return res
          .status(400)
          .json(Response.userFailResp("Missing required parameters"));
      }
      const channel = await Channel.findById(channelId)
        .populate("nvrId")
        .populate(toPopulateDetections);
      if (!channel) {
        return res.status(404).json(Response.notFoundResp("Channel not found"));
      }
      // Check if detection setting exists and is linked
      const existingLink = channel?.detections?.[detectionType];
      logger.debug(
        `toggleDetection - channelId: ${channelId}, detectionType: ${detectionType}, existingLink: ${JSON.stringify(existingLink)}`
      );

      if (existingLink && existingLink?.id) {
        // Check if already in desired state
        const currentStatus = channel?.detections?.[detectionType]?.enabled;
        if (currentStatus === enable) {
          return res.status(200).json(
            Response.userSuccessResp(
              `Detection is already ${enable ? "enabled" : "disabled"}`,
              {
                channelId,
                detectionType,
                enabled: currentStatus,
                linked: true,
              }
            )
          );
        }

        // Linked: Update enabled status
        channel.detections[detectionType].enabled = enable;
        // Send data to python backend
        const detectionSetting = channel?.detections?.[detectionType]?.id;
        const detectionSettingDoc = await DetectionSetting.findById(detectionSetting);
        const zones =
          detectionSettingDoc?.settings?.referencePoints?.[channelId] || [];
        const zone_configs = detectionSettingDoc?.settings?.zone_configs || [];
        const obstruction_threshold_sec = detectionSettingDoc?.settings?.obstruction_threshold_sec || 0;
        const videoResolution = detectionSettingDoc?.settings?.videoResolution || [];
        const severity = detectionSettingDoc?.settings?.levelOfImportance;
        const confidence_thresholds = detectionSettingDoc?.settings || {};
        const line_crossing_settings = detectionSettingDoc?.settings || {};
        if (String(channel.userId) === "32") {
          return res
            .status(403)
            .json(Response.userFailResp("This operation is not allowed."));
        }

        const beResponse = await pythonService.handleDetectionStartStop(
          channel,
          await resolveAdminObjectId({
            adminId,
            userId: req?.verified?.userData?.user_id,
            channelUserId: channel?.userId,
          }),
          enable,
          detectionType,
          zones,
          zone_configs,
          videoResolution,
          obstruction_threshold_sec,
          severity,
          confidence_thresholds,
          line_crossing_settings
          );
        await updateModelThresholds(detectionSettingDoc, beResponse);

        await channel.save();
        return res.status(200).json(
          Response.userSuccessResp("Detection updated successfully", {
            channelId,
            detectionType,
            enabled: enable,
            linked: true,
            backendResponse: beResponse,
          })
        );
      } else {
        // if (
        //   detectionType === "lineCrossingSettings" ||
        //   detectionType === "doorDetectionSettings"
        // ) {
        //   return res
        //     .status(400)
        //     .json(
        //       Response.userFailResp(
        //         "Cannot enable detection without detection setting. Please create a detection setting first."
        //       )
        //     );
        // }
        // // Not linked: Create default setting and link
        // if (enable) {
        //   // Create default setting
        //   const defaultPayload = {
        //     name: `Default ${
        //       DETECTION_TYPES[detectionType] || detectionType
        //     } for ${channel.name}`,
        //     settingType: detectionType,
        //     settings: {}, // Empty settings or default values?
        //     channelId: [channelId],
        //     NVRId: channel.nvrId._id,
        //     userId: userId,
        //     enabled: true,
        //     alerts: [],
        //   };
        //   // Use DetectionSettingService to save and link
        //   const result =
        //     await DetectionSettingService.constructor.saveDetectionSettings(
        //       defaultPayload
        //     );

        //   // Send data to python backend
        //   const beResponse = await pythonService.handleDetectionStartStop(
        //     channel,
        //     adminId,
        //     enable,
        //     detectionType,
        //     [], // No zones for default
        //     [] // No video resolution for default
        //   );
        //   return res.status(200).json(
        //     Response.userSuccessResp("Default detection created and enabled", {
        //       channelId,
        //       detectionType,
        //       enabled: enable,
        //       created: true,
        //       result,
        //       backendResponse: beResponse,
        //     })
        //   );
        // } else {
        //   // If enable is false and not linked, nothing to do really, or just return success.
        //   return res.status(200).json(
        //     Response.userSuccessResp("Detection is already disabled", {
        //       channelId,
        //       detectionType,
        //       enabled: enable,
        //       linked: false,
        //     })
        //   );
        // }
        return res
          .status(404)
          .json(
            Response.notFoundResp(
              "Detection setting not found. Please create a detection setting first."
            )
          );
      }
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to start detection", error.message));
    }
  }
}

export default new ChannelService();
