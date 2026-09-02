import mongoose from "mongoose";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

// One boolean flag per DETECTION_TYPES key, all defaulting false. Built from
// the constants file so new detection types show up here automatically.
const detectionFields = Object.fromEntries(
  Object.keys(DETECTION_TYPES).map((key) => [key, { type: Boolean, default: false }])
);

// Per-detection-type run/event tally (the "Face Recognition — 1 run · 1
// events" rows in the session analytics panel), keyed the same way as
// `detections` above.
const detectionStatsFields = Object.fromEntries(
  Object.keys(DETECTION_TYPES).map((key) => [
    key,
    {
      runs: { type: Number, default: 0 },
      events: { type: Number, default: 0 },
    },
  ])
);

// dsVideoUrl is filled in later by the DS team via the update API, once
// they've processed videoUrl. zones and zone_configs come from
// faceAuthenticationSettings linked to the camera, captured at record
// creation time and sent to video-process.
// Each entry keeps its own _id so a single video can be targeted for that update
// without touching the rest of the array.
const videoEntrySchema = new mongoose.Schema({
  videoUrl: { type: String, required: true },
  dsVideoUrl: { type: String, default: null },
  zones: { type: [mongoose.Schema.Types.Mixed], default: [] },
  zone_configs: { type: [mongoose.Schema.Types.Mixed], default: [] },
});

const videoRecordSchema = new mongoose.Schema(
  {
    videos: {
      type: [videoEntrySchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    plan: {
      name: { type: String, required: true },
      expiryDate: { type: Date, required: true },
    },
    detections: detectionFields,
    // Session analytics summary — mirrors the "Session analytics" panel
    // (demos run, events detected, avg confidence, detections tested, and a
    // per-detection-type run/event breakdown). Populated by the DS team via
    // the update API as videos get processed.
    sessionAnalytics: {
      demosRun: { type: Number, default: 0 },
      eventsDetected: { type: Number, default: 0 },
      avgConfidence: { type: Number, default: 0 },
      detectionsTested: { type: Number, default: 0 },
      byDetection: detectionStatsFields,
    },
  },
  { timestamps: true }
);

export default mongoose.model("LiveDemo", videoRecordSchema);
