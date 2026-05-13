import mongoose from "mongoose";

const ObjectsSchema = new mongoose.Schema(
  {
    // Array of objects
    objects: [String],

    settingType: {
      type: String,
      enum: ["personalProtectiveEquipment", "crowdDetection"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("DetectionObjects", ObjectsSchema);
