import DigestFetch from "digest-fetch";
import NVR from "./nvr.model.js";
import Camera from "../channels/channels.model.js";
import logger from "../../../utils/logger.js";
import NVRValidation from "./nvr.validate.js";
import { decrypt, encrypt } from "../../../utils/cryptoUtils.js";
import Response from "../../../utils/response.js";
import brandHandlers, { updateHandlers } from "./nvr.brands.js"; // Import brand-specific handlers
import DeleteService from "../../../services/delete.service.js";
import Channel from "../channels/channels.model.js";
import adminModel from "../admin/admin.model.js";
import net from "net";
import config from "config";
import { autoSyncLocations } from "../../../utils/helperFunctions.js";
import { buildRTSPUrl, updateCameraStream } from "../../../utils/rtspStream.js";
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
          });
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
          });
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

  async removeCamera(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.user_id;
      const { cameraId } = req.params;

      if (!cameraId) {
        return res.status(400).json(Response.userFailResp("Validation Failed", "cameraId is required"));
      }

      const camera = await Camera.findOne({ _id: cameraId, userId: user_id });
      if (!camera) {
        return res.status(404).json(Response.notFoundResp("Camera not found"));
      }

      const nvrId = camera.nvrId;

      await DeleteService.deleteChannel(cameraId);

      const totalCameras = await Camera.countDocuments({ nvrId });
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
