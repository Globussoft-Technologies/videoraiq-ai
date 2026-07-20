import axios from "axios";
import NVR from "../core/v1/NVR/nvr.model.js";
import Channel from "../core/v1/channels/channels.model.js";
import { DetectionSetting } from "../core/v1/detectionSettings/detectionSettings.model.js";
import { Incident } from "../core/v1/incidents/incidents.model.js";
import logger from "../utils/logger.js";
import config from "config";
import { redis } from "../utils/database.js";
import authorizedChannelsModel from "../core/v1/cameraRestrictions/authorizedChannels.model.js";
import usersModel from "../core/v1/users/users.model.js";
import { resolveStream } from "../utils/rtspStream.js";
const APP_ENV = config.get("APP_ENV");

class DeleteService {
  static async deleteNVR(nId) {
    try {
      const nvrId = nId?._id ? nId._id : nId;

      // includeInactive: the Channel pre(/^find/) hook injects { isAdded: true }
      // into every query unless we opt out. Without it this finds only added
      // cameras, so cameras that were discovered from the NVR but never added
      // outlive the NVR they belong to.
      const channels = await Channel.find({ nvrId }).setOptions({
        includeInactive: true,
      });
      // Captured before the loop: once the channels are deleted this list can
      // never be rebuilt, which is why the authorized-list cleanup below was
      // silently doing nothing.
      const channelIds = channels.map((c) => c._id);

      for (const channel of channels) {
        // Only added cameras were ever registered with the streaming service
        // (registerCameraStream runs in the add flow), so tearing down an
        // un-added one would 404 and abort the whole delete.
        if (APP_ENV === "cloud" && channel.isAdded) {
          const uid = `${nvrId.toString()}-${channel._id.toString()}`;
          const redisKey = `stream_url:${uid}`;
          await this.deleteStreamingCamera(uid, channel.userId);
          await redis.del(redisKey);
        }

        // *commom
        await this.deleteChannel(channel._id);
      }
      // Before deleting the NVR: this reads the NVR's location to strip it from
      // users' authorized lists, which found nothing once the row was gone.
      await this.deleteDataFromUserAccounts(nvrId, channelIds);

      // Delete the NVR itself
      await NVR.deleteOne({ _id: nvrId });

      logger.info(`Deleted NVR ${nvrId} and all associated resources.`);
      return true;
    } catch (error) {
      logger.error("Error deleting NVR:", error);
      throw new Error("Failed to delete NVR and its associated resources.");
    }
  }

  static async deleteChannel(channelId) {
    try {
      // findById hits the same isAdded pre-hook, so an un-added camera would
      // read as "not found" and abort the NVR delete mid-way.
      const channel = await Channel.findById(channelId).setOptions({
        includeInactive: true,
      });
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

  static async deleteStreamingCamera(cameraId, userId) {
    try {
      const { host, token } = await resolveStream(userId);
      const response = await axios.delete(
        `${host}/api/camera/${cameraId}`,
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

  static async deleteDataFromUserAccounts(nvrId, knownChannelIds = null) {
    try {
      // 1️⃣ Channel ids of this NVR. deleteNVR passes them in because it has
      // already deleted the channels by this point; the lookup is the fallback
      // for any other caller.
      const channelIds =
        knownChannelIds ??
        (
          await Channel.find({ nvrId })
            .setOptions({ includeInactive: true })
            .select("_id")
        ).map((ch) => ch._id);

      // 2️⃣ Get distinct locations of this NVR
      const locationsRelatedToNVR = await NVR.distinct("location", {
        _id: nvrId,
      });

      // 3️⃣ Remove NVR from all user authorized list (using $pull -> more efficient)
      // No early return on "nobody is authorized for this NVR": a user can hold
      // its channels or locations without holding the NVR itself, and bailing
      // here skipped those two cleanups entirely.
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
