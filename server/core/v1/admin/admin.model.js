// models/User.js

import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  emp_id : {type:String, default: null},
  orgId: { type: String, default: null },
  user_id: {
    type: String,
    required: true,
    unique: true,
  },
  login: {
    type: String,
    required: true,
    unique: true,
  },
  name_f: {
    type: String,
    default: '',
  },
  name_l: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  //add emp emails and their orgId in an array of objects
  empData: {
    type: Array,
    default: [],
    of: {
      email: String,
      orgId: String
    }
  },
  logsSound: { type: Boolean, default: false },
  // True while this admin's detection/face-auth streams have been stopped due to
  // plan expiry. Set when stop-all fires; cleared (and resume-all fired) when the
  // admin logs in again with an active plan.
  streamsStopped: { type: Boolean, default: false },
  // Per-admin IANA timezone (e.g. "Asia/Kolkata"). null = not set.
  timezone: { type: String, default: null },
  // Optional per-admin service endpoint overrides. null = use the global
  // value from config (default for all admins).
  // - streamHost / streamToken  -> RTSPStream.host / RTSPStream.token
  // - dsAuthUsersAPI            -> DSAuthUsersAPI
  // - attendanceUrl             -> PythonService.attendanceUrl
  // - detectionUrl             -> PythonService.detectionUrl
  streamHost: { type: String, default: null },
  streamToken: { type: String, default: null },
  dsAuthUsersAPI: { type: String, default: null },
  attendanceUrl: { type: String, default: null },
  detectionUrl: { type: String, default: null },
  // Per-admin incident Telegram bot + channel. Incidents post to Telegram ONLY
  // if BOTH are set (no global fallback); otherwise this admin gets no Telegram.
  telegramBotToken: { type: String, default: null },
  telegramChatId: { type: String, default: null },
  // Per-admin detection config. Key = settingType, value = custom display name.
  // If a key is present, that detection is allowed for this admin.
  // Empty object = all detections allowed with default names.
  detectionConfig: {
    type: Map,
    of: String,
    default: {},
  }
}, {
  timestamps: true,
});

export default mongoose.model('Admin', adminSchema);

