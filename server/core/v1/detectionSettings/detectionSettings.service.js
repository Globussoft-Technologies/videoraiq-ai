import Admin from "../admin/admin.model.js";
import {
  DETECTION_TYPES,
  countPersonsSettings,
  genericObjectDetectionSettings,
  motionDetectionSettings,
  countVehiclesSettings,
  loiteringWithoutAuthSettings,
  loiteringWithAuthSettings,
  unauthorizedAccessSettings,
  lineCrossingSettings,
  fireSmokeDetectionSettings,
  weaponDetectionSettings,
  unattendedBaggageDetectionSettings,
  crowdDetectionSettings,
  personalProtectiveEquipmentSettings,
  doorDetectionSettings,
  lightDetectionSettings,
  vehicleDetectionSettings,
  deskAbsenceSettings,
  guardAbsenceSettings,
  conveyorDetectionSettings,
  crusherDetectionSettings,
  waterSpillageDetectionSettings,
  toPopulateDetections,
  vehicleObstructionSettings,
  loiteringDetectionSettings,
  tableOccupancyDetectionSettings,
  foodServicePPEDetectionSettings,
  mobilePhoneDetectionSettings
} from "../../../constants/detectionTypes.js";
import pythonService from "../../../services/python.service.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import DetectionSettingsValidation from "./detectionSettings.validate.js";
import {
  CountPersonsDetectionSetting,
  GenericObjectDetectionSetting,
  MotionDetectionSetting,
  DetectionSetting,
  CountVehiclesSetting,
  LoiteringWithoutAuthSetting,
  LoiteringWithAuthSetting,
  UnAuthorisedAccessSetting,
  LineCrossingSetting,
  FireSmokeDetectionSetting,
  WeaponDetectionSetting,
  UnattendedBaggageDetectionSetting,
  CrowdDetectionSetting,
  PersonalProtectiveEquipmentSetting,
  DoorDetectionSetting,
  LightDetectionSetting,
  VehiclDetectionSetting,
  DeskAbsenceDetectionSetting,
  GuardAbsenceDetectionSetting,
  ConveyorDetectionSetting,
  CrusherDetectionSetting,
  WaterSpillageDetectionSetting,
  VehicleTypeDetectionSetting,
  LoiteringDetectionSetting,
  VehicleObstructionDetectionSetting,
  TableOccupancyDetectionSetting,
  FoodServicePPEDetectionSetting,
  MobilePhoneDetectionSetting
} from "./detectionSettings.model.js";
import Channel from "../channels/channels.model.js";
import mongoose, { Types } from "mongoose";

const modelMap = {
  countPersonsSettings: CountPersonsDetectionSetting,
  motionDetectionSettings: MotionDetectionSetting,
  genericObjectDetectionSettings: GenericObjectDetectionSetting,
  countVehiclesSettings: CountVehiclesSetting,
  loiteringWithoutAuthSettings: LoiteringWithoutAuthSetting,
  loiteringWithAuthSettings: LoiteringWithAuthSetting,
  unauthorizedAccessSettings: UnAuthorisedAccessSetting,
  lineCrossingSettings: LineCrossingSetting,
  fireSmokeDetectionSettings: FireSmokeDetectionSetting,
  weaponDetectionSettings: WeaponDetectionSetting,
  unattendedBaggageDetectionSettings: UnattendedBaggageDetectionSetting,
  crowdDetectionSettings: CrowdDetectionSetting,
  personalProtectiveEquipmentSettings: PersonalProtectiveEquipmentSetting,
  doorDetectionSettings: DoorDetectionSetting,
  lightDetectionSettings: LightDetectionSetting,
  vehicleDetectionSettings: VehiclDetectionSetting,
  deskAbsenceSettings: DeskAbsenceDetectionSetting,
  guardAbsenceSettings: GuardAbsenceDetectionSetting,
  conveyorDetectionSettings: ConveyorDetectionSetting,
  crusherDetectionSettings: CrusherDetectionSetting,
  waterSpillageDetectionSettings: WaterSpillageDetectionSetting,
  vehicleTypeDetectionSettings: VehicleTypeDetectionSetting,
  loiteringDetectionSettings: LoiteringDetectionSetting,
  vehicleObstructionSettings: VehicleObstructionDetectionSetting,
  tableOccupancyDetectionSettings: TableOccupancyDetectionSetting,
  mobilePhoneDetectionSettings: MobilePhoneDetectionSetting,
  foodServicePPEDetectionSettings: FoodServicePPEDetectionSetting
};

