import mongoose from "mongoose";

/**
 * The platform's master list of detection types, published into the shared
 * database so the superadmin service sees exactly what this backend supports.
 *
 * Why this exists: `server/constants/detectionTypes.js` and
 * `server-superadmin/constants/detectionTypes.js` are two hand-maintained
 * copies of the same list, and they drift — Car Model Detection was added here
 * and never mirrored, so it was invisible in the superadmin UI and could not be
 * licensed to anyone. This backend owns the constants (detections are
 * implemented against them), so it publishes them and the superadmin reads
 * them instead of keeping its own copy.
 *
 * Rows are never deleted. A detection removed from the constants is marked
 * `active: false` so existing ClientDetectionAllocation rows, which key on
 * settingType, keep resolving to a name instead of turning into orphans.
 */
const detectionCatalogSchema = new mongoose.Schema(
  {
    settingType: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    // false once the type disappears from the constants — kept for history.
    active: {
      type: Boolean,
      default: true,
    },
    // Whether DS actually implements this detection, resolved from its own
    // DetectionLogic enum at sync time. null = DS could not be reached, which is
    // deliberately distinct from false ("DS answered, and does not have it").
    dsSupported: {
      type: Boolean,
      default: null,
    },
    // Which service last wrote this row, so a stale publisher is diagnosable.
    source: {
      type: String,
      default: "server",
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("DetectionCatalog", detectionCatalogSchema);
