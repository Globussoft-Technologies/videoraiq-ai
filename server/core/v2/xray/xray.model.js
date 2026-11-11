/**
 * X-Ray session — the MongoDB record.
 *
 * WHY A DATABASE RECORD AT ALL, for a thing that lives for a few minutes:
 *
 * Every session holds a GPU slot on another machine. If Node tracks sessions
 * only in memory, a Node restart forgets them and that GPU state is orphaned
 * forever — nothing left to issue the DELETE. Plan Phase 3 step 6 names this as
 * the exact way the reference implementation leaked sessions. The record is
 * what makes the Phase 5 startup sweep and the idle reaper possible.
 *
 * Schema shape copied from core/v2/sessions/sessions.model.js (the login-session
 * model), which is the house reference for a short-lived, indexed, swept record.
 *
 * IMPORTANT — side effects. Compiling a Mongoose model registers it and lets
 * Mongoose build its indexes against the live database. That is a visible change
 * to a deployment, so this file must never be reached when XRAY_ENABLED is
 * false. It is therefore imported lazily, per request, from xray.routes.js —
 * never statically from routes/v2/v2.js. Contract §3: off is byte-identical.
 */
import mongoose from "mongoose";
import { localSessionCollection } from "./dev/localTestSafety.js";

/**
 * Contract §7 — the single shared vocabulary. These five strings appear
 * identically in the Python service, in this collection, in the socket.io
 * events and in the UI. Changing one means changing the contract.
 */
export const XRAY_STATES = Object.freeze([
  "preparing", // SHM attached or attaching, no prompt yet — clicks disabled
  "ready", //     frames flowing, awaiting a click
  "tracking", //  at least one object being tracked and emitted
  "lost", //      tracked object absent from recent frames, still recoverable
  "ended", //     over, with a reason
]);

/**
 * Contract §7 — exhaustive. A session may only end for one of these reasons,
 * and `reason` is non-null only in the `ended` state.
 *
 * `lost` is NOT in this list and is NOT a failure: an object behind a pillar for
 * two seconds is normal. Only after `lost_after_frames` consecutive absent
 * frames does it become ended/object_lost.
 */
export const XRAY_END_REASONS = Object.freeze([
  "closed_by_user",
  "object_lost",
  "stream_stalled",
  "stream_restarted",
  "session_expired",
  "idle_timeout",
  "internal_error",
  "capacity_reclaimed",
]);

const xraySessionSchema = new mongoose.Schema(
  {
    // The service's own session id (contract §6 returns it as `session_id`).
    // Unique because it is the routing key for every mask message that follows.
    sessionId: { type: String, required: true, unique: true, index: true },

    // Who. `adminId` is the Mongo _id of the admin; `userId` is the tenant key
    // (`user_id` on the token), which is what Channel/NVR documents are stamped
    // with. Two different things — see status_backend.md Phase 0 answer 1.
    adminId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    // Present only for sub-user (member) logins; null for an admin.
    memberId: { type: String, default: null, index: true },

    // What. Kept as strings, not ObjectIds: these cross the wire to Python as
    // strings and are only ever compared, never populated.
    cameraId: { type: String, required: true, index: true },
    nvrId: { type: String, required: true },

    // Where to deliver masks. Contract §9 requires routing by session, not by
    // user, because one user can have two tabs open on the same camera.
    // `clientSessionId` is the browser tab's own id (the x-session-id header);
    // `socketId` is the socket.io connection resolved from it at create time.
    socketId: { type: String, default: "", index: true },
    clientSessionId: { type: String, default: "" },

    // Lifecycle. `state` is contract §7; `endReason` is non-null only when
    // state === "ended".
    state: { type: String, enum: XRAY_STATES, default: "preparing", index: true },
    endReason: { type: String, enum: [...XRAY_END_REASONS, null], default: null },
    endedAt: { type: Date, default: null },

    // What the service told us about the stream, echoed back to the frontend so
    // it can scale polygons and interpolate between masks (contract §5, §12).
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    frameRate: { type: Number, default: 0 },
    lostAfterFrames: { type: Number, default: 0 },
    maxObjects: { type: Number, default: 1 },

    // Objects currently tracked in this session. v1 caps this at one
    // (contract §13.4) while the code stays multi-object-capable.
    objects: { type: [String], default: [] },

    // Reaping (contract §10 — BOTH ends reap, deliberately).
    lastHeartbeatAt: { type: Date, default: Date.now, index: true },

    // How many times closing this session has failed.
    //
    // Persisted rather than held in memory so the count survives a Node
    // restart: a session the service will never close must not get a fresh
    // budget of retries every time the process comes back, or it is live
    // forever and the browser waits forever. Reset is unnecessary — the record
    // becomes terminal the moment the count is exhausted.
    closeAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// The idle sweep's query: live sessions whose heartbeat has gone stale.
xraySessionSchema.index({ state: 1, lastHeartbeatAt: 1 });
// The startup sweep and the socket-disconnect reaper both look up by socket.
xraySessionSchema.index({ socketId: 1, state: 1 });

export default mongoose.model("XRaySession", xraySessionSchema, localSessionCollection());
