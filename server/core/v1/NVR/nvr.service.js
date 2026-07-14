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

      // ponytail: hard cap of 2 channels, only for user_id "46"; generalize to a plan/config field when tiers exist
      const MAX_CHANNELS_PER_USER = 2;
      if (String(userId) === "46") {
        const existingChannelCount = await Channel.countDocuments({
          userId,
          isAdded: true,
        });
        if (existingChannelCount + cameras.length > MAX_CHANNELS_PER_USER) {
          return res
            .status(400)
            .json(
              Response.userFailResp(
                `Channel limit reached. A maximum of ${MAX_CHANNELS_PER_USER} channels are allowed for this user (${existingChannelCount} already added).`,
              ),
            );
        }
      }

      // Save NVR metadata
      const savedNvr = await NVR.create({
        userId,
        ...nvr,
        cameraCount: cameras.length,
      });

      const cameraDocs = cameras.map((cam) => ({
        userId,
        nvrId: savedNvr._id,
        isAdded: true,
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

          // ponytail: hard cap of 2 channels, only for user_id "46"; generalize to a plan/config field when tiers exist.
          // Only NEW channels count against the cap — editing existing ones is always allowed.
          const MAX_CHANNELS_PER_USER = 2;
          if (String(userId) === "46") {
            const newChannelCount = cameras.filter(
              (cam) => !channelMap.has(cam.localChannelId),
            ).length;
            if (newChannelCount > 0) {
              const existingChannelCount = await Channel.countDocuments({
                userId,
                isAdded: true,
              });
              if (existingChannelCount + newChannelCount > MAX_CHANNELS_PER_USER) {
                return res
                  .status(400)
                  .json(
                    Response.userFailResp(
                      `Channel limit reached. A maximum of ${MAX_CHANNELS_PER_USER} channels are allowed for this user (${existingChannelCount} already added).`,
                    ),
                  );
              }
            }
          }

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
          })
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
          // Dahua uses the same CGI protocol as CP-Plus.
          const testClient = new DigestFetch(username, passwordToUse);
          const testRes = await testClient.fetch(
            `http://${ip}:${port}/cgi-bin/magicBox.cgi?action=getSystemInfo`,
          );
          if (!testRes.ok) {
            return res
              .status(400)
              .json(
                Response.userFailResp(
                  "Dahua NVR authentication failed with new credentials",
                ),
              );
          }
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
                await updateCameraStream(uid, rtspUrl, undefined, updatedNvr?.userId);
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
        // NVR exists - show all available cameras + mark which ones are already added
        const addedCameras = await Camera.find({ nvrId: existingNvr._id });
        const addedChannelIds = addedCameras.map((c) => c.channelId);

        // Mark cameras that are already added
        const camerasWithStatus = camerasData.cameras.map((cam) => ({
          ...cam,
          isAdded: addedChannelIds.includes(cam.channelId),
        }));

        return res.status(200).json(
          Response.userSuccessResp("Cameras retrieved successfully", {
            nvr: existingNvr,
            cameras: camerasWithStatus,
            isNew: false,
          }),
        );
      }

      // Tiandy NVR password fields are capped at 15 chars — store trimmed value so RTSP URLs authenticate correctly
      const storedPassword = brand.toLowerCase() === "tiandy" ? password.slice(0, 15) : password;

      // Save NVR
      const savedNvr = await NVR.create({
        userId: user_id,
        ip,
        username,
        password: storedPassword,
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
        location: location?.toLowerCase()  || "",
        cameraCount: 0,
      });

      // Save all fetched cameras
      const savedCameras = [];
      for (const cam of camerasData.cameras) {
        const savedCam = await Camera.create({
          nvrId: savedNvr._id,
          userId: user_id,
          channelId: cam.channelId,
          name: cam.name || `Camera ${cam.channelId}`,
          ipAddress: cam.ipAddress || "",
          model: cam.model || "",
          serialNumber: cam.serialNumber || "",
          firmwareVersion: cam.firmwareVersion || "",
          streamEndpoint: cam.streamEndpoint || "",
          rtspChannels: cam.rtspChannels || [],
        });

        const uid = `${savedNvr._id}-${savedCam._id}`;
        const rtspUrl = buildRTSPUrl(savedNvr, savedCam, "main");
        registerCameraStream(uid, rtspUrl, savedNvr?.userId);
        savedCameras.push(savedCam);
      }

      await NVR.findByIdAndUpdate(savedNvr._id, { cameraCount: savedCameras.length });

      const adminId = req?.verified?.userData?.adminId;
      autoSyncLocations(
        { _id: adminId },
        { user_id }
      ).catch((e) => logger.error("Post-NVR registration sync failed", e));

      return res.status(201).json(
        Response.userSuccessResp("NVR registered and cameras fetched successfully", {
          nvr: { ...savedNvr._doc, cameraCount: savedCameras.length },
          cameras: savedCameras,
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

        // Hikvision list endpoints page at ~50 results; without paging, cameras
        // on higher channels (e.g. a 64ch NVR) are silently dropped. Loop with
        // searchResultPosition/maxResults until a short page comes back.
        // ponytail: page size 50 (Hikvision's common cap); it clamps larger values itself.
        const fetchAllPaged = async (path, listKey, itemKey) => {
          const pageSize = 1000;
          const all = [];
          for (let pos = 0; ; pos += pageSize) {
            const res = await client.fetch(
              `http://${ip}:${port}${path}?searchResultPosition=${pos}&maxResults=${pageSize}`
            );
            if (!res.ok) break;
            const data = await parseXml(await res.text());
            const raw = data?.[listKey]?.[itemKey];
            const page = Array.isArray(raw) ? raw : raw ? [raw] : [];
            all.push(...page);
            if (page.length < pageSize) break;
          }
          return all;
        };

        const channels = await fetchAllPaged(
          "/ISAPI/ContentMgmt/InputProxy/channels",
          "InputProxyChannelList",
          "InputProxyChannel"
        );

        const statuses = await fetchAllPaged(
          "/ISAPI/ContentMgmt/InputProxy/channels/status",
          "InputProxyChannelStatusList",
          "InputProxyChannelStatus"
        );

        const streamingChannels = await fetchAllPaged(
          "/ISAPI/Streaming/channels",
          "StreamingChannelList",
          "StreamingChannel"
        );

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
      } else if (brand.toLowerCase() === "tiandy") {
        const { createHash } = await import("crypto");

        // Tiandy NVR password fields are capped at 15 chars — trim to match what NVR stored
        const effectivePassword = password.slice(0, 15);

        // Step 1: SessionCheck — public endpoint, requires If-Modified-Since: 0
        let scRes;
        try {
          scRes = await fetch(
            `http://${ip}:${port}/CGI/Security/SessionCheck?timeStamp=${Date.now()}`,
            { headers: { "If-Modified-Since": "0" }, signal: AbortSignal.timeout(10000) }
          );
        } catch (err) {
          return { error: `Tiandy SessionCheck failed — ${err.message}` };
        }
        if (!scRes.ok) return { error: "Tiandy SessionCheck failed — device unreachable" };

        const scXml = await scRes.text();
        const scExtract = (tag) => (scXml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
        const session    = scExtract("session");
        const key        = scExtract("key");
        const iterations = parseInt(scExtract("iterations")) || 10;

        // Step 2: SHA256 hash chain (Tiandy GetSessionPW logic)
        let hash = createHash("sha256").update(username + effectivePassword).digest("hex").toUpperCase();
        for (let i = 0; i < iterations; i++) {
          hash = createHash("sha256").update(hash + key).digest("hex").toUpperCase();
        }

        // Step 3: POST Logon — no XML declaration (matches browser behavior)
        const loginXml = `<User><username>${username}</username><passwd>${hash}</passwd><sessionTmp>${session}</sessionTmp></User>`;
        let logonRes;
        try {
          logonRes = await fetch(
            `http://${ip}:${port}/CGI/Security/Logon?timeStamp=${Date.now()}`,
            { method: "POST", headers: { "Content-Type": "application/xml; charset=utf-8", "If-Modified-Since": "0" }, body: loginXml, signal: AbortSignal.timeout(10000) }
          );
        } catch (err) {
          return { error: `Tiandy Logon failed — ${err.message}` };
        }
        const logonXml = await logonRes.text();
        const statusValue   = (logonXml.match(/<statusValue>([^<]+)<\/statusValue>/) || [])[1];
        const sessionToken  = (logonXml.match(/<session>([^<]+)<\/session>/) || [])[1] || "";
        const passwdLeft    = (logonXml.match(/<passwdLeftValue>([^<]+)<\/passwdLeftValue>/) || [])[1];

        if (statusValue !== "200" || !sessionToken) {
          return { error: `Tiandy authentication failed (attempts left: ${passwdLeft})` };
        }

        const authHeaders = { HttpSession: sessionToken, "If-Modified-Since": "0" };

        // Step 4: Device info
        let deviceInfo = { deviceName: "", model: "", serialNumber: "", firmwareVersion: "", macAddress: "", deviceType: "NVR" };
        try {
          const devRes = await fetch(`http://${ip}:${port}/ISAPI/System/deviceInfo`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
          if (devRes.ok) {
            const devXml = await devRes.text();
            const x = (tag) => (devXml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
            deviceInfo = {
              deviceName: x("deviceName"),
              model: x("model"),
              serialNumber: x("serialNumber"),
              macAddress: x("macAddress"),
              firmwareVersion: x("firmwareVersion"),
              deviceType: "NVR",
            };
          }
        } catch (_) { /* use default deviceInfo */ }

        // Step 5: Channel list
        let channels = [];
        try {
        const chRes = await fetch(`http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
        if (chRes.ok) {
          const chXml = await chRes.text();
          const chMatches = [...chXml.matchAll(/<InputProxyChannel>([\s\S]*?)<\/InputProxyChannel>/g)];
          channels = chMatches.map((m) => {
            const cx = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
            const chNum = cx("id");
            const resolvedName = cx("channelName") || cx("name") || `Camera ${chNum}`;
            return {
              channelId: chNum,
              name: resolvedName,
              ipAddress: cx("ipAddress"),
              serialNumber: cx("serialnumber"),
              model: "",
              firmwareVersion: "",
              streamEndpoint: "/Streaming/Channels/",
              rtspChannels: [
                { id: `${chNum}_1`, resolution: { width: 0, height: 0 } },
                { id: `${chNum}_2`, resolution: { width: 0, height: 0 } },
              ],
            };
          });
        }
        } catch (_) { /* use empty channels, fallback applies below */ }

        // Fallback: 16 channels if list empty
        const cameras = channels.length > 0 ? channels : Array.from({ length: 16 }, (_, i) => {
          const ch = String(i + 1);
          return {
            channelId: ch,
            name: `Camera ${ch}`,
            ipAddress: "",
            model: "",
            serialNumber: "",
            firmwareVersion: "",
            streamEndpoint: "",
            rtspChannels: [
              { id: `${ch}_1`, resolution: { width: 0, height: 0 } },
              { id: `${ch}_2`, resolution: { width: 0, height: 0 } },
            ],
          };
        });

        return { deviceInfo, cameras };
      } else if (brand.toLowerCase() === "securus") {
        // XiongMai Sofia DVR/NVR — three sources: ONVIF (port 8899) + DVRIP (port 34567) + HTML
        const { createHash } = await import("crypto");
        const dvripPort = 34567;
        const onvifPort = 8899;

        // Sofia password hash: 8 chars from even-indexed MD5 hex positions, uppercased
        const sofiaPwdHash = (pwd) => {
          const md5 = createHash("md5").update(pwd).digest("hex");
          let h = "";
          for (let i = 0; i < 8; i++) h += md5[i * 2];
          return h.toUpperCase();
        };

        const buildPacket = (sessionId, seq, msgId, jsonBody) => {
          const body = Buffer.from(jsonBody + "\n\0", "utf8");
          const hdr = Buffer.alloc(20);
          hdr[0] = 0xff;
          hdr.writeUInt32LE(sessionId, 4);
          hdr.writeUInt32LE(seq, 8);
          hdr.writeUInt16LE(msgId, 14);
          hdr.writeUInt32LE(body.length, 16);
          return Buffer.concat([hdr, body]);
        };

        // Step 1: ONVIF GetDeviceInformation on port 8899 (no auth required on XiongMai)
        let onvifDeviceInfo = {};
        try {
          const soapBody = `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><tds:GetDeviceInformation xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`;
          const onvifRes = await fetch(`http://${ip}:${onvifPort}/onvif/device_service`, {
            method: "POST",
            headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
            body: soapBody,
            signal: AbortSignal.timeout(5000),
          });
          if (onvifRes.ok) {
            const xml = await onvifRes.text();
            const tag = (t) => xml.match(new RegExp(`<[^:>]*:?${t}>([^<]+)<`))?.[1]?.trim() || "";
            onvifDeviceInfo = {
              manufacturer:    tag("Manufacturer"),
              model:           tag("Model"),
              firmwareVersion: tag("FirmwareVersion"),
              serialNumber:    tag("SerialNumber"),
              hardwareId:      tag("HardwareId"),
            };
          }
        } catch (_) { /* ONVIF port not reachable */ }

        // Step 2: DVRIP login → ConfigGet "IPCamera" (per-channel IP camera info for NVRs)
        //         + SystemInfo query as fallback for device metadata
        const dvripResult = await new Promise((resolve) => {
          const sock = net.createConnection({ host: ip, port: dvripPort, timeout: 10000 });
          let buf = Buffer.alloc(0);
          let seq = 0;
          let sessionId = 0;
          let loginDone = false;
          const result = { ipcChannels: [] };
          let timer = null;

          const finish = () => { clearTimeout(timer); sock.destroy(); resolve(result); };

          sock.on("connect", () => {
            sock.write(buildPacket(0, seq++, 1000, JSON.stringify({
              EncryptType: "MD5", LoginType: "DVRIP",
              PassWord: sofiaPwdHash(password), UserName: username,
            })));
          });

          sock.on("data", (chunk) => {
            buf = Buffer.concat([buf, chunk]);
            while (buf.length >= 20) {
              const dataLen = buf.readUInt32LE(16);
              if (buf.length < 20 + dataLen) break;
              const pktMsgId = buf.readUInt16LE(14);
              sessionId = buf.readUInt32LE(4);
              const rawBody = buf.slice(20, 20 + dataLen);
              buf = buf.slice(20 + dataLen);

              if (pktMsgId === 1001 && !loginDone) {
                // Login response — binary: first 4 bytes = 0 means success
                const binaryRet = rawBody.length >= 4 ? rawBody.readUInt32LE(0) : -1;
                if (binaryRet !== 0) return finish(); // wrong credentials, resolve empty
                loginDone = true;
                const sidHex = "0x" + sessionId.toString(16).padStart(8, "0").toUpperCase();
                // ConfigGet IPCamera — returns per-channel IP, port, credentials for NVR IP cameras
                sock.write(buildPacket(sessionId, seq++, 1042, JSON.stringify({ Name: "IPCamera", SessionID: sidHex })));
                // SystemInfo as fallback for device metadata
                sock.write(buildPacket(sessionId, seq++, 1020, JSON.stringify({ Name: "SystemInfo", SessionID: sidHex })));
                timer = setTimeout(finish, 4000);
              } else if (pktMsgId === 1043) {
                // ConfigGet response — try JSON (some firmware) else log ASCII for debugging
                try {
                  const parsed = JSON.parse(rawBody.toString("utf8").replace(/\0/g, "").trim());
                  if (Array.isArray(parsed.IPCamera)) result.ipcChannels = parsed.IPCamera;
                  else if (Array.isArray(parsed)) result.ipcChannels = parsed;
                } catch (_) {
                  const ascii = rawBody.toString("latin1").replace(/[^\x20-\x7e]/g, "|");
                  console.log(`ConfigGet binary response (${dataLen}B): ${ascii.substring(0, 300)}`);
                }
              } else if (pktMsgId === 1021) {
                // SystemInfo response — try JSON
                try { Object.assign(result, JSON.parse(rawBody.toString("utf8").replace(/\0/g, "").trim())); } catch (_) {}
              }
            }
          });

          sock.on("timeout", () => finish());
          sock.on("error", () => finish());
        });

        // Step 3: HTML page — channel count + fallback device info from embedded JS vars
        let channelCount = 4;
        let htmlDeviceInfo = {};
        try {
          const htmlRes = await fetch(`http://${ip}:${port}/`, { signal: AbortSignal.timeout(5000) });
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            const chMatch = html.match(/g_channelNum\s*=\s*(\d+)/);
            if (chMatch) channelCount = parseInt(chMatch[1]);
            const extract = (re) => { const m = html.match(re); return m ? m[1].trim() : ""; };
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            htmlDeviceInfo = {
              model:           extract(/g_devType\s*=\s*["']([^"']+)["']/) || (titleMatch ? titleMatch[1].trim() : ""),
              serialNumber:    extract(/g_serialNo\s*=\s*["']([^"']+)["']/),
              firmwareVersion: extract(/g_softVersion\s*=\s*["']([^"']+)["']/),
              macAddress:      extract(/g_macAddr\s*=\s*["']([^"']+)["']/),
            };
          }
        } catch (_) { /* use defaults */ }

        // Merge device info: ONVIF (most reliable) > DVRIP SystemInfo > HTML vars
        const deviceInfo = {
          deviceName:      onvifDeviceInfo.manufacturer   || dvripResult.DeviceName      || "",
          model:           onvifDeviceInfo.model          || dvripResult.HardWare        || htmlDeviceInfo.model          || "",
          serialNumber:    onvifDeviceInfo.serialNumber   || dvripResult.SerialNo        || htmlDeviceInfo.serialNumber   || "",
          firmwareVersion: onvifDeviceInfo.firmwareVersion|| dvripResult.SoftWareVersion || htmlDeviceInfo.firmwareVersion|| "",
          macAddress:                                        dvripResult.MACAddress       || htmlDeviceInfo.macAddress     || "",
          deviceType: "DVR",
        };

        // Build camera list — use IPC channel data if available (NVR), else generic (analog DVR)
        const cameras = Array.from({ length: channelCount }, (_, i) => {
          const ch = String(i + 1);
          const ipc = dvripResult.ipcChannels[i] || {};
          return {
            channelId: ch,
            name:      ipc.Name || ipc.ChannelName || `Camera ${ch}`,
            ipAddress: ipc.IPCAddress || ipc.IPAddress || "",
            model:     ipc.DeviceType || "",
            serialNumber: "",
            firmwareVersion: "",
            streamEndpoint: "",
            rtspChannels: [
              { id: `${ch}_0`, resolution: { width: 0, height: 0 } },
              { id: `${ch}_1`, resolution: { width: 0, height: 0 } },
            ],
          };
        });

        return { deviceInfo, cameras };
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

      // Fetch all updated cameras (including inactive for complete state)
      const cameras = await Camera.find({ nvrId }).setOptions({ includeInactive: true });

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
      const dbNameByChannel = new Map(addedCameras.map((c) => [c.channelId, c.name]));

      // Sync DB name -> NVR's current name when a camera was renamed on the device.
      const renames = camerasData.cameras
        .filter((cam) => dbNameByChannel.has(cam.channelId) && cam.name && cam.name !== dbNameByChannel.get(cam.channelId))
        .map((cam) => ({
          updateOne: { filter: { nvrId, channelId: cam.channelId }, update: { $set: { name: cam.name } } },
        }));
      if (renames.length) {
        await Camera.bulkWrite(renames);
      }

      // Auto-add new cameras found on NVR but not in database. Each one's
      // stream is registered immediately (same as the Add-NVR flow) so it can
      // be previewed right away, regardless of isAdded/selection state.
      const newCameras = camerasData.cameras.filter((cam) => !addedMap.has(cam.channelId));
      if (newCameras.length > 0) {
        const cameraDocs = newCameras.map((cam) => ({
          userId: user_id,
          nvrId: nvr._id,
          isAdded: true,
          ...cam,
        }));
        const insertedCameras = await Camera.insertMany(cameraDocs);
        insertedCameras.forEach((savedCam) => {
          addedMap.set(savedCam.channelId, { _id: savedCam._id, isAdded: savedCam.isAdded });
          try {
            const uid = `${nvr._id}-${savedCam._id}`;
            const rtspUrl = buildRTSPUrl(nvr, savedCam, "main");
            registerCameraStream(uid, rtspUrl, nvr.userId);
          } catch (streamError) {
            logger.error(`Failed to register preview stream for camera ${savedCam._id}:`, streamError);
          }
        });
      }

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

      if (!['hikvision', 'cpplus', 'dahua'].includes(brandLower)) {
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

      } else if (brandLower === 'cpplus' || brandLower === 'dahua') {
        // CP-Plus and Dahua share the same protocol/endpoints.
        const deviceResponse = await fetch(
          `http://${host}/API/System/SystemInfo`,
          {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        );

        if (!deviceResponse.ok) {
          return { error: `Failed to fetch device info from ${brandLower === 'dahua' ? 'Dahua' : 'CP Plus'} NVR` };
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
