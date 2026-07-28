import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  nvr: { type: mongoose.Schema.Types.ObjectId, ref: "NVR", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  personName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  images: {
    faceImage: { type: String},
    personImage: { type: String },
    frameImage: { type: String},
  },
  confidenceScore: { type: Number }
});

const accessLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },

  date: { type: Date, default: () => new Date(), index: true },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "authorizedUsers", index: true },

  tag: { type: Boolean, default: false },

  taggedAt: { type: Date, default: null },

  sessions: { type: [sessionSchema], default: [] }

}, { timestamps: true });


accessLogSchema.index({ admin: 1, date: 1, userId: 1 });
accessLogSchema.index({ admin: 1, createdAt: -1 });
accessLogSchema.index({ admin: 1, userId: 1, createdAt: -1 });
accessLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("OptimizedAccessLogs", accessLogSchema);
