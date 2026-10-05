import mongoose from "mongoose";

const assistantMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true, maxlength: 20_000 },
    ui: { type: mongoose.Schema.Types.Mixed },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    error: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const assistantConversationSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    ownerType: { type: String, enum: ["admin", "member"], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 90 },
    messageCount: { type: Number, default: 0, min: 0 },
    messages: { type: [assistantMessageSchema], default: [] },
    // Stateful conversational workflows live here instead of relying only on
    // the model history, which may be truncated or edited by the client.
    workflowState: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

assistantConversationSchema.index({ adminId: 1, ownerType: 1, ownerId: 1, updatedAt: -1 });

export default mongoose.model("AssistantConversation", assistantConversationSchema);
