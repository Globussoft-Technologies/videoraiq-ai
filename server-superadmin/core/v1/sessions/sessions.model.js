import mongoose from "mongoose";

export const SESSION_EVENT_TYPES = ["login", "heartbeat", "logout", "blocked", "unblocked", "expired"];
export const SESSION_USER_TYPES = ["admin", "user"];
export const SESSION_STATUSES = ["active", "expired", "blocked", "logged_out"];

const sessionEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SESSION_EVENT_TYPES, required: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    deviceId: { type: String, required: true, index: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      index: true,
      default: null,
      validate: {
        validator(value) {
          return this.userType !== "user" || Boolean(value);
        },
        message: "memberId is required for user sessions",
      },
    },
    orgId: { type: String, index: true, default: "" },
    userType: { type: String, enum: SESSION_USER_TYPES, default: "admin", index: true },
    deviceName: { type: String, trim: true, default: "" },
    operatingSystem: { type: String, trim: true, default: "" },
    browser: { type: String, trim: true, default: "" },
    ipAddress: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
    loginTime: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now, index: true },
    logoutTime: { type: Date, default: null },
    status: { type: String, enum: SESSION_STATUSES, default: "active", index: true },
    blockedAt: { type: Date, default: null },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    blockReason: { type: String, trim: true, default: "" },
    events: { type: [sessionEventSchema], default: [] },
  },
  { timestamps: true }
);

sessionSchema.index({ adminId: 1, memberId: 1, deviceId: 1, status: 1 });
sessionSchema.index({ adminId: 1, status: 1, lastActiveAt: -1 });

export default mongoose.model("UserSession", sessionSchema);
