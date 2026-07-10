import mongoose from "mongoose";
import config from "config";
import logger from "../utils/logger.js";
import Channel from "../core/v1/channels/channels.model.js";
import NVR from "../core/v1/NVR/nvr.model.js";

const MONGO_URI = config.get("DB.uri");
const APP_ENV = config.get("APP_ENV");

async function migrateIsAddedField() {
  try {
    console.log("🔄 Starting migration: Adding isAdded field to existing channels...");
    console.log(`Environment: ${APP_ENV}`);

    // Connect to database
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to database");

    // Get all existing channels
    const channels = await Channel.find({}).setOptions({ includeInactive: true });
    console.log(`📊 Found ${channels.length} existing channels`);

    if (channels.length === 0) {
      console.log("ℹ️  No channels found. Nothing to migrate.");
      await mongoose.connection.close();
      return;
    }

    // Strategy: Mark channels as added if they have a profile, detection settings, or control enabled
    // This assumes channels that are actively being used should be marked as added
    let addedCount = 0;
    let inactiveCount = 0;

    for (const channel of channels) {
      // Determine if channel should be marked as added
      const hasProfile = !!channel.profile;
      const hasDetections = Object.values(channel.detections || {}).some(det => det?.enabled);
      const hasControl = channel.control === 1;
      const hasAlerts = (channel.alerts || []).length > 0;

      // Mark as added if it has any active configuration
      const shouldBeAdded = hasProfile || hasDetections || hasControl || hasAlerts;

      if (shouldBeAdded) {
        await Channel.updateOne(
          { _id: channel._id },
          { isAdded: true },
          { new: true }
        );
        addedCount++;
      } else {
        // Mark as inactive if no active configuration
        await Channel.updateOne(
          { _id: channel._id },
          { isAdded: false },
          { new: true }
        );
        inactiveCount++;
      }
    }

    console.log(`\n✅ Migration Complete:`);
    console.log(`   - Channels marked as added (isAdded=true): ${addedCount}`);
    console.log(`   - Channels marked as inactive (isAdded=false): ${inactiveCount}`);
    console.log(`   - Total channels processed: ${channels.length}`);

    // Update NVR camera counts (only count added cameras)
    console.log("\n🔄 Updating NVR camera counts...");
    const nvrs = await NVR.find({});

    for (const nvr of nvrs) {
      const addedCameras = await Channel.find({
        nvrId: nvr._id,
        isAdded: true
      });

      await NVR.updateOne(
        { _id: nvr._id },
        { cameraCount: addedCameras.length }
      );
    }

    console.log(`✅ Updated camera counts for ${nvrs.length} NVRs`);

    // Verify migration
    console.log("\n🔍 Verifying migration...");
    const addedChannels = await Channel.find({ isAdded: true }).setOptions({ includeInactive: true });
    const inactiveChannels = await Channel.find({ isAdded: false }).setOptions({ includeInactive: true });

    console.log(`   - Channels with isAdded=true: ${addedChannels.length}`);
    console.log(`   - Channels with isAdded=false: ${inactiveChannels.length}`);

    console.log("\n✨ Migration successful!");
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateIsAddedField();
