import mongoose from "mongoose";

// The subscription plan catalog shown on the super-admin Plans screen.
//
// This is presentation only: aMember remains the source of truth for what a
// client is actually billed and which products they hold. A plan here is
// matched back to aMember by amemberProductId (preferred) or by name, which is
// how "N clients on this plan" is counted.
const planSchema = new mongoose.Schema(
  {
    // Also the fallback match against an aMember invoice item title, so it has
    // to stay in step with the product name in aMember when no id is set.
    name: { type: String, required: true, trim: true, unique: true },
    // aMember product_id this plan corresponds to. Preferred over name matching.
    amemberProductId: { type: String, default: null, trim: true },
    tagline: { type: String, default: "", trim: true },
    // ponytail: display string, not a number — the Enterprise tier shows
    // "Custom", and aMember does the actual billing. Formatting/currency lives
    // wherever it is rendered; make it a Number only if we start computing on it.
    priceLabel: { type: String, default: "", trim: true },
    pricePeriod: { type: String, default: "", trim: true },
    features: { type: [String], default: [] },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    // Archived plans stay for existing clients but are hidden from the catalog.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

planSchema.index({ archived: 1, sortOrder: 1 });

export default mongoose.model("Plan", planSchema);
