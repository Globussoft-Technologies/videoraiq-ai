import mongoose from "mongoose";

const blockedDeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null, index: true },
    userType: { type: String, enum: ["admin", "user", "system"], default: "admin", index: true },
    ipAddress: { type: String, trim: true, default: "", index: true },
    operatingSystem: { type: String, trim: true, default: "", index: true },
    browser: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["blocked", "unblocked"], default: "blocked", index: true },
    reason: { type: String, trim: true, default: "" },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    blockedAt: { type: Date, default: Date.now },
    unblockedAt: { type: Date, default: null },
    unblockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

blockedDeviceSchema.index(
  { adminId: 1, memberId: 1, userType: 1, deviceId: 1 },
  { unique: true }
);

export default mongoose.model("BlockedDevice", blockedDeviceSchema);
