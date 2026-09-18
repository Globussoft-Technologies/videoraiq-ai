import mongoose from "mongoose";

const amemberWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    userId: { type: String, required: true },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("AmemberWebhookEvent", amemberWebhookEventSchema);
