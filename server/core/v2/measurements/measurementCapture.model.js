import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true, index: true },
    storagePath: { type: String, required: true },
    stationId: { type: String, required: true, index: true },
    cameraId: { type: String, required: true },
    captureTrigger: { type: String, required: true },
    capturedAt: { type: Date, required: true, index: true },
    bytes: { type: Number, required: true, min: 1 },
  },
  { timestamps: true, collection: "measurement_captures" },
);

export { schema as measurementCaptureSchema };
export default mongoose.models.MeasurementCapture ||
  mongoose.model("MeasurementCapture", schema);
