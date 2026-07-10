import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: String,
    lastName: String,
    email: String,
    profileImages: [String],
  },
  { timestamps: true }
);

export default mongoose.model("EntryUser", userSchema);
