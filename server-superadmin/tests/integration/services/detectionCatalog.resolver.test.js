/**
 * The superadmin reads the shared detection catalog that the client backend
 * publishes, instead of its own DETECTION_TYPES2 copy — which had drifted and
 * was hiding Car Model Detection from every screen that lists detections.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { resolveDetectionTypes } = await import(
  "../../../core/v1/detectionCatalog/detectionTypes.resolver.js"
);
const { default: DetectionCatalog } = await import(
  "../../../core/v1/detectionCatalog/detectionCatalog.model.js"
);
const { DETECTION_TYPES2 } = await import("../../../constants/detectionTypes.js");

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => { await clearCollections(); });

describe("resolveDetectionTypes", () => {
  it("offers only the canonical emotion setting key when an older publisher still lists the legacy key", async () => {
    await DetectionCatalog.create({ settingType: "emotionDetection", name: "Emotion Detection", active: true });
    const result = await resolveDetectionTypes();
    expect(result.detections.filter(row => row.name === "Emotion Detection")).toEqual([
      expect.objectContaining({ settingType: "emotionDetectionSettings" }),
    ]);
  });
  it("uses the published catalog when the client backend has synced", async () => {
    await DetectionCatalog.insertMany([
      { settingType: "crowdDetectionSettings", name: "Crowd Detection" },
      { settingType: "carModelDetectionSettings", name: "Car Model Detection" },
      { settingType: "emotionDetectionSettings", name: "Emotion Detection", dsSupported: true },
    ]);

    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections.map((d) => d.settingType)).toEqual(expect.arrayContaining([
      "carModelDetectionSettings",
      "crowdDetectionSettings",
      "emotionDetectionSettings",
    ]));
    // The detection this service's own constants never had.
    expect(result.detections.find((d) => d.settingType === "carModelDetectionSettings").name)
      .toBe("Car Model Detection");
  });

  it("ignores rows the client backend has retired", async () => {
    await DetectionCatalog.insertMany([
      { settingType: "crowdDetectionSettings", name: "Crowd Detection", active: true },
      { settingType: "retiredSettings", name: "Retired", active: false },
    ]);

    const result = await resolveDetectionTypes();
    expect(result.detections.map((d) => d.settingType)).toEqual(expect.arrayContaining([
      "crowdDetectionSettings", "emotionDetectionSettings",
    ]));
    expect(result.detections.some(d => d.settingType === "retiredSettings")).toBe(false);
  });

  it("includes emotion detection when an older published catalog is missing it", async () => {
    await DetectionCatalog.create({ settingType: "crowdDetectionSettings", name: "Crowd Detection" });

    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections.find((d) => d.settingType === "emotionDetectionSettings"))
      .toMatchObject({ name: "Emotion Detection", dsSupported: null });
    expect(result.detections.find((d) => d.settingType === "emotionDetectionSettings").description)
      .not.toBe("");
  });

  it.each([true, false, null])("preserves published emotion metadata and support=%s without duplicates", async (dsSupported) => {
    await DetectionCatalog.create({
      settingType: "emotionDetectionSettings", name: "Published Emotion Detection",
      description: "Published description", dsSupported,
    });

    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections.filter(d => d.settingType === "emotionDetectionSettings")).toEqual([{
      settingType: "emotionDetectionSettings", name: "Published Emotion Detection",
      description: "Published description", dsSupported,
    }]);
  });

  it("keeps supported detections visible when an older publisher deactivates them", async () => {
    await DetectionCatalog.create({
      settingType: "genderAgeDetectionSettings", name: "Gender & Age Detection", active: false,
    });

    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections).toContainEqual(expect.objectContaining({ settingType: "genderAgeDetectionSettings", name: "Gender & Age Detection" }));
    expect(new Set(result.detections.map(d => d.settingType)).size).toBe(result.detections.length);
  });

  it("falls back to the local list, flagged stale, before the first publish", async () => {
    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections).toHaveLength(Object.keys(DETECTION_TYPES2).length);
    expect(result.detections.some((d) => d.settingType === "emotionDetectionSettings")).toBe(true);
    // The fallback keeps the screens working — it is just possibly out of date,
    // which is exactly what `stale` reports.
    expect(result.detections.some((d) => d.settingType === "carModelDetectionSettings"))
      .toBe(false);
  });
});
