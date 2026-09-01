/**
 * v2 DetectionSettingsService.getDetectionTypes — the `?search=` query param.
 *
 * The Applied Types popover on /detection-settings drives its type search off
 * this endpoint, so the matching has to happen here rather than in the client.
 * Matching is case-insensitive and covers the settingType key as well as the
 * display name, because the two frequently share no words at all
 * (vehicleDetectionSettings is labelled "ANPR Detection").
 *
 * The licence filter still applies first: search can only ever narrow what
 * getAllowedDetectionTypes already permitted, never widen it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);

const LICENSED = [
  "carModelDetectionSettings", // "Car Model Detection"
  "vehicleDetectionSettings", // "ANPR Detection"        <- key/label mismatch
  "countVehiclesSettings", // "Count Vehicles Detection"
  "crowdDetectionSettings", // "Crowd Detection"
  "personalProtectiveEquipmentSettings", // "Personal Protective Equipment Detection"
];

let adminId;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  const admin = await Admin.create({
    user_id: "u1",
    login: "u1",
    email: "u1@test.com",
    purchasedCameras: 10,
  });
  adminId = admin._id;
  await DetectionAllocation.insertMany(
    LICENSED.map((settingType) => ({
      adminId: admin._id,
      settingType,
      enabled: true,
      cameraAllocation: 10,
    })),
  );
});

const fetchTypes = async (query) => {
  const { req, res, next } = serviceCtx({
    adminId,
    user_id: "u1",
    query,
  });
  await DetectionSettingsService.getDetectionTypes(req, res, next);
  expect(res.statusCode).toBe(200);
  return payload(res).data.detectionTypes;
};

describe("v2 getDetectionTypes ?search=", () => {
  it("returns the full licensed catalogue when no search is given", async () => {
    const types = await fetchTypes({});
    expect(Object.keys(types).sort()).toEqual([...LICENSED].sort());
  });

  it("matches on the display name", async () => {
    const types = await fetchTypes({ search: "crowd" });
    expect(Object.keys(types)).toEqual(["crowdDetectionSettings"]);
  });

  it("matches on the settingType key when the label shares no words", async () => {
    // "vehicle" appears in vehicleDetectionSettings' KEY only — its label is
    // "ANPR Detection". A label-only search would miss it entirely.
    const types = await fetchTypes({ search: "vehicle" });
    expect(Object.keys(types).sort()).toEqual(
      ["countVehiclesSettings", "vehicleDetectionSettings"].sort(),
    );
    expect(types.vehicleDetectionSettings).toBe("ANPR Detection");
  });

  it("is case-insensitive and ignores surrounding whitespace", async () => {
    for (const search of ["car", "CAR", "Car", "  car  "]) {
      expect(Object.keys(await fetchTypes({ search }))).toEqual([
        "carModelDetectionSettings",
      ]);
    }
  });

  it("returns an empty object when nothing matches", async () => {
    expect(await fetchTypes({ search: "zzzznope" })).toEqual({});
  });

  it("treats an all-whitespace search as no search", async () => {
    const types = await fetchTypes({ search: "   " });
    expect(Object.keys(types).sort()).toEqual([...LICENSED].sort());
  });

  it("never widens past the licence — an unlicensed type stays hidden", async () => {
    // "Intrusion Detection" (unauthorizedAccessSettings) exists in
    // DETECTION_TYPES but was never allocated to this tenant above.
    expect(await fetchTypes({ search: "intrusion" })).toEqual({});
  });

  it("tolerates a non-string search without throwing", async () => {
    // Express gives arrays for repeated params (?search=a&search=b).
    const types = await fetchTypes({ search: ["car", "crowd"] });
    expect(types).toEqual({});
  });
});
