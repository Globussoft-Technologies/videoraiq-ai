import mongoose from "mongoose";
import { detectionScheduleSchema } from "../channels/channels.model.js";

/**
 * NVR-level global detection schedule.
 *
 * Admin (userId) -> NVR (nvrId) -> one or more global schedules, each covering
 * a set of that NVR's cameras. Lets an admin configure detection hours once for
 * many cameras instead of editing each camera's own schedule.
 *
 * The schedule itself reuses the exact `detectionScheduleSchema`
 * ({mode, timezone, days}) that per-camera schedules use, so both are evaluated
 * by the same code in services/detectionSchedule.resolver.js.
 *
 * Deliberately NOT stored here: the running/stopped state of each camera. That
 * already lives on `channel.detections[settingType].enabled`, which the
 * schedule runner diffs against to stay idempotent. Duplicating it would give
 * us two sources of truth that can disagree.
 */

const globalScheduleCameraSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    /**
     * ENROLMENT, NOT RUNTIME STATE.
     *
     *   true  = this camera is enrolled in this global schedule, so the global
     *           schedule decides when its detection runs.
     *   false = this camera is un-enrolled; it falls back to its own
     *           camera-specific schedule. Kept as a row rather than deleted so
     *           un-enrolling is reversible and survives a UI re-save.
     *
     * It does NOT mean "detection is currently running". Whether a camera's
     * detection is running right now lives on
     * `channel.detections[settingType].enabled`, which the schedule runner
     * diffs against to decide if a DS call is needed. Reading this field as
     * runtime state would give us two sources of truth that drift apart the
     * moment a DS call fails.
     */
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const GlobalScheduleSchema = new mongoose.Schema(
  {
    // Owning admin. Matches Channel.userId / NVR.userId (stored as a string in
    // both), so global schedules scope the same way every other model does.
    userId: {
      type: String,
      required: true,
    },
    nvrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NVR",
      required: true,
    },
    name: {
      type: String,
      default: null,
    },
    // Turn the whole global schedule off without deleting it. Covered cameras
    // revert to their own camera-specific schedules.
    enabled: {
      type: Boolean,
      default: true,
    },
    schedule: {
      type: detectionScheduleSchema,
      required: true,
    },
    cameras: {
      type: [globalScheduleCameraSchema],
      default: [],
    },
    // Detector setting types this schedule governs (e.g.
    // "lineCrossingSettings"). Empty = every detector configured on the
    // covered cameras. This is the hook for detector-specific global
    // scheduling; the resolver already honours it.
    detectors: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

// The runner loads every enabled schedule once per tick; the admin/NVR pair is
// how the UI and the save path look them up.
GlobalScheduleSchema.index({ userId: 1, nvrId: 1 });
GlobalScheduleSchema.index({ enabled: 1 });

export default mongoose.model("GlobalSchedule", GlobalScheduleSchema);
