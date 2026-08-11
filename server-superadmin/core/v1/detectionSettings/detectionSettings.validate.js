import Joi from "joi";

const thresholdFieldsBySettingType = {
  faceAuth: ["person_threshold"],
  personalProtectiveEquipmentSettings: [
    "person_threshold",
    "vest_threshold",
    "helmet_threshold",
  ],
  foodServicePPEDetection: [
    "person_threshold",
    "emp_floor",
    "glove_floor",
    "apron_floor",
  ],
  crowdDetectionSettings: ["person_threshold"],
  lineCrossingSettings: ["person_threshold"],
  countPersonsSettings: ["person_threshold"],
  zoneIntrusionSettings: ["person_threshold"],
  deskAbsenceDetection: ["person_threshold"],
  tableOccupancySettings: ["person_threshold"],
  loiteringDetectionSettings: ["person_threshold"],
  countVehiclesSettings: ["vehicle_threshold"],
  vehicleObstructionSettings: ["vehicle_threshold"],
  vehicleTypeDetectionSettings: ["vehicle_threshold", "forklift_threshold"],
  numberPlateDetectionSettings: ["plate_confidence", "ocr_min_confidence"],
  mobilePhoneDetectionSettings: ["mobile_phone_confidence"],
  conveyorDetectionSettings: [],
  crusherDetectionSettings: [],
  waterSpillageDetectionSettings: [],
};

const detectorThresholdAliasesBySettingType = {
  faceAuth: ["faceAuth"],
  personalProtectiveEquipmentSettings: ["personalProtectiveEquipmentSettings"],
  foodServicePPEDetection: ["foodServicePPEDetection"],
};

class DetectionSettingsValidation {
  createDetectionSettingsValidation(body) {
    const schema = Joi.object().keys({
      name: Joi.string().required(),
      settingType: Joi.string().required(),
      channelId: Joi.array().required(),
      NVRId: Joi.string().required(),
      enabled: Joi.boolean().required(),
      settings: Joi.object().required(),
      alerts: Joi.array().default([]) // comment later
    });
    const result = schema.validate(body);
    return result;
  }

  extractModelThresholds(settingType, modelThresholds = {}) {
    const fields = thresholdFieldsBySettingType[settingType] || [];
    const detectorKeys = [
      settingType,
      ...(detectorThresholdAliasesBySettingType[settingType] || []),
    ];

    return detectorKeys.reduce((thresholds, detectorKey) => {
      const detectorThresholds = modelThresholds?.[detectorKey];
      if (!detectorThresholds || typeof detectorThresholds !== "object") {
        return thresholds;
      }

      fields.forEach((field) => {
        const value = detectorThresholds[field];
        if (
          typeof value === "number" &&
          !Number.isNaN(value) &&
          value >= 0 &&
          value <= 1
        ) {
          thresholds[field] = value;
        }
      });

      return thresholds;
    }, {});
  }
}
export default new DetectionSettingsValidation();
