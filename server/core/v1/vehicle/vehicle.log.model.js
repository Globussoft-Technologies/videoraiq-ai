import mongoose from "mongoose";
const { Schema } = mongoose;

const ImagesSchema = new mongoose.Schema(
  {
    vehicle: String,
  },
  { _id: false },
);

const eventSchema = new Schema({
  timestamp: { type: Date, default: Date.now },
  nvr: { type: mongoose.Schema.Types.ObjectId, ref: "NVR" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },
  images: {
    type: ImagesSchema,
    validate: {
      validator: function (v) {
        return v && v.vehicle;
      },
      message: "Vehicle image is required.",
    },
  },
});

const vehicleLogSchema = new Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
    },
    events: [eventSchema],
  },
  { timestamps: true },
);

export default mongoose.model("VehicleLog", vehicleLogSchema);
