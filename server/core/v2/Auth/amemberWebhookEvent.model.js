import mongoose from "mongoose";

const amemberWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    userId: { type: String, required: true },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("AmemberWebhookEvent", amemberWebhookEventSchema);
