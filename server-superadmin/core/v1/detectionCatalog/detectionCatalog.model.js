import mongoose from "mongoose";

/**
 * Read model for the shared detection catalog. The client backend
 * (server/core/v2/detectionCatalog) owns and publishes this collection from its
 * own DETECTION_TYPES on boot; both services share one database, so this
 * declaration exists purely so the superadmin can read the same rows.
 *
 * This is what replaces server-superadmin's hand-maintained DETECTION_TYPES /
 * DETECTION_TYPES2 copies, which had drifted (Car Model Detection existed in
 * the client backend but in neither list here, so it could never be licensed).
 */
const detectionCatalogSchema = new mongoose.Schema(
  {
    settingType: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
    source: { type: String, default: "server" },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("DetectionCatalog", detectionCatalogSchema);
