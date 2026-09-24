import mongoose from "mongoose";

const { Schema } = mongoose;

const measurementMediaSchema = new Schema(
  {
    assetId: { type: String, required: true, unique: true, index: true, trim: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true, trim: true },
    adminId: { type: String, default: null, index: true, trim: true },
    incidentId: { type: Schema.Types.ObjectId, default: null, index: true },
    source: {
      type: String,
      enum: ["measurement-result", "qr-capture"],
      default: "measurement-result",
      index: true,
    },
    sourceReference: { type: String, default: null, index: true, trim: true },
    stationId: { type: String, default: null, index: true, trim: true, lowercase: true },
    sku: { type: String, default: null, index: true, trim: true, uppercase: true },
    originalName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    bytes: { type: Number, required: true, min: 1 },
    checksum: { type: String, required: true, trim: true },
    folderName: { type: String, required: true, trim: true },
    stablePath: { type: String, required: true, unique: true, trim: true },
    localKey: { type: String, default: null, trim: true },
    cloudPath: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ["uploading", "pending", "syncing", "cloud_synced", "completed", "failed"],
      default: "uploading",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null, index: true },
    lockUntil: { type: Date, default: null, index: true },
    lastError: { type: String, default: null },
    syncedAt: { type: Date, default: null },
    localDeletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "measurement_media",
    minimize: false,
  },
);

measurementMediaSchema.index({ status: 1, nextRetryAt: 1, lockUntil: 1 });

const MeasurementMedia = mongoose.models.MeasurementMedia
  || mongoose.model("MeasurementMedia", measurementMediaSchema);

export default MeasurementMedia;
