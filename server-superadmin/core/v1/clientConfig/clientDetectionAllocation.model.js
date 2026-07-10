import mongoose from "mongoose";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

// One row per (client admin × detection type): how many cameras this client has
// allocated to that detection, and whether it's enabled. Drives the Client
// Configuration screen's Detection Assignment table.
const clientDetectionAllocationSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    settingType: {
      type: String,
      required: true,
      enum: Object.keys(DETECTION_TYPES),
    },
    cameraAllocation: {
      type: Number,
      default: 0,
      min: 0,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// One allocation doc per detection per client.
clientDetectionAllocationSchema.index({ adminId: 1, settingType: 1 }, { unique: true });

export default mongoose.model("ClientDetectionAllocation", clientDetectionAllocationSchema);
