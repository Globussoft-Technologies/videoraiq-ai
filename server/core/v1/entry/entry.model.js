import mongoose from "mongoose";
const { Schema } = mongoose;

const ImagesSchema = new mongoose.Schema(
  {
    face: String,
    person: String,
    frame: String,
    // vehicle: String,
  },
  { _id: false }
);

// Each event now stores which NVR and Channel it came from
const eventSchema = new Schema({
  // type: { type: String, enum: ["user", "vehicle"], required: true },
  timestamp: { type: Date, default: Date.now },
  nvr: { type: mongoose.Schema.Types.ObjectId, ref: "NVR" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },
  images: {
    type: ImagesSchema,
    validate: {
      validator: function (v) {
        return v && (v.face || v.person || v.frame);
      },
      message:
        "At least one image (face, person, frame) is required.",
    },
  },
});

const entrySchema = new Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EntryUser",
      required: true,
    },
    events: [eventSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Entry", entrySchema);
