import mongoose from "mongoose";

// An email address an admin is about to give to a new (or edited) user. The
// address must be verified from the link mailed to it before the user can be
// saved with it. One row per admin + address; consumed once the user is saved.
const emailVerificationSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailVerificationSchema.index({ adminId: 1, email: 1 }, { unique: true });
// Mongo deletes a row a day after its last change: a link expires in 10 min
// and a verification counts for 24 h (VERIFIED_TTL_MS), so an abandoned row
// is dead by then. Consumed rows are already deleted on save.
emailVerificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model("UserEmailVerification", emailVerificationSchema);
