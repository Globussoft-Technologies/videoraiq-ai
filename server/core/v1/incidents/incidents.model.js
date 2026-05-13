// models/incident.js

import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const options = { discriminatorKey: 'incidentType', collection: 'incidents' ,timestamps: true };

// Common Base Schema
const incidentSchema = new Schema({
  timeOfIncident: { type: Date, required: true },
  Image:{type: String, default: null},
  videoLink: { type: String, default:null },
  description: String,
  incidentName: String,
  cameraId: String,
  nvrId:{type:mongoose.Schema.Types.ObjectId,ref:"NVR",required: true},
  channelId:{type:mongoose.Schema.Types.ObjectId,ref:"Channel",required:true},
  userId:{type:String,required:true},
  zone: String,
  severity: { type: String, enum: ['low', 'moderate', 'high'] },
  resolved:{type:Boolean,default:false},
  report:{
    status:{type:Boolean,default:false},
    description:{type:String,default:""},
    resolvedAt:{type:Date,default:null},
    reportedAt:{type:Date,default:null}
  },
  type:{type: String} // there are few types of detection like counter gauge binary
}, options);

const Incident = model('Incident', incidentSchema);

// Cashier Theft Detection
const CountPersonDetectionSchema = new Schema({
  count: {type:Number},
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      count: Number,
    }
  ]
});
const CountPersonIncident = Incident.discriminator('countPersons', CountPersonDetectionSchema);

// Cylinder Stack Height Detection
const CountVehiclesDetectionSchema = new Schema({
  count: {type:Number},
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      count: Number,
    }
  ]
});
const CountVehiclesIncident = Incident.discriminator('countVehicles', CountVehiclesDetectionSchema);

// Door Open/Close Detection
const MotionDetectionSchema = new Schema({
});
const MotionIncident = Incident.discriminator('motionDetection', MotionDetectionSchema);

// Uniform Detection
const GenericObjectDetectionDetectionSchema = new Schema({
  objectsDetected: {
    type: [Schema.Types.Mixed], // Accepts any object like { bag: 3 }
    validate: {
      validator: function(arr) {
        return arr.every(obj =>
          typeof obj === 'object' &&
          Object.values(obj).every(v => typeof v === 'number')
        );
      },
      message: 'Each object in objectsDetected must have numeric values.'
    }
  },
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      objectsDetected: {
        type: [Schema.Types.Mixed], // Accepts any object like { bag: 3 }
        validate: {
          validator: function(arr) {
            return arr.every(obj =>
              typeof obj === 'object' &&
              Object.values(obj).every(v => typeof v === 'number')
            );
          },
          message: 'Each object in objectsDetected must have numeric values.'
        }
      }
    }
  ]
});
const GenericObjectIncident = Incident.discriminator('genericObjectDetection', GenericObjectDetectionDetectionSchema);

const LoiteringWithAuthAuthSchema = new Schema({
  personDetected: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'authorizedUsers', // Assuming your user model is named "User"
    }
  ],
  triggerNotification: { type: Boolean, default: true },
  loiteringThreshold:{type:Number}
});

const LoiteringWithAuthIncident = Incident.discriminator('loiteringWithAuth', LoiteringWithAuthAuthSchema);

const LoiteringWithoutAuthAuthSchema = new Schema({
  triggerNotification: { type: Boolean, default: true },
  loiteringThreshold:{type:Number}
});

const LoiteringWithoutAuthIncident = Incident.discriminator('loiteringWithoutAuth', LoiteringWithoutAuthAuthSchema);

const UnauthorizedAccessSchema = new Schema({
  personDetected: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'authorizedUsers', // Assuming your user model is named "User"
    }
  ],
  triggerNotification: { type: Boolean, default: true },
  unknownCount: { type: Number },
  alertThreshold: { type: Number },
});

const UnauthorizedAccessIncident = Incident.discriminator('unauthorizedAccess', UnauthorizedAccessSchema);

const LineCrossingAuthAuthSchema = new Schema({
  atoB: {
    type: Number,
    min: [0, 'atoB cannot be less than 0'],
    validate: {
      validator: Number.isInteger,
      message: 'atoB must be an integer',
    },
  },
  btoA: {
    type: Number,
    min: [0, 'bToA cannot be less than 0'],
    validate: {
      validator: Number.isInteger,
      message: 'bToA must be an integer',
    },
  },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      atoB: {
        type: Number,
        min: [0, 'atoB cannot be less than 0'],
        validate: {
          validator: Number.isInteger,
          message: 'atoB must be an integer',
        },
      },
      btoA: {
        type: Number,
        min: [0, 'bToA cannot be less than 0'],
        validate: {
          validator: Number.isInteger,
          message: 'bToA must be an integer',
        },
      },
    }
  ],
  triggerNotification: { type: Boolean, default: false },
  personDetected: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'authorizedUsers', // Assuming your user model is named "User"
    }
  ],
  alertThreshold:{type:Number},
});

