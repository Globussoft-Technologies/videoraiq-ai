import Channel from "./../channels/channels.model.js";
import AppError from "../../../utils/appError.js";
import logger from "../../../utils/logger.js";
import nvrModel from "../NVR/nvr.model.js";
import incidentsValidate from "./incidents.validate.js";
import mongoose from "mongoose";
import Response from "../../../utils/response.js";
import { sendPayloadToUser } from "../../../socket.js";
import momentTZ from "moment-timezone";
import { withSFTPConnection } from "../../../utils/newSFTPConnectionCheck.js";
import path from "path";
import fs from "fs";
import { deletionQueue } from "../jobs/utils/deletionQueue.js";
import {
  attachTaggedUsers,
  findTaggedPlates,
  vehicleTagStages,
  stripNormPlateStage,
  escapeRegex,
  NORM_PLATE_FIELD,
} from "../../../utils/vehicleTagging.js";
import { ALERT_FEED_EXCLUDED_TYPES } from "../../../constants/detectionTypes.js";

import {
  Incident,
  CountPersonIncident,
  CountVehiclesIncident,
  MotionIncident,
  GenericObjectIncident,
  LoiteringWithoutAuthIncident,
  UnauthorizedAccessIncident,
  LineCrossingAuthIncident,
  LoiteringWithAuthIncident,
  CroudIncident,
  SafetyHelmetIncident,
  DoorStatusIncident,
  LightStatusIncident,
  BagDetectionIncident,
  VehicleDetectionIncident,
  VehicleObstructionIncident,
  DeskAbsenceIncident,
  GuardAbsenceIncident,
  ConveyorDetectionIncident,
  CrusherDetectionIncident,
  VehicleTypeDetectionIncident,
  WaterSpillageDetectionIncident,
  LoiteringDetectionIncident,
  TableOccupancyDetectionIncident,
  FoodServicePPEDetectionIncident,
  MobilePhoneDetectionIncident,
  CarModelDetectionIncident
} from "./incidents.model.js";
const modelMap = {
  countPersons: CountPersonIncident,
  countVehicles: CountVehiclesIncident,
  motionDetection: MotionIncident,
  genericObjectDetection: GenericObjectIncident,
  loiteringWithAuth: LoiteringWithAuthIncident,
  loiteringWithoutAuth: LoiteringWithoutAuthIncident,
  unauthorizedAccess: UnauthorizedAccessIncident,
  lineCrossing: LineCrossingAuthIncident,
  crowdDetection: CroudIncident,
  personalProtectiveEquipment: SafetyHelmetIncident,
  doorDetection: DoorStatusIncident,
  lightDetection: LightStatusIncident,
  bagDetection: BagDetectionIncident,
  vehicleDetection: VehicleDetectionIncident,
  vehicleObstruction: VehicleObstructionIncident,
  deskAbsence: DeskAbsenceIncident,
  guardAbsence: GuardAbsenceIncident,
  conveyorDetection: ConveyorDetectionIncident,
  crusherDetection: CrusherDetectionIncident,
  waterSpillageDetection: WaterSpillageDetectionIncident,
  vehicleTypeDetection: VehicleTypeDetectionIncident,
  loiteringDetection: LoiteringDetectionIncident,
  tableOccupancyDetection: TableOccupancyDetectionIncident,
  foodServicePPEDetection: FoodServicePPEDetectionIncident,
  mobilePhoneDetection: MobilePhoneDetectionIncident,
  carModelDetection: CarModelDetectionIncident
};
import channelsModel from "./../channels/channels.model.js";
import adminModel from "../admin/admin.model.js";
import { triggerAlertOnIncident } from "../alerts/alert.events.js";
import config from "config";
import {
  DetectionSetting,
  CountPersonsDetectionSetting,
  GenericObjectDetectionSetting,
  MotionDetectionSetting,
  CountVehiclesSetting,
  LoiteringWithoutAuthSetting,
  LoiteringWithAuthSetting,
  UnAuthorisedAccessSetting,
  LineCrossingSetting,
  FireSmokeDetectionSetting,
  WeaponDetectionSetting,
  UnattendedBaggageDetectionSetting,
  DeskAbsenceDetectionSetting,
  GuardAbsenceDetectionSetting,
} from "./../detectionSettings/detectionSettings.model.js";
const DetectionModelMap = {
  countPersons: CountPersonsDetectionSetting,
  countVehicles: CountVehiclesSetting,
  motionDetection: MotionDetectionSetting,
  genericObjectDetection: GenericObjectDetectionSetting,
  loiteringWithAuth: LoiteringWithAuthSetting,
  loiteringWithoutAuth: LoiteringWithoutAuthSetting,
  unauthorizedAccess: UnAuthorisedAccessSetting,
  lineCrossing: LineCrossingSetting,
  deskAbsence: DeskAbsenceDetectionSetting,
  guardAbsence: GuardAbsenceDetectionSetting,
};
import JobsService from "../jobs/jobs.service.js";

const normalizeVehicleObstructionPayload = (body = {}) => {
  const vehicleNumber = body.vehicleNumber == null ? "" : String(body.vehicleNumber).trim();
  const incidentName = String(body.incidentName || "");
  const looksLikeObstruction =
    body.incidentType === "vehicleDetection" &&
    !vehicleNumber &&
    /obstruction/i.test(incidentName);

  if (looksLikeObstruction) {
    body.incidentType = "vehicleObstruction";
    body.incidentName = "Vehicle & Obstruction Detection";
  }
};

// carModelDetection ships a manufacture year that may arrive as a number or a
// string. Parse it, and drop unusable values ("unknown", "N/A") to null rather
// than letting a NaN cast fail the whole incident save.
const toModelYear = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const year = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(year) ? year : null;
};

// Attribute values arrive from the DS under several spellings and sometimes
// as explicit placeholders. Take the first usable one and treat placeholder
// text as absent, so the logs UI shows a real value or "--", never "unknown".
const firstFilled = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && !/^(unknown|undefined|null|none|n\/?a)$/i.test(text)) return text;
  }
  return null;
};

// Sortable log columns: the id the client sends -> the real document path.
// A whitelist rather than the raw query value, so a caller can't push an
// arbitrary path into $sort, and so UI column ids (modelName, nvrName) map
// onto the fields those columns actually render.
const LOG_SORT_FIELDS = {
  timeOfIncident: "timeOfIncident",
  severity: "severity",
  incidentName: "incidentName",
  description: "description",
  zone: "zone",
  resolved: "resolved",
  vehicleNumber: "vehicleNumber",
  modelName: "model_name",
  model_name: "model_name",
  company: "company",
  color: "color",
  colour: "color",
  year: "year",
  nvrName: "nvrData.nvrName",
  "nvrData.nvrName": "nvrData.nvrName",
  channelName: "channelData.name",
  "channelData.name": "channelData.name",
};

const cacheDir = path.join("/tmp", "media-cache"); // You can change this to './cache' or any path
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, {
    recursive: true,
  });
}

