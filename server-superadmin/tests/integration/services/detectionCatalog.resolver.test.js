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
  it("uses the published catalog when the client backend has synced", async () => {
    await DetectionCatalog.insertMany([
      { settingType: "crowdDetectionSettings", name: "Crowd Detection" },
      { settingType: "carModelDetectionSettings", name: "Car Model Detection" },
    ]);

    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(false);
    expect(result.detections.map((d) => d.settingType).sort()).toEqual([
      "carModelDetectionSettings",
      "crowdDetectionSettings",
    ]);
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
    expect(result.detections.map((d) => d.settingType)).toEqual(["crowdDetectionSettings"]);
  });

  it("falls back to the local list, flagged stale, before the first publish", async () => {
    const result = await resolveDetectionTypes();

    expect(result.stale).toBe(true);
    expect(result.detections).toHaveLength(Object.keys(DETECTION_TYPES2).length);
    // The fallback keeps the screens working — it is just possibly out of date,
    // which is exactly what `stale` reports.
    expect(result.detections.some((d) => d.settingType === "carModelDetectionSettings"))
      .toBe(false);
  });
});
