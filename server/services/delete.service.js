import axios from "axios";
import NVR from "../core/v1/NVR/nvr.model.js";
import Channel from "../core/v1/channels/channels.model.js";
import { DetectionSetting } from "../core/v1/detectionSettings/detectionSettings.model.js";
import { Incident } from "../core/v1/incidents/incidents.model.js";
import logger from "../utils/logger.js";
import config from "config";
import { redis } from "../utils/database.js";
const api_host = config.get("RTSPStream.host");
const token = config.get("RTSPStream.token");
import authorizedChannelsModel from "../core/v1/cameraRestrictions/authorizedChannels.model.js";
import usersModel from "../core/v1/users/users.model.js";
const APP_ENV = config.get("APP_ENV");

class DeleteService {
  static async deleteNVR(nId) {
    try {
      const nvrId = nId?._id ? nId._id : nId;

      const channels = await Channel.find({ nvrId });

      for (const channel of channels) {
        // const uid = `${nvrId}-${channel._id}`;
        // !old
        if (APP_ENV === "cloud") {
          const uid = `${nvrId.toString()}-${channel._id.toString()}`;
          const redisKey = `stream_url:${uid}`;
          await this.deleteStreamingCamera(uid);
          await redis.del(redisKey);
        }

        // *commom
        await this.deleteChannel(channel._id);
      }
      // Delete the NVR itself
      await NVR.deleteOne({ _id: nvrId });
      await this.deleteDataFromUserAccounts(nvrId);

      logger.info(`Deleted NVR ${nvrId} and all associated resources.`);
      return true;
    } catch (error) {
      logger.error("Error deleting NVR:", error);
      throw new Error("Failed to delete NVR and its associated resources.");
    }
  }

  static async deleteChannel(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }

      // const detectionIds = Object.values(channel.detections || {});
      // if (detectionIds.length) {
      //   await DetectionSetting.deleteMany({ _id: { $in: detectionIds } });
      // }

      await Incident.deleteMany({ channelId });

      await Channel.deleteOne({ _id: channelId });

      logger.info(
        `Deleted channel ${channelId} and all associated settings and incidents.`
      );

      return true;
    } catch (error) {
      logger.error("Error deleting channel:", error);
      throw new Error("Failed to delete channel and its associated resources.");
    }
  }

  static async deleteStreamingCamera(cameraId) {
    try {
      const response = await axios.delete(
        `${api_host}/api/camera/${cameraId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return true;
    } catch (error) {
      logger.error("Error deleting streaming camera:", error);
      throw new Error(
        "Failed to delete streaming camera and its associated resources."
      );
    }
  }

  static async deleteDataFromUserAccounts(nvrId) {
    try {
      // Convert to string once
      const nvrIdStr = nvrId.toString();

      // 1️⃣ Get all channelIds of this NVR
      const channelsRelatedToNVR = await Channel.find({ nvrId }).select("_id");
      const channelIds = channelsRelatedToNVR.map((ch) => ch._id);

      // 2️⃣ Get distinct locations of this NVR
      const locationsRelatedToNVR = await NVR.distinct("location", {
        _id: nvrId,
      });

      // 3️⃣ Find entries where this NVR is authorized
      const authorizedNVR = await authorizedChannelsModel.find({
        nvrIds: nvrId,
      });

      if (!authorizedNVR.length) {
        console.log("No users are authorized for this NVR, nothing to remove");
        return;
      }

      // 4️⃣ Remove NVR from all user authorized list (using $pull -> more efficient)
      await authorizedChannelsModel.updateMany(
        { nvrIds: nvrId },
        { $pull: { nvrIds: nvrId } }
      );

      // 5️⃣ Remove channels of this NVR from users
      if (channelIds.length > 0) {
        await authorizedChannelsModel.updateMany(
          { channels: { $in: channelIds } },
          { $pull: { channels: { $in: channelIds } } }
        );
      }

      // 6️⃣ Remove locations of this NVR from users
      if (locationsRelatedToNVR.length > 0) {
        await authorizedChannelsModel.updateMany(
          { locations: { $in: locationsRelatedToNVR } },
          { $pull: { locations: { $in: locationsRelatedToNVR } } }
        );
      }

      console.log(
        "✅ NVR-related data removed successfully from authorized users."
      );
    } catch (error) {
      logger.error("Error deleting user account data:", error);
      throw new Error(
        "Failed to delete user account data associated with NVR."
      );
    }
  }
}

export default DeleteService;
