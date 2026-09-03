import mongoose from "mongoose";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

// One row per (client admin × detection type): how many cameras this client has
// allocated to that detection, and whether it's enabled.
//
// Written by the superadmin backend (server-superadmin's Client Configuration
// screen). Both services share one database, so this declaration exists
// mainly so this backend can read the same collection.
//
// One narrow exception: server/core/v2/clientConfig/detectionLicense.service.js
// grantPlanDefaultCameras() creates rows here too, but ONLY to backfill a
// detection a client already has running when they are first granted a
// default camera licence, and ONLY when no row for that (adminId, settingType)
// exists yet — it never edits or replaces a row the superadmin has set.
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
