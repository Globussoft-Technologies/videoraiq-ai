// models/Storage.js
import mongoose from "mongoose";

const StorageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    isValid: { type: Boolean, default: true },
    type: {
      type: String,
      enum: ["google_drive_oauth", "google_drive_service_account", "s3", "sftp"],
      required: true,
    },
    credentials: { type: Object, required: true }, // Encrypted JSON
    note: { type: String },
  },
  {
    timestamps: true,
  }
);

StorageSchema.pre("save", async function (next) {
  await mongoose.model("Storage").updateMany(
    {
      userId: this.userId,
      _id: { $ne: this._id }, // exclude current doc
    },
    { $set: { active: false } }
  );
  next();
});

export default mongoose.model("Storage", StorageSchema);
