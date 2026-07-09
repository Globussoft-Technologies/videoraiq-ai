import mongoose from "mongoose";
import {
  DETECTION_TYPES,
  TYPE_MAP,
} from "../../../constants/detectionTypes.js";
const baseOptions = { discriminatorKey: "settingType", timestamps: true };

// Shared per-zone config, available on every detection's `settings`.
const zoneConfigsField = {
  zone_configs: [
    {
      name: { type: String },
      capacity: { type: Number },
      threshold_sec: { type: Number },
      // Daily Telegram-alert window for this zone, in the admin's timezone.
      // 12-hour clock strings, e.g. "09:00 AM" / "06:30 PM". null = no window;
      // Telegram is only sent when both are set AND the incident's local time
      // (UTC converted to the admin's timezone) falls inside the window.
      startTime: { type: String, default: null },
      endTime: { type: String, default: null },
    },
  ],
};

const DetectionSettingBaseSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    settingType: {
      type: String,
      required: true,
      enum: Object.keys(DETECTION_TYPES),
    },
    name: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      required: true,
    },
    detectionType: {
      type: String,
    },
    alerts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "recipients",
      },
    ],
  },
  baseOptions,
);

// hooks
DetectionSettingBaseSchema.pre("save", function (next) {
  if (!this.detectionType) {
    this.detectionType = TYPE_MAP[this.settingType] || this.settingType;
  }
  next();
});

const DetectionSetting = mongoose.model(
  "DetectionSetting",
  DetectionSettingBaseSchema,
);

const CountPersonsDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 30 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("countPersonsSettings")
const CountPersonsDetectionSetting = DetectionSetting.discriminator(
  "countPersonsSettings",
  new mongoose.Schema({ settings: CountPersonsDetectionSchema }),
);

const GenericObjectDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 1 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
  objectList: {
    type: [String],
    default: ["generic"],
  },
});

// The discriminator key must match the enum string in base schema ("genericObjectDetectionSettings")
const GenericObjectDetectionSetting = DetectionSetting.discriminator(
  "genericObjectDetectionSettings",
  new mongoose.Schema({ settings: GenericObjectDetectionSchema }),
);

const MotionDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 1 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "binary",
  },
});

// The discriminator key must match the enum string in base schema ("motionDetectionSettings")
const MotionDetectionSetting = DetectionSetting.discriminator(
  "motionDetectionSettings",
  new mongoose.Schema({ settings: MotionDetectionSchema }),
);

const CountVehiclesSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  objectList: {
    type: [String],
    default: ["vehicles"],
  },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("countVehiclesSettings")
const CountVehiclesSetting = DetectionSetting.discriminator(
  "countVehiclesSettings",
  new mongoose.Schema({ settings: CountVehiclesSchema }),
);

const LoiteringWithoutAuthSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  crowdCountThreshold: { type: Number, default: 1 },
  peopleCountThreshold: { type: Number, default: 5 },
  loiteringThreshold: { type: Number, default: 600 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("loiteringWithoutAuthSettings")
const LoiteringWithoutAuthSetting = DetectionSetting.discriminator(
  "loiteringWithoutAuthSettings",
  new mongoose.Schema({ settings: LoiteringWithoutAuthSchema }),
);

const LoiteringWithAuthSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  crowdCountThreshold: { type: Number, default: 1 },
  peopleCountThreshold: { type: Number, default: 5 },
  loiteringThreshold: { type: Number, default: 600 },
  videoResolution: [Number],
  authorisedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authorizedUsers",
    },
  ],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("loiteringWithAuthSettings")
const LoiteringWithAuthSetting = DetectionSetting.discriminator(
  "loiteringWithAuthSettings",
  new mongoose.Schema({ settings: LoiteringWithAuthSchema }),
);

const UnAuthorisedAccessSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  authorisedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authorizedUsers",
    },
  ],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("unauthorizedAccessSettings")
const UnAuthorisedAccessSetting = DetectionSetting.discriminator(
  "unauthorizedAccessSettings",
  new mongoose.Schema({ settings: UnAuthorisedAccessSchema }),
);

const LineCrossingSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  faceAuth: { type: Boolean, default: false },
  authorisedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authorizedUsers",
    },
  ],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "counter",
  },
});

LineCrossingSchema.pre("save", function (next) {
  this.faceAuth =
    Array.isArray(this.authorisedUsers) && this.authorisedUsers.length > 0;
  next();
});

// The discriminator key must match the enum string in base schema ("lineCrossingSettings")
const LineCrossingSetting = DetectionSetting.discriminator(
  "lineCrossingSettings",
  new mongoose.Schema({ settings: LineCrossingSchema }),
);

const FireSmokeDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

// The discriminator key must match the enum string in base schema ("lineCrossingSettings")
const FireSmokeDetectionSetting = DetectionSetting.discriminator(
  "fireSmokeDetectionSettings",
  new mongoose.Schema({ settings: FireSmokeDetectionSchema }),
);

const WeaponDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
  objectList: { type: [String], default: ["weapons"] },
});

// The discriminator key must match the enum string in base schema ("lineCrossingSettings")
const WeaponDetectionSetting = DetectionSetting.discriminator(
  "weaponDetectionSettings",
  new mongoose.Schema({ settings: WeaponDetectionSchema }),
);

const UnattendedBaggageDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 600 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
  objectList: { type: [String], default: ["bag"] },
});

// The discriminator key must match the enum string in base schema ("unattendedBaggageDetectionSettings")
const UnattendedBaggageDetectionSetting = DetectionSetting.discriminator(
  "unattendedBaggageDetectionSettings",
  new mongoose.Schema({ settings: UnattendedBaggageDetectionSchema }),
);

const CrowdDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 30 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const CrowdDetectionSetting = DetectionSetting.discriminator(
  "crowdDetectionSettings",
  new mongoose.Schema({ settings: CrowdDetectionSchema }),
);

const PersonalProtectiveEquipmentSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const PersonalProtectiveEquipmentSetting = DetectionSetting.discriminator(
  "personalProtectiveEquipmentSettings",
  new mongoose.Schema({ settings: PersonalProtectiveEquipmentSchema }),
);

const DoorDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const DoorDetectionSetting = DetectionSetting.discriminator(
  "doorDetectionSettings",
  new mongoose.Schema({ settings: DoorDetectionSchema }),
);

const LightDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const LightDetectionSetting = DetectionSetting.discriminator(
  "lightDetectionSettings",
  new mongoose.Schema({ settings: LightDetectionSchema }),
);

const VehicleDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const VehiclDetectionSetting = DetectionSetting.discriminator(
  "vehicleDetectionSettings",
  new mongoose.Schema({ settings: VehicleDetectionSchema }),
);

const DeskAbsenceDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  absenceThreshold: { type: Number, default: 300 },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 30 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});
const DeskAbsenceDetectionSetting = DetectionSetting.discriminator(
  "deskAbsenceSettings",
  new mongoose.Schema({ settings: DeskAbsenceDetectionSchema }),
);

const GuardAbsenceDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  absenceThreshold: { type: Number, default: 300 },
  videoResolution: [Number],
  detectionTimeGap: { type: Number, default: 30 },
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});



const GuardAbsenceDetectionSetting = DetectionSetting.discriminator(
  "guardAbsenceSettings",
  new mongoose.Schema({ settings: GuardAbsenceDetectionSchema }),
);

const ConveyorDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const ConveyorDetectionSetting = DetectionSetting.discriminator(
  "conveyorDetectionSettings",
  new mongoose.Schema({ settings: ConveyorDetectionSchema }),
);

const CrusherDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const CrusherDetectionSetting = DetectionSetting.discriminator(
  "crusherDetectionSettings",
  new mongoose.Schema({ settings: CrusherDetectionSchema }),
);

const WaterSpillageDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const WaterSpillageDetectionSetting = DetectionSetting.discriminator(
  "waterSpillageDetectionSettings",
  new mongoose.Schema({ settings: WaterSpillageDetectionSchema }),
);



const VehicleTypeDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const VehicleTypeDetectionSetting = DetectionSetting.discriminator(
  "vehicleTypeDetectionSettings",
  new mongoose.Schema({ settings: VehicleTypeDetectionSchema }),
);

const LoiteringDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const LoiteringDetectionSetting = DetectionSetting.discriminator(
  "loiteringDetectionSettings",
  new mongoose.Schema({ settings: LoiteringDetectionSchema }),
);


const TableOccupancyDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const TableOccupancyDetectionSetting = DetectionSetting.discriminator(
  "tableOccupancyDetectionSettings",
  new mongoose.Schema({ settings: TableOccupancyDetectionSchema }),
);

const VehicleObstructionDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  obstruction_threshold_sec: { type: Number, default: 0 },
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const VehicleObstructionDetectionSetting = DetectionSetting.discriminator(
  "vehicleObstructionSettings",
  new mongoose.Schema({ settings: VehicleObstructionDetectionSchema }),
);

const FoodServicePPEDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
});

const FoodServicePPEDetectionSetting = DetectionSetting.discriminator(
  "foodServicePPEDetectionSettings",
  new mongoose.Schema({ settings: FoodServicePPEDetectionSchema }),
);


const MobilePhoneDetectionSchema = new mongoose.Schema({
  ...zoneConfigsField,
  imageRequired: {
    type: Boolean,
    default: false,
  },
  videoLinkRequirement: {
    type: Boolean,
    default: false,
  },
  videoMinLength: Number,
  videoMaxLength: Number,
  videoDuration: Number,
  levelOfImportance: {
    type: String,
    enum: ["low", "moderate", "high"],
    default: "moderate",
  },
  alertThreshold: { type: Number, default: 1 },
  videoResolution: [Number],
  referencePoints: Object,
  metricType: {
    type: String,
    enum: ["gauge", "counter", "binary"],
    default: "gauge",
  },
  zone_name: { type: String, default: "default" },
});

const MobilePhoneDetectionSetting = DetectionSetting.discriminator(
  "mobilePhoneDetectionSettings",
  new mongoose.Schema({ settings: MobilePhoneDetectionSchema }),
);

export {
  DetectionSetting,
  CountPersonsDetectionSetting,
  GenericObjectDetectionSetting,
  MotionDetectionSetting,
  CountVehiclesSetting,
  LoiteringWithoutAuthSetting,
  LoiteringWithAuthSetting,
  UnAuthorisedAccessSetting,
  LineCrossingSetting,
  FireSmokeDetectionSetting,
  WeaponDetectionSetting,
  UnattendedBaggageDetectionSetting,
  CrowdDetectionSetting,
  PersonalProtectiveEquipmentSetting,
  DoorDetectionSetting,
  LightDetectionSetting,
  VehiclDetectionSetting,
  DeskAbsenceDetectionSetting,
  GuardAbsenceDetectionSetting,
  ConveyorDetectionSetting,
  CrusherDetectionSetting,
  WaterSpillageDetectionSetting,
  VehicleTypeDetectionSetting,
  LoiteringDetectionSetting,
  VehicleObstructionDetectionSetting,
  TableOccupancyDetectionSetting,
  FoodServicePPEDetectionSetting,
  MobilePhoneDetectionSetting
};
