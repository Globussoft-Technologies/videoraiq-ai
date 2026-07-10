import mongoose from 'mongoose';

const detectionConfigSchema = new mongoose.Schema({
  detectionType: {
    type: String,
    required: true,
    enum: [
      'countPersons',
      // 'countVehicles',
      // 'motionDetection',
      'genericObjectDetection',
      // 'loiteringWithoutAuth',
      'lineCrossing',
      'unauthorizedAccess',
      // 'loiteringWithAuth',
    ],
  },
  isEnabled: {
    type: Boolean,
    default: false, // true = show in sidebar, false = hide
  },
  allowedDetection:{
    type: Boolean,
    default: true, // To conditionally show detection for specific Admin 
  },
  displayName:{type:String}
}, { _id: false });

const dashboardSidebarConfigSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    unique: true, // Each admin should have one config
  },
  detectionConfigs: {
    type: [detectionConfigSchema],
    default: [], // Allow empty list if no custom config yet
  },
}, {
  timestamps: true,
});

export default mongoose.model('DashboardSidebarConfig', dashboardSidebarConfigSchema);


