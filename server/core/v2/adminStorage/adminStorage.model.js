import mongoose from "mongoose";

const storageVersionSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["nas", "aws", "gcp", "oracle"],
      required: true,
    },
    encryptedConfig: { type: String, required: true, select: false },
    label: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

const adminStorageConfigSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: true },
    activeVersion: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Versions are immutable. Stored media paths contain the version id so a
    // credential/provider change never makes older media unreadable.
    versions: { type: [storageVersionSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.AdminStorageConfig ||
  mongoose.model("AdminStorageConfig", adminStorageConfigSchema);
