import mongoose from "mongoose";
import config from "config";
import AuthorizedUsers from "../core/v1/authorizedUsers/authorizedUsers.model.js";

const MONGO_URI = config.get("mongodb_uri");
const APP_ENV = config.get("APP_ENV");
const IMAGE_BASE_URL = config.get("ImageView");

// Run with --dry-run to preview changes without writing to the database.
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * One-time cleanup: some authorizedUsers.profilePics entries were saved as
 * full absolute URLs (an already-ImageView-prefixed display URL passed
 * straight through as a storage path, from the "quick create user from
 * flagged face images" flow) instead of the relative NAS path every other
 * flow stores. That absolute value then gets double-prefixed wherever a
 * client displays it. This strips the ImageView base back off in place.
 */
async function migrateProfilePicsToRelative() {
  try {
    console.log(`🔄 Starting migration: normalize profilePics to relative paths (${DRY_RUN ? "DRY RUN" : "LIVE"})...`);
    console.log(`Environment: ${APP_ENV}`);
    console.log(`ImageView base: ${IMAGE_BASE_URL}`);

    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to database");

    const users = await AuthorizedUsers.find({
      profilePics: { $elemMatch: { $regex: `^${IMAGE_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } },
    });
    console.log(`📊 Found ${users.length} user(s) with an absolute-URL profilePics entry`);

    if (users.length === 0) {
      console.log("ℹ️  Nothing to migrate.");
      await mongoose.connection.close();
      return;
    }

    let updatedCount = 0;
    for (const user of users) {
      const before = user.profilePics || [];
      const after = before.map((pic) =>
        typeof pic === "string" && pic.startsWith(IMAGE_BASE_URL)
          ? pic.slice(IMAGE_BASE_URL.length)
          : pic
      );

      const changed = before.some((pic, i) => pic !== after[i]);
      if (!changed) continue;

      console.log(`\n👤 ${user.firstName} ${user.lastName} (${user._id})`);
      before.forEach((pic, i) => {
        if (pic !== after[i]) console.log(`   - ${pic}\n   + ${after[i]}`);
      });

      if (!DRY_RUN) {
        await AuthorizedUsers.updateOne({ _id: user._id }, { profilePics: after });
      }
      updatedCount++;
    }

    console.log(`\n✅ Migration ${DRY_RUN ? "preview" : "complete"}: ${updatedCount} user(s) ${DRY_RUN ? "would be" : "were"} updated.`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrateProfilePicsToRelative();
