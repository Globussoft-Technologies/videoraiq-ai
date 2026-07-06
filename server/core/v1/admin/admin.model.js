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
  // Optional per-admin RTSP stream overrides. null = use the global
  // RTSPStream.host / RTSPStream.token from config (default for all admins).
  streamHost: { type: String, default: null },
  streamToken: { type: String, default: null },
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

