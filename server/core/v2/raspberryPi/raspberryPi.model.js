import mongoose from "mongoose";
const schema = new mongoose.Schema({
  deviceData: { type: String, required: true, unique: true, index: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  tokenEncrypted: { type: String, required: true },
  status: { type: String, enum: ["connected", "disconnected"], default: "connected" },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });
export default mongoose.model("RaspberryPiDevice", schema);
