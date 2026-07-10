import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;


const alertSchema = new Schema({
  adminId: {
    type: Types.ObjectId,
    required: true,
    ref: 'admins'
  },
  detectionTypes: {
    type: [String],
    enum: [
      'countPersons',
      'countVehicles',
      'motionDetection',
      'genericObjectDetection',
      'loiteringWithoutAuth'
    ],
    default: []
  },  
  emails: {
    type: [String],
    default: []
  },
  phoneNumbers: {
    type: [String],
    default: []
  },
  alertBasedOn: {
    type: String,
    enum: ['NVR', 'Camera'],
    required: true
  },
  selectedNVRs: [
    {
      type: Types.ObjectId,
      ref: 'NVR' 
    }
  ],
  selectedCameras: [
    {
      type: Types.ObjectId,
      ref: 'Channel' 
    }
  ]
}, { timestamps: true });

const AlertsConfig = model('alerts', alertSchema);
export default AlertsConfig;
