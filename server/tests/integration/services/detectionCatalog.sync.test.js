/**
 * The shared detection catalog: server publishes its DETECTION_TYPES, the
 * superadmin reads them instead of its own drifting constants copy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { syncDetectionCatalog } = await import(
  "../../../core/v2/detectionCatalog/detectionCatalog.service.js"
);
const { default: DetectionCatalog } = await import(
  "../../../core/v2/detectionCatalog/detectionCatalog.model.js"
);
const { DETECTION_TYPES } = await import("../../../constants/detectionTypes.js");

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => { await clearCollections(); });

describe("syncDetectionCatalog", () => {
  it("publishes every DETECTION_TYPES entry into the shared collection", async () => {
    const result = await syncDetectionCatalog();
    const expected = Object.keys(DETECTION_TYPES);

    expect(result.total).toBe(expected.length);
    expect(result.added).toBe(expected.length);

    const rows = await DetectionCatalog.find({}).lean();
    expect(rows).toHaveLength(expected.length);
    expect(rows.map((r) => r.settingType).sort()).toEqual([...expected].sort());
    expect(rows.every((r) => r.active === true)).toBe(true);
  });

  it("includes the detection that was missing from the superadmin's own list", async () => {
    // The drift this whole mechanism exists to fix.
    await syncDetectionCatalog();
    const row = await DetectionCatalog.findOne({
      settingType: "carModelDetectionSettings",
    }).lean();
    expect(row?.name).toBe("Car Model Detection");
  });

  it("is idempotent — a second run adds nothing and does not duplicate", async () => {
    await syncDetectionCatalog();
    const second = await syncDetectionCatalog();

    expect(second.added).toBe(0);
    expect(second.updated).toBe(second.total);
    expect(await DetectionCatalog.countDocuments({})).toBe(second.total);
  });

  it("deactivates a type that has left the constants instead of deleting it", async () => {
    // An allocation could still reference a retired type, so the row must
    // survive with a resolvable name.
    await DetectionCatalog.create({
      settingType: "retiredDetectionSettings",
      name: "Retired Detection",
    });

    const result = await syncDetectionCatalog();
    expect(result.deactivated).toBe(1);

    const row = await DetectionCatalog.findOne({
      settingType: "retiredDetectionSettings",
    }).lean();
    expect(row).not.toBeNull();
    expect(row.active).toBe(false);
    expect(row.name).toBe("Retired Detection");
  });
});
