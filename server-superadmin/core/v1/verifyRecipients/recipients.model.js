import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const recipientSchema = new Schema({
  adminId: {
    type: Types.ObjectId,
    required: true,
    ref: 'admins'
  },
  type: {
    type: String,
    enum: ['email', 'phone'],
    required: true
  },
  fullName:{
    type:String,
    default:null
  },
  value: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifyOTP:{
    type:String
  },
  otpExpireDate: {
    type: Date
  },
  incidentTypes: {
    type: [String],
    default: []
  }
}, { timestamps: true });

const RecipientModel = model('recipients', recipientSchema);
export default RecipientModel;

