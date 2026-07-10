import mongoose from "mongoose";

const authorizedObjectsSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    objectType: {
      type: String,
      required: true,
      trim: true,
    },
    objectNames: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ✅ Make (admin + objectType) unique so each admin can have only one record per type
authorizedObjectsSchema.index({ admin: 1, objectType: 1 }, { unique: true });

export default mongoose.model("authorizedObjects", authorizedObjectsSchema);