const DEFAULT_DETECTION_SCHEDULE = { mode: "always" };
const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Kolkata";
const SCHEDULE_TOGGLE_RETRY_ATTEMPTS = 4;
const SCHEDULE_TOGGLE_RETRY_DELAY_MS = 10000;

const getDetectionSchedule = (channel, settingType) =>
  channel?.detections?.[settingType]?.schedule || DEFAULT_DETECTION_SCHEDULE;

const buildSchedulePayload = (channel, settingType) => ({
  channelId: channel?._id,
  channelName: channel?.customName || channel?.name,
  enabled: channel?.detections?.[settingType]?.enabled || false,
  schedule: getDetectionSchedule(channel, settingType),
});

const buildFetchUiData = (detectionSetting, linkedCameras = []) => {
  const settings = detectionSetting?.settings?.toObject?.()
    || detectionSetting?.settings
    || {};

  const {
    ocr_min_confidence: _ocrMinConfidence,
    ...displaySettings
  } = settings;

  const activeCameraCount = linkedCameras.filter(
    (channel) => channel?.detections?.[detectionSetting?.settingType]?.enabled === true,
  ).length;

  const primarySchedule =
    linkedCameras.find(
      (channel) => channel?.detections?.[detectionSetting?.settingType]?.schedule,
    )?.detections?.[detectionSetting?.settingType]?.schedule || DEFAULT_DETECTION_SCHEDULE;

  return {
    detectionName: DETECTION_TYPES[detectionSetting?.settingType],
    status: activeCameraCount > 0 ? "Active" : "Paused",
    schedule: primarySchedule,
    appliedCameras: linkedCameras.length,
    activeCameras: activeCameraCount,
    settings: displaySettings,
  };
};

