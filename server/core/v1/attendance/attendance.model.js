import mongoose from "mongoose";
const { Schema } = mongoose;

const ImagesSchema = new mongoose.Schema(
  {
    face: String,
    person: String,
    frame: String,
  },
  { _id: false },
);

// Each event now stores which NVR and Channel it came from
const eventSchema = new Schema({
  cameraType: { type: String, enum: ["checkin", "checkout"], required: true },
  timestamp: { type: Date, default: Date.now },
  // imageUrl: { type: String, required: true },
  nvr: { type: mongoose.Schema.Types.ObjectId, ref: "NVR" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },
  images: {
    type: ImagesSchema,
    validate: {
      validator: function (v) {
        return v && (v.face || v.person || v.frame);
      },
      message: "At least one image (face, person, or frame) is required.",
    },
  },
  confidenceScore: { type: Number },
});

eventSchema.pre("validate", function (next) {
  if (!this.images || (!this.images.face && !this.images.person && !this.images.frame)) {
    this.invalidate("images", "At least one image (face, person, or frame) is required.");
  }
  next();
});

const attendanceSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authorizedUsers",
      required: true,
    },
    // shiftId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Shift",
    // },
    events: [eventSchema], // all events for the day (can come from different cameras)
  },
  { timestamps: true },
);

// Every read path here matches on `user` and windows on `createdAt` (the
// analytics rollups, the Attendance Logs list, the export). Without these the
// collection had only its _id index, so each of those was a full scan — which
// is what made Attendance Analytics take seconds on a 22-employee tenant.
// `employee` sits between them for the department-scoped rollup, which adds an
// `employee: { $in: [...] }` to the same match.
attendanceSchema.index({ user: 1, createdAt: -1 });
attendanceSchema.index({ user: 1, employee: 1, createdAt: -1 });

export default mongoose.model("Attendance", attendanceSchema);