const LineCrossingAuthIncident = Incident.discriminator('lineCrossing', LineCrossingAuthAuthSchema);

// Cashier Theft Detection
const croudIncidentSchema = new Schema({
  croudCount: {type:Number},
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      count: Number,
    }
  ]
});
const CroudIncident = Incident.discriminator('crowdDetection', croudIncidentSchema);

// Cashier Theft Detection

const ppeItemSchema = new Schema(
  {
    yes: { type: Number, default: 0 },
    no: { type: Number, default: 0 }
  },
  { _id: false }
);
const safetyHelmetSchema = new Schema({
  ppe: {
        helmet: {
          type: ppeItemSchema,
          default: () => ({})
        },
        safety_jacket: {
          type: ppeItemSchema,
          default: () => ({})
        }
  },
  croudCount: {type:Number},
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      croudCount: {type:Number},
      ppe: {
        helmet: {
          type: ppeItemSchema,
          default: () => ({})
        },
        safety_jacket: {
          type: ppeItemSchema,
          default: () => ({})
        }
      }
    }
  ]
});
const SafetyHelmetIncident = Incident.discriminator('personalProtectiveEquipment', safetyHelmetSchema);


const DoorStatusSchema = new Schema({
  currentStatus: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    required: true
  },
  currentImage:{
    type:String,
    default:null
  },

  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['OPEN', 'CLOSED'],
        required: true
      },
      Image:{type:String,default:null}
    }
  ],

  triggerNotification: {
    type: Boolean,
    default: false
  },

});
const DoorStatusIncident = Incident.discriminator('doorDetection',DoorStatusSchema);


const LightStatusSchema = new Schema({
  currentStatus: {
    type: String,
    enum: ['ON', 'OFF'],
    required: true
  },
  currentImage:{
    type:String,
    default:null
  },

  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['ON', 'OFF'],
        required: true
      },
      Image:{type:String,default:null}
    }
  ],

  triggerNotification: {
    type: Boolean,
    default: false
  },

  alertAfterDuration: {
    type: Number, // minutes / seconds
    min: 0
  }
});

const LightStatusIncident = Incident.discriminator('lightDetection',LightStatusSchema);


const BagAccessSchema = new Schema({
  triggerNotification: { type: Boolean, default: true },
  count: { type: Number },
  alertThreshold: { type: Number },
});

const BagDetectionIncident = Incident.discriminator('bagDetection', BagAccessSchema);


// Cylinder Stack Height Detection
const VehicleDetectionSchema = new Schema({
  count: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
  vehicleNumber:{type:String,default:null}
});
const VehicleDetectionIncident = Incident.discriminator('vehicleDetection', VehicleDetectionSchema);

const DeskAbsenceSchema = new Schema({
  personPresent: { type: Boolean },
  triggerNotification: { type: Boolean, default: true },
});
const DeskAbsenceIncident = Incident.discriminator(
  "deskAbsence",
  DeskAbsenceSchema,
);

const GuardAbsenceSchema = new Schema({
  personPresent: { type: Boolean },
  triggerNotification: { type: Boolean, default: true },
});
const GuardAbsenceIncident = Incident.discriminator(
  "guardAbsence",
  GuardAbsenceSchema,
);

const ConveyorDetectionSchema = new Schema({
  currentStatus: {
    type: String,
    enum: ["ON", "OFF"],
    required: true,
  },
  triggerNotification: { type: Boolean, default: true },
});
const ConveyorDetectionIncident = Incident.discriminator(
  "conveyorDetection",
  ConveyorDetectionSchema,
);

const CrusherDetectionSchema = new Schema({
  currentStatus: {
    type: String,
    enum: ["ON", "OFF"],
    required: true,
  },
  triggerNotification: { type: Boolean, default: true },
});
const CrusherDetectionIncident = Incident.discriminator(
  "crusherDetection",
  CrusherDetectionSchema,
);

const WaterSpillageDetectionSchema = new Schema({
  currentStatus: {
    type: String,
    enum: ["DETECTED", "CLEAR"],
    required: true,
  },
  triggerNotification: { type: Boolean, default: true },
});
const WaterSpillageDetectionIncident = Incident.discriminator(
  "waterSpillageDetection",
  WaterSpillageDetectionSchema,
);


export  {
  Incident,
  CountPersonIncident,
  CountVehiclesIncident,
  MotionIncident,
  GenericObjectIncident,
  LoiteringWithAuthIncident,
  LoiteringWithoutAuthIncident,
  UnauthorizedAccessIncident,
  LineCrossingAuthIncident,
  CroudIncident,
  SafetyHelmetIncident,
  DoorStatusIncident,
  LightStatusIncident,
  BagDetectionIncident,
  VehicleDetectionIncident,
  DeskAbsenceIncident,
  GuardAbsenceIncident,
  ConveyorDetectionIncident,
  CrusherDetectionIncident,
  WaterSpillageDetectionIncident,
};
