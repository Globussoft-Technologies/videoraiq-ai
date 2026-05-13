import mongoose from "mongoose";

// Individual session (single action log for a user)
const sessionSchema = new mongoose.Schema({
  nvr: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "NVR",
    required: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Channel",
    required: true,
  },
  personName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  images:{
    faceImage:{type:String, default:"", required:true},
    personImage:{type:String, default:""},
    frameImage:{type:String, default:""}    
  }
}, { _id: false });

// Group sessions by user
const userSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "authorizedUsers",
    required: false, // optional: sometimes personName may not be tied to a user
    default: null,
  },
  lastCreatedAt: { type: Date, default: Date.now },
  sessions: {
    type: [sessionSchema], // array of session logs
    default: [],
  },
});

// Main Access Log Schema
const accessLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
  date: { type: Date, default: Date.now }, // represents the day
  usersLogs: {
    type: [userSessionSchema], // multiple users per admin per day
    default: [],
  },
}, { timestamps: true });

export default mongoose.model("TestAccessLogs", accessLogSchema);
