import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    // Kept populated with the MAC for compatibility with the unique index
    // created by the previous schema.
    deviceData: { type: String, required: true, unique: true, index: true },
    mac: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    ip: { type: String, required: true },
    station: { type: mongoose.Schema.Types.Mixed, required: true },
    registrationPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    tokenEncrypted: { type: String, default: null },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      index: true,
    },
    approvalUpdatedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["connected", "disconnected"],
      default: "connected",
    },
    registeredAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export { schema as raspberryPiDeviceSchema };
export default mongoose.models.RaspberryPiDevice ||
  mongoose.model("RaspberryPiDevice", schema);
