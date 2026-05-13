import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  nvr: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "NVR",
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Channel",
  },
  images:{
    faceImage:{type:String, default:"", required:true},
    personImage:{type:String, default:""},
    frameImage:{type:String, default:""}
  },
  personName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const accessLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
  date: { type: Date, default: Date.now }, // represents the day
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "authorizedUsers",
    required: false,     // not mandatory
    default: null,       // only set when provided
  },

  sessions: { type: [sessionSchema], default: [] }, // multiple enter/exit pairs
}, { timestamps: true });

export default mongoose.model("AccessLogs", accessLogSchema);
