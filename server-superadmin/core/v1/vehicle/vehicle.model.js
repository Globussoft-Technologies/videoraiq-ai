import mongoose from "mongoose";

const { Schema } = mongoose;

const vehicleSchema = new Schema(
  {
    vehicleNumber: { type: String, unique: true, required: true },
  },
  { timestamps: true },
);

export default mongoose.model("Vehicle", vehicleSchema);