class IncidentsService {
  async createIncidents(req, res, next) {
    try {
      normalizeVehicleObstructionPayload(req.body);
      const { incidentType, nvrId, channelId, triggerNotification, adminId } =
        req.body;
      // const userId = req?.verified?.userData?.user_id;

      const isAdminExist = await adminModel.findById(adminId);
      if (!isAdminExist) {
        return res.send(
          Response.validationFailResp("Admin not found!", "Validation Failed!"),
        );
      }

      const userId = isAdminExist.user_id?.toString();   
      let channel = await Channel.findOne({ _id: channelId })
        .populate("profile")
        .lean();
        // return res.status(200).json({ channel });
      if (!channel) {
        return res.status(400).json({ error: "Invalid Channel or NVR ID" });
      }

      const Model = modelMap[incidentType];
      if (!Model) {
        return res
          .status(400)
          .json({ error: `Unknown incident type: ${incidentType}` });
      }

      const currentTime = new Date();

      // Check if the incidentType needs special update logic
      if (
        [
          "countPersons",
          "countVehicles",
          "genericObjectDetection",
          "lineCrossing",
          "doorDetection"
        ].includes(incidentType)
      ) {
        // update the same document in a day
        const startOfDay = new Date(currentTime);
        startOfDay.setHours(0, 0, 0, 0);

        const recentIncident = await Model.findOne({
          nvrId,
          channelId,
          userId: userId?.toString(),
          incidentType,
          timeOfIncident: { $gte: startOfDay },
        }).sort({ timeOfIncident: -1 });

        const channelData = await channelsModel
          .findOne({ _id: channelId })
          .populate("profile")
          .lean();
        let detectionType = channelData.detections[`${incidentType}Settings`];

        if (!detectionType) {
          return res.send(
            Response.validationFailResp(
              "Detection setting not found!",
              "Validation Failed!",
            ),
          );
        }

        let detectionSetting = await DetectionSetting.findOne({
          _id: detectionType.id,
        });

        if (recentIncident) {
          // Update logic depending on incidentType
          if (
            incidentType === "countPersons" ||
            incidentType === "countVehicles"
          ) {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.count = req.body.count;
            recentIncident.timeSeries.push({
              count: req.body.count ?? 0, // or appropriate value
            });
          } else if (incidentType === "genericObjectDetection") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.objectsDetected = req.body.objectsDetected;
            recentIncident.timeSeries.push({
              objectsDetected: req.body.objectsDetected,
            });
          } else if (incidentType === "lineCrossing") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            const type = req.body.type || "all";
            const entry = Number(req.body.entry ?? 0);
            const exit = Number(req.body.exit ?? 0);
            recentIncident.type = type;
            recentIncident.totalEntry = (recentIncident.totalEntry || 0) + entry;
            recentIncident.totalExit = (recentIncident.totalExit || 0) + exit;
            recentIncident.timeSeries.push({
              timestamp: req?.body?.timeOfIncident || new Date(),
              type,
              entry,
              exit,
            });
          } else if (incidentType === "crowdDetection") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.croudCount = req.body.count;
            recentIncident.timeSeries.push({
              croudCount: req.body.count ?? 0, // or appropriate value
            });
          } else if (incidentType === "personalProtectiveEquipment") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.helmetCount = req.body.count;
            recentIncident.timeSeries.push({
              croudCount: req.body.count ?? 0, // or appropriate value
              ppe: {
                helmet: {
                  yes: req.body.ppe?.helmet?.yes ?? 0,
                  no: req.body.ppe?.helmet?.no ?? 0,
                },
                safety_jacket: {
                  yes: req.body.ppe?.safety_jacket?.yes ?? 0,
                  no: req.body.ppe?.safety_jacket?.no ?? 0,
                },
              },
            });
          } else if (incidentType === "lightDetection") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            ((recentIncident.currentStatus = req.body?.lightDetection?.status),
              (recentIncident.currentImage = req.body?.lightDetection?.Image));
            recentIncident.timeSeries.push({
              status: req.body?.lightDetection?.status,
              Image: req.body?.lightDetection?.Image,
            });
          } else if (incidentType === "doorDetection") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.currentStatus =
              req?.body?.doorDetectionPayload?.status;
            recentIncident.currentImage =
              req?.body?.doorDetectionPayload?.Image;
            recentIncident.timeSeries.push({
              status: req?.body?.doorDetectionPayload?.status,
              Image: req?.body?.doorDetectionPayload?.Image,
            });
          } else if(incidentType === "deskAbsence") {
            recentIncident.timeOfIncident = req?.body?.timeOfIncident;
            recentIncident.personPresent = req?.body?.personPresent;
            recentIncident.timeSeries.push({
              personCount: req.body.personCount ?? 0,
              zoneName: req.body.zoneName,
              personPresent: req.body.personPresent,
            });
          }

          // New payloads may carry a fresh confidence for the same-day doc.
          if (req.body.ConfidenceScoreInPercentage != null) {
            recentIncident.ConfidenceScoreInPercentage =
              req.body.ConfidenceScoreInPercentage;
          }

          await recentIncident.save();

          delete recentIncident.timeSeries;

          let incidentObj = recentIncident.toObject();
          incidentObj.push = channelData?.profile?.notification?.channels?.push;

          if (detectionSetting && recentIncident) {
            incidentObj.detectionSetting = detectionSetting;
            incidentObj.channelName = channel.name;
          }

          // await sendPayloadToUser(userId, `cameradetection_${recentIncident.nvrId}_${recentIncident.channelId}`, incidentObj);
          void sendPayloadToUser(
            userId,
            `cameradetection_${isAdminExist?._id}`,
            incidentObj,
          );

          // ! alert trigger
          // if (channelData?.profile?.notification?.channels?.email===true) {
          // if (
          //   channelData?.profile &&
          //   (await JobsService.handleProfileNotification(
          //     channelData?.profile,
          //     channelId,
          //   ))
          // ) {
            const shouldTriggerAlert =
              triggerNotification !== false &&
              incidentType !== "countPersons" &&
              incidentType !== "countVehicles";

            if (shouldTriggerAlert) {
              void triggerAlertOnIncident({
                detectionType: incidentType,
                nvrId,
                channelId,
                saved: recentIncident,
                adminId
              }).catch((err) => logger.error(err));
            }
          // }
          delete incidentObj.timeSeries;
          return res
            .status(200)
            .json(
              Response.userSuccessResp("Incident updated successfully", {
                Incident: incidentObj,
              }),
            );
        }
      }

      // Else: Create new incident
      const newIncident = new Model({
        ...req.body,
        userId,
        timeOfIncident: currentTime,
      });

      if (incidentType === "countPersons" || incidentType === "countVehicles") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.timeSeries.push({
          count: req.body.count ?? 0, // or appropriate value
        });
      } else if (incidentType === "genericObjectDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.timeSeries.push({
          objectsDetected: req.body.objectsDetected,
        });
      } else if (incidentType === "lineCrossing") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        const type = req.body.type || "all";
        const entry = Number(req.body.entry ?? 0);
        const exit = Number(req.body.exit ?? 0);
        newIncident.type = type;
        newIncident.totalEntry = entry;
        newIncident.totalExit = exit;
        newIncident.timeSeries.push({
          timestamp: req?.body?.timeOfIncident || new Date(),
          type,
          entry,
          exit,
        });
      } else if (incidentType === "crowdDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.croudCount = req.body.count;
        newIncident.timeSeries.push({
          croudCount: req.body.count ?? 0, // or appropriate value
        });
      } else if (incidentType === "personalProtectiveEquipment") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.helmetCount = req.body.count;
        newIncident.timeSeries.push({
          croudCount: req.body.count ?? 0, // or appropriate value
          ppe: {
            helmet: {
              yes: req.body.ppe?.helmet?.yes ?? 0,
              no: req.body.ppe?.helmet?.no ?? 0,
            },
            safety_jacket: {
              yes: req.body.ppe?.safety_jacket?.yes ?? 0,
              no: req.body.ppe?.safety_jacket?.no ?? 0,
            },
          },
        });
      } else if (incidentType === "lightDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.currentStatus = req.body?.lightDetection?.status;
        newIncident.currentImage = req.body?.lightDetection?.image;
        newIncident.timeSeries.push({
          status: req.body?.lightDetection?.status,
          Image: req.body?.lightDetection?.Image,
        });
      } else if (incidentType === "doorDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        ((newIncident.currentStatus = req?.body?.doorDetectionPayload?.status),
          (newIncident.currentImage = req?.body?.doorDetectionPayload?.Image));
        newIncident.timeSeries.push({
          status: req?.body?.doorDetectionPayload?.status,
          Image: req?.body?.doorDetectionPayload?.Image,
        });
      } else if (incidentType === "bagDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        ((newIncident.count = req?.body?.count),
          (newIncident.Image = req?.body?.Image));
      } else if (incidentType === "vehicleDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        ((newIncident.count = req?.body?.count),
          (newIncident.Image = req?.body?.Image));
      } else if (incidentType === "deskAbsence") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.personPresent = req?.body?.personPresent;
        newIncident.Image = req?.body?.Image;
        newIncident.timeSeries.push({
          personCount: req.body.personCount ?? 0,
          zoneName: req.body.zoneName,
          personPresent: req.body.personPresent,
        });
      } else if (incidentType === "guardAbsence") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.personPresent = req?.body?.personPresent;
        newIncident.Image = req?.body?.Image;
      } else if (incidentType === "vehicleObstruction") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        ((newIncident.count = req?.body?.count),
          (newIncident.Image = req?.body?.Image));
      } else if (incidentType === "vehicleTypeDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        ((newIncident.vehicleType = req?.body?.vehicleType),
          (newIncident.Image = req?.body?.Image));
      } else if (incidentType === "loiteringDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.Image = req?.body?.Image;
      } else if (incidentType === "tableOccupancyDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.Image = req?.body?.Image;
      } else if (incidentType === "mobilePhoneDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.Image = req?.body?.Image;
      } else if (incidentType === "foodServicePPEDetection") {
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.Image = req?.body?.Image;
        newIncident.timeSeries.push({
          croudCount: req.body.count ?? 0, // or appropriate value
          ppe: {
            gloves: {
              yes: req.body.ppe?.gloves?.yes ?? 0,
              no: req.body.ppe?.gloves?.no ?? 0,
            },
            apron: {
              yes: req.body.ppe?.apron?.yes ?? 0,
              no: req.body.ppe?.apron?.no ?? 0,
            }, 
            vest: {
              yes: req.body.ppe?.vest?.yes ?? 0,
              no: req.body.ppe?.vest?.no ?? 0,
            },
            mask: {
              yes: req.body.ppe?.mask?.yes ?? 0,
              no: req.body.ppe?.mask?.no ?? 0,
            }, 

          },
        });
      }else if(incidentType === "carModelDetection"){
        newIncident.timeOfIncident = req?.body?.timeOfIncident;
        newIncident.Image = req?.body?.Image;
        newIncident.model_name = req?.body?.model_name;
        newIncident.vehicleNumber = req?.body?.vehicleNumber;
        // The DS has shipped these three under different keys across pipeline
        // versions (`colour`, `make`/`brand`, `model_year`). Accept every
        // spelling we have seen: the schema keeps one canonical field each,
        // and an unrecognised key would otherwise be stored as null and render
        // as "--" in Car Logs even though the DS did send a value.
        newIncident.color = firstFilled(req?.body?.color, req?.body?.colour);
        newIncident.company = firstFilled(
          req?.body?.company,
          req?.body?.make,
          req?.body?.brand,
          req?.body?.manufacturer,
        );
        newIncident.year = toModelYear(
          req?.body?.year ?? req?.body?.model_year ?? req?.body?.manufacture_year,
        );
      }



      const incidentObj = await newIncident.save();
      let saved = incidentObj.toObject();

      const channelData = await channelsModel
        .findOne({ _id: channelId })
        .populate("profile")
        .lean();

      let detectionType = channelData.detections[`${incidentType}Settings`];
      if (!detectionType) {
        return res.send(
          Response.validationFailResp(
            "Detection setting not found!",
            "Validation Failed!",
          ),
        );
      }

      let detectionSetting = await DetectionSetting.findOne({
        _id: detectionType.id,
      });

      saved.channelName = channel?.name;
      if (detectionSetting) {
        saved.detectionSetting = detectionSetting;
      }
      saved.push = channelData?.profile?.notification?.channels?.push;
      // await sendPayloadToUser(userId, `cameradetection_${saved.nvrId}_${saved.channelId}`, saved);
      void sendPayloadToUser(
        userId,
        `cameradetection_${isAdminExist?._id}`,
        saved,
      );

      // ! alert trigger
      // if (channelData?.profile?.notification?.channels?.email===true) {

      // if (
      //   channelData?.profile &&
      //   (await JobsService.handleProfileNotification(
      //     channelData?.profile,
      //     channelId,
      //   ))
      // ) {
        const shouldTriggerAlert =
          triggerNotification !== false &&
          incidentType !== "countPersons" &&
          incidentType !== "countVehicles";

        if (shouldTriggerAlert) {
          void triggerAlertOnIncident({
            detectionType: incidentType,
            nvrId,
            channelId,
            saved,
            adminId
          }).catch((err) => logger.error(err));
        }
      // }

      delete saved.timeSeries;
      return res
        .status(200)
        .json(
          Response.userSuccessResp("Incident created successfully", {
            Incident: saved,
          }),
        );
    } catch (error) {
      logger.error(`[INCIDENT_CREATE_ERROR] Failed to create incident`, {
        incidentType: req.body?.incidentType,
        channelId: req.body?.channelId,
        nvrId: req.body?.nvrId,
        adminId: req.body?.adminId,
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString(),
      });
      next(new AppError("Failed to create Incident", 500));
    }
  }

  async getAllIncidentsById(req, res, next) {
    try {
      const { channelId, incidentId, skip = 0, limit = 10 } = req.query;
      let user_id = req?.verified?.userData?.user_id;
      // Validate presence of at least one
      if (!channelId && !incidentId) {
        return res
          .status(400)
          .json({ error: "Either channelId or incidentId must be provided." });
      }

      let filter = {
        Image: { $exists: true, $nin: [null, "", undefined, "https://"] },
        userId: user_id.toString(),
      };

      // If channelId is provided, validate and check existence
      if (channelId) {
        const { error, value } = incidentsValidate.getChannel({ channelId });
        if (error) return res.status(400).json({ error });

        const isChannelExist = await channelsModel.findOne({
          _id: value.channelId,
        }).setOptions({ includeInactive: true });
        if (!isChannelExist)
          return res.status(400).json({ error: "No channel found." });

        filter.channelId = new mongoose.Types.ObjectId(value.channelId);
      }

      // If incidentId is provided instead
      if (!channelId && incidentId) {
        if (!mongoose.Types.ObjectId.isValid(incidentId)) {
          return res.status(400).json({ error: "Invalid incidentId format" });
        }
        filter._id = new mongoose.Types.ObjectId(incidentId);
      }

      // Get paginated data using aggregation
      const data = await Incident.aggregate([
        { $match: filter },
        // Lookup NVR info
        {
          $lookup: {
            from: "nvrs", // Collection name for NVRs
            localField: "nvrId",
            foreignField: "_id",
            as: "nvrData",
          },
        },
        {
          $unwind: {
            path: "$nvrData",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Lookup Channel info
        {
          $lookup: {
            from: "channels", // Collection name for Channels
            localField: "channelId",
            foreignField: "_id",
            as: "channelData",
          },
        },
        {
          $unwind: {
            path: "$channelData",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $skip: Number(skip) },
        { $limit: Number(limit) },
      ]);

      // Name the registered user each detected plate belongs to, so a
      // deep-linked Vehicle Detection incident reads the same as the list.
      await attachTaggedUsers(data, req?.verified?.userData?.adminId);

      // Get total count
      const totalCount = await Incident.countDocuments(filter);

      res.status(200).json({
        message: "Incidents fetched successfully",
        totalCount,
        data,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch incidents", 500));
    }
  }

  async getAllIncidents(req, res, next) {
    try {
      let user_id = req?.verified?.userData?.user_id;
      let memberId = req?.verified?.userData?.memberId;
      const adminId = req?.verified?.userData?.adminId;

      let authorizedNvrs = req?.verified?.authorizedNvr?.nvrIds || [];
      let authorizedChannels = req?.verified?.authorizedChannel?.channels || [];
      let authorizedDepartments =
        req?.verified?.authorizedChannel?.departmentIds || [];
      let authorizedLocations = req?.verified?.authorizedNvr?.locations || [];
      if (!user_id) {
        logger.error("User ID not provided in request");
        return res
          .status(400)
          .json(Response.userFailResp("Please provide user_id"));
      }
      const { skip = 0, limit = 10 } = req.query;
      let {
        startDate,
        endDate,
        nvrId,
        channelId,
        location,
        department,
        reportStatus,
        checkInOrCheckOutCamera,
        incidentTypeFilter,
        severity,
        statusFilter,
        // Vehicle Detection: free-text over plate + tagged user's name, and
        // an all/tagged/untagged filter. Both are no-ops for other types,
        // whose incidents carry no vehicleNumber.
        search,
        tagStatus,
      } = req.body;

      // Shared with the Analytics overview breakdown so the "why is this in the
      // total but not in Alerts?" explanation can never drift from what this
      // list actually filters on.
      const matchStage = {
        Image: { $exists: true, $nin: [null, "", undefined, "https://"] },
        incidentType: { $nin: ALERT_FEED_EXCLUDED_TYPES },
        userId: user_id.toString(),
        incidentName: { $not: /Guard Present/i }
      };

      // Filter: status (new / resolved). Defaults to
      // unresolved-only (previous hardcoded behavior) when nothing is selected.
      const statusFilters = Array.isArray(statusFilter)
        ? statusFilter
        : statusFilter
        ? [statusFilter]
        : [];
      const STATUS_CONDITIONS = {
        new: { resolved: false, $or: [{ "report.status": { $exists: false } }, { "report.status": { $ne: true } }] },
        resolved: { resolved: true },
        reported: { "report.status": true, resolved: { $ne: true } },
      };
      if (statusFilters.length) {
        const statusOr = statusFilters
          .map((s) => STATUS_CONDITIONS[s])
          .filter(Boolean);
        if (statusOr.length) {
          matchStage.$and = [...(matchStage.$and || []), { $or: statusOr }];
        }
      } else {
        matchStage.resolved = false;
      }

      // Collect every channel/nvr scoping filter as a candidate set of string ids.
      // These are intersected (AND) at the end so multiple filters narrow together
      // instead of overwriting each other. An empty set => no matches (not "all").
      const channelIdFilterSets = [];
      const nvrIdFilterSets = [];
      const toIdArray = (val) =>
        (Array.isArray(val)
          ? val
          : String(val).split(",").map((s) => s.trim())
        ).filter(Boolean);
      const toIdStr = (id) => id?.toString?.() ?? String(id);
      // True only when a filter actually has values (ignores [] and "").
      const hasFilter = (val) => toIdArray(val ?? "").length > 0;

      if (checkInOrCheckOutCamera === "checkin") {
        let checkInCameraIds = [];
        if (memberId === undefined) {
          let channels = await channelsModel.find({
            checkType: "checkin",
          });
          checkInCameraIds.push(...channels);
        } else {
          let channels = await channelsModel.find(
            { checkType: "checkin" },
            null,
            { memberId },
          );
          checkInCameraIds.push(...channels);
        }

        channelIdFilterSets.push(
          checkInCameraIds.map((camera) => toIdStr(camera._id)),
        );
      } else if (checkInOrCheckOutCamera === "checkout") {
        let checkoutCameraIds = [];
        if (memberId === undefined) {
          let channels = await channelsModel.find({
            checkType: "checkout",
          });
          checkoutCameraIds.push(...channels);
        } else {
          let channels = await channelsModel.find(
            { checkType: "checkout" },
            null,
            { memberId },
          );
          checkoutCameraIds.push(...channels);
        }

        channelIdFilterSets.push(
          checkoutCameraIds.map((camera) => toIdStr(camera._id)),
        );
      } else if (checkInOrCheckOutCamera === "both") {
        let checkoutCameraIds = [];
        if (memberId === undefined) {
          let channels = await channelsModel.find({
            checkType: ["checkin", "checkout"],
          });
          checkoutCameraIds.push(...channels);
        } else {
          let channels = await channelsModel.find(
            { checkType: ["checkin", "checkout"] },
            null,
            { memberId },
          );
          checkoutCameraIds.push(...channels);
        }

        channelIdFilterSets.push(
          checkoutCameraIds.map((camera) => toIdStr(camera._id)),
        );
      }

      if (startDate && endDate) {
        const timezone = "Asia/Kolkata"; // your local timezone

        matchStage.timeOfIncident = {
          $gte: momentTZ.tz(startDate, timezone).startOf("day").toDate(),
          $lte: momentTZ.tz(endDate, timezone).endOf("day").toDate(),
        };
      }

      // Reported incidents are an active bucket; resolved reports should not leak back into it.
      if (reportStatus !== undefined && reportStatus) {
        matchStage["report.status"] = reportStatus;
        matchStage.resolved = { $ne: true };
      }

      // Filter: severity (single value or array). Accept both legacy title-case
      // values and the v2 chip keys; Medium and Moderate are the same bucket.
      if (severity !== undefined && severity !== null && severity !== "") {
        const severities = (Array.isArray(severity) ? severity : [severity])
          .filter((item) => item !== undefined && item !== null && item !== "")
          .map((item) => String(item));
        const expandedSeverities = new Set();
        severities.forEach((item) => {
          const lower = item.toLowerCase();
          const variants = lower === "moderate" || lower === "medium"
            ? ["moderate", "medium"]
            : [lower];
          variants.forEach((variant) => {
            expandedSeverities.add(variant);
            expandedSeverities.add(variant.toUpperCase());
            expandedSeverities.add(variant.charAt(0).toUpperCase() + variant.slice(1));
          });
        });
        if (expandedSeverities.size) {
          matchStage.severity = { $in: Array.from(expandedSeverities) };
        }
      }

      const orConditions = [];

      /* ---------------------------------------------------
          Crowd Detection Filter
        --------------------------------------------------- */
      const crowdFilters = req.body?.incidentCrowdDetectionFilters;

      if (crowdFilters?.incidentType === "crowdDetection") {
        const crowdMatch = {
          incidentType: "crowdDetection",
        };

        if (
          crowdFilters?.count?.min !== undefined &&
          crowdFilters?.count?.max !== undefined
        ) {
          crowdMatch.croudCount = {
            $gte: crowdFilters.count.min,
            $lte: crowdFilters.count.max,
          };
        }

        orConditions.push(crowdMatch);
      }

      /* ---------------------------------------------------
          Personal Protective Equipment Filter
        --------------------------------------------------- */
      const ppeFilters = req.body?.incidentpersonalProtectiveEquipmentFilters;

      if (ppeFilters?.incidentType === "personProtectiveEquipment") {
        const ppeMatch = {
          incidentType: "personalProtectiveEquipment",
        };

        // Helmet - YES
        if (
          ppeFilters?.helmet?.yes?.min !== undefined &&
          ppeFilters?.helmet?.yes?.max !== undefined
        ) {
          ppeMatch["ppe.helmet.yes"] = {
            $gte: ppeFilters.helmet.yes.min,
            $lte: ppeFilters.helmet.yes.max,
          };
        }

        // Helmet - NO
        if (
          ppeFilters?.helmet?.no?.min !== undefined &&
          ppeFilters?.helmet?.no?.max !== undefined
        ) {
          ppeMatch["ppe.helmet.no"] = {
            $gte: ppeFilters.helmet.no.min,
            $lte: ppeFilters.helmet.no.max,
          };
        }

        // Safety Jacket - YES
        if (
          ppeFilters?.safety_jacket?.yes?.min !== undefined &&
          ppeFilters?.safety_jacket?.yes?.max !== undefined
        ) {
          ppeMatch["ppe.safety_jacket.yes"] = {
            $gte: ppeFilters.safety_jacket.yes.min,
            $lte: ppeFilters.safety_jacket.yes.max,
          };
        }

        // Safety Jacket - NO
        if (
          ppeFilters?.safety_jacket?.no?.min !== undefined &&
          ppeFilters?.safety_jacket?.no?.max !== undefined
        ) {
          ppeMatch["ppe.safety_jacket.no"] = {
            $gte: ppeFilters.safety_jacket.no.min,
            $lte: ppeFilters.safety_jacket.no.max,
          };
        }

        orConditions.push(ppeMatch);
      }

      //Default Incident Type Filter
      if (incidentTypeFilter?.length > 0) {
        matchStage.incidentType = {
          $nin: ["countPersons", "lineCrossing"],
          $in: incidentTypeFilter,
        };
      }

      /* ---------------------------------------------------
          Apply OR conditions safely
        --------------------------------------------------- */
      if (orConditions.length > 0) {
        matchStage.$or = orConditions;
      }

      // Filter: specific NVR (id, comma-separated string, or array)
      if (hasFilter(nvrId)) {
        nvrIdFilterSets.push(toIdArray(nvrId));
      }

      // Filter: specific channel/camera (id, comma-separated string, or array)
      if (hasFilter(channelId)) {
        channelIdFilterSets.push(toIdArray(channelId));
      }

      // Filter: by location â†’ constrain to NVRs in those locations
      if (hasFilter(location)) {
        const locations = toIdArray(location);
        const nvrs = await nvrModel
          .find({ userId: user_id.toString(), location: { $in: locations } })
          .select("_id");
        nvrIdFilterSets.push(nvrs.map((nvr) => toIdStr(nvr._id)));
      }

      // Filter: by department â†’ constrain to channels in those departments
      if (hasFilter(department)) {
        const deptIds = toIdArray(department);
        const channels = await channelsModel
          .find({ userId: user_id.toString(), department: { $in: deptIds } })
          .select("_id");
        channelIdFilterSets.push(channels.map((ch) => toIdStr(ch._id)));
      }

      // Member restriction: limit to the member's authorized channels.
      if (memberId) {
        channelIdFilterSets.push((authorizedChannels || []).map(toIdStr));
      }

      // Intersect all collected sets (AND). Empty intersection => no results.
      const intersectIds = (sets) =>
        sets.reduce((acc, set) => {
          const cur = new Set(set);
          return acc.filter((id) => cur.has(id));
        });

      if (channelIdFilterSets.length > 0) {
        const ids = intersectIds(channelIdFilterSets);
        matchStage.channelId = {
          $in: ids.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      if (nvrIdFilterSets.length > 0) {
        const ids = intersectIds(nvrIdFilterSets);
        matchStage.nvrId = {
          $in: ids.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      // Vehicle tagging (Vehicle Detection incidents): filter by
      // tagged/untagged and search by plate or by the tagged user's name.
      // Built once and reused by the count aggregation below so the severity /
      // status chips can never disagree with the grid they sit above.
      const wantsTagFilter = tagStatus === "tagged" || tagStatus === "untagged";
      const searchTerm = typeof search === "string" ? search.trim() : "";
      const vehicleStages = [];

      if (wantsTagFilter || searchTerm) {
        const taggedPlates = wantsTagFilter ? await findTaggedPlates(adminId) : [];
        vehicleStages.push(...vehicleTagStages(tagStatus, taggedPlates));

        if (searchTerm) {
          // The owner's name lives on the user record, so searching by name
          // has to resolve to the plates those users hold first.
          const ownerPlates = await findTaggedPlates(adminId, { search: searchTerm });
          const rx = { $regex: escapeRegex(searchTerm), $options: "i" };
          vehicleStages.push({
            $match: {
              $or: [
                { vehicleNumber: rx },
                ...(ownerPlates.length
                  ? [{ [NORM_PLATE_FIELD]: { $in: ownerPlates } }]
                  : []),
              ],
            },
          });
        }

        vehicleStages.push(stripNormPlateStage);
      }

      // Aggregated paginated data
      const data = await Incident.aggregate([
        // 1ï¸âƒ£ Match early (uses index)
        {
          $match: {
            ...matchStage,
          },
        },
        ...vehicleStages,

        // 2) Sort by the most relevant action time for the current bucket.
        // Resolved uses resolution time, Reported uses reported time, Active uses incident/created time.
        {
          $addFields: {
            sortAt: {
              $cond: [
                { $eq: ["$resolved", true] },
                { $ifNull: ["$report.resolvedAt", "$updatedAt"] },
                {
                  $cond: [
                    { $eq: ["$report.status", true] },
                    { $ifNull: ["$report.reportedAt", "$updatedAt"] },
                    { $ifNull: ["$timeOfIncident", "$createdAt"] },
                  ],
                },
              ],
            },
          },
        },
        {
          $sort: { sortAt: -1, createdAt: -1 },
        },

        // 3ï¸âƒ£ Pagination BEFORE lookups
        {
          $skip: Number(skip),
        },
        {
          $limit: Number(limit),
        },

        // 4ï¸âƒ£ Lookup NVR (small dataset now)
        {
          $lookup: {
            from: "nvrs",
            localField: "nvrId",
            foreignField: "_id",
            as: "nvrData",
          },
        },
        {
          $unwind: {
            path: "$nvrData",
            preserveNullAndEmptyArrays: true,
          },
        },

        // 5ï¸âƒ£ Lookup Channel
        {
          $lookup: {
            from: "channels",
            localField: "channelId",
            foreignField: "_id",
            as: "channelData",
          },
        },
        {
          $unwind: {
            path: "$channelData",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]);

      // Vehicle Detection incidents carry only a plate; resolve who it
      // belongs to so the Incident Center can show plate + tagged user.
      await attachTaggedUsers(data, req?.verified?.userData?.adminId);

      const [countStats = {}] = await Incident.aggregate([
        { $match: { ...matchStage } },
        ...vehicleStages,
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            high: {
              $sum: {
                $cond: [{ $eq: [{ $toLower: { $ifNull: ["$severity", ""] } }, "high"] }, 1, 0],
              },
            },
            moderate: {
              $sum: {
                $cond: [{ $in: [{ $toLower: { $ifNull: ["$severity", ""] } }, ["moderate", "medium"]] }, 1, 0],
              },
            },
            low: {
              $sum: {
                $cond: [{ $eq: [{ $toLower: { $ifNull: ["$severity", ""] } }, "low"] }, 1, 0],
              },
            },
            new: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$resolved", true] },
                      { $ne: ["$report.status", true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            resolved: {
              $sum: { $cond: [{ $eq: ["$resolved", true] }, 1, 0] },
            },
            reported: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$report.status", true] },
                      { $ne: ["$resolved", true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const totalCount = countStats.total || 0;

      res.status(200).json({
        message: "Incidents fetched successfully",
        totalCount,
        counts: {
          severity: {
            all: totalCount,
            high: countStats.high || 0,
            moderate: countStats.moderate || 0,
            low: countStats.low || 0,
          },
          status: {
            all: totalCount,
            new: countStats.new || 0,
            resolved: countStats.resolved || 0,
            reported: countStats.reported || 0,
          },
        },
        data,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to update camera", 500));
    }
  }

  async updateIncident(req, res, next) {
    try {
      const incidentId = req.params.id;
      const updates = { ...req.body };

      if (updates.resolved === true) {
        updates["report.status"] = false;
        updates["report.description"] = "";
        updates["report.resolvedAt"] = new Date();
        updates.$unset = {
          ...(updates.$unset || {}),
          "report.reportedAt": "",
        };
      }

      const updatedIncident = await Incident.findByIdAndUpdate(
        incidentId,
        updates,
        {
          new: true,
          runValidators: true,
        },
      );

      if (!updatedIncident) {
        return res
          .status(404)
          .json(Response.notFoundResp("Incident not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Incident updated successfully", {
          Incident: updatedIncident,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to update Incident", 500));
    }
  }

  async editIncidentDetails(req, res, next) {
    try {

    const { error, value } = incidentsValidate.editIncidentDetails(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details.map((d) => d.message).join(", "),
      });
    }


      const incidentId = req.params.id;
      const userId = req?.verified?.userData?.user_id;
      const updates = req.body;

      // Exclude Image field from updates
      delete updates.Image;

      // Validate NVR and Channel if being updated
      if (updates.nvrId || updates.channelId) {
        if (updates.nvrId) {
          const nvr = await nvrModel.findOne({
            _id: updates.nvrId,
            userId,
          });
          if (!nvr) {
            return res.status(400).json({
              error: "Invalid NVR ID or NVR does not belong to this user",
            });
          }
        }

        if (updates.channelId) {
          const channel = await Channel.findOne({
            _id: updates.channelId,
            userId,
          });
          if (!channel) {
            return res.status(400).json({
              error: "Invalid Channel ID or Channel does not belong to this user",
            });
          }
        }
      }

      // Find the incident first to determine its discriminator type
      const incidentDoc = await Incident.findById(incidentId);
      if (!incidentDoc) {
        return res
          .status(404)
          .json(Response.notFoundResp("Incident not found"));
      }

      // Fields like vehicleNumber, licensePlate, etc. live on the discriminator
      // schema (e.g. VehicleDetectionSchema), NOT on the base Incident schema.
      // Updating through the base Incident model causes Mongoose to strip those
      // paths (strict mode). Use the discriminator model that matches the
      // incident's incidentType so all child-schema fields are updatable.
      const UpdateModel = modelMap[incidentDoc.incidentType] || Incident;

      const updatedIncident = await UpdateModel.findByIdAndUpdate(
        incidentId,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!updatedIncident) {
        return res
          .status(404)
          .json(Response.notFoundResp("Incident not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Incident details updated successfully", {
          Incident: updatedIncident,
        }),
      );
    } catch (error) {
      logger.error(`[EDIT_INCIDENT_DETAILS_ERROR] Failed to edit incident ${req.params.id}:`, {
        errorMessage: error.message,
        errorStack: error.stack,
        userId: req?.verified?.userData?.user_id,
      });
      next(new AppError("Failed to edit Incident details", 500));
    }
  }

  async deleteIncident(req, res, next) {
    try {
      const { id: incidentId } = req.params;

      const incident = await Incident.findById(incidentId);
      if (!incident) {
        return res
          .status(404)
          .json(Response.notFoundResp("Incident not found"));
      }

      if (incident.Image?.trim()) {
        if (incident.Image.includes("..")) {
          return res.status(400).json({
            status: "failed",
            message: "Invalid image path",
          });
        }

        const fileName = path.basename(incident.Image);
        const cachedFilePath = path.join(cacheDir, fileName);

        // delete cached file (non-blocking)
        if (fs.existsSync(cachedFilePath)) {
          await fs.promises.unlink(cachedFilePath);
          console.log(`Deleted from cache: ${cachedFilePath}`);
        }

        try {
          await withSFTPConnection(async (sftp) => {
            const exists = await sftp.exists(incident.Image);
            if (exists) {
              await sftp.delete(incident.Image);
              console.log(`Deleted from SFTP: ${incident.Image}`);
            } else {
              console.warn(`SFTP file missing: ${incident.Image}`);
            }
          });
        } catch (err) {
          console.error("SFTP delete failed:", err.message);
        }
      }

      await Incident.findByIdAndDelete(incidentId);

      return res
        .status(200)
        .json(Response.userSuccessResp("Incident deleted successfully"));
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to delete Incident", 500));
    }
  }

  async deleteIncidentsByIds(req, res, next) {
    try {
      //Find all the incidents by ids and delete in SFTP and mongodb
      const { incidentIds } = req.body;

      if (!incidentIds || incidentIds.length === 0) {
        return res.status(400).json({
          status: "failed",
          message: "Invalid incident IDs",
        });
      }
      const incidents = await Incident.find({ _id: { $in: incidentIds } });
      if (!incidents || incidents.length !== incidentIds.length) {
        return res.status(404).json({
          status: "failed",
          message: "Incidents not found",
        });
      }
      for (const incident of incidents) {
        if (incident.Image?.trim()) {
          if (incident.Image.includes("..")) {
            return res.status(400).json({
              status: "failed",
              message: "Invalid image path",
            });
          }

          const fileName = path.basename(incident.Image);
          const cachedFilePath = path.join(cacheDir, fileName);

          // delete cached file (non-blocking)
          if (fs.existsSync(cachedFilePath)) {
            await fs.promises.unlink(cachedFilePath);
          }

          try {
            await withSFTPConnection(async (sftp) => {
              const exists = await sftp.exists(incident.Image);
              if (exists) {
                await sftp.delete(incident.Image);
                console.log(`Deleted from SFTP: ${incident.Image}`);
              } else {
                console.warn(`SFTP file missing: ${incident.Image}`);
              }
            });
          } catch (err) {
            console.error("SFTP delete failed:", err.message);
            next(new AppError("Failed to delete incidents", 500));
          }
        }
      }
      await Incident.deleteMany({ _id: { $in: incidentIds } });
      return res.status(200).json({
        status: "success",
        message: "Incidents deleted successfully",
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to delete incidents", 500));
    }
  }

  async getIncidentsDetails(req, res, next) {
    try {
      const { skip = 0, limit = 10, search = "", channelId, nvrId } = req.query;
      const {
        criticalIncidents,
        resolvedIncidents,
        ActiveChannels,
        totalIncidents,
        startDate,
        endDate,
      } = req.body;

      let memberId = req?.verified?.userData?.memberId;
      let authorizedNvrs = req?.verified?.authorizedNvr?.nvrIds || [];
      let authorizedChannels = req?.verified?.authorizedChannel?.channels || [];
      let authorizedDepartments =
        req?.verified?.authorizedChannel?.departmentIds || [];
      let authorizedLocations = req?.verified?.authorizedNvr?.locations || [];

      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      // âœ… Allow only one filter at a time
      const trueFlags = [
        criticalIncidents,
        resolvedIncidents,
        ActiveChannels,
        totalIncidents,
      ].filter(Boolean);
      if (trueFlags.length > 1) {
        return res.send(
          Response.validationFailResp(
            "Only one filter should be true at a time.",
            "Validation failed!",
          ),
        );
      }

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.timeOfIncident = {
          $gte: new Date(`${startDate}T00:00:00.000Z`),
          $lte: new Date(`${endDate}T23:59:59.999Z`),
        };
      }

      const userMatch = { userId: data.user_id.toString(), ...dateFilter };

      const notificationExclusion = {
        $or: [{ triggerNotification: { $ne: true } }],
      };

      // âœ… Active Channels
      if (ActiveChannels) {
        let searchMatchStage = {};

        if (search) {
          if (
            typeof search === "string" &&
            isNaN(search) &&
            search.trim() !== ""
          ) {
            // Escape special regex characters like (), [], ., *, +, etc.
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            const fields = [
              "name",
              "customName",
              "ipAddress",
              "model",
              "serialNumber",
              "firmwareVersion",
              "streamEndpoint",
              "severity",
              "type",
              "nvrData.nvrName",
            ];

            searchMatchStage.$or = fields.map((field) => ({
              [field]: { $regex: escapedSearch, $options: "i" },
            }));
          } else if (!isNaN(search) && search !== null) {
            const numericQuery = parseFloat(search);
            searchMatchStage.$or = [{ Unit: numericQuery }];
          }
        }

        const matchStage = {
          userId: data.user_id.toString(),
          $or: [
            // Case 1: detections exist and have valid ObjectIds
            {
              $or: [
                { "detections.countPersonsSettings.enabled": true },
                { "detections.motionDetectionSettings.enabled": true },
                { "detections.genericObjectDetectionSettings.enabled": true },
                { "detections.countVehiclesSettings.enabled": true },
                { "detections.loiteringWithoutAuthSettings.enabled": true },
                { "detections.loiteringWithAuthSettings.enabled": true },
                { "detections.unauthorizedAccessSettings.enabled": true },
                { "detections.lineCrossingSettings.enabled": true },
                { "detections.fireSmokeDetectionSettings.enabled": true },
                { "detections.weaponDetectionSettings.enabled": true },
                { "detections.unattendedBaggageDetectionSettings.enabled": true },
                { "detections.personalProtectiveEquipmentSettings.enabled": true },
                { "detections.crowdDetectionSettings.enabled": true },
                { "detections.doorDetectionSettings.enabled": true },
                { "detections.lightDetectionSettings.enabled": true },
                { "detections.vehicleDetectionSettings.enabled": true },
                { "detections.vehicleObstructionSettings.enabled": true },
                { "detections.conveyorDetectionSettings.enabled": true },
                { "detections.crusherDetectionSettings.enabled": true },
                { "detections.waterSpillageDetectionSettings.enabled": true },
                { "detections.guardPresentSettings.enabled": true },
                { "detections.deskAbsenceSettings.enabled": true },
                { "detections.vehicleTypeDetectionSettings.enabled": true }
              ]
            },
            // Case 2: detections field does not exist or is empty
            // { detections: { $exists: false } },
            // { detections: {} },
            // { detections: null }
          ],
        };

        if (nvrId) {
          matchStage.nvrId = new mongoose.Types.ObjectId(nvrId);
        }
        if (channelId) {
          matchStage._id = new mongoose.Types.ObjectId(channelId);
        }
        if (!matchStage._id && memberId) {
          if (authorizedChannels.length > 0) {
            matchStage._id = { $in: authorizedChannels };
          } else {
            // No authorized channels for member
            matchStage._id = { $in: [] };
          }
        }
        const basePipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: "nvrs",
              localField: "nvrId",
              foreignField: "_id",
              as: "nvrData",
            },
          },
          { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
        ];

        if (Object.keys(searchMatchStage).length > 0) {
          basePipeline.push({ $match: searchMatchStage });
        }
        
        const [countResult, channels] = await Promise.all([
          channelsModel.aggregate([...basePipeline, { $count: "totalCount" }]),
          channelsModel.aggregate([
            ...basePipeline,
            { $sort: { createdAt: -1 } },
            { $skip: parseInt(skip) },
            { $limit: parseInt(limit) },
          ]),
        ]);
        let filtereddata = {};
        if (memberId) {
          if (authorizedChannels.length > 0) {
            filtereddata._id = { $in: authorizedChannels };
            filtereddata.userId = data.user_id.toString();
          } else {
            // No authorized channels for member
            matchStage._id = { $in: [] };
            filtereddata.userId = data.user_id.toString();
          }
        } else {
          filtereddata.userId = data.user_id.toString();
        }
        let overAllCameraCount =
          await channelsModel.countDocuments(filtereddata);
        const totalCount = countResult[0]?.totalCount || 0;

        return res.send(
          Response.userSuccessResp("Successfully fetched Active Channels", {
            totalCount,
            overAllCameraCount,
            data: channels,
          }),
        );
      }

      // âœ… Critical Incidents
      if (criticalIncidents) {
        let searchMatchStage = {};

        const query = {
          ...userMatch,
          severity: "high",
          Image: {'$exists': true, '$nin': [null, '', undefined, 'https://']},
          userId: data.user_id.toString(),
          incidentType: { '$nin': ['countPersons', 'lineCrossing', 'countVehicles'] },
          resolved: false,
          incidentName: { '$not': /Guard Present/i }
        };
        if (nvrId) {
          query.nvrId = new mongoose.Types.ObjectId(nvrId);
        }
        if (channelId) {
          query.channelId = new mongoose.Types.ObjectId(channelId);
        }
        if (search) {
          if (
            typeof search === "string" &&
            isNaN(search) &&
            search.trim() !== ""
          ) {
            const fields = [
              "timeOfIncident",
              "DOS",
              "description",
              "incidentName",
              "cameraId",
              "userId",
              "zone",
              "severity",
              "type",
            ];
            searchMatchStage.$or = fields.map((field) => ({
              [field]: { $regex: search, $options: "i" },
            }));
          } else if (!isNaN(search) && search !== null) {
            const numericQuery = parseFloat(search);
            searchMatchStage.$or = [{ Unit: numericQuery }];
          }
        }
        if (!query.channelId && memberId) {
          if (authorizedChannels.length > 0) {
            query.channelId = { $in: authorizedChannels };
          } else {
            // No authorized channels for member
            query.channelId = { $in: [] };
          }
        }
        const basePipeline = [
          { $match: query },
          {
            $lookup: {
              from: "nvrs",
              localField: "nvrId",
              foreignField: "_id",
              as: "nvrData",
            },
          },
          {
            $lookup: {
              from: "channels",
              localField: "channelId",
              foreignField: "_id",
              as: "channelData",
            },
          },
          { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
          {
            $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true },
          },
          { $match: searchMatchStage },
        ];

        const [countResult, incidents] = await Promise.all([
          Incident.aggregate([...basePipeline, { $count: "totalCount" }]),
          Incident.aggregate([
            ...basePipeline,
            { $sort: { createdAt: -1 } },
            { $skip: parseInt(skip) },
            { $limit: parseInt(limit) },
          ]),
        ]);

        const totalCount = countResult[0]?.totalCount || 0;

        return res.send(
          Response.userSuccessResp("Successfully fetched Critical incidents.", {
            totalCount,
            data: incidents,
          }),
        );
      }

      // âœ… Resolved Incidents
      if (resolvedIncidents) {
        let searchMatchStage = {};

        const query = {
          ...userMatch,
          resolved: true,
          Image: { $exists: true, $nin: [null, "", undefined, "https://"] },
          incidentType: { $nin: ["countPersons", "lineCrossing"] },
        };
        if (nvrId) {
          query.nvrId = new mongoose.Types.ObjectId(nvrId);
        }
        if (channelId) {
          query.channelId = new mongoose.Types.ObjectId(channelId);
        }
        if (search) {
          if (
            typeof search === "string" &&
            isNaN(search) &&
            search.trim() !== ""
          ) {
            const fields = [
              "timeOfIncident",
              "DOS",
              "description",
              "incidentName",
              "cameraId",
              "userId",
              "zone",
              "severity",
              "type",
            ];
            searchMatchStage.$or = fields.map((field) => ({
              [field]: { $regex: search, $options: "i" },
            }));
          } else if (!isNaN(search) && search !== null) {
            const numericQuery = parseFloat(search);
            searchMatchStage.$or = [{ Unit: numericQuery }];
          }
        }
        if (!query.channelId && memberId) {
          if (authorizedChannels.length > 0) {
            query.channelId = { $in: authorizedChannels };
          } else {
            // No authorized channels for member
            query.channelId = { $in: [] };
          }
        }
        const basePipeline = [
          { $match: query },
          {
            $lookup: {
              from: "nvrs",
              localField: "nvrId",
              foreignField: "_id",
              as: "nvrData",
            },
          },
          {
            $lookup: {
              from: "channels",
              localField: "channelId",
              foreignField: "_id",
              as: "channelData",
            },
          },
          { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
          {
            $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true },
          },
          { $match: searchMatchStage },
        ];

        const [countResult, incidents] = await Promise.all([
          Incident.aggregate([...basePipeline, { $count: "totalCount" }]),
          Incident.aggregate([
            ...basePipeline,
            { $sort: { createdAt: -1 } },
            { $skip: parseInt(skip) },
            { $limit: parseInt(limit) },
          ]),
        ]);

        const totalCount = countResult[0]?.totalCount || 0;
        return res.send(
          Response.userSuccessResp("Successfully fetched resolved incidents.", {
            totalCount,
            data: incidents,
          }),
        );
      }

      // âœ… Total Incidents
      if (totalIncidents) {
        let searchMatchStage = {};
        const query = {
          ...userMatch,
          incidentType: { $nin:  ['countPersons', 'lineCrossing', 'countVehicles']},
          Image: {'$exists': true, '$nin': [null, '', undefined, 'https://'] },
          resolved: false,
          incidentName: { '$not': /Guard Present/i }
        };
        if (nvrId) {
          query.nvrId = new mongoose.Types.ObjectId(nvrId);
        }
        if (channelId) {
          query.channelId = new mongoose.Types.ObjectId(channelId);
        }

        if (search) {
          if (
            typeof search === "string" &&
            isNaN(search) &&
            search.trim() !== ""
          ) {
            const fields = [
              "timeOfIncident",
              "DOS",
              "description",
              "incidentName",
              "cameraId",
              "userId",
              "zone",
              "severity",
              "type",
            ];
            searchMatchStage.$or = fields.map((field) => ({
              [field]: { $regex: search, $options: "i" },
            }));
          } else if (!isNaN(search) && search !== null) {
            const numericQuery = parseFloat(search);
            searchMatchStage.$or = [{ Unit: numericQuery }];
          }
        }
        if (!query.channelId && memberId) {
          if (authorizedChannels.length > 0) {
            query.channelId = { $in: authorizedChannels };
          } else {
            // No authorized channels for member
            query.channelId = { $in: [] };
          }
        }

        const basePipeline = [
          { $match: query },
          {
            $lookup: {
              from: "nvrs",
              localField: "nvrId",
              foreignField: "_id",
              as: "nvrData",
            },
          },
          {
            $lookup: {
              from: "channels",
              localField: "channelId",
              foreignField: "_id",
              as: "channelData",
            },
          },
          { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
          {
            $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true },
          },
          { $match: searchMatchStage },
        ];

        const [countResult, incidents] = await Promise.all([
          Incident.aggregate([...basePipeline, { $count: "totalCount" }]),
          Incident.aggregate([
            ...basePipeline,
            { $sort: { createdAt: -1 } },
            { $skip: parseInt(skip) },
            { $limit: parseInt(limit) },
          ]),
        ]);

        const totalCount = countResult[0]?.totalCount || 0;

        return res.send(
          Response.userSuccessResp("Successfully fetched incidents.", {
            totalCount,
            data: incidents,
          }),
        );
      }

      // âŒ None selected
      return res.send(
        Response.userFailResp(
          "Invalid Filters provided.",
          "Validation failed.",
        ),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch incident details", 500));
    }
  }

  async updateReportStatus(req, res, next) {
    try {
      const { incidentId, status, description } = req.body;
      const incident = await Incident.findById(incidentId);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      if (incident.resolved && status === true) {
        return res
          .status(400)
          .json(Response.userFailResp("Resolved incidents cannot be reported again."));
      }

      incident.report.status = status;
      incident.report.description = description || "";

      if (status === false) {
        incident.report.resolvedAt = new Date();
      } else {
        incident.report.reportedAt = new Date();
      }
      await incident.save();
      return res
        .status(200)
        .json(
          Response.userSuccessResp("Report status updated successfully", {
            incident,
          }),
        );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to update report status", 500));
    }
  }

  async getIncidentLists(req, res, next) {
    try {
      const { skip = 0, limit = 10 } = req.query;

      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      let isAdminExist = await adminModel.findOne({ _id: data.adminId });
      if (!isAdminExist) {
        return res.send(
          Response.userFailResp("Admin not found.", "Validation failed."),
        );
      }
      //Fetch all unique incident types, incidentName and _id and group by incidentType and add skip and limit
      const pipeline = [
        {
          $match: {
            userId: isAdminExist.user_id.toString(),
            incidentType: { $nin: ["countPersons", "lineCrossing","countVehicles"] },
          },
        },
        {
          $sort: { timeOfIncident: -1 },
        },
        {
          $group: {
            _id: "$incidentType",
            incidentType: { $first: "$incidentType" },
            incidentName: { $first: "$incidentName" },
            incidentId: { $first: "$_id" },
          },
        },
        {
          $skip: parseInt(skip),
        },
        {
          $limit: parseInt(limit),
        },
      ];
      const result = await Incident.aggregate(pipeline);

      //Total count of incidents after grouping
      const totalCount = await Incident.aggregate([
        {
          $match: {
            userId: isAdminExist.user_id.toString(),
            incidentType: { $nin: ["countPersons", "lineCrossing","countVehicles"] },
          },
        },
        {
          $group: {
            _id: "$incidentType",
            incidentType: { $first: "$incidentType" },
            incidentName: { $first: "$incidentName" },
            incidentId: { $first: "$_id" },
          },
        },
        { $count: "totalCount" },
      ]);

      const formattedResult = result.map((incident) => {
        // Ensure incidentType is a string before formatting
        if (typeof incident.incidentType === "string") {
          return {
            ...incident,
            formattedIncidentType: incident.incidentType
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase()),
          };
        }
        return incident;
      });

      return res.status(200).json(
        Response.userSuccessResp("Incident fetched successfully", {
          totalCount: totalCount.length,
          result: formattedResult,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch incident lists", 500));
    }
  }

  async deskAbsenceData(req, res, next) {
    try {
      let { date } = req.body;
      const { skip = 0, limit = 10 , search, isExport} = req.query;
      const exportMode = isExport === "true";
      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      //startDate from start of the day enddate is till end of the day
     let startDate, endDate;
      startDate = new Date(date);
      endDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      

      let isAdminExist = await adminModel.findOne({ _id: data.adminId });
      if (!isAdminExist) {
        return res.send(
          Response.userFailResp("Admin not found.", "Validation failed."),
        );
      }

      //Add search for cahnnel name and departmentName
      let searchCondition = {};
      if (search) {
        searchCondition = {
          $or: [
            { "channel.name": { $regex: search, $options: "i" } },
            { "channel.departmentName": { $regex: search, $options: "i" } },
          ],
        };
      }
      //Fetch all unique incident types, incidentName and _id and group by incidentType and add skip and limit
    const pipeline = [
      {
        $match: {
          userId: isAdminExist.user_id.toString(),
          incidentType: "deskAbsence",
          timeOfIncident: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
      },
      // lookup nvr with limited details
      {
        $lookup: {
          from: "nvrs",
          localField: "nvrId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                nvrName: 1,
                username: 1,
                cameraCount: 1,
                deviceName: 1,
                model: 1
              }
            }
          ],
          as: "nvr",
        },
      },
      { $unwind: { path: "$nvr", preserveNullAndEmptyArrays: true } },

      // lookup channel with limited details and lookup department which is in channel
      {
        $lookup: {
          from: "channels",
          localField: "channelId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                model: 1,
                customName: 1,
                firmwareVersion: 1,
                department:1
              }
            }
          ],
          as: "channel",
        },
      },
      { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },

      // lookup departmentwhich is an array of ids
      {
        $lookup: {
          from: "departments",
          let: { deptIds: "$channel.department" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$deptIds"] }
              }
            },
            {
              $project: {
                _id: 1,
                departmentName: 1
              }
            }
          ],
          as: "department"
        }
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      { $match: searchCondition },
      // latest incident first
      {
        $sort: { timeOfIncident: -1 },
      },

      // group by only cameraId and give other data
      {
        $group: {
          _id: "$channelId",
          incidents: { $push: "$$ROOT" },

        },
      },
      // {
      //   $project: {
      //     _id: "$_id",
      //     channel: 1,
      //     nvr: 1,
      //     incidents: 1,
      //   },
      // },
      ...(!exportMode ? [{ $skip: parseInt(skip) }, { $limit: parseInt(limit) }] : []),
    ];

    //Loop each incident and based on timeOfIncident and personPresent calculate total presence and absence time


const result = await Incident.aggregate(pipeline);

    // Calculate total presence and absence time based on actual incidents
    result.forEach((camera) => {
      let totalPresenceTime = 0;
      let totalAbsenceTime = 0;
      let incidents = camera.incidents;

      if (incidents && incidents.length > 0) {
        // Filter incidents to retain only boundary values for consecutive presence/absence blocks
        const filteredIncidents = [];
        let currentBlockState = incidents[0].personPresent;
        let currentBlock = [incidents[0]];

        for (let i = 1; i < incidents.length; i++) {
          if (incidents[i].personPresent === currentBlockState) {
            currentBlock.push(incidents[i]);
          } else {
            if (currentBlock.length === 1) {
              filteredIncidents.push(currentBlock[0]);
            } else {
              filteredIncidents.push(currentBlock[0]);
              filteredIncidents.push(currentBlock[currentBlock.length - 1]);
            }
            currentBlockState = incidents[i].personPresent;
            currentBlock = [incidents[i]];
          }
        }

        if (currentBlock.length === 1) {
          filteredIncidents.push(currentBlock[0]);
        } else {
          filteredIncidents.push(currentBlock[0]);
          filteredIncidents.push(currentBlock[currentBlock.length - 1]);
        }

        camera.incidents = filteredIncidents;
        incidents = filteredIncidents;

        // Calculate total presence and absence time only between actual incidents
        for (let i = incidents.length - 1; i > 0; i--) {
          const currentIncident = incidents[i]; // earlier incident
          const nextIncident = incidents[i - 1]; // later incident

          const timeDifference =
            new Date(nextIncident.timeOfIncident).getTime() -
            new Date(currentIncident.timeOfIncident).getTime();

          if (currentIncident.personPresent === true) {
            totalPresenceTime += timeDifference; // Were present during this interval
          } else {
            totalAbsenceTime += timeDifference; // Were absent during this interval
          }
        }
      }

      const formatTime = (ms) => {
        const totalMinutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h ${minutes}m`;
      };

      camera.totalPresenceTime = formatTime(totalPresenceTime);
      camera.totalAbsenceTime = formatTime(totalAbsenceTime);
    });
    
      //Total count of incidents after grouping
      const totalCount = await Incident.aggregate([
        {
          $match: {
            userId: isAdminExist.user_id.toString(),
            incidentType: "deskAbsence",
            timeOfIncident: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
          },
        },
        // lookup nvr with limited details and lookup department which is in channel
        {
          $lookup: {
            from: "channels",
            localField: "channelId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  model: 1,
                  customName: 1,
                  firmwareVersion: 1,
                  department:1
                }
              }
            ],
            as: "channel",
          },
        },
        { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },

        // lookup departmentwhich is an array of ids
        {
          $lookup: {
            from: "departments",
            let: { deptIds: "$channel.department" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$deptIds"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  departmentName: 1,
                },
              },
            ],
            as: "department",
          },
        },
        { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
        { $match: searchCondition },
        {
          $group: {
            _id: "$channelId",
          },
        },
        { $count: "totalCount" },
      ]);

      return res.status(200).json(
        Response.userSuccessResp("Incident fetched successfully", {
          totalCount: totalCount[0]?.totalCount || 0,
          result: result,
        }),
      );
    } catch (error) {      
      logger.error(error);
      next(new AppError("Failed to fetch incident lists", 500));
    }
  }
    async guardAbsenceData(req, res, next) {
    try {
      let { date, nvrIds, channelIds } = req.body;
      const { skip = 0, limit = 10 , search, isExport} = req.query;
      const exportMode = isExport === "true";
      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      //startDate from start of the day enddate is till end of the day
     let startDate, endDate;
      startDate = new Date(date);
      endDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      

      let isAdminExist = await adminModel.findOne({ _id: data.adminId });
      if (!isAdminExist) {
        return res.send(
          Response.userFailResp("Admin not found.", "Validation failed."),
        );
      }

      //Add search for cahnnel name and departmentName
      let searchCondition = {};
      if (search) {
        searchCondition = {
          $or: [
            { "channel.name": { $regex: search, $options: "i" } },
            { "channel.departmentName": { $regex: search, $options: "i" } },
          ],
        };
      }
      //Fetch all unique incident types, incidentName and _id and group by incidentType and add skip and limit
    const matchStage = {
          userId: isAdminExist.user_id.toString(),
          incidentType: "guardAbsence",
          timeOfIncident: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        };

      // Filter by nvrIds
      if (nvrIds && nvrIds.length > 0) {
        const nvrIdList = Array.isArray(nvrIds)
          ? nvrIds
          : nvrIds.split(",").map((id) => id.trim());
        matchStage.nvrId = {
          $in: nvrIdList.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      // Filter by channelIds
      if (channelIds && channelIds.length > 0) {
        const channelIdList = Array.isArray(channelIds)
          ? channelIds
          : channelIds.split(",").map((id) => id.trim());
        matchStage.channelId = {
          $in: channelIdList.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

    const pipeline = [
      {
        $match: matchStage,
      },
      // lookup nvr with limited details
      {
        $lookup: {
          from: "nvrs",
          localField: "nvrId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                nvrName: 1,
                username: 1,
                cameraCount: 1,
                deviceName: 1,
                model: 1
              }
            }
          ],
          as: "nvr",
        },
      },
      { $unwind: { path: "$nvr", preserveNullAndEmptyArrays: true } },

      // lookup channel with limited details and lookup department which is in channel
      {
        $lookup: {
          from: "channels",
          localField: "channelId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                model: 1,
                customName: 1,
                firmwareVersion: 1,
                department:1
              }
            }
          ],
          as: "channel",
        },
      },
      { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },

      // lookup departmentwhich is an array of ids
      {
        $lookup: {
          from: "departments",
          let: { deptIds: "$channel.department" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$deptIds"] }
              }
            },
            {
              $project: {
                _id: 1,
                departmentName: 1
              }
            }
          ],
          as: "department"
        }
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      { $match: searchCondition },
      // latest incident first
      {
        $sort: { timeOfIncident: -1 },
      },

      // group by only cameraId and give other data
      {
        $group: {
          _id: "$channelId",
          incidents: { $push: "$$ROOT" },

        },
      },
      // {
      //   $project: {
      //     _id: "$_id",
      //     channel: 1,
      //     nvr: 1,
      //     incidents: 1,
      //   },
      // },
      ...(!exportMode ? [{ $skip: parseInt(skip) }, { $limit: parseInt(limit) }] : []),
    ];

    //Loop each incident and based on timeOfIncident and personPresent calculate total presence and absence time


const result = await Incident.aggregate(pipeline);

console.log(result,'result');


    // Calculate total presence and absence time based on actual incidents
    result.forEach((camera) => {
      let totalPresenceTime = 0;
      let totalAbsenceTime = 0;
      let incidents = camera.incidents;

      if (incidents && incidents.length > 0) {
        // Filter incidents to retain only boundary values for consecutive presence/absence blocks
        const filteredIncidents = [];
        let currentBlockState = incidents[0].personPresent;
        let currentBlock = [incidents[0]];

        for (let i = 1; i < incidents.length; i++) {
          if (incidents[i].personPresent === currentBlockState) {
            currentBlock.push(incidents[i]);
          } else {
            if (currentBlock.length === 1) {
              filteredIncidents.push(currentBlock[0]);
            } else {
              filteredIncidents.push(currentBlock[0]);
              filteredIncidents.push(currentBlock[currentBlock.length - 1]);
            }
            currentBlockState = incidents[i].personPresent;
            currentBlock = [incidents[i]];
          }
        }

        if (currentBlock.length === 1) {
          filteredIncidents.push(currentBlock[0]);
        } else {
          filteredIncidents.push(currentBlock[0]);
          filteredIncidents.push(currentBlock[currentBlock.length - 1]);
        }

        camera.incidents = filteredIncidents;
        incidents = filteredIncidents;

        // Calculate total presence and absence time only between actual incidents
        for (let i = incidents.length - 1; i > 0; i--) {
          const currentIncident = incidents[i]; // earlier incident
          const nextIncident = incidents[i - 1]; // later incident

          const timeDifference =
            new Date(nextIncident.timeOfIncident).getTime() -
            new Date(currentIncident.timeOfIncident).getTime();

          if (currentIncident.personPresent === true) {
            totalPresenceTime += timeDifference; // Were present during this interval
          } else {
            totalAbsenceTime += timeDifference; // Were absent during this interval
          }
        }
      }

      const formatTime = (ms) => {
        const totalMinutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h ${minutes}m`;
      };

      camera.totalPresenceTime = formatTime(totalPresenceTime);
      camera.totalAbsenceTime = formatTime(totalAbsenceTime);
    });
    
      //Total count of incidents after grouping
      const totalCount = await Incident.aggregate([
        {
          $match: matchStage,
        },
        // lookup nvr with limited details and lookup department which is in channel
        {
          $lookup: {
            from: "channels",
            localField: "channelId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  model: 1,
                  customName: 1,
                  firmwareVersion: 1,
                  department:1
                }
              }
            ],
            as: "channel",
          },
        },
        { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },

        // lookup departmentwhich is an array of ids
        {
          $lookup: {
            from: "departments",
            let: { deptIds: "$channel.department" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$deptIds"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  departmentName: 1,
                },
              },
            ],
            as: "department",
          },
        },
        { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
        { $match: searchCondition },
        {
          $group: {
            _id: "$channelId",
          },
        },
        { $count: "totalCount" },
      ]);

      return res.status(200).json(
        Response.userSuccessResp("Incident fetched successfully", {
          totalCount: totalCount[0]?.totalCount || 0,
          result: result,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch incident lists", 500));
    }
  }

  async _fetchIncidentLogs({
    req,
    res,
    incidentType,
    extraMatch = {},
    searchFields = ["incidentName", "description", "zone"],
    // Opt-in: run the free-text search AFTER the nvr/channel $lookups so it can
    // also match joined fields (NVR name, camera name) and a stringified
    // timeOfIncident. Off by default so all other callers are unaffected.
    postLookupSearch = false,
    // Numeric columns to include in the free-text search. Mongo cannot regex a
    // number in place, so these are stringified into helper fields first.
    // Only consulted on the postLookupSearch path.
    searchNumberFields = [],
    // Opt-in: resolve the registered user behind each row's vehicleNumber
    // and attach it as `taggedUser`. Only the plate-bearing log pages need
    // it, so it costs the others nothing. Also enables the `tagStatus`
    // (all/tagged/untagged) filter and lets free-text `search` match the
    // tagged user's name, not just the plate.
    attachVehicleOwners = false,
  }) {
    const data = req?.verified?.userData;
    if (!data?.user_id) {
      return res.send(
        Response.userFailResp("User authentication failed.", "Unauthorized"),
      );
    }

    const {
      skip = 0,
      limit = 10,
      startDate,
      endDate,
      nvrId,
      nvrIds,
      channelId,
      channelIds,
      severity,
      resolved,
      reportStatus,
      search,
      sortField,
      sortOrder,
      tagStatus,
    } = req.query;

    // Plates already claimed by a registered user, needed by the
    // tagged/untagged filter. Only fetched for the pages that opted in, and
    // only when the filter is actually set.
    const wantsTagFilter =
      attachVehicleOwners && (tagStatus === "tagged" || tagStatus === "untagged");
    const taggedPlates = wantsTagFilter
      ? await findTaggedPlates(data?.adminId)
      : [];

    const toArray = (v) =>
      v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

    const matchStage = {
      userId: data.user_id.toString(),
      incidentType,
      ...extraMatch,
    };

    if (startDate && endDate) {
      matchStage.timeOfIncident = {
        $gte: momentTZ.tz(startDate, "Asia/Kolkata").startOf("day").toDate(),
        $lte: momentTZ.tz(endDate, "Asia/Kolkata").endOf("day").toDate(),
      };
    }

    const nvrFilter = nvrId ? [nvrId] : toArray(nvrIds);
    if (nvrFilter.length) {
      matchStage.nvrId = {
        $in: nvrFilter.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const channelFilter = channelId ? [channelId] : toArray(channelIds);
    const authorizedChannels = req?.verified?.authorizedChannel?.channels;
    let effectiveChannelIds = null;
    if (channelFilter.length && Array.isArray(authorizedChannels)) {
      const authSet = new Set(authorizedChannels.map((c) => c.toString()));
      effectiveChannelIds = channelFilter.filter((c) => authSet.has(c));
    } else if (channelFilter.length) {
      effectiveChannelIds = channelFilter;
    } else if (Array.isArray(authorizedChannels)) {
      effectiveChannelIds = authorizedChannels.map((c) => c.toString());
    }
    if (Array.isArray(effectiveChannelIds)) {
      matchStage.channelId = {
        $in: effectiveChannelIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (severity) matchStage.severity = severity;
    if (resolved !== undefined) matchStage.resolved = resolved === "true";
    if (reportStatus !== undefined) {
      const isReported = reportStatus === "true";
      matchStage["report.status"] = isReported;
      if (isReported) matchStage.resolved = { $ne: true };
    }

    // Escape the free-text term once; reused for every $or branch below.
    let escapedSearch = null;
    if (search && typeof search === "string" && search.trim()) {
      escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // Searching by a tagged user's name has to resolve to plates first — the
    // owner's name lives on the user record, not on the incident.
    const searchOwnerPlates =
      attachVehicleOwners && escapedSearch
        ? await findTaggedPlates(data?.adminId, { search })
        : [];

    // Default path (all callers except the opt-in one): search the incident-doc
    // fields inside matchStage, before the $lookups â€” unchanged behavior.
    if (escapedSearch && !postLookupSearch) {
      matchStage.$or = searchFields.map((field) => ({
        [field]: { $regex: escapedSearch, $options: "i" },
      }));
    }

    const basePipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "nvrs",
          localField: "nvrId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, nvrName: 1 } }],
          as: "nvrData",
        },
      },
      { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "channels",
          localField: "channelId",
          foreignField: "_id",
          pipeline: [
            { $project: { _id: 1, name: 1, customName: 1 } },
          ],
          as: "channelData",
        },
      },
      { $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true } },
    ];

    // Tagged/untagged filtering runs inside basePipeline so the $count and the
    // $skip/$limit aggregations narrow identically and totalCount stays exact.
    // Added before the search block below, which reads the same helper field.
    if (attachVehicleOwners) {
      basePipeline.push(...vehicleTagStages(tagStatus, taggedPlates));
    }

    // Opt-in path: search across incident-doc fields, joined NVR/camera names,
    // and a stringified timeOfIncident. Must run after the $lookups (those
    // joined fields don't exist before). Runs inside basePipeline so the $count
    // and $skip/$limit aggregations filter identically (totalCount stays exact).
    if (escapedSearch && postLookupSearch) {
      const rx = { $regex: escapedSearch, $options: "i" };
      const searchTextPaths = [
        ...new Set([
          "severity",
          "vehicleNumber",
          "incidentName",
          "nvrData.nvrName",
          "channelData.name",
          "channelData.customName",
          ...searchFields,
        ]),
      ];
      basePipeline.push(
        {
          $addFields: {
            // timeOfIncident is a BSON Date â€” regex can't hit it directly, so
            // render it to a string first (Asia/Kolkata, matching the date
            // filter above and the UI). Nulls yield null and safely don't match.
            _searchTime: {
              $dateToString: {
                date: "$timeOfIncident",
                format: "%Y-%m-%d %H:%M",
                timezone: "Asia/Kolkata",
              },
            },
            ...Object.fromEntries(
              searchNumberFields.map((field) => [
                `_searchNum_${field}`,
                { $toString: { $ifNull: [`$${field}`, ""] } },
              ]),
            ),
          },
        },
        {
          $match: {
            $or: [
              { _searchTime: rx }, // Time of Incident
              // Tagged user's name — matched through the plates those owners
              // hold, since the name itself isn't on the incident document.
              ...(searchOwnerPlates.length
                ? [{ [NORM_PLATE_FIELD]: { $in: searchOwnerPlates } }]
                : []),
              // Severity, Vehicle Number, Incident Name, NVR Name and Camera
              // Name (the last three joined), plus the caller's own
              // searchFields. Those used to apply only on the pre-lookup path,
              // so opting into postLookupSearch dropped them from the search
              // entirely -- car logs list model_name/company/color there.
              ...searchTextPaths.map((field) => ({ [field]: rx })),
              ...searchNumberFields.map((field) => ({
                [`_searchNum_${field}`]: rx,
              })),
            ],
          },
        },
        {
          $project: {
            _searchTime: 0,
            ...Object.fromEntries(
              searchNumberFields.map((field) => [`_searchNum_${field}`, 0]),
            ),
          },
        }, // strip helper â€” response shape unchanged
      );
    }

    // Drop the tagging helper field once every stage that reads it has run.
    if (attachVehicleOwners) basePipeline.push(stripNormPlateStage);

    // $sort must remain the last stage of basePipeline. Every log page sends
    // sortField/sortOrder when a column header is clicked; without a
    // recognised field this keeps the previous behaviour (newest first).
    const sortPath = LOG_SORT_FIELDS[String(sortField ?? "").trim()];
    if (sortPath) {
      const sortStage = { [sortPath]: sortOrder === "asc" ? 1 : -1 };
      // Tiebreaker: a low-cardinality column (colour, year, company) leaves
      // most rows tied, and an unstable order between the $count and the
      // $skip/$limit aggregation lets a row repeat or vanish across pages.
      if (sortPath !== "timeOfIncident") sortStage.timeOfIncident = -1;
      sortStage._id = -1;
      basePipeline.push({ $sort: sortStage });
    } else {
      basePipeline.push({ $sort: { timeOfIncident: -1 } });
    }

    const [countResult, logs] = await Promise.all([
      Incident.aggregate([...basePipeline, { $count: "totalCount" }]),
      Incident.aggregate([
        ...basePipeline,
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
      ]),
    ]);

    if (attachVehicleOwners) {
      await attachTaggedUsers(logs, data?.adminId);
    }

    return res.status(200).json(
      Response.userSuccessResp(`${incidentType} logs fetched successfully`, {
        totalCount: countResult[0]?.totalCount || 0,
        data: logs,
      }),
    );
  }

  async getVehicleDetectionLogs(req, res, next) {
    try {
      const { vehicleNumber } = req.query;
      const extraMatch = {};
      if (vehicleNumber) {
        const escaped = vehicleNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        extraMatch.vehicleNumber = { $regex: escaped, $options: "i" };
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "vehicleDetection",
        extraMatch,
        // ANPR Logs shows "Vehicle Number + Tagged User", and offers
        // Tag User for any plate that has no owner yet.
        attachVehicleOwners: true,
        // Free-text `search` matches Time of Incident, Severity, Vehicle
        // Number, Incident Name, NVR Name and Camera Name, plus the default
        // searchFields (description, zone) -- see _fetchIncidentLogs.
        postLookupSearch: true,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch vehicle detection logs", 500));
    }
  }

  async getCarModelDetectionLogs(req, res, next) {
    try {
      const { model_name } = req.query;
      const extraMatch = {};
      if (model_name) {
        const escaped = model_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        extraMatch.$or = [
          { model_name: { $regex: escaped, $options: "i" } },
          { incidentName: { $regex: escaped, $options: "i" } },
        ];
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "carModelDetection",
        extraMatch,
        // The columns Car Logs renders, so free-text search matches what the
        // user can actually see in the table.
        searchFields: [
          "incidentName",
          "description",
          "zone",
          "model_name",
          "company",
          "color",
        ],
        searchNumberFields: ["year"],
        postLookupSearch: true,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch car model detection logs", 500));
    }
  }

  async getVehicleNumbers(req, res, next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      const vehicleNumbers = await VehicleDetectionIncident.distinct(
        "vehicleNumber",
        {
          userId: data.user_id.toString(),
          incidentType: "vehicleDetection",
          vehicleNumber: { $nin: [null, ""] },
        },
      );

      return res.status(200).json(
        Response.userSuccessResp("Vehicle numbers fetched successfully", {
          totalCount: vehicleNumbers.length,
          vehicleNumbers,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch vehicle numbers", 500));
    }
  }

  async getConveyorDetectionLogs(req, res, next) {
    try {
      const { status } = req.query;
      const extraMatch = {};
      if (status && ["ON", "OFF"].includes(status.toUpperCase())) {
        extraMatch.currentStatus = status.toUpperCase();
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "conveyorDetection",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch conveyor detection logs", 500));
    }
  }

  async getCrusherDetectionLogs(req, res, next) {
    try {
      const { status } = req.query;
      const extraMatch = {};
      if (status && ["ON", "OFF"].includes(status.toUpperCase())) {
        extraMatch.currentStatus = status.toUpperCase();
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "crusherDetection",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch crusher detection logs", 500));
    }
  }

  async getWaterSpillageDetectionLogs(req, res, next) {
    try {
      const { status } = req.query;
      const extraMatch = {};
      if (status && ["DETECTED", "CLEAR"].includes(status.toUpperCase())) {
        extraMatch.currentStatus = status.toUpperCase();
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "waterSpillageDetection",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch water spillage detection logs", 500));
    }
  }

  async getUnauthorizedAccessLogs(req, res, next) {
    try {
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "unauthorizedAccess",
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch unauthorized access logs", 500));
    }
  }

  async getVehicleCountLogs(req, res, next) {
    try {
      const { minCount, maxCount } = req.query;
      const extraMatch = {};
      if (minCount !== undefined || maxCount !== undefined) {
        extraMatch.count = {};
        if (minCount !== undefined) extraMatch.count.$gte = Number(minCount);
        if (maxCount !== undefined) extraMatch.count.$lte = Number(maxCount);
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "countVehicles",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch vehicle count logs", 500));
    }
  }

  async getPersonCountLogs(req, res, next) {
    try {
      const { minCount, maxCount } = req.query;
      const extraMatch = {};
      if (minCount !== undefined || maxCount !== undefined) {
        extraMatch.count = {};
        if (minCount !== undefined) extraMatch.count.$gte = Number(minCount);
        if (maxCount !== undefined) extraMatch.count.$lte = Number(maxCount);
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "countPersons",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch person count logs", 500));
    }
  }

  async getLineCrossingLogs(req, res, next) {
    try {
      const {
        type,
        minEntry,
        maxEntry,
        minExit,
        maxExit,
        minAtoB,
        maxAtoB,
        minBtoA,
        maxBtoA,
      } = req.query;
      const extraMatch = {};
      const entryMin = minEntry ?? minAtoB;
      const entryMax = maxEntry ?? maxAtoB;
      const exitMin = minExit ?? minBtoA;
      const exitMax = maxExit ?? maxBtoA;

      if (entryMin !== undefined || entryMax !== undefined) {
        extraMatch.totalEntry = {};
        if (entryMin !== undefined) extraMatch.totalEntry.$gte = Number(entryMin);
        if (entryMax !== undefined) extraMatch.totalEntry.$lte = Number(entryMax);
      }
      if (exitMin !== undefined || exitMax !== undefined) {
        extraMatch.totalExit = {};
        if (exitMin !== undefined) extraMatch.totalExit.$gte = Number(exitMin);
        if (exitMax !== undefined) extraMatch.totalExit.$lte = Number(exitMax);
      }
      if (type) {
        extraMatch.type = type;
      }
      return await this._fetchIncidentLogs({
        req,
        res,
        incidentType: "lineCrossing",
        extraMatch,
      });
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch line crossing logs", 500));
    }
  }

  async deleteLineCrossingLogs(req, res, next) {
    try {
      const deleteAll = ["true", "1", "yes"].includes(
        String(req.query.all ?? req.query.deleteAll ?? "").toLowerCase(),
      );
      const {
        type,
        startDate,
        endDate,
        nvrId,
        nvrIds,
        channelId,
        channelIds,
        minEntry,
        maxEntry,
        minExit,
        maxExit,
        minAtoB,
        maxAtoB,
        minBtoA,
        maxBtoA,
      } = req.query;
      const extraMatch = {};
      const entryMin = minEntry ?? minAtoB;
      const entryMax = maxEntry ?? maxAtoB;
      const exitMin = minExit ?? minBtoA;
      const exitMax = maxExit ?? maxBtoA;

      if (entryMin !== undefined || entryMax !== undefined) {
        extraMatch.totalEntry = {};
        if (entryMin !== undefined) extraMatch.totalEntry.$gte = Number(entryMin);
        if (entryMax !== undefined) extraMatch.totalEntry.$lte = Number(entryMax);
      }
      if (exitMin !== undefined || exitMax !== undefined) {
        extraMatch.totalExit = {};
        if (exitMin !== undefined) extraMatch.totalExit.$gte = Number(exitMin);
        if (exitMax !== undefined) extraMatch.totalExit.$lte = Number(exitMax);
      }
      if (type) {
        extraMatch.type = type;
      }

      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      const match = {
        userId: data.user_id.toString(),
        incidentType: "lineCrossing",
      };
      if (!deleteAll && startDate && endDate) {
        match.timeOfIncident = {
          $gte: momentTZ.tz(startDate, "Asia/Kolkata").startOf("day").toDate(),
          $lte: momentTZ.tz(endDate, "Asia/Kolkata").endOf("day").toDate(),
        };
      }
      const toArray = (v) =>
        v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : [];
      const nvrFilter = nvrId ? [nvrId] : toArray(nvrIds);
      if (!deleteAll && nvrFilter.length) {
        match.nvrId = {
          $in: nvrFilter.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
      const channelFilter = channelId ? [channelId] : toArray(channelIds);
      if (!deleteAll && channelFilter.length) {
        match.channelId = {
          $in: channelFilter.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
      if (!deleteAll) {
        Object.assign(match, extraMatch);
      }

      const result = await Incident.deleteMany(match);

      return res.status(200).json(
        Response.userSuccessResp("Line crossing logs deleted successfully", {
          deletedCount: result.deletedCount || 0,
          deletedAll: deleteAll,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to delete line crossing logs", 500));
    }
  }

  async getDeskAbsenceLogs(req, res, next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      const {
        skip = 0,
        limit = 10,
        startDate,
        endDate,
        nvrId,
        nvrIds,
        channelId,
        channelIds,
        zoneNames,
      } = req.body;

      const toArray = (v) =>
        v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

      // Every desk-absence detection is stored as its own document, so the
      // graph must collect the points across all of a camera's documents
      // (within the date range) and merge them into a single time-series.
      const matchStage = {
        userId: data.user_id.toString(),
        incidentType: "deskAbsence",
      };

      if (startDate && endDate) {
        matchStage.timeOfIncident = {
          $gte: momentTZ.tz(startDate, "Asia/Kolkata").startOf("day").toDate(),
          $lte: momentTZ.tz(endDate, "Asia/Kolkata").endOf("day").toDate(),
        };
      }

      const nvrFilter = nvrId ? [nvrId] : toArray(nvrIds);
      if (nvrFilter.length) {
        matchStage.nvrId = {
          $in: nvrFilter.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      const channelFilter = channelId ? [channelId] : toArray(channelIds);
      const authorizedChannels = req?.verified?.authorizedChannel?.channels;
      let effectiveChannelIds = null;
      if (channelFilter.length && Array.isArray(authorizedChannels)) {
        const authSet = new Set(authorizedChannels.map((c) => c.toString()));
        effectiveChannelIds = channelFilter.filter((c) => authSet.has(c));
      } else if (channelFilter.length) {
        effectiveChannelIds = channelFilter;
      } else if (Array.isArray(authorizedChannels)) {
        effectiveChannelIds = authorizedChannels.map((c) => c.toString());
      }
      if (Array.isArray(effectiveChannelIds)) {
        matchStage.channelId = {
          $in: effectiveChannelIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      // Optional zoneNames filter applied per time-series point.
      const pointMatch = {};
      const zoneFilter = Array.isArray(zoneNames) ? zoneNames.filter(Boolean) : [];
      if (zoneFilter.length) {
        pointMatch["point.zoneName"] = { $in: zoneFilter };
      }

      const basePipeline = [
        { $match: matchStage },
        // Each document carries its own timeSeries entries; flatten them so
        // points from every document of a camera can be regrouped together.
        { $unwind: { path: "$timeSeries", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            channelId: 1,
            nvrId: 1,
            point: {
              timestamp: {
                $ifNull: ["$timeSeries.timestamp", "$timeOfIncident"],
              },
              personCount: "$timeSeries.personCount",
              zoneName: "$timeSeries.zoneName",
              personPresent: {
                $ifNull: ["$timeSeries.personPresent", "$personPresent"],
              },
            },
          },
        },
        ...(Object.keys(pointMatch).length ? [{ $match: pointMatch }] : []),
        { $sort: { "point.timestamp": 1 } },
        {
          $group: {
            _id: "$channelId",
            nvrId: { $first: "$nvrId" },
            timeSeries: { $push: "$point" },
          },
        },
        {
          $lookup: {
            from: "nvrs",
            localField: "nvrId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, nvrName: 1 } }],
            as: "nvrData",
          },
        },
        { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "channels",
            localField: "_id",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, name: 1, customName: 1 } }],
            as: "channelData",
          },
        },
        { $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true } },
        { $sort: { "channelData.name": 1 } },
      ];

      const [countResult, logs] = await Promise.all([
        Incident.aggregate([...basePipeline, { $count: "totalCount" }]),
        Incident.aggregate([
          ...basePipeline,
          { $skip: parseInt(skip) },
          { $limit: parseInt(limit) },
        ]),
      ]);

      return res.status(200).json(
        Response.userSuccessResp("deskAbsence logs fetched successfully", {
          totalCount: countResult[0]?.totalCount || 0,
          data: logs,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch desk absence logs", 500));
    }
  }

  async getDeskAbsenceZoneNames(req, res, next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.user_id) {
        return res.send(
          Response.userFailResp("User authentication failed.", "Unauthorized"),
        );
      }

      const {
        startDate,
        endDate,
        nvrId,
        nvrIds,
        channelId,
        channelIds,
      } = req.query;

      const toArray = (v) =>
        v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

      const matchStage = {
        userId: data.user_id.toString(),
        incidentType: "deskAbsence",
      };

      if (startDate && endDate) {
        matchStage.timeOfIncident = {
          $gte: momentTZ.tz(startDate, "Asia/Kolkata").startOf("day").toDate(),
          $lte: momentTZ.tz(endDate, "Asia/Kolkata").endOf("day").toDate(),
        };
      }

      const nvrFilter = nvrId ? [nvrId] : toArray(nvrIds);
      if (nvrFilter.length) {
        matchStage.nvrId = {
          $in: nvrFilter.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      const channelFilter = channelId ? [channelId] : toArray(channelIds);
      const authorizedChannels = req?.verified?.authorizedChannel?.channels;
      let effectiveChannelIds = null;
      if (channelFilter.length && Array.isArray(authorizedChannels)) {
        const authSet = new Set(authorizedChannels.map((c) => c.toString()));
        effectiveChannelIds = channelFilter.filter((c) => authSet.has(c));
      } else if (channelFilter.length) {
        effectiveChannelIds = channelFilter;
      } else if (Array.isArray(authorizedChannels)) {
        effectiveChannelIds = authorizedChannels.map((c) => c.toString());
      }
      if (Array.isArray(effectiveChannelIds)) {
        matchStage.channelId = {
          $in: effectiveChannelIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      const zoneNames = await Incident.aggregate([
        { $match: matchStage },
        { $unwind: { path: "$timeSeries", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$timeSeries.zoneName",
          },
        },
        { $match: { _id: { $ne: null } } },
        { $sort: { _id: 1 } },
      ]);

      return res.status(200).json(
        Response.userSuccessResp("Zone names fetched successfully", {
          zoneNames: zoneNames.map((z) => z._id),
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch zone names", 500));
    }
  }

  async deleteIncidentsByAdminAndDateRange(req, res, next) {
    try {
      const { error, value } = incidentsValidate.deleteIncidentsByAdminAndDateRange(req.body);
      if (error) {
        return res.status(400).json(
          Response.validationFailResp("Validation failed", error.message)
        );
      }

      const { startDate, endDate } = value;
      const userId = req?.verified?.userData?.user_id;

      if (!userId) {
        return res.status(401).json(
          Response.validationFailResp(
            "User not authenticated",
            "Authentication required"
          )
        );
      }

      // Validate date range if provided
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
          return res.status(400).json(
            Response.validationFailResp(
              "Invalid date range",
              "startDate must be before endDate"
            )
          );
        }
      }

      // Get count of incidents that will be deleted (for user awareness)
      const query = { userId };
      if (startDate || endDate) {
        query.timeOfIncident = {};
        if (startDate) {
          query.timeOfIncident.$gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.timeOfIncident.$lte = end;
        }
      }

      const incidentCount = await Incident.countDocuments(query);

      if (incidentCount === 0) {
        return res.status(400).json(
          Response.validationFailResp(
            "No incidents found",
            "No incidents match the specified criteria"
          )
        );
      }

      // Queue the deletion job
      const job = await deletionQueue.add(
        "delete-incidents",
        {
          adminId: userId,
          startDate,
          endDate,
        },
        {
          removeOnComplete: { age: 3600 }, // Keep completed job for 1 hour
          removeOnFail: { age: 86400 }, // Keep failed job for 24 hours
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }
      );

      logger.info(
        `Deletion job ${job.id} queued for admin ${userId}. Will delete ${incidentCount} incidents.`
      );

      return res.status(202).json(
        Response.userSuccessResp(
          "Deletion job queued successfully",
          {
            jobId: job.id,
            incidentCount,
            startDate: startDate || null,
            endDate: endDate || null,
            message: `${incidentCount} incident(s) will be deleted. You will receive a confirmation email when the deletion is complete.`,
          }
        )
      );
    } catch (error) {
      logger.error("Error queuing deletion job:", error);
      next(new AppError("Failed to queue deletion job", 500));
    }
  }

  async getDeletionJobStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      const userId = req?.verified?.userData?.user_id;

      if (!userId || !jobId) {
        return res.status(400).json(
          Response.validationFailResp(
            "Missing required parameters",
            "jobId and authentication required"
          )
        );
      }

      const job = await deletionQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json(
          Response.notFoundResp("Deletion job not found")
        );
      }

      const progress = job.progress();
      const state = await job.getState();
      const attempts = job.attemptsMade;
      const failedReason = job.failedReason;

      let status = "unknown";
      if (state === "completed") {
        status = "completed";
      } else if (state === "failed") {
        status = "failed";
      } else if (state === "active") {
        status = "processing";
      } else if (state === "waiting" || state === "delayed") {
        status = "queued";
      }

      const jobData = job.data;
      const jobResult =
        state === "completed" ? await job.returnvalue : null;

      return res.status(200).json(
        Response.userSuccessResp("Job status retrieved successfully", {
          jobId,
          status,
          progress: typeof progress === "number" ? progress : 0,
          incidentCount: jobData.incidentCount,
          startDate: jobData.startDate || null,
          endDate: jobData.endDate || null,
          attempts,
          failedReason: failedReason || null,
          result: jobResult || null,
        })
      );
    } catch (error) {
      logger.error("Error retrieving job status:", error);
      next(new AppError("Failed to retrieve job status", 500));
    }
  }
}

export default new IncidentsService();





