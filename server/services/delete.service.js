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
import { toRelativeMediaPath } from "../utils/mediaStorage.js";
import { collectMediaPaths, deleteMediaBestEffort } from "../utils/mediaCleanup.js";
const APP_ENV = config.get("APP_ENV");

// Only the fields that can carry a stored media path on an Incident (base
// schema Image/videoLink, plus the Door/Light discriminators' currentImage
// and timeSeries[].Image) — see core/v1/incidents/incidents.model.js.
const INCIDENT_MEDIA_SELECT = "_id Image currentImage videoLink timeSeries.Image";
// Docs per batch: bounds memory for a channel with a very large incident
// history, same sizing as the retention sweeper's default. Exported so tests
// can construct an exact-size batch to exercise the multi-page loop.
export const INCIDENT_BATCH_SIZE = 200;

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

      const { deleted, mediaFailures } = await this.deleteChannelIncidents(
        channelId
      );

      await Channel.deleteOne({ _id: channelId });

      logger.info(
        `Deleted channel ${channelId}: removed ${deleted} incident(s)` +
          (mediaFailures
            ? ` (${mediaFailures} media file(s) failed to delete from storage — see warnings above; the incident rows are gone so those files can no longer be found and retried)`
            : "") +
          " and the channel itself."
      );

      return true;
    } catch (error) {
      logger.error("Error deleting channel:", error);
      throw new Error("Failed to delete channel and its associated resources.");
    }
  }

  /**
   * Deletes every Incident under a channel: for each bounded batch, first
   * best-effort deletes the incident's stored media (image/video, from
   * whichever storage provider is active — NAS or Oracle, via
   * utils/mediaStorage.js) and only then deletes that batch's DB rows.
   * `Incident.deleteMany({ channelId })` alone (the old behaviour) dropped
   * the rows but left every referenced file orphaned on storage.
   *
   * A storage failure is logged but never blocks the DB row from being
   * removed — an incident whose file failed to delete is not left behind
   * as a retryable unit; it's only recoverable via the warning log. This
   * matches the retention sweeper's same trade-off (utils/mediaCleanup.js).
   *
   * Safe to re-run: querying `{ channelId }` after a partial run (e.g. the
   * process died mid-cascade) simply finds whatever incidents are still
   * there and continues; a channel with nothing left returns
   * { deleted: 0, mediaFailures: 0 } and deleteChannel proceeds straight to
   * removing the channel row.
   */
  static async deleteChannelIncidents(channelId) {
    let deleted = 0;
    let mediaFailures = 0;

    for (;;) {
      const batch = await Incident.find({ channelId })
        .select(INCIDENT_MEDIA_SELECT)
        .limit(INCIDENT_BATCH_SIZE)
        .lean();
      if (!batch.length) break;

      const paths = batch
        .flatMap((doc) => collectMediaPaths(doc))
        .map(toRelativeMediaPath)
        // videoLink can be an external URL rather than a storage path — not
        // ours to delete.
        .filter((p) => typeof p === "string" && p.trim() && !/^https?:\/\//i.test(p));

      mediaFailures += await deleteMediaBestEffort(
        paths,
        `[NVR-DELETE] channel:${channelId}`
      );

      const res = await Incident.deleteMany({
        _id: { $in: batch.map((d) => d._id) },
      });
      deleted += res.deletedCount || 0;

      if (batch.length < INCIDENT_BATCH_SIZE) break;
    }

    return { deleted, mediaFailures };
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
