import logger from "../../../utils/logger.js";
import response from "../../../utils/response.js";
import Profile from "../profiles/profiles.model.js";
import Channel from "../channels/channels.model.js";
import { createJobsForNextDays } from "./utils/scheduleJobs.js";
import { redis } from "../../../utils/database.js";
import { getNowInTimeZone } from "./utils/time.util.js";

class JobsService {
  async #clearBullKeys() {
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "bull:*",
        "COUNT",
        100,
      );

      cursor = nextCursor;

      if (keys.length) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");

    console.log("✅ All bull:* keys deleted");
  }
  async mockCreateJobs(req, res, _next) {
    try {
      const { profileId } = req.body;
      if (!profileId) {
        return res
          .status(400)
          .json(response.errorResp("Profile ID is required"));
      }
      const profile = await Profile.findById(profileId);
      if (!profile) {
        return res.status(400).json(response.errorResp("Profile not found"));
      }
      await createJobsForNextDays(profile);
      return res
        .status(200)
        .json(response.SuccessResp("Jobs created successfully"));
    } catch (error) {
      logger.error("Error creating jobs:", error);
      return res
        .status(400)
        .json(response.errorResp("Failed to create jobs", error?.message));
    }
  }
  async mockDeleteAllJobs(_req, res, _next) {
    try {
      await this.#clearBullKeys();
      return res
        .status(200)
        .json(response.SuccessResp("All jobs deleted successfully"));
    } catch (error) {
      logger.error("Error deleting jobs:", error);
      return res
        .status(400)
        .json(response.errorResp("Failed to delete jobs", error?.message));
    }
  }
  async handleProfileStart(data) {
    try {
      const { scheduleId } = data;
      if (!scheduleId) {
        throw new Error("Schedule ID is required in job data");
      }

      const profile = await Profile.findOne({ scheduleId });
      if (!profile) {
        throw new Error(`No profile found for schedule ID: ${scheduleId}`);
      }

      const channels = await Channel.find({ profile: profile._id }).populate([
        { path: "detections.countPersonsSettings.id" },
        { path: "detections.motionDetectionSettings.id" },
        { path: "detections.genericObjectDetectionSettings.id" },
        { path: "detections.countVehiclesSettings.id" },
        { path: "detections.loiteringWithoutAuthSettings.id" },
        { path: "detections.fireSmokeDetectionSettings.id" },
        { path: "detections.weaponDetectionSettings.id" },
        { path: "detections.unattendedBaggageDetectionSettings.id" },
        { path: "detections.unauthorizedAccessSettings.id" },
        { path: "detections.lineCrossingSettings.id" },
        { path: "detections.loiteringWithAuthSettings.id" },
        { path: "detections.personalProtectiveEquipmentSettings.id" },
        { path: "detections.crowdDetectionSettings.id" },
        { path: "detections.conveyorDetectionSettings.id" },
        { path: "detections.crusherDetectionSettings.id" },
        { path: "detections.waterSpillageDetectionSettings.id" },
      ]);

      if (channels.length === 0) {
        logger.warn(`No channels found for profile ID: ${profile._id}`);
        return;
      }

      channels.forEach((channel) => {
        logger.info(
          `▶️ Starting channel ${channel._id} for profile ${profile._id}`,
        );
        const detections = Object.values(channel.detections);
        const validDetections = detections.filter((det) => det.id);
        const payload = {
          camera_id: channel?._id?.toString(),
          nvr_id: channel?.nvrId?._id?.toString(),
        };
      });
    } catch (error) {
      logger.error("Error handling profile start:", error);
    }
  }
  async handleProfileStop(data) {
    try {
    } catch (error) {
      logger.error("Error handling profile stop:", error);
    }
  }
  async handleProfileNotification(profile, channelId) {
    try {
      // 1. Validate profile and notification
      if (!profile || !profile?.notification) return false;

      const {
        notify,
        digestEveryMinutes,
        enableQuietHours,
        quietFrom,
        quietTo,
        channels,
      } = profile.notification;

      // 2. Validate notification channels
      if (!channels?.email) return false;

      // 3. Instant Mode
      if (notify === "Instant") {
        return true;
      }

      // 4. Quiet Hours Check (applies to both Instant & Digest)
      if (enableQuietHours && quietFrom && quietTo) {
        const timeZone = profile.basics?.timeZone || "UTC";
        const now = getNowInTimeZone(timeZone);
        const nowMinutes = now.hour() * 60 + now.minute();

        const [startHour, startMinute] = quietFrom.split(":").map(Number);
        const [endHour, endMinute] = quietTo.split(":").map(Number);

        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        if (startMinutes < endMinutes) {
          // Normal range
          if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
            return false;
          }
        } else {
          // Overnight range
          if (nowMinutes >= startMinutes || nowMinutes < endMinutes) {
            return false;
          }
        }
      }

      

      // 5. Digest Mode
      if (notify === "Digest") {
        const redisKey = `notification:digest:${profile?._id?.toString()}:${channelId}`;
        const now = Date.now();

        const lastSent = await redis.get(redisKey);

        if (!lastSent) {
          // First time sending
          await redis.set(redisKey, now);
          return true;
        }

        const diffMinutes = (now - Number(lastSent)) / (1000 * 60);

        if (diffMinutes >= digestEveryMinutes) {
          await redis.set(redisKey, now);
          return true;
        }

        return false;
      }

      // 6. Default
      return false;
    } catch (error) {
      logger.error("Error handling profile notification:", error);
    }
  }
}

export default new JobsService();
