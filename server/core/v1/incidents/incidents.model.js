// models/incident.js

import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const options = { discriminatorKey: 'incidentType', collection: 'incidents' ,timestamps: true };

// Common Base Schema
const incidentSchema = new Schema({
  timeOfIncident: { type: Date, required: true },
  // Optional UTC timestamp to seek the NVR playback to, distinct from
  // timeOfIncident (e.g. a few seconds earlier to show the lead-up).
  playBackTime: { type: Date, default: null },
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
  // Optional model confidence (0-100) sent by the detection trigger. Lives on
  // the base schema so every incident type accepts it, and every alert channel
  // can read it, without touching 25 discriminators.
  ConfidenceScoreInPercentage:{type:Number,default:null},
  resolved:{type:Boolean,default:false},
  liveDemoData:{type:Boolean,default:false},
  videoId:{type:mongoose.Schema.Types.ObjectId,ref:'LiveDemo',default:null},
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
  type: {
    type: String,
    default: "all",
  },
  totalEntry: { type: Number, default: 0, min: 0 },
  totalExit: { type: Number, default: 0, min: 0 },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      type: {
        type: String,
        default: "all",
      },
      entry: {
        type: Number,
        min: 0,
        validate: {
          validator: Number.isInteger,
          message: "entry must be an integer",
        },
        default: 0,
      },
      exit: {
        type: Number,
        min: 0,
        validate: {
          validator: Number.isInteger,
          message: "exit must be an integer",
        },
        default: 0,
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
  vehicleNumber:{type:String,default:null},
  vehicleType: {type:String,default:null},
  licensePlate: {type:String,default:null},
  vehicleColor: {type:String,default:null},
  confidence: {type:Number,default:null},
  detectTime: {type:Date,default:null}
});
const VehicleDetectionIncident = Incident.discriminator('vehicleDetection', VehicleDetectionSchema);

// Cylinder Stack Height Detection
const vehicleObstructionSchema = new Schema({
  count: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
  vehicleNumber:{type:String,default:null},
  vehicleType: {type:String,default:null},
  // When the vehicle entered the dispatch area (sent in the trigger payload).
  // timeOfIncident doubles as the dispatch exit time for this type.
  dispatchEntryTime: {type:Date,default:null}
});
const VehicleObstructionIncident = Incident.discriminator('vehicleObstruction', vehicleObstructionSchema);

const DeskAbsenceSchema = new Schema({
  personPresent: { type: Boolean },
  triggerNotification: { type: Boolean, default: true },
  timeSeries: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      personCount: { type: Number },
      zoneName: { type: String },
      personPresent: { type: Boolean },
    }
  ],
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

// Cylinder Stack Height Detection
const VehicleTypeDetectionSchema = new Schema({
  count: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
  vehicleType:{type:String,default:null}
});
const VehicleTypeDetectionIncident = Incident.discriminator('vehicleTypeDetection', VehicleTypeDetectionSchema);
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

// Cylinder Stack Height Detection
const loiteringDetectionSchema = new Schema({
  count: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
});
const LoiteringDetectionIncident = Incident.discriminator('loiteringDetection', loiteringDetectionSchema);


const TableOccupancyDetectionSchema = new Schema({
  count: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
});
const TableOccupancyDetectionIncident = Incident.discriminator('tableOccupancyDetection', TableOccupancyDetectionSchema);


const FoodServicePPEItemSchema = new Schema(
  {
    yes: { type: Number, default: 0 },
    no: { type: Number, default: 0 }
  },
  { _id: false }
);
const FoodServicePPESchema = new Schema({
  ppe: {
        gloves: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        apron: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        vest: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        hairnet: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        mask: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
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
        gloves: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        apron: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        vest: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        hairnet: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
        mask: {
          type: FoodServicePPEItemSchema,
          default: () => ({})
        },
      }
    }
  ]
});
const FoodServicePPEDetectionIncident = Incident.discriminator('foodServicePPEDetection', FoodServicePPESchema);

// Cylinder Stack Height Detection
const mobilePhoneDetectionSchema = new Schema({
  count: {type:Number,default:0},
  numberOfMobileDetected: {type:Number,default:0},
  triggerNotification: { type: Boolean, default: true },
});
const MobilePhoneDetectionIncident = Incident.discriminator('mobilePhoneDetection', mobilePhoneDetectionSchema);

// Cylinder Stack Height Detection
const carModelDetectionSchema = new Schema({
  count: {type:Number,default:0},
  model_name: { type: String, default: null },
  vehicleNumber: { type: String, default: null },
  // Vehicle attributes sent alongside the model read. All optional — a payload
  // that omits them keeps the null defaults.
  color: { type: String, default: null },
  company: { type: String, default: null },
  year: { type: Number, default: null },
  triggerNotification: { type: Boolean, default: true }
});
const CarModelDetectionIncident = Incident.discriminator('carModelDetection', carModelDetectionSchema);


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
  VehicleObstructionIncident,
  DeskAbsenceIncident,
  GuardAbsenceIncident,
  ConveyorDetectionIncident,
  CrusherDetectionIncident,
  VehicleTypeDetectionIncident,
  WaterSpillageDetectionIncident,
  LoiteringDetectionIncident,
  TableOccupancyDetectionIncident,
  FoodServicePPEDetectionIncident,
  MobilePhoneDetectionIncident,
  CarModelDetectionIncident
};