const getAdminScheduleTimezone = async (adminId) => {
  if (!adminId) return DEFAULT_SCHEDULE_TIMEZONE;

  const admin = await Admin.findById(adminId).select("timezone").lean();
  return admin?.timezone || DEFAULT_SCHEDULE_TIMEZONE;
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getNowInScheduleTimezone = (timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return {
    day: getPart("weekday")?.toLowerCase(),
    minutes: Number(getPart("hour")) * 60 + Number(getPart("minute")),
  };
};

const isScheduleActiveNow = (schedule) => {
  if (!schedule || schedule.mode === "always") return true;
  if (schedule.mode !== "custom") return true;

  const { day, minutes } = getNowInScheduleTimezone(
    schedule.timezone || DEFAULT_SCHEDULE_TIMEZONE,
  );
  const windows = schedule.days?.[day] || [];

  return windows.some(
    (window) =>
      minutes >= timeToMinutes(window.start) &&
      minutes < timeToMinutes(window.end),
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const handleDetectionStartStopWithRetry = async (args) => {
  let lastError;

  for (let attempt = 1; attempt <= SCHEDULE_TOGGLE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await pythonService.handleDetectionStartStop(...args);
    } catch (error) {
      lastError = error;
      if (attempt < SCHEDULE_TOGGLE_RETRY_ATTEMPTS) {
        await sleep(SCHEDULE_TOGGLE_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
};

const updateSettingsWithModelThresholds = async (detectionSetting, backendResponse) => {
  const thresholds = DetectionSettingsValidation.extractModelThresholds(
    detectionSetting?.settingType,
    backendResponse?.model_thresholds,
  );

  if (!Object.keys(thresholds).length) return;

  const currentSettings =
    detectionSetting.settings?.toObject?.() || detectionSetting.settings || {};

  detectionSetting.settings = {
    ...currentSettings,
    ...thresholds,
  };
  detectionSetting.markModified("settings");
  await detectionSetting.save();
};

class DetectionSettingService {
  async getDetectionTypes(req, res, _next) {
    try {
      return res.status(200).json(
        Response.userSuccessResp("Detection types fetched successfully", {
          detectionTypes: DETECTION_TYPES,
        }),
      );
    } catch (error) {
      logger.error("Error fetching detection types:", error);
      return res
        .status(500)
        .json(
          Response.errorResp("Failed to fetch detection types", error.message),
        );
    }
  }

  async createDetectionSettings(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;

      // 1. Validate input
      const { error, value } =
        DetectionSettingsValidation.createDetectionSettingsValidation(req.body);

      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const thresholdValidation =
        DetectionSettingsValidation.validateConfidenceThresholds(
          value.settingType,
          value.settings,
        );

      if (thresholdValidation.error) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Validation Failed",
              thresholdValidation.error.message,
            ),
          );
      }

      const lineCrossingValidation =
        DetectionSettingsValidation.validateLineCrossingSettings(
          value.settingType,
          value.settings,
        );

      if (lineCrossingValidation.error) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Validation Failed",
              lineCrossingValidation.error.message,
            ),
          );
      }

      // 2. Check if admin is allowed to use this detection type
      const adminId = req?.verified?.userData?.adminId;
      const admin = await Admin.findById(adminId).select("detectionConfig").lean();
      const config = admin?.detectionConfig;
      // if (config && Object.keys(config).length > 0 && !(value.settingType in config)) {
      //   return res
      //     .status(403)
      //     .json(Response.userFailResp("You are not authorized to use this detection type"));
      // }

      // 3. Save to DB for each channelId
      const data = { ...value, userId: user_id };

      const existing = await DetectionSetting.findOne({
        name: data.name,
        settingType: data.settingType,
        userId: user_id,
      });
      // if (existing) {
      //   return res
      //     .status(400)
      //     .json(
      //       Response.userFailResp(
      //         "A detection setting with this name already exists."
      //       )
      //     );
      // }

      const savedDetectionSettings =
        await DetectionSettingService.saveDetectionSettings(data);

      // 3. Return success
      return res.status(201).json(
        Response.userSuccessResp("Detection settings created successfully", {
          savedDetectionSettings,
        }),
      );
    } catch (error) {
      logger.error("Error creating detection settings:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Detection settings creation failed",
            error.message,
          ),
        );
    }
  }

  // Static method to save to appropriate discriminator model
  static async saveDetectionSettings(payload) {
    const {
      settingType,
      settings,
      channelId: channelIds,
      NVRId,
      ...baseData
    } = payload;

    const Model = modelMap[settingType];
    if (!Model) {
      throw new Error(`Unsupported detection type: ${settingType}`);
    }

    const savedDetections = [];
    const skippedChannels = [];

    // Check if any channel already has this detection type enabled
    const existingChannels = await Channel.find({
      _id: { $in: channelIds },
      nvrId: NVRId,
    });

    for (const channel of existingChannels) {
      if (channel.detections?.[settingType]?.enabled) {
        throw new Error(
          `Channel '${channel.name}' already has ${
            DETECTION_TYPES[settingType] || settingType
          } enabled.`,
        );
      }
    }

    // Create detection
    const detectionDoc = new Model({
      ...baseData,
      settingType,
      settings,
    });

    const savedDetection = await detectionDoc.save();

    for (const channelId of channelIds) {
      try {
        const channel = await Channel.findOne({ _id: channelId, nvrId: NVRId });
        if (!channel) {
          skippedChannels.push({ channelId, reason: "Channel not found" });
          continue;
        }

        if (channel.detections?.[settingType]?.enabled) {
          skippedChannels.push({
            channelId,
            channelName: channel.name,
            reason: `${DETECTION_TYPES[settingType]} already linked`,
          });
          continue;
        }

        // Link to channel
        if (!channel.detections) channel.detections = {};
        channel.detections[settingType] = {
          id: savedDetection._id,
          enabled: false,
        };

        await channel.save();

        savedDetections.push({
          channelId,
          channelName: channel.name,
          detection: savedDetection,
        });
      } catch (err) {
        skippedChannels.push({ channelId, reason: err.message });
      }
    }

    return {
      saved: savedDetections,
      skipped: skippedChannels,
    };
  }

  async deleteDetectionSettings(req, res, _next) {
    try {
      const { id } = req.params;
      const user_id = req?.verified?.userData?.user_id;

      // 1. Find the detection setting
      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;

      // 2. Remove reference from Channel model
      await Channel.updateMany(
        { [`detections.${settingType}.id`]: id },
        { $unset: { [`detections.${settingType}`]: 1 } },
      );

      // 3. Delete the detection setting
      await DetectionSetting.deleteOne({ _id: id });

      return res
        .status(200)
        .json(
          Response.userSuccessResp("Detection settings deleted successfully"),
        );
    } catch (error) {
      logger.error("Error deleting detection settings:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to delete detection settings",
            error.message,
          ),
        );
    }
  }
  async updateDetectionSettings(req, res, _next) {
    try {
      const { id } = req.params;
      const user_id = req?.verified?.userData?.user_id;
      const value = { ...req.body };

      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;

      if (value.settings && typeof value.settings === "object") {
        const thresholdValidation =
          DetectionSettingsValidation.validateConfidenceThresholds(
            settingType,
            value.settings,
          );

        if (thresholdValidation.error) {
          return res
            .status(400)
            .json(
              Response.userFailResp(
                "Validation Failed",
                thresholdValidation.error.message,
              ),
            );
        }
      }

      // Update base fields
      ["name", "enabled", "alerts"].forEach((field) => {
        if (value[field] !== undefined) {
          detectionSetting[field] = value[field];
        }
      });

      // Update nested settings
      if (value.settings && typeof value.settings === "object") {
        detectionSetting.settings = {
          ...detectionSetting.settings,
          ...value.settings,
        };
      }

      const saved = [];
      const skipped = [];

      if (Array.isArray(value.channelId) && value.NVRId) {
        const newChannelIds = value.channelId.map(String);

        // Get all channels linked to this setting
        const previouslyLinkedChannels = await Channel.find({
          [`detections.${settingType}.id`]: id,
        });

        const previouslyLinkedIds = previouslyLinkedChannels.map((ch) =>
          String(ch._id),
        );

        // If there's any change (new or removed channels), unlink old ones
        const channelsToUnlink = previouslyLinkedIds.filter(
          (id) => !newChannelIds.includes(id),
        );

        if (channelsToUnlink.length) {
          await Channel.updateMany(
            {
              _id: { $in: channelsToUnlink },
              [`detections.${settingType}.id`]: id,
            },
            { $unset: { [`detections.${settingType}`]: "" } },
          );
        }

        for (const chId of newChannelIds) {
          const channel = await Channel.findOne({
            _id: chId,
            nvrId: value.NVRId,
          });

          if (!channel) {
            skipped.push({ channelId: chId, reason: "Channel not found" });
            continue;
          }

          const existingLink = channel.detections?.[settingType];

          if (
            existingLink?.id &&
            existingLink?.id?.toString() === id &&
            existingLink?.enabled
          ) {
            skipped.push({
              channelId: chId,
              channelName: channel.name,
              reason: `${DETECTION_TYPES[settingType]} already linked`,
            });
            continue;
          }

          // if (existingLink?.id) {
          //   skipped.push({
          //     channelId: chId,
          //     channelName: channel.name,
          //     reason: `${DETECTION_TYPES[settingType]} already linked to another detection`,
          //   });
          //   continue;
          // }

          // Link detection
          if (!channel.detections) channel.detections = {};
          channel.detections[settingType] = {
            id: detectionSetting._id,
            enabled: false,
          };
          channel.control = 1;
          await channel.save();

          saved.push({
            channelId: chId,
            channelName: channel.name,
            detection: detectionSetting,
          });
        }
      }

      await detectionSetting.save();

      // Notify Python for all linked and enabled channels
      const adminId = req?.verified?.userData?.adminId;
      const linkedChannels = await Channel.find({
        [`detections.${settingType}.id`]: id,
        [`detections.${settingType}.enabled`]: true,
      })
        .populate("nvrId")
        .populate(toPopulateDetections);

      for (const channel of linkedChannels) {
        try {
          const cameraId = channel._id.toString();
          const zones =
            detectionSetting?.settings?.referencePoints?.[cameraId] || [];
          const obstruction_threshold_sec =
            detectionSetting?.settings?.obstruction_threshold_sec || 0;
          const videoResolution =
            detectionSetting?.settings?.videoResolution || [];
          const severity = detectionSetting?.settings?.levelOfImportance;
          const zone_configs =
            detectionSetting?.settings?.zone_configs || [];
          const zoneName = detectionSetting?.settings?.zoneName || [];
          const confidence_thresholds = detectionSetting?.settings || {};
          const line_crossing_settings = detectionSetting?.settings || {};
          const mobile_phone_confidence = detectionSetting?.settings || {};



          const backendResponse = await pythonService.handleDetectionUpdate(
            channel,
            adminId,
            settingType,
            zones,
            videoResolution,
            zone_configs,
            obstruction_threshold_sec,
            severity,
            zoneName,
            confidence_thresholds,
            line_crossing_settings,
            mobile_phone_confidence,
          );
          await updateSettingsWithModelThresholds(detectionSetting, backendResponse);
        } catch (error) {
          logger.error(
            `Failed to notify python for channel ${channel?._id}:`,
            error,
          );
        }
      }

      return res.status(200).json(
        Response.userSuccessResp("Detection settings updated successfully", {
          saved,
          skipped,
        }),
      );
    } catch (error) {
      logger.error("Error updating detection settings:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to update detection settings",
            error.message,
          ),
        );
    }
  }

  async getDetectionSchedule(req, res, _next) {
    try {
      const { id } = req.params;
      const user_id = req?.verified?.userData?.user_id;

      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;
      const linkedCameras = await Channel.find({
        [`detections.${settingType}.id`]: id,
      }).lean();

      return res.status(200).json(
        Response.userSuccessResp("Detection schedules fetched successfully", {
          detectionSettingId: id,
          settingType,
          schedules: linkedCameras.map((channel) =>
            buildSchedulePayload(channel, settingType),
          ),
        }),
      );
    } catch (error) {
      logger.error("Error fetching detection schedules:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to fetch detection schedules",
            error.message,
          ),
        );
    }
  }

  async getCameraDetectionSchedule(req, res, _next) {
    try {
      const { id, channelId } = req.params;
      const user_id = req?.verified?.userData?.user_id;

      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;
      const channel = await Channel.findOne({
        _id: channelId,
        userId: user_id,
        [`detections.${settingType}.id`]: id,
      }).lean();

      if (!channel) {
        return res
          .status(404)
          .json(
            Response.userFailResp(
              "Camera is not linked to this detection setting",
            ),
          );
      }

      return res.status(200).json(
        Response.userSuccessResp("Detection schedule fetched successfully", {
          detectionSettingId: id,
          settingType,
          ...buildSchedulePayload(channel, settingType),
        }),
      );
    } catch (error) {
      logger.error("Error fetching camera detection schedule:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to fetch camera detection schedule",
            error.message,
          ),
        );
    }
  }

  async updateCameraDetectionSchedule(req, res, _next) {
    try {
      const { id, channelId } = req.params;
      const user_id = req?.verified?.userData?.user_id;
      const adminId = req?.verified?.userData?.adminId;
      const { timezone: _timezone, ...clientSchedulePayload } = req.body;
      const schedulePayload = { ...clientSchedulePayload };

      if (schedulePayload.mode === "custom") {
        schedulePayload.timezone = await getAdminScheduleTimezone(adminId);
      }

      const { error, value } =
        DetectionSettingsValidation.updateDetectionScheduleValidation(
          schedulePayload,
        );

      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;
      const channel = await Channel.findOne({
        _id: channelId,
        userId: user_id,
        [`detections.${settingType}.id`]: id,
      });

      if (!channel) {
        return res
          .status(404)
          .json(
            Response.userFailResp(
              "Camera is not linked to this detection setting",
            ),
          );
      }

      channel.detections[settingType].schedule = value;
      channel.control = 1;
      channel.markModified(`detections.${settingType}.schedule`);
      await channel.save();

      const populatedChannel = await Channel.findById(channel._id)
        .populate("nvrId")
        .populate(toPopulateDetections);

      await this.applyDetectionScheduleState(req, populatedChannel, detectionSetting);

      return res.status(200).json(
        Response.userSuccessResp("Detection schedule updated successfully", {
          detectionSettingId: id,
          settingType,
          ...buildSchedulePayload(populatedChannel || channel, settingType),
        }),
      );
    } catch (error) {
      logger.error("Error updating camera detection schedule:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to update camera detection schedule",
            error.message,
          ),
        );
    }
  }

  async resetCameraDetectionSchedule(req, res, _next) {
    try {
      const { id, channelId } = req.params;
      const user_id = req?.verified?.userData?.user_id;

      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;
      const channel = await Channel.findOne({
        _id: channelId,
        userId: user_id,
        [`detections.${settingType}.id`]: id,
      });

      if (!channel) {
        return res
          .status(404)
          .json(
            Response.userFailResp(
              "Camera is not linked to this detection setting",
            ),
          );
      }

      channel.detections[settingType].schedule = undefined;
      channel.control = 1;
      channel.markModified(`detections.${settingType}.schedule`);
      await channel.save();

      const populatedChannel = await Channel.findById(channel._id)
        .populate("nvrId")
        .populate(toPopulateDetections);

      await this.applyDetectionScheduleState(req, populatedChannel, detectionSetting);

      return res.status(200).json(
        Response.userSuccessResp("Detection schedule reset successfully", {
          detectionSettingId: id,
          settingType,
          ...buildSchedulePayload(populatedChannel || channel, settingType),
        }),
      );
    } catch (error) {
      logger.error("Error resetting camera detection schedule:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to reset camera detection schedule",
            error.message,
          ),
        );
    }
  }

  async applyDetectionScheduleState(req, channel, detectionSetting) {
    try {
      if (!channel || !detectionSetting) return;

      const adminId = req?.verified?.userData?.adminId;
      const settingType = detectionSetting.settingType;
      const link = channel?.detections?.[settingType];
      if (!link?.id) return;

      const shouldEnable = isScheduleActiveNow(link.schedule);
      const currentStatus = link.enabled === true;
      if (currentStatus === shouldEnable) return;

      const cameraId = channel._id.toString();
      const zones = detectionSetting?.settings?.referencePoints?.[cameraId] || [];
      const obstruction_threshold_sec =
        detectionSetting?.settings?.obstruction_threshold_sec || 0;
      const videoResolution = detectionSetting?.settings?.videoResolution || [];
      const severity = detectionSetting?.settings?.levelOfImportance;
      const zone_configs = detectionSetting?.settings?.zone_configs || [];
      const zoneName = detectionSetting?.settings?.zoneName || [];
      const confidence_thresholds = detectionSetting?.settings || {};
      const line_crossing_settings = detectionSetting?.settings || {};

      const backendResponse = await handleDetectionStartStopWithRetry([
        channel,
        adminId,
        shouldEnable,
        settingType,
        zones,
        zone_configs,
        videoResolution,
        obstruction_threshold_sec,
        severity,
        confidence_thresholds,
        line_crossing_settings,
      ]);
      await updateSettingsWithModelThresholds(detectionSetting, backendResponse);

      link.enabled = shouldEnable;
      channel.markModified(`detections.${settingType}.enabled`);
      await channel.save();
    } catch (error) {
      logger.error(
        `Failed to apply scheduled detection state for channel ${channel?._id}:`,
        error,
      );
    }
  }

  async getDetectionSettings(req, res, _next) {
    try {
      const { id } = req.params;
      const user_id = req?.verified?.userData?.user_id;

      // 1. Find the detection setting
      const detectionSetting = await DetectionSetting.findOne({
        _id: id,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      // 2. Find the linked channel (camera)
      const settingType = detectionSetting.settingType;

      const linkedChannels = await Channel.find({
        [`detections.${settingType}.id`]: id,
        // [`detections.${settingType}.enabled`]: true,
      }).populate("nvrId");
      return res.status(200).json(
        Response.userSuccessResp("Detection settings fetched successfully", {
          detectionSetting: {
            ...detectionSetting._doc,
            detectionName: DETECTION_TYPES[detectionSetting.settingType],
          },
          linkedCameras: linkedChannels || null,
          uiData: buildFetchUiData(detectionSetting, linkedChannels || []),
        }),
      );
    } catch (error) {
      logger.error("Error fetching detection settings:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to fetch detection settings",
            error.message,
          ),
        );
    }
  }

  async getAllDetectionSettings(req, res, _next) {
    try {
      const {
        ids,
        name,
        settingType,
        nvrIds,
        channelIds,
        skip = 0,
        limit = 10,
      } = req.query;

      const toArray = (ids) =>
        ids ? ids.split(",").map((id) => id.trim()) : [];

      const user_id = req?.verified?.userData?.user_id;

      const filter = { userId: user_id };
      if (ids) filter._id = { $in: toArray(ids) };
      if (name) filter.name = { $regex: name, $options: "i" };
      if (settingType) filter.settingType = settingType;

      const total = await DetectionSetting.countDocuments(filter);

      const detectionSettings = await DetectionSetting.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .populate({
          path: "alerts",
          select: "adminId type fullName value verified",
        })
        .lean();

      // --- Resolve relevant channel IDs based on nvrIds and channelIds ---
      let resolvedChannelIds = null;
      if (nvrIds || channelIds) {
        const channelFilter = {};

        const nvrObjectIds = toArray(nvrIds);
        if (nvrObjectIds?.length) channelFilter.nvrId = { $in: nvrObjectIds };

        const channelObjectIds = toArray(channelIds);
        if (channelObjectIds?.length) {
          channelFilter._id = {
            ...(channelFilter._id || {}),
            $in: channelObjectIds,
          };
        }

        const filteredChannels = await Channel.find(
          channelFilter,
          "_id",
        ).lean();
        resolvedChannelIds = filteredChannels.map((ch) => ch._id.toString());
      }

      // --- Populate linked cameras per detection setting ---
      const resultsWithCamera = [];

      for (const setting of detectionSettings) {
        const query = {
          [`detections.${setting.settingType}.id`]: setting._id,
          // [`detections.${setting.settingType}.enabled`]: true,
        };

        if (
          Array.isArray(resolvedChannelIds) &&
          resolvedChannelIds.length > 0
        ) {
          query._id = { $in: resolvedChannelIds };
        }

        const linkedCameras = await Channel.find(query)
          .populate("nvrId")
          .lean();

        // Skip this detection setting if resolvedChannelIds were provided and no linked cameras found
        if (
          Array.isArray(resolvedChannelIds) &&
          resolvedChannelIds.length > 0 &&
          linkedCameras.length === 0
        ) {
          continue;
        }

        resultsWithCamera.push({
          detectionSetting: {
            ...setting,
            detectionName: DETECTION_TYPES[setting.settingType],
          },
          linkedCameras,
        });
      }

      return res.status(200).json(
        Response.userSuccessResp("Detection settings fetched successfully", {
          count: total,
          detectionSettings: resultsWithCamera,
        }),
      );
    } catch (error) {
      logger.error("Error fetching detection settings:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to fetch detection settings",
            error.message,
          ),
        );
    }
  }
  async getDetectionExamples(_req, res, _next) {
    try {
      // Example data for detection settings
      const examples = {
        countPersonsSettings,
        genericObjectDetectionSettings,
        motionDetectionSettings,
        countVehiclesSettings,
        loiteringWithoutAuthSettings,
        loiteringWithAuthSettings,
        unauthorizedAccessSettings,
        lineCrossingSettings,
        fireSmokeDetectionSettings,
        weaponDetectionSettings,
        unattendedBaggageDetectionSettings,
        crowdDetectionSettings,
        personalProtectiveEquipmentSettings,
        doorDetectionSettings,
        lightDetectionSettings,
        vehicleDetectionSettings,
        deskAbsenceSettings,
        guardAbsenceSettings,
        conveyorDetectionSettings,
        crusherDetectionSettings,
        waterSpillageDetectionSettings,
        vehicleObstructionSettings,
      };

      return res.status(200).json(
        Response.userSuccessResp("Detection examples fetched successfully", {
          examples,
        }),
      );
    } catch (error) {
      logger.error("Error fetching detection examples:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to fetch detection examples",
            error.message,
          ),
        );
    }
  }
  async attachDetectionSetting(req, res, _next) {
    try {
      const { channelId, detectionSettingId } = req.body;
      const user_id = req?.verified?.userData?.user_id;

      if (!channelId || !detectionSettingId) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Both channelId and detectionSettingId are required",
            ),
          );
      }

      // 1. Find the detection setting and get its type
      const detectionSetting = await DetectionSetting.findOne({
        _id: detectionSettingId,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;

      // 2. Find the channel
      const channel = await Channel.findOne({
        _id: channelId,
        userId: user_id,
      });

      if (!channel) {
        return res.status(404).json(Response.userFailResp("Channel not found"));
      }

      // 3. Check if already attached
      if (channel.detections?.[settingType]) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              `${DETECTION_TYPES[settingType]} already linked to this channel`,
            ),
          );
      }

      // 4. Attach detection
      await Channel.updateOne(
        { _id: channelId },
        { $set: { [`detections.${settingType}`]: detectionSetting._id } },
      );

      return res.status(200).json(
        Response.userSuccessResp("Detection setting attached successfully", {
          channelId,
          detectionSettingId,
          settingType,
        }),
      );
    } catch (error) {
      logger.error("Error attaching detection setting:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to attach detection setting",
            error.message,
          ),
        );
    }
  }

  async detachDetectionSetting(req, res, _next) {
    try {
      const { channelId, detectionSettingId } = req.body;
      const user_id = req?.verified?.userData?.user_id;

      if (!channelId || !detectionSettingId) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Both channelId and detectionSettingId are required",
            ),
          );
      }

      // Step 1: Find the detection setting and get its type
      const detectionSetting = await DetectionSetting.findOne({
        _id: detectionSettingId,
        userId: user_id,
      });

      if (!detectionSetting) {
        return res
          .status(404)
          .json(Response.userFailResp("Detection setting not found"));
      }

      const settingType = detectionSetting.settingType;

      // Step 2: Check if the channel exists and has this detection linked
      const channel = await Channel.findOne({
        _id: channelId,
        userId: user_id,
      });

      if (!channel) {
        return res.status(404).json(Response.userFailResp("Channel not found"));
      }

      const existingLinkedId = channel.detections?.[settingType];

      if (
        !existingLinkedId ||
        existingLinkedId?.id?.toString() !== detectionSettingId
      ) {
        return res
          .status(404)
          .json(
            Response.userFailResp(
              "Detection setting is not linked to this channel",
            ),
          );
      }

      // Step 3: Unset the field
      await Channel.updateOne(
        { _id: channelId },
        { $unset: { [`detections.${settingType}`]: "" } },
      );

      return res
        .status(200)
        .json(
          Response.userSuccessResp("Detection setting detached successfully"),
        );
    } catch (error) {
      logger.error("Error detaching detection setting:", error);
      return res
        .status(500)
        .json(
          Response.errorResp(
            "Failed to detach detection setting",
            error.message,
          ),
        );
    }
  }
}

export default new DetectionSettingService();
