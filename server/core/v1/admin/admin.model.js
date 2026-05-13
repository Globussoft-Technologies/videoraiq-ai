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
}, {
  timestamps: true,
});

export default mongoose.model('Admin', adminSchema);

