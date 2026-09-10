import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Measurement incidents are intentionally kept out of the detection incident
 * collection. QR and measurement payloads are owned by the DS contract and
 * therefore use Mixed fields until that contract is finalised.
 */
const measurementIncidentSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true, trim: true },
    userId: { type: String, default: null, index: true, trim: true },
    operatorId: { type: String, default: null, trim: true },
    stationId: { type: String, required: true, trim: true, index: true },
    qrImagePath: { type: String, required: true, trim: true },
    qrImage: { type: Schema.Types.Mixed, default: null },
    requestPayload: { type: Schema.Types.Mixed, default: {} },
    qrSku: { type: String, default: null, trim: true, uppercase: true, index: true },
    qrMetadata: { type: Schema.Types.Mixed, required: true },
    measuredData: { type: Schema.Types.Mixed, default: {} },
    measurementImage: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    dsProcessedAt: { type: Date, default: null },
    statusUpdatedAt: { type: Date, default: null },
    statusUpdatedBy: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "measurement_incidents",
    minimize: false,
  },
);

measurementIncidentSchema.index({ adminId: 1, createdAt: -1 });
measurementIncidentSchema.index({ qrSku: 1, status: 1, createdAt: -1 });

const MeasurementIncident =
  mongoose.models.MeasurementIncident ||
  mongoose.model("MeasurementIncident", measurementIncidentSchema);

export { MeasurementIncident, measurementIncidentSchema };
export default MeasurementIncident;
