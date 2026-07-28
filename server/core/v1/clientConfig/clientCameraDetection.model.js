import mongoose from "mongoose";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

// One row per (client admin × camera × detection type): whether that detection
// is enabled for that specific camera, as managed from the superadmin Client
// Configuration "Cameras" grid. Separate from the client's own
// Channel.detections toggles — this is the superadmin-managed view.
//
// Written only by the superadmin backend. A camera with no row for a detection
// simply reads as false, which is why this backend never needs to seed rows.
const clientCameraDetectionSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    cameraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    settingType: {
      type: String,
      required: true,
      enum: Object.keys(DETECTION_TYPES),
    },
    enabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// One row per detection per camera per client.
clientCameraDetectionSchema.index(
  { adminId: 1, cameraId: 1, settingType: 1 },
  { unique: true }
);

export default mongoose.model("ClientCameraDetection", clientCameraDetectionSchema);
