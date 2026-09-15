import mongoose from "mongoose";

const { Schema } = mongoose;

const pointSchema = new Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const measurementCalibrationSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true, trim: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "RaspberryPiDevice", required: true, index: true },
    stationId: { type: String, required: true, trim: true, index: true },
    points: { type: [pointSchema], default: [] },
    minZoneFlatRatio: { type: Number, required: true, min: 0.1, max: 1, default: 0.85 },
    inlierToleranceMm: { type: Number, required: true, min: 1, max: 100, default: 20 },
  },
  {
    collection: "measurement_calibrations",
    minimize: false,
    timestamps: true,
  },
);

measurementCalibrationSchema.index({ adminId: 1, deviceId: 1 }, { unique: true });

export { measurementCalibrationSchema };
export default mongoose.models.MeasurementCalibration
  || mongoose.model("MeasurementCalibration", measurementCalibrationSchema);
