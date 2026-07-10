import mongoose from "mongoose";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
const locationSchema = new mongoose.Schema(
  {
    locationName: {
      type: String,
      required: true,
      trim: true,
    },
    empLocationId: {
      type: String,
      required: false,
      trim: true,
    },
    isImportedFromEMP: {
      type: Boolean,
      default: false,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true }
);

// Optional: You can add simple index here if empLocationId is unique per admin
// locationSchema.index({ adminId: 1, empLocationId: 1 }, { unique: true });



locationSchema.pre(/^find|countDocuments/, async function () {
  const memberId = this.options?.memberId;
  const user = this.options?.user;

  // No member → allow full access
  if (!memberId) return;

  // Fetch allowed locations for the member
  const authorized = await authorizedChannelsModel.findOne({
    userId: memberId,
  });
  
  if (!authorized) return;

  const allowedLocations = user==="nvr"?authorized?.locations:authorized?.employeeLocations; // ensure correct field

  

  // If allowed list empty → block all results
  if (!Array.isArray(allowedLocations) || allowedLocations.length === 0) {
    this.where({ _id: { $in: [] } });
    return;
  }

  this.where({ locationName: { $in: allowedLocations } });
});

export default mongoose.model("Location", locationSchema);
