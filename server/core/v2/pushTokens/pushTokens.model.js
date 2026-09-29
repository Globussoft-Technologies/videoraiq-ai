import mongoose from "mongoose";

// One row per device/browser that can receive incident push notifications.
// `token` is the FCM registration token — unique per app install / browser
// profile, so registering it again from another account simply moves it
// (the upsert in pushTokens.service.js) instead of duplicating it.
const pushTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["android", "ios", "web"], required: true },
    // Tenant the device belongs to — incidents are pushed to every device of
    // the incident's admin, the same audience as the `cameradetection_${adminId}` socket.
    adminId: { type: String, required: true, index: true },
    userId: { type: String, default: null }, // admin user_id or memberId, for debugging only
  },
  { timestamps: true },
);

export default mongoose.model("PushToken", pushTokenSchema);
