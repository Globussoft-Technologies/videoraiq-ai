import mongoose from "mongoose";

// Read-only view over the `measurement_incidents` collection written by the
// mattress QC pipeline (Detection Service + the flo-mattress station app).
// `strict: false` so we never drop fields the pipeline adds later; only the
// ones the Measurement Logs page reads are declared here.

const qrMetadataSchema = new mongoose.Schema(
  {
    ref_no: String,
    sales_order: String,
    order_item: String,
    sku: String,
    size_type: String,
    raw: String,
    length: Number, // printed, inches
    breadth: Number,
    height: Number,
  },
  { _id: false, strict: false },
);

const measuredDataSchema = new mongoose.Schema(
  {
    length: Number, // measured, centimetres
    breadth: Number,
    height: Number,
    confidence: Number,
  },
  { _id: false, strict: false },
);

const measurementIncidentSchema = new mongoose.Schema(
  {
    adminId: { type: String, index: true },
    userId: { type: String, default: null },
    operatorId: { type: String, default: null },
    stationId: { type: String, index: true },
    qrImagePath: String,
    qrImage: { url: String, filename: String },
    requestPayload: { type: mongoose.Schema.Types.Mixed },
    qrSku: { type: String, index: true },
    qrMetadata: qrMetadataSchema,
    measuredData: measuredDataSchema,
    measurementImage: String,
    // accepted | pending | rejected
    status: { type: String, index: true },
    dsProcessedAt: Date,
    statusUpdatedAt: Date,
    statusUpdatedBy: String,
  },
  { timestamps: true, strict: false, collection: "measurement_incidents" },
);

export default mongoose.models.MeasurementIncident
  || mongoose.model("MeasurementIncident", measurementIncidentSchema);
