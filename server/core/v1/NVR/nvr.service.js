import DigestFetch from "digest-fetch";
import NVR from "./nvr.model.js";
import Camera from "../channels/channels.model.js";
import logger from "../../../utils/logger.js";
import NVRValidation from "./nvr.validate.js";
import { decrypt, encrypt } from "../../../utils/cryptoUtils.js";
import Response from "../../../utils/response.js";
import brandHandlers, { updateHandlers } from "./nvr.brands.js";
import DeleteService from "../../../services/delete.service.js";
import Channel from "../channels/channels.model.js";
import adminModel from "../admin/admin.model.js";
import net from "net";
import config from "config";
import { autoSyncLocations } from "../../../utils/helperFunctions.js";
import { buildRTSPUrl, updateCameraStream, registerCameraStream, buildStreamingUrl } from "../../../utils/rtspStream.js";
import { parseXml } from "../../../utils/xmlParse.js";
import mongoose from "mongoose";
const APP_ENV = config.get("APP_ENV");

class NVRService {
  // old
  async registerNvr(req, res, _next) {
    try {
      const { error, value } = NVRValidation.registerNVR(req.body);
      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const { brand } = value;
      const handler = brandHandlers[brand?.toLowerCase()];
      if (!handler) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Unsupported brand",
              "NVR brand not supported",
            ),
          );
      }

      return await handler(req, res); // Call brand-specific handler
    } catch (error) {
      logger.error("Register NVR Error:", error);
      return res
        .status(500)
        .json(Response.errorResp("NVR registration failed", error.message));
    }
  }
  // new
  async addNvr(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.user_id;
      const adminId = req?.verified?.userData?.adminId;

      const isAdminExist = await adminModel.findOne({ user_id: userId });
      if (!isAdminExist) {
        return res
          .status(400)
          .json(Response.userFailResp("Please provide valid user_id"));
      }
      const { error, value } = NVRValidation.registerNvrMetadataSchema(
        req.body,
      );

      if (error) {
        const messages = error.details.map((d) => d.message);
        return res
          .status(400)
          .json(Response.userFailResp("Validation error", messages));
      }

      const existingNvr = await NVR.findOne({
        localNvrId: value.nvr.localNvrId,
      });

      if (existingNvr) {
        return res
          .status(400)
          .json(
            Response.userFailResp("NVR with this localNvrId already exists"),
          );
      }

      const { nvr, cameras } = value;

      // Save NVR metadata
      const savedNvr = await NVR.create({
        userId,
        ...nvr,
        cameraCount: cameras.length,
      });

      const cameraDocs = cameras.map((cam) => ({
        userId,
        nvrId: savedNvr._id,
        ...cam,
      }));

      const savedCameras = await Camera.insertMany(cameraDocs);

      // Trigger location auto-sync in background
      autoSyncLocations(
        { _id: adminId || isAdminExist._id },
        { user_id: userId },
      ).catch((err) => {
        logger.error("Failed to auto-sync locations after NVR addition", err);
      });

      return res.status(201).json(
        Response.userSuccessResp("NVR metadata registered successfully", {
          nvr: savedNvr,
          cameras: savedCameras,
        }),
      );
    } catch (error) {
      logger.error("Add NVR Error:", error);
      return res
        .status(500)
        .json(Response.errorResp("NVR addition failed", error.message));
    }
  }
  // ! new
  // async updateNvr(req, res, _next) {
  //   try {
  //     const { id: nvrId } = req.params;

  //     if (!nvrId) {
  //       return res
  //         .status(400)
  //         .json(Response.userFailResp("NVR ID is required"));
  //     }
  //     const { error, value } = NVRValidation.nvrSchema().validate(req.body);

  //     if (error) {
  //       const messages = error.details.map((d) => d.message);
  //       return res
  //         .status(400)
  //         .json(Response.userFailResp("Validation error", messages));
  //     }

  //     // Check if NVR exists
  //     const existingNvr = await NVR.findOne({ localNvrId: nvrId });
  //     if (!existingNvr) {
  //       return res.status(404).json(Response.notFoundResp("NVR not found"));
  //     }

  //     // Update NVR details
  //     const updatedNvr = await NVR.findByIdAndUpdate(existingNvr?._id, value, {
  //       new: true,
  //       runValidators: true,
  //     });

  //     return res.status(200).json(
  //       Response.userSuccessResp("NVR updated successfully", {
  //         nvr: updatedNvr,
  //       })
  //     );
  //   } catch (error) {
  //     logger.error("Update NVR Error:", error);
  //     return res
  //       .status(500)
  //       .json(Response.errorResp("NVR update failed", error.message));
  //   }
  // }
  // ! old
  async updateNvr(req, res, _next) {
    try {
      const { id: nvrId } = req.params;

      // 1. Validate NVR ID
      if (!nvrId) {
        return res
          .status(400)
          .json(Response.userFailResp("NVR ID is required"));
      }

      // only for on premise
      if (APP_ENV === "local") {
        const userId = req?.verified?.userData?.user_id;
        const { error, value } = NVRValidation.updateNvrLocalSchema(req.body);

        if (error) {
          const messages = error.details.map((d) => d.message);
          return res
            .status(400)
            .json(Response.userFailResp("Validation error", messages));
        }

        // Check if NVR exists
        const existingNvr = await NVR.findOne({ localNvrId: nvrId });
        if (!existingNvr) {
          return res.status(404).json(Response.notFoundResp("NVR not found"));
        }

        // Separate cameras from NVR metadata
        const { cameras, ...nvrFields } = value;

        // Update NVR metadata (only fields that were provided)
        const nvrUpdate = {};
        for (const [key, val] of Object.entries(nvrFields)) {
          if (val !== undefined) nvrUpdate[key] = val;
        }

        // Sync cameras if provided
        const syncResult = { created: [], updated: [], skipped: [] };

        if (Array.isArray(cameras) && cameras.length > 0) {
          // Fetch existing channels for this NVR
          const existingChannels = await Camera.find({
            nvrId: existingNvr._id,
          }).setOptions({ includeInactive: true });
          const channelMap = new Map(
            existingChannels.map((ch) => [ch.localChannelId, ch]),
          );

          for (const cam of cameras) {
            const existing = channelMap.get(cam.localChannelId);

            if (existing) {
              // Update existing channel
              let changed = false;
              if (cam.name && cam.name !== existing.name) {
                existing.name = cam.name;
                changed = true;
              }
              if (
                cam.streamingPath &&
                cam.streamingPath !== existing.streamingPath
              ) {
                existing.streamingPath = cam.streamingPath;
                changed = true;
              }
              if (changed) {
                await existing.save();
                syncResult.updated.push({
                  localChannelId: cam.localChannelId,
                  name: existing.name,
                });
              } else {
                syncResult.skipped.push({
                  localChannelId: cam.localChannelId,
                  reason: "No changes",
                });
              }
            } else {
              // Create new channel
              const newChannel = await Camera.create({
                userId,
                nvrId: existingNvr._id,
                name: cam.name,
                streamingPath: cam.streamingPath,
                localChannelId: cam.localChannelId,
              });
              syncResult.created.push({
                _id: newChannel._id,
                localChannelId: cam.localChannelId,
                name: cam.name,
              });
            }
          }

          // Update camera count
          const totalCameras = await Camera.countDocuments({
            nvrId: existingNvr._id,
          }).setOptions({ includeInactive: true });
          nvrUpdate.cameraCount = totalCameras;
        }

        const updatedNvr = Object.keys(nvrUpdate).length
          ? await NVR.findByIdAndUpdate(existingNvr._id, nvrUpdate, {
              new: true,
              runValidators: true,
            })
          : existingNvr;

        return res.status(200).json(
          Response.userSuccessResp("NVR updated successfully", {
            nvr: updatedNvr,
            cameras: syncResult,
          })
        );
      }

      // 2. Validate input
      const { error, value } = NVRValidation.updateNVR(req.body);
      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const {
        ip: encryptedIp, // frontend already encrypted the IP
        port,
        username,
        rtspPort,
        nvrName,
        oldPassword,
        newPassword,
        location,
      } = value;

      // Decrypt for comparisons and device auth; store encryptedIp directly
      const ip = decrypt(encryptedIp);

      // 3. Fetch existing NVR
      const existingNvr = await NVR.findById(nvrId);
      if (!existingNvr) {
        return res.status(404).json(Response.notFoundResp("NVR not found"));
      }

      const decryptedOldPassword = decrypt(existingNvr.password);

      // 4. Determine if any credentials changed
      // Compare against the decrypted stored IP so the check is meaningful
      const decryptedStoredIp = decrypt(existingNvr.ip);
      const credentialsChanged =
        ip !== decryptedStoredIp ||
        port !== existingNvr.port ||
        username !== existingNvr.username ||
        !!newPassword;

      const rtspChanged = rtspPort !== existingNvr.rtspPort;

      let passwordToUse = decryptedOldPassword;

      // 5. Handle password update
      if (newPassword || oldPassword) {
        if (!oldPassword) {
          return res
            .status(400)
            .json(Response.userFailResp("Old password is required"));
        }

        if (!newPassword) {
          return res
            .status(400)
            .json(Response.userFailResp("New password is required"));
        }

        if (oldPassword !== decryptedOldPassword) {
          return res
            .status(400)
            .json(Response.userFailResp("Old password is incorrect"));
        }

        passwordToUse = newPassword;
      }

      // 6. If credentials changed, validate with the NVR
      if (credentialsChanged) {
        if (existingNvr.brand === "hikvision") {
          const testClient = new DigestFetch(username, passwordToUse);
          const testRes = await testClient.fetch(
            `http://${ip}:${port}/ISAPI/System/deviceInfo`,
          );

          if (!testRes.ok) {
            return res
              .status(400)
              .json(
                Response.userFailResp(
                  "Hikvision NVR authentication failed with new credentials",
                ),
              );
          }
        } else if (existingNvr.brand === "cpplus") {
          const testClient = new DigestFetch(username, passwordToUse);
          const testRes = await testClient.fetch(
            `http://${ip}:${port}/cgi-bin/magicBox.cgi?action=getSystemInfo`,
          );
          if (!testRes.ok) {
            return res
              .status(400)
              .json(
                Response.userFailResp(
                  "CPPlus NVR authentication failed with new credentials",
                ),
              );
          }
        } else if (existingNvr.brand === "dahua") {
          // TODO: Add Dahua auth test logic
        } else if (existingNvr.brand === "prama") {
          // TODO: Add Prama auth test logic
        }

        // Optional: Handle unknown brands
        else {
          return res
            .status(400)
            .json(
              Response.userFailResp(`Unsupported brand: ${existingNvr.brand}`),
            );
        }
      }

      // 7. Update payload
      // encryptedIp is already AES-encrypted by the frontend — store it directly
      const updatePayload = {
        ip: encryptedIp,
        port,
        rtspPort,
        username,
        nvrName,
        password: encrypt(passwordToUse),
        location,
      };

      const updatedNvr = await NVR.findByIdAndUpdate(nvrId, updatePayload, {
        new: true,
      });

      // 8. If anything affecting the RTSP URL changed, update every camera
      // under this NVR on the streaming server.
      if (credentialsChanged || rtspChanged) {
        try {
          const cameras = await Camera.find({ nvrId: updatedNvr._id });
          await Promise.all(
            cameras.map(async (cam) => {
              try {
                const rtspUrl = buildRTSPUrl(updatedNvr, cam, "main");
                const uid = `${updatedNvr._id}-${cam._id}`;
                await updateCameraStream(uid, rtspUrl);
              } catch (innerErr) {
                logger.error(
                  `Failed to propagate RTSP update for camera ${cam._id}`,
                  innerErr.message,
                );
              }
            }),
          );
        } catch (syncErr) {
          logger.error(
            "Failed to sync updated NVR credentials to streaming server",
            syncErr.message,
          );
        }
      }

      return res.status(200).json(
        Response.userSuccessResp("NVR updated successfully", {
          nvr: updatedNvr,
        }),
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update NVR", error.message));
    }
  }

  async updateNvrChannels(req, res, _next) {
    try {
      const { id: nvrId } = req.params;

      if (!nvrId) {
        return res
          .status(400)
          .json(Response.userFailResp("NVR ID is required"));
      }

      const nvr = await NVR.findById(nvrId);
      if (!nvr) {
        return res.status(404).json(Response.notFoundResp("NVR not found"));
      }

      const { brand, password } = nvr;
      const handler = updateHandlers[brand?.toLowerCase()];

      if (!handler) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Unsupported brand",
              "NVR brand not supported for update",
            ),
          );
      }

      const decryptedPassword = decrypt(password);
      return await handler(nvr, decryptedPassword, res);
    } catch (error) {
      logger.error("Update NVR Channels Error:", error);
      return res
        .status(500)
        .json(Response.errorResp("NVR channel update failed", error.message));
    }
  }

  async testRtspConnection(rtspUrl) {
    try {
      const url = new URL(rtspUrl);
      const host = url.hostname;
      const port = url.port || 554;

      return new Promise((resolve) => {
        const socket = net.createConnection(
          { host, port, timeout: 3000 },
          () => {
            socket.destroy();
            resolve(true);
          },
        );
        socket.on("error", () => resolve(false));
        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }

  async deleteNvr(req, res, _next) {
    try {
      const { id } = req.params;
      // const deletedNVR = await NVR.findByIdAndDelete(nvrId);

      // if (!deletedNVR) {
      //   return res.status(400).json(Response.userFailResp("NVR not found"));
      // }

      // // 👇 Delete associated cameras
      // await Camera.deleteMany({ nvrId });

      if (!id) {
        return res
          .status(400)
          .json(Response.userFailResp("NVR ID is required"));
      }

      // ! new
      // const nvrId = await NVR.findOne({ localNvrId: id }).select("_id");

      // !old
      const nvrId =
        APP_ENV === "cloud"
          ? await NVR.findOne({ _id: id }).select("_id")
          : await NVR.findOne({ localNvrId: id }).select("_id");

      if (!nvrId) {
        return res.status(400).json(Response.userFailResp("NVR not found"));
      }

      const deletedNVR = await DeleteService.deleteNVR(nvrId);
      if (!deletedNVR) {
        return res.status(400).json(Response.userFailResp("NVR not found"));
      }

      return res
        .status(200)
        .json(
          Response.userSuccessResp(
            "NVR and associated cameras deleted successfully",
          ),
        );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to delete NVR", error.message));
    }
  }

  async deleteAllNvrs(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.user_id;
      const nvrs = await NVR.find({ userId }).select("_id");
      if (nvrs.length === 0) {
        return res
          .status(400)
          .json(Response.userFailResp("No NVRs found to delete"));
      }
      for (const nvr of nvrs) {
        await DeleteService.deleteNVR(nvr._id);
      }

      return res
        .status(200)
        .json(
          Response.userSuccessResp(
            "NVRs and associated cameras deleted successfully",
          ),
        );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to delete NVRs", error.message));
    }
  }

  async getNvrById(req, res, _next) {
    try {
      const { id: nvrId } = req.params;

      const nvr = await NVR.findById(nvrId);

      if (!nvr) {
        return res.status(400).json(Response.userFailResp("NVR not found"));
      }

      res
        .status(200)
        .json(Response.userSuccessResp("NVR retrieved successfully", { nvr }));
    } catch (error) {
      logger.error(error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to retrieve NVR", error.message));
    }
  }

  async getAllNvrs(req, res, _next) {
    try {
      let { user_id, adminId, memberId } = req?.verified?.userData;
      if (!memberId) {
        let adminData = await adminModel.findOne({ _id: adminId });
        user_id = adminData?.user_id;
        if (!user_id) {
          logger.error("User ID not provided in request");
          return res
            .status(400)
            .json(Response.userFailResp("Please provide user_id"));
        }
        // Extract skip and limit from query parameters, with defaults
        const skip = parseInt(req.query.skip) || 0;
        const limit = parseInt(req.query.limit) || 10;

        const nvrs = await NVR.find({ userId: user_id })
          .skip(skip)
          .limit(limit);

        const total = await NVR.countDocuments({ userId: user_id });

        return res.status(200).json(
          Response.userSuccessResp("NVRs retrieved successfully", {
            nvrs,
            total,
          }),
        );
      } else {
        let { user_id, adminId, memberId } = req?.verified?.userData;
        let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];

        if (!memberId) {
          let adminData = await adminModel.findOne({ _id: adminId });
          user_id = adminData?.user_id;
          if (!user_id) {
            logger.error("User ID not provided in request");
            return res
              .status(400)
              .json(Response.userFailResp("Please provide user_id"));
          }
          // Extract skip and limit from query parameters, with defaults
          const skip = parseInt(req.query.skip) || 0;
          const limit = parseInt(req.query.limit) || 10;

          const nvrs = await NVR.find({ userId: user_id })
            .skip(skip)
            .limit(limit);

          const total = await NVR.countDocuments({ userId: user_id });

          return res.status(200).json(
            Response.userSuccessResp("NVRs retrieved successfully", {
              nvrs,
              total,
            }),
          );
        } else {
          // Extract skip and limit from query parameters, with defaults
          const skip = parseInt(req.query.skip) || 0;
          const limit = parseInt(req.query.limit) || 10;

          // Fetch NVRs with authorization check
          const nvrs = await NVR.find({
            userId: user_id,
            _id: { $in: authorizedNVRs },
          })
            .skip(skip)
            .limit(limit);

          const total = await NVR.countDocuments({
            userId: user_id,
            _id: { $in: authorizedNVRs },
          });

          return res.status(200).json(
            Response.userSuccessResp("NVRs retrieved successfully", {
              nvrs,
              total,
            }),
          );
        }
      }
    } catch (error) {
      logger.error("Error fetching all NVRs:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to retrieve NVRs", error.message));
    }
  }
  async getNVRsWithChannels(req, res, _next) {
    try {
      let memberId = req?.verified?.userData?.memberId;
      let authorizedChannels = req?.verified?.authorizedChannel?.channels || [];
      let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
      if (memberId) {
        const settingType = req?.query?.settingType;
        if (!settingType) {
          logger.error("Setting type not provided in request");
          return res
            .status(400)
            .json(Response.userFailResp("Please provide settingType"));
        }
        let { user_id, adminId } = req?.verified?.userData;
        let adminData = await adminModel.findOne({ _id: adminId });
        user_id = adminData?.user_id;

        // Get all NVRs for the user
        const nvrs = await NVR.find({
          userId: user_id,
          _id: { $in: authorizedNVRs },
        })
          .select("nvrName")
          .lean();
        // Get all channels for the user
        const channels = await Channel.find({
          userId: user_id,
          _id: { $in: authorizedChannels },
        })
          .select("name nvrId detections")
          .lean();

        // Group channels by NVR ID
        const channelsByNvr = channels.reduce((acc, channel) => {
          const nvrId = channel.nvrId?.toString();
          const detections = channel?.detections || {};
          if (!acc[nvrId]) acc[nvrId] = [];
          acc[nvrId].push({
            _id: channel._id,
            name: channel.name,
            hasSetting:
              detections.hasOwnProperty(settingType) &&
              detections[settingType]?.enabled
                ? true
                : false,
          });
          return acc;
        }, {});

        // Combine each NVR with its channels
        const result = nvrs.map((nvr) => ({
          _id: nvr._id,
          name: nvr.nvrName,
          channels: channelsByNvr[nvr._id.toString()] || [],
        }));

        return res.status(200).json(
          Response.userSuccessResp("NVRs with channels fetched successfully", {
            nvrs: result,
          }),
        );
      }
      const settingType = req?.query?.settingType;
      if (!settingType) {
        logger.error("Setting type not provided in request");
        return res
          .status(400)
          .json(Response.userFailResp("Please provide settingType"));
      }
      let { user_id, adminId } = req?.verified?.userData;
      let adminData = await adminModel.findOne({ _id: adminId });
      user_id = adminData?.user_id;

      // Get all NVRs for the user
      const nvrs = await NVR.find({ userId: user_id }).select("nvrName").lean();

      // Get all channels for the user
      const channels = await Channel.find({ userId: user_id })
        .setOptions({ includeInactive: true })
        .select("name nvrId detections")
        .lean();

      // Group channels by NVR ID
      const channelsByNvr = channels.reduce((acc, channel) => {
        const nvrId = channel.nvrId?.toString();
        const detections = channel?.detections || {};
        if (!acc[nvrId]) acc[nvrId] = [];
        acc[nvrId].push({
          _id: channel._id,
          name: channel.name,
          hasSetting:
            detections.hasOwnProperty(settingType) &&
            detections[settingType]?.enabled
              ? true
              : false,
        });
        return acc;
      }, {});

      // Combine each NVR with its channels
      const result = nvrs.map((nvr) => ({
        _id: nvr._id,
        name: nvr.nvrName,
        channels: channelsByNvr[nvr._id.toString()] || [],
      }));

      return res.status(200).json(
        Response.userSuccessResp("NVRs with channels fetched successfully", {
          nvrs: result,
        }),
      );
    } catch (error) {
      logger.error("Error fetching NVRs with channels:", error);
      return res
        .status(400)
        .json(
          Response.errorResp(
            "Failed to retrieve NVRs with channels",
            error.message,
          ),
        );
    }
  }

  async allNvrs(_req, res, _next) {
    try {
      const nvrs = await NVR.find().select("_id");

      let total = 0;
      if (nvrs.length > 0) total = nvrs.length;

      return res.status(200).json(
        Response.userSuccessResp("NVRs retrieved successfully", {
          nvrs,
          total,
        }),
      );
    } catch (error) {
      logger.error("Error fetching all NVRs:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to retrieve NVRs", error.message));
    }
  }
  async getNVRLocations(req, res, _next) {
    try {
      let authorizedLocations =
        req?.verified?.authorizedChannel?.locations || [];
      let memberId = req?.verified?.userData?.memberId;
      const user_id = req?.verified?.userData?.user_id;
      if (!user_id) {
        logger.error("User ID not provided in request");
        return res
          .status(400)
          .json(Response.userFailResp("Please provide user_id"));
      }

      const locations = await NVR.distinct("location", { userId: user_id });

      if (memberId) {
        // ✅ Filter only authorized locations
        const filteredLocations = locations.filter((loc) =>
          authorizedLocations.includes(loc),
        );

        return res.status(200).json(
          Response.userSuccessResp("NVR locations retrieved successfully", {
            locations: filteredLocations,
          }),
        );
      }

      return res.status(200).json(
        Response.userSuccessResp("NVR locations retrieved successfully", {
          locations,
        }),
      );
    } catch (error) {
      logger.error("Error fetching NVR locations:", error);
      return res
        .status(400)
        .json(
          Response.errorResp("Failed to retrieve NVR locations", error.message),
        );
    }
  }

  async registerAndFetchCameras(req, res, _next) {
    try {
      const { error, value } = NVRValidation.registerNVR(req.body);
      if (error) {
        return res
          .status(400)
          .json(Response.userFailResp("Validation Failed", error.message));
      }

      const { brand, ip, port, username, password, rtspPort, nvrName, location } = value;
      const user_id = req?.verified?.userData?.user_id;

      // Check if NVR already exists by querying all NVRs and comparing
      const allNvrs = await NVR.find({ userId: user_id, port });
      let existingNvr = null;

      for (const nvr of allNvrs) {
        try {
          const decryptedIp = nvr.ip ? decrypt(nvr.ip) : null;
          if (decryptedIp === ip) {
            existingNvr = nvr;
            break;
          }
        } catch {
          // skip NVRs with unreadable ip
        }
      }

      // Authenticate and fetch available cameras from device
      const camerasData = await this._fetchCamerasFromNvr(brand, ip, port, username, password);
      if (camerasData.error) {
        return res.status(400).json(
          Response.userFailResp("NVR Authentication failed", camerasData.error),
        );
      }

      if (existingNvr) {
        // NVR exists - add any new cameras and show all available cameras with isAdded status
        const plainPassword = existingNvr.password ? decrypt(existingNvr.password) : null;

        // Add all cameras that don't exist yet (without setting isAdded=true)
        for (const cam of camerasData.cameras) {
          const existing = await Camera.findOne({
            nvrId: existingNvr._id,
            channelId: cam.channelId,
          }).setOptions({ includeInactive: true });

          if (!existing) {
            // Create new camera with isAdded=false
            try {
              const uid = `${existingNvr._id}-${cam.channelId}`;
              const newCam = await Camera.create({
                nvrId: existingNvr._id,
                userId: user_id,
                channelId: cam.channelId,
                rtspChannels: cam.rtspChannels || [],
                name: cam.name || "",
                ipAddress: cam.ipAddress || "",
                model: cam.model || "",
                serialNumber: cam.serialNumber || "",
                firmwareVersion: cam.firmwareVersion || "",
                streamEndpoint: cam.streamEndpoint || "default",
                isAdded: false,
              });

              // Register stream but mark as not added yet
              const rtspUrl = buildRTSPUrl(existingNvr, newCam, "main");
              try {
                await registerCameraStream(uid, rtspUrl);
              } catch (streamErr) {
                logger.error(`Failed to register stream for camera ${cam.channelId}`, streamErr.message);
              }
            } catch (camErr) {
              logger.error(`Failed to create camera ${cam.channelId}`, camErr.message);
            }
          }
        }

        // Fetch all cameras and return with their isAdded status (including inactive)
        const allCameras = await Camera.find({ nvrId: existingNvr._id }).setOptions({ includeInactive: true });
        const camerasMap = new Map(allCameras.map((c) => [c.channelId, { isAdded: c.isAdded, _id: c._id }]));

        // Build cameras with status and streaming URLs
        const camerasWithStatus = await Promise.all(
          camerasData.cameras.map(async (cam) => {
            const dbCam = camerasMap.get(cam.channelId);
            let streamingUrl = null;

            // Build streaming URL for all cameras (for preview in discovery modal)
            if (dbCam) {
              streamingUrl = await buildStreamingUrl(existingNvr, { ...cam, _id: dbCam._id });
            }

            return {
              ...cam,
              isAdded: dbCam ? dbCam.isAdded : false,
              streamingUrl,
            };
          })
        );

        // Update camera count (only count added cameras)
        const addedCount = allCameras.filter(c => c.isAdded).length;
        await NVR.findByIdAndUpdate(existingNvr._id, { cameraCount: addedCount });

        return res.status(200).json(
          Response.userSuccessResp("Cameras retrieved successfully", {
            nvr: existingNvr,
            cameras: camerasWithStatus,
            isNew: false,
          }),
        );
      }

      // Save new NVR and add all its cameras with isAdded=false
      const savedNvr = await NVR.create({
        userId: user_id,
        ip,
        username,
        password,
        port,
        rtspPort,
        nvrName,
        brand: brand.toLowerCase(),
        deviceName: camerasData.deviceInfo?.deviceName || "",
        model: camerasData.deviceInfo?.model || "",
        serialNumber: camerasData.deviceInfo?.serialNumber || "",
        macAddress: camerasData.deviceInfo?.macAddress || "",
        firmwareVersion: camerasData.deviceInfo?.firmwareVersion || "",
        deviceType: camerasData.deviceInfo?.deviceType || "",
        location: location || "",
        cameraCount: 0,
      });

      // Add all cameras for new NVR with isAdded=false
      const createdCameras = [];
      for (const cam of camerasData.cameras) {
        try {
          const newCam = await Camera.create({
            nvrId: savedNvr._id,
            userId: user_id,
            channelId: cam.channelId,
            rtspChannels: cam.rtspChannels || [],
            name: cam.name || "",
            ipAddress: cam.ipAddress || "",
            model: cam.model || "",
            serialNumber: cam.serialNumber || "",
            firmwareVersion: cam.firmwareVersion || "",
            streamEndpoint: cam.streamEndpoint || "default",
            isAdded: false,
          });

          createdCameras.push(newCam);

          // Register stream
          const uid = `${savedNvr._id}-${newCam._id}`;
          const rtspUrl = buildRTSPUrl(savedNvr, newCam, "main");
          try {
            await registerCameraStream(uid, rtspUrl);
          } catch (streamErr) {
            logger.error(`Failed to register stream for camera ${cam.channelId}`, streamErr.message);
          }
        } catch (camErr) {
          logger.error(`Failed to create camera ${cam.channelId}`, camErr.message);
        }
      }

      // Build streaming URLs for all cameras
      const camerasWithUrl = await Promise.all(
        camerasData.cameras.map(async (cam, index) => {
          const createdCam = createdCameras[index];
          let streamingUrl = null;
          if (createdCam) {
            try {
              streamingUrl = await buildStreamingUrl(savedNvr, createdCam);
            } catch {
              // non-fatal
            }
          }
          return {
            ...cam,
            isAdded: false,
            streamingUrl,
          };
        })
      );

      // Update camera count (initially 0 since all are isAdded=false)
      await NVR.findByIdAndUpdate(savedNvr._id, { cameraCount: 0 });

      return res.status(201).json(
        Response.userSuccessResp("NVR registered and cameras fetched successfully", {
          nvr: savedNvr,
          cameras: camerasWithUrl,
          isNew: true,
        }),
      );
    } catch (error) {
      logger.error("Register and Fetch Cameras Error:", error);
      // Handle duplicate key error
      if (error.message.includes("E11000")) {
        return res.status(400).json(
          Response.userFailResp("NVR already exists", "This NVR is already registered"),
        );
      }
      return res
        .status(500)
        .json(Response.errorResp("Failed to register and fetch cameras", error.message));
    }
  }

  async _fetchCamerasFromNvr(brand, ip, port, username, password) {
    try {
      const client = new DigestFetch(username, password);

      if (brand.toLowerCase() === "hikvision") {
        const deviceInfoRes = await client.fetch(
          `http://${ip}:${port}/ISAPI/System/deviceInfo`
        );
        if (!deviceInfoRes.ok) {
          return { error: "Failed to authenticate with Hikvision NVR" };
        }

        const deviceInfoXml = await deviceInfoRes.text();
        const deviceInfoData = await parseXml(deviceInfoXml);
        const deviceInfo = deviceInfoData?.DeviceInfo;

        const channelsRes = await client.fetch(
          `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels`
        );
        const channelsXml = await channelsRes.text();
        const channelsData = await parseXml(channelsXml);
        const channelList = channelsData?.InputProxyChannelList?.InputProxyChannel;
        const channels = Array.isArray(channelList) ? channelList : (channelList ? [channelList] : []);

        const statusRes = await client.fetch(
          `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels/status`
        );
        const statusXml = await statusRes.text();
        const statusData = await parseXml(statusXml);
        const statusList =
          statusData?.InputProxyChannelStatusList?.InputProxyChannelStatus;
        const statuses = Array.isArray(statusList) ? statusList : [statusList];

        const streamInfoRes = await client.fetch(
          `http://${ip}:${port}/ISAPI/Streaming/channels/`
        );
        const streamInfoXml = await streamInfoRes.text();
        const streamInfoData = await parseXml(streamInfoXml);
        const streamingChannelList =
          streamInfoData?.StreamingChannelList?.StreamingChannel;
        const streamingChannels = Array.isArray(streamingChannelList)
          ? streamingChannelList
          : [streamingChannelList];

        const streamResolutionMap = {};
        for (const stream of streamingChannels) {
          const id = stream?.id;
          const width = stream?.Video?.videoResolutionWidth;
          const height = stream?.Video?.videoResolutionHeight;
          if (id && width && height) {
            streamResolutionMap[id] = {
              width: parseInt(width, 10),
              height: parseInt(height, 10),
            };
          }
        }

        const cameraList = [];
        for (const ch of channels) {
          const chId = ch.id;
          const status = statuses.find((s) => s.id === chId);
          const streamIds =
            status?.streamingProxyChannelIdList?.streamingProxyChannelId || [];

          const rtspChannels = streamIds.map((id) => ({
            id,
            resolution: streamResolutionMap[id] || { width: 0, height: 0 },
          }));

          cameraList.push({
            channelId: chId,
            rtspChannels,
            name: ch?.name || `Camera ${chId}`,
            ipAddress: ch?.sourceInputPortDescriptor?.ipAddress || "",
            model: ch?.sourceInputPortDescriptor?.model || "",
            serialNumber: ch?.sourceInputPortDescriptor?.serialNumber || "",
            firmwareVersion: ch?.sourceInputPortDescriptor?.firmwareVersion || "",
            streamEndpoint: "/Streaming/Channels/",
          });
        }

        return {
          deviceInfo,
          cameras: cameraList,
        };
      } else if (brand.toLowerCase() === "cpplus") {
        // Helper function to parse CP Plus plain text response
        const parseCPPlusResponse = (text) => {
          const lines = text.split("\n");
          const result = {};
          lines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed && trimmed.includes("=")) {
              const [key, ...valueParts] = trimmed.split("=");
              const value = valueParts.join("=");
              result[key.trim()] = value.trim();
            }
          });
          return result;
        };

        // Helper to group array properties from CP Plus response
        const groupArrayProperties = (data, prefix) => {
          const groups = {};
          Object.keys(data).forEach((key) => {
            if (key.startsWith(prefix)) {
              const match = key.match(/\[(\d+)\](?:\[(\d+)\])?\.?(.+)?/);
              if (match) {
                const index1 = match[1];
                const index2 = match[2];
                const property = match[3];
                const groupKey = index2 ? `${index1}_${index2}` : index1;
                if (!groups[groupKey]) {
                  groups[groupKey] = {
                    channel: index1,
                    stream: index2,
                  };
                }
                if (property) {
                  groups[groupKey][property] = data[key];
                }
              }
            }
          });
          return Object.values(groups);
        };

        const deviceInfoRes = await client.fetch(
          `http://${ip}:${port}/cgi-bin/magicBox.cgi?action=getSystemInfo`
        );

        if (!deviceInfoRes.ok) {
          return { error: "Failed to authenticate with CP Plus NVR" };
        }

        const deviceInfoText = await deviceInfoRes.text();
        const deviceInfoData = parseCPPlusResponse(deviceInfoText);

        const deviceInfo = {
          deviceName:
            deviceInfoData["deviceName"] ||
            deviceInfoData["DeviceName"] ||
            "",
          model:
            deviceInfoData["deviceModel"] ||
            deviceInfoData["DeviceType"] ||
            "",
          serialNumber:
            deviceInfoData["serialNumber"] || deviceInfoData["SerialNo"] || "",
          macAddress:
            deviceInfoData["macAddress"] || deviceInfoData["MacAddress"] || "",
          firmwareVersion:
            deviceInfoData["softwareVersion"] ||
            deviceInfoData["SoftwareVersion"] ||
            "",
          deviceType:
            deviceInfoData["deviceClass"] ||
            deviceInfoData["DeviceClass"] ||
            "",
        };

        // Get channel titles
        const channelTitlesRes = await client.fetch(
          `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`
        );
        const channelTitlesText = await channelTitlesRes.text();
        const channelTitlesData = parseCPPlusResponse(channelTitlesText);

        const channelNames = {};
        Object.keys(channelTitlesData).forEach((key) => {
          const match = key.match(/table\.ChannelTitle\[(\d+)\]\.Name/);
          if (match) {
            const channelIdx = match[1];
            channelNames[channelIdx] = channelTitlesData[key];
          }
        });

        // Get channels
        const channelsRes = await client.fetch(
          `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=VideoInOptions`
        );
        const channelsText = await channelsRes.text();
        const channelsData = parseCPPlusResponse(channelsText);
        const channelGroups = groupArrayProperties(
          channelsData,
          "table.VideoInOptions["
        );

        // Get encode config
        const encodeRes = await client.fetch(
          `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
        );
        const encodeText = await encodeRes.text();
        const encodeData = parseCPPlusResponse(encodeText);

        const encodeGroups = {};
        Object.keys(encodeData).forEach((key) => {
          const match = key.match(
            /table\.Encode\[(\d+)\]\.(MainFormat|ExtraFormat)\[(\d+)\]\.Video\.(Width|Height|Compression|BitRate|FPS)/
          );

          if (match) {
            const channelIdx = match[1];
            const streamType = match[2];
            const streamIdx = match[3];
            const property = match[4];

            const streamKey = `${channelIdx}_${streamType}_${streamIdx}`;

            if (!encodeGroups[streamKey]) {
              encodeGroups[streamKey] = {
                channel: channelIdx,
                streamType,
                streamIdx,
                id: `${parseInt(channelIdx) + 1}${
                  streamType === "MainFormat" ? "01" : "02"
                }`,
              };
            }

            if (property === "Width") {
              encodeGroups[streamKey].width = parseInt(encodeData[key], 10);
            } else if (property === "Height") {
              encodeGroups[streamKey].height = parseInt(encodeData[key], 10);
            }
          }
        });

        const cameraList = [];
        for (const chGroup of channelGroups) {
          const chId = chGroup.channel;

          const channelStreams = Object.values(encodeGroups).filter(
            (stream) => stream.channel === chId && stream.width && stream.height
          );

          const rtspChannels = channelStreams.map((stream) => ({
            id: stream.id,
            resolution: {
              width: stream.width || 0,
              height: stream.height || 0,
            },
          }));

          const cameraName =
            channelNames[chId] ||
            chGroup.Alias ||
            chGroup.Name ||
            `Camera ${parseInt(chId) + 1}`;

          cameraList.push({
            channelId: (parseInt(chId) + 1).toString(),
            rtspChannels,
            name: cameraName,
            ipAddress: chGroup?.IPAddress || "",
            model: chGroup?.Model || "",
            serialNumber: chGroup?.SerialNumber || "",
            firmwareVersion: chGroup?.FirmwareVersion || "",
            streamEndpoint: "/cam/realmonitor",
          });
        }

        return {
          deviceInfo,
          cameras: cameraList,
        };
      } else {
        return { error: "This brand is not yet supported for camera discovery" };
      }
    } catch (error) {
      logger.error("Fetch Cameras From NVR Error:", error);
      return { error: error.message };
    }
  }

  async addSelectedCameras(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { nvrId, cameraIds, cameras: camerasInput } = req.body;
      const cameraList = cameraIds ?? camerasInput;

      if (!nvrId || !Array.isArray(cameraList) || cameraList.length === 0) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Validation Failed",
              "nvrId and cameraIds array are required",
            ),
          );
      }

      if (!mongoose.Types.ObjectId.isValid(nvrId)) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Validation Failed",
              "Invalid nvrId format",
            ),
          );
      }

      const nvr = await NVR.findOne({ _id: nvrId, userId: user_id });
      if (!nvr) {
        return res.status(404).json(Response.notFoundResp("NVR not found"));
      }

      // Get all cameras for this NVR (including inactive ones)
      const allCameras = await Camera.find({ nvrId }).setOptions({ includeInactive: true });

      // Normalize cameraIds to strings for comparison
      const selectedSet = new Set(cameraList.map(id => String(id)));
      const bulkOps = allCameras.map((cam) => ({
        updateOne: {
          filter: { _id: cam._id },
          update: { $set: { isAdded: selectedSet.has(String(cam.channelId)) } },
        },
      }));

      if (bulkOps.length > 0) {
        await Camera.bulkWrite(bulkOps);
      }

      // Update camera count (count only added cameras)
      const addedCount = await Camera.countDocuments({ nvrId, isAdded: true });
      await NVR.findByIdAndUpdate(nvrId, { cameraCount: addedCount });

      // Fetch all updated cameras (including inactive for complete state)
      const cameras = await Camera.find({ nvrId }).setOptions({ includeInactive: true });

      // Update camera count based on isAdded cameras
      const addedCount = await Camera.countDocuments({ nvrId, isAdded: true });
      await NVR.findByIdAndUpdate(nvrId, { cameraCount: addedCount });

      return res.status(200).json(
        Response.userSuccessResp("Cameras selection updated successfully", {
          cameras,
          cameraCount: addedCount,
        }),
      );
    } catch (error) {
      logger.error("Add Selected Cameras Error:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to update cameras", error.message));
    }
  }

  async editNvrCameras(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { nvrId } = req.params;

      if (!nvrId) {
        return res.status(400).json(Response.userFailResp("Validation Failed", "nvrId is required"));
      }

      if (!mongoose.Types.ObjectId.isValid(nvrId)) {
        return res.status(400).json(Response.userFailResp("Validation Failed", "Invalid nvrId format"));
      }

      const nvr = await NVR.findOne({ _id: nvrId, userId: user_id });
      if (!nvr) {
        return res.status(404).json(Response.notFoundResp("NVR not found"));
      }

      const plainPassword = decrypt(nvr.password);
      const plainIp = decrypt(nvr.ip);

      const camerasData = await this._fetchCamerasFromNvr(nvr.brand, plainIp, nvr.port, nvr.username, plainPassword);
      if (camerasData.error) {
        return res.status(400).json(Response.userFailResp("Failed to fetch cameras", camerasData.error));
      }

      const addedCameras = await Camera.find({ nvrId }).setOptions({ includeInactive: true });
      const addedMap = new Map(addedCameras.map((c) => [c.channelId, { _id: c._id, isAdded: c.isAdded }]));

      const availableCameras = camerasData.cameras.map((cam) => ({
        ...cam,
        isAdded: addedMap.has(cam.channelId) ? addedMap.get(cam.channelId).isAdded : false,
        dbId: addedMap.has(cam.channelId) ? addedMap.get(cam.channelId)._id : null,
      }));

      return res.status(200).json(
        Response.userSuccessResp("Edit cameras retrieved successfully", { nvr, availableCameras }),
      );
    } catch (error) {
      logger.error("Edit NVR Cameras Error:", error);
      return res.status(500).json(Response.errorResp("Failed to fetch edit data", error.message));
    }
  }

  async removeCamera(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { cameraId } = req.params;

      if (!cameraId) {
        return res.status(400).json(Response.userFailResp("Validation Failed", "cameraId is required"));
      }

      if (!mongoose.Types.ObjectId.isValid(cameraId)) {
        return res.status(400).json(Response.userFailResp("Validation Failed", "Invalid cameraId format"));
      }

      const camera = await Camera.findOne({ _id: cameraId, userId: user_id }).setOptions({ includeInactive: true });
      if (!camera) {
        return res.status(404).json(Response.notFoundResp("Camera not found"));
      }

      const nvrId = camera.nvrId;

      await DeleteService.deleteChannel(cameraId);

      const totalCameras = await Camera.countDocuments({ nvrId }).setOptions({ includeInactive: true });
      await NVR.findByIdAndUpdate(nvrId, { cameraCount: totalCameras });

      return res.status(200).json(
        Response.userSuccessResp("Camera removed successfully", { cameraId, nvrId, cameraCount: totalCameras }),
      );
    } catch (error) {
      logger.error("Remove Camera Error:", error);
      return res.status(500).json(Response.errorResp("Failed to remove camera", error.message));
    }
  }

  static async _fetchCamerasFromNvr(brand, host, username, password) {
    try {
      const brandLower = brand?.toLowerCase();

      if (!['hikvision', 'cpplus'].includes(brandLower)) {
        return {
          error: 'NVR brand not yet supported'
        };
      }

      let deviceInfo, cameraResponse;

      if (brandLower === 'hikvision') {
        const deviceResponse = await fetch(
          `http://${host}/ISAPI/System/deviceInfo`,
          {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        );

        if (!deviceResponse.ok) {
          return { error: 'Failed to fetch device info from Hikvision NVR' };
        }

        deviceInfo = await deviceResponse.json();

        const camerasResponse = await fetch(
          `http://${host}/ISAPI/ContentMgmt/InputProxy/channels`,
          {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        );

        cameraResponse = await camerasResponse.json();

      } else if (brandLower === 'cpplus') {
        const deviceResponse = await fetch(
          `http://${host}/API/System/SystemInfo`,
          {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        );

        if (!deviceResponse.ok) {
          return { error: 'Failed to fetch device info from CP Plus NVR' };
        }

        deviceInfo = await deviceResponse.json();

        const camerasResponse = await fetch(
          `http://${host}/API/ContentMgmt/InputProxy/Channels`,
          {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        );

        cameraResponse = await camerasResponse.json();
      }

      const cameras = Array.isArray(cameraResponse) ? cameraResponse :
                      cameraResponse?.InputProxyChannelList || [];

      return {
        deviceInfo,
        cameras: cameras.map(cam => ({
          id: cam.id || cam.channelId,
          name: cam.name || cam.channelName,
          enabled: cam.enabled !== false
        }))
      };

    } catch (error) {
      return {
        error: error.message || 'Unknown error fetching cameras from NVR'
      };
    }
  }
}

export { NVRService };
export default new NVRService();
