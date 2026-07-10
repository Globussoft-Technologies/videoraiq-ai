import mongoose from "mongoose";

const authorizedChannelsSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // ✅ Locations are required, as per your logic
    locations: [
      {
        type: String,
        required: true,
      },
    ],

    // ✅ Locations are required, as per your logic
    employeeLocations: [
      {
        type: String,
        default:[]
      },
    ],

    // ✅ NVRs can be empty or missing
    nvrIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "NVR",
        required: false,
      },
    ],

    // ✅ Departments can be empty or missing
    departmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: false,
      },
    ],

    // ✅ Channels list (required only when added)
    channels: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Channel",
        required: false,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("authorizedChannels", authorizedChannelsSchema);
