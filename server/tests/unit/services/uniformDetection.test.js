import { describe, expect, it } from "vitest";
import { buildUniformDetector, normalizeUniformIncident } from "../../../services/uniformDetection.js";
import validation from "../../../core/v2/detectionSettings/detectionSettings.validate.js";
import validationV1 from "../../../core/v1/detectionSettings/detectionSettings.validate.js";
import { UniformDetectionSetting } from "../../../core/v2/detectionSettings/detectionSettings.model.js";
import { UniformDetectionIncident } from "../../../core/v2/incidents/incidents.model.js";
import { DETECTION_LOG_METADATA, dsLogicNamesFor, uniformDetectionSettings } from "../../../constants/detectionTypes.js";

const normalized = [[0.12, 0.30], [0.78, 0.30], [0.78, 0.95], [0.12, 0.95]];
const pixels = [[120, 300], [780, 300], [780, 950], [120, 950]];
const configs = [{ name: "Main Gate", telegramChatIds: ["private"] }, { name: "Back Gate" }];

describe("Uniform Detection contract", () => {
  it("matches DS's detector payload and retains every polygon and its name", () => {
    expect(buildUniformDetector([normalized, normalized], configs, "moderate")).toEqual({
      name: "uniformDetectionSettings", zones: [normalized, normalized],
      zone_configs: [{ name: "Main Gate" }, { name: "Back Gate" }],
      person_threshold: 0.45, uniform_confidence: 0.60, severity: "moderate",
    });
  });
  it("normalizes editor pixel coordinates without mutating stored polygons", () => {
    const zones = [pixels, pixels];
    expect(buildUniformDetector(zones, configs, "high", { person_threshold: 0, uniform_confidence: 1 }, [1000, 1000]))
      .toMatchObject({ zones: [normalized, normalized], severity: "high", person_threshold: 0, uniform_confidence: 1 });
    expect(zones[0][0]).toEqual([120, 300]);
  });
  it("rejects missing names, mismatched configs, invalid points, confidence and resolution", () => {
    expect(() => buildUniformDetector([normalized], configs)).toThrow(/one named/);
    expect(() => buildUniformDetector([normalized], [{ name: " " }])).toThrow(/names/);
    expect(() => buildUniformDetector([[[0, 0], [1, 0]]], [configs[0]])).toThrow(/three/);
    expect(() => buildUniformDetector([pixels], [configs[0]])).toThrow(/videoResolution/);
    expect(() => buildUniformDetector([pixels], [configs[0]], "high", {}, [100, 100])).toThrow(/inside/);
    expect(() => buildUniformDetector([normalized], [configs[0]], "high", { uniform_confidence: 1.2 })).toThrow(/confidence/);
  });
  it("validates the public create example and confidence controls", () => {
    for (const validator of [validationV1, validation]) {
      expect(validator.validateUniformSettings("uniformDetectionSettings", uniformDetectionSettings.settings, true).error).toBeNull();
      expect(validator.validateUniformSettings("uniformDetectionSettings", {}, true).error).toBeTruthy();
      expect(validator.validateConfidenceThresholds("uniformDetectionSettings", { uniform_confidence: 0.6, person_threshold: 0.45 }).error).toBeNull();
      expect(validator.validateConfidenceThresholds("uniformDetectionSettings", { uniform_confidence: 2 }).error).toBeTruthy();
    }
  });
  it("keeps multiple zones and confidence defaults in the Mongoose setting", () => {
    const doc = new UniformDetectionSetting({ userId: "100", name: "Uniform", enabled: true,
      settings: { referencePoints: { cam: [pixels, pixels] }, zone_configs: configs, videoResolution: [1000, 1000] } });
    expect(doc.settings.referencePoints.cam).toHaveLength(2);
    expect(doc.settings.zone_configs.map(zone => zone.name)).toEqual(["Main Gate", "Back Gate"]);
    expect(doc.settings.person_threshold).toBe(0.45);
    expect(doc.settings.uniform_confidence).toBe(0.60);
    expect(doc.settings.levelOfImportance).toBe("moderate");
  });
  it("accepts time and image incident fields and stores a separate Uniform discriminator", () => {
    const body = { incidentType: "uniform_detection", image: "/snapshot.jpg", incidentTime: "2026-10-29T10:00:00Z" };
    normalizeUniformIncident(body);
    expect(body).toMatchObject({ incidentType: "uniformDetection", Image: "/snapshot.jpg", timeOfIncident: "2026-10-29T10:00:00Z" });
    expect(new UniformDetectionIncident({ ...body, userId: "100" }).Image).toBe("/snapshot.jpg");
    expect(() => normalizeUniformIncident({ incidentType: "uniformDetection", Image: "/snapshot.jpg" })).toThrow(/timeOfIncident/);
    expect(() => normalizeUniformIncident({ incidentType: "uniformDetection", timeOfIncident: body.timeOfIncident })).toThrow(/image/);
  });
  it("uses its own stop logic and log permission rather than a camera-wide revoke", () => {
    expect(dsLogicNamesFor("uniformDetectionSettings")).toEqual(["uniformDetectionSettings"]);
    expect(DETECTION_LOG_METADATA.uniformDetectionSettings).toEqual({ permissionKey: "uniformLogs", logsConfigKey: "uniformLogs" });
  });
});
