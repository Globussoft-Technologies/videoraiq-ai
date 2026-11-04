import { describe, expect, it } from "vitest";
import {
  DETECTION_LOG_METADATA,
  DETECTION_MODES_MAP,
  DS_DETECTOR_BY_MODE,
  INDUSTRIAL_INCIDENT_TYPES,
  INDUSTRIAL_SETTING_TYPES,
  TYPE_MAP,
} from "../../../constants/detectionTypes.js";
import {
  WorkingAtHeightDetectionSetting,
  OilLeakageDetectionSetting,
  GunnyBagsMaterialsWrongLocationDetectionSetting,
  SandDustWasteScrapDisposalDetectionSetting,
  UnauthorizedAnimalEntryDetectionSetting,
  SpillsDirtyMessyAreasDetectionSetting,
  GenderAgeDetectionSetting,
} from "../../../core/v1/detectionSettings/detectionSettings.model.js";

const MODELS = [
  WorkingAtHeightDetectionSetting,
  OilLeakageDetectionSetting,
  GunnyBagsMaterialsWrongLocationDetectionSetting,
  SandDustWasteScrapDisposalDetectionSetting,
  UnauthorizedAnimalEntryDetectionSetting,
  SpillsDirtyMessyAreasDetectionSetting,
  GenderAgeDetectionSetting,
];
const SETTING_TYPES = [
  "workingAtHeightDetectionSettings", "oilLeakageDetectionSettings",
  "gunnyBagsMaterialsWrongLocationDetectionSettings", "sandDustWasteScrapDisposalDetectionSettings",
  "unauthorizedAnimalEntryDetectionSettings", "spillsDirtyMessyAreasDetectionSettings", "genderAgeDetectionSettings",
];

describe("industrial detection registry", () => {
  it("maps every setting type to its incident, toggle mode, DS name and logs permission", () => {
    INDUSTRIAL_SETTING_TYPES.forEach((settingType, index) => {
      expect(TYPE_MAP[settingType]).toBe(INDUSTRIAL_INCIDENT_TYPES[index]);
      expect(DETECTION_MODES_MAP[settingType]).toEqual([settingType]);
      expect(DS_DETECTOR_BY_MODE[settingType]).toBe(settingType);
      expect(DETECTION_LOG_METADATA[settingType]).toBeDefined();
    });
  });

  it("uses separate setting discriminators with the expected defaults", () => {
    MODELS.forEach((Model, index) => {
      const setting = new Model({
        settingType: SETTING_TYPES[index],
        name: "Industrial detector",
        userId: "u1",
        settings: {},
      });

      expect(setting.settingType).toBe(SETTING_TYPES[index]);
      expect(setting.settings.imageRequired).toBe(true);
      expect(setting.settings.alertThreshold).toBe(1);
      expect(setting.settings.detectionTimeGap).toBe(30);
      expect(setting.settings.metricType).toBe("gauge");
    });

    expect(new Set(MODELS.map((Model) => Model.modelName)).size).toBe(MODELS.length);
  });
});
