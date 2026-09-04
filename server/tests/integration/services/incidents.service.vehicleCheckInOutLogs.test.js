/**
 * Vehicle Check-In / Check-Out logs.
 *
 * This page is not a flat incident list: a row is a vehicle, shown at its first
 * check-in, and custody is derived by pairing that vehicle's crossings. The
 * cases below pin the derivation, because "checked in and never checked out"
 * and "checked in, out, and back in again" both mean the car is on site while
 * looking very different in the raw events.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn() }));

const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { VehicleCheckInOutIncident } = await import(
  "../../../core/v2/incidents/incidents.model.js"
);

const USER_ID = "777";
const NVR_ID = new mongoose.Types.ObjectId();
const CHANNEL_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  // $lookup reads collections, not models, so the join targets go in raw --
  // building a schema-valid NVR would mean a dozen required fields this suite
  // never looks at.
  await mongoose.connection
    .collection("nvrs")
    .insertOne({ _id: NVR_ID, nvrName: "Pride Honda" });
  await mongoose.connection
    .collection("channels")
    .insertOne({ _id: CHANNEL_ID, name: "gate cam", customName: "outside view cam" });
});

/** One crossing. `at` is an hour offset within a single day. */
const crossing = (vehicleNumber, checkin, at, over = {}) =>
  VehicleCheckInOutIncident.create({
    userId: USER_ID,
    nvrId: NVR_ID,
    channelId: CHANNEL_ID,
    incidentType: "vehicleCheckInOut",
    incidentName: checkin ? "Vehicle Check-In" : "Vehicle Check-Out",
    timeOfIncident: new Date(`2026-09-04T${String(at).padStart(2, "0")}:00:00.000Z`),
    severity: "moderate",
    checkin,
    vehicleNumber,
    ...over,
  });

const list = async (query = {}) => {
  const { req, res, next } = serviceCtx({
    user_id: USER_ID,
    query: { limit: 50, ...query },
  });
  await IncidentsService.getVehicleCheckInOutLogs(req, res, next);
  return payload(res).data;
};

const history = async (vehicleKey) => {
  const { req, res, next } = serviceCtx({
    user_id: USER_ID,
    query: { vehicleKey },
  });
  await IncidentsService.getVehicleCheckInOutHistory(req, res, next);
  return payload(res).data;
};

const byPlate = (rows, plate) =>
  rows.find((r) => String(r.vehicleNumber).toUpperCase() === plate);

describe("vehicle check-in/out logs — grouping", () => {
  it("shows one row per vehicle, not one per crossing", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 17);
    await crossing("MH12AB1234", true, 19);

    const { data } = await list();
    expect(data).toHaveLength(1);
    expect(data[0].totalEvents).toBe(3);
  });

  it("shows the vehicle at its first check-in", async () => {
    await crossing("MH12AB1234", true, 9, { model_name: "Swift" });
    await crossing("MH12AB1234", false, 17, { model_name: "Swift" });

    const { data } = await list();
    // 09:00 is the first check-in; the row must not be the 17:00 check-out.
    expect(new Date(data[0].timeOfIncident).getUTCHours()).toBe(9);
    expect(data[0].checkin).toBe(true);
  });

  it("counts check-ins and check-outs separately", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 12);
    await crossing("MH12AB1234", true, 14);

    const [row] = (await list()).data;
    expect(row.checkInCount).toBe(2);
    expect(row.checkOutCount).toBe(1);
  });

  it("groups the same plate regardless of case or padding", async () => {
    await crossing("mh12ab1234", true, 9);
    await crossing("  MH12AB1234  ", false, 17);

    const { data } = await list();
    expect(data).toHaveLength(1);
    expect(data[0].totalEvents).toBe(2);
  });

  // Two cars the OCR failed on are not the same car, so they must not collapse
  // into one phantom vehicle with a nonsense custody state.
  it("keeps unreadable plates as separate vehicles", async () => {
    await crossing("--", true, 9);
    await crossing("", true, 10);
    await crossing(null, true, 11);

    const { data } = await list();
    expect(data).toHaveLength(3);
    expect(data.every((r) => r.vehicleKey.startsWith("__unknown__:"))).toBe(true);
  });
});

describe("vehicle check-in/out logs — custody", () => {
  it("is in custody when checked in and never checked out", async () => {
    await crossing("MH12AB1234", true, 9);

    const [row] = (await list()).data;
    expect(row.custody).toBe(true);
  });

  it("is not in custody once checked back out", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 17);

    const [row] = (await list()).data;
    expect(row.custody).toBe(false);
  });

  // A return visit: out, then back in. The car is on site again, so the pairing
  // has to compare the latest of each rather than just "has a check-out".
  it("is in custody again after a later re-entry", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 12);
    await crossing("MH12AB1234", true, 15);

    const [row] = (await list()).data;
    expect(row.custody).toBe(true);
  });

  it("is not in custody with a check-out but no check-in", async () => {
    await crossing("MH12AB1234", false, 17);

    const [row] = (await list()).data;
    expect(row.custody).toBe(false);
  });

  it("filters to vehicles in custody", async () => {
    await crossing("IN0001", true, 9);
    await crossing("OUT0001", true, 9);
    await crossing("OUT0001", false, 17);

    const { data, totalCount } = await list({ custody: "true" });
    expect(totalCount).toBe(1);
    expect(data[0].vehicleNumber).toBe("IN0001");
  });

  it("filters to vehicles no longer in custody", async () => {
    await crossing("IN0001", true, 9);
    await crossing("OUT0001", true, 9);
    await crossing("OUT0001", false, 17);

    const { data, totalCount } = await list({ custody: "false" });
    expect(totalCount).toBe(1);
    expect(data[0].vehicleNumber).toBe("OUT0001");
  });

  it("returns both when no custody filter is given", async () => {
    await crossing("IN0001", true, 9);
    await crossing("OUT0001", true, 9);
    await crossing("OUT0001", false, 17);

    expect((await list()).totalCount).toBe(2);
  });
});

describe("vehicle check-in/out logs — paging and search", () => {
  // totalCount is computed over the grouped set, so it must count vehicles.
  // Counting incidents would make the pager promise pages that do not exist.
  it("counts vehicles, not crossings", async () => {
    await crossing("AAA", true, 9);
    await crossing("AAA", false, 10);
    await crossing("BBB", true, 11);

    expect((await list()).totalCount).toBe(2);
  });

  it("pages over vehicles without repeating one", async () => {
    await crossing("AAA", true, 9);
    await crossing("BBB", true, 10);
    await crossing("CCC", true, 11);

    const first = await list({ skip: 0, limit: 2 });
    const second = await list({ skip: 2, limit: 2 });

    expect(first.totalCount).toBe(3);
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);
    const keys = [...first.data, ...second.data].map((r) => r.vehicleKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("searches by plate and by model", async () => {
    await crossing("MH12AB1234", true, 9, { model_name: "Swift" });
    await crossing("KA05XY9999", true, 10, { model_name: "City" });

    expect((await list({ search: "mh12" })).totalCount).toBe(1);
    expect((await list({ search: "city" })).totalCount).toBe(1);
  });
});

describe("vehicle check-in/out logs — includeHistory (export path)", () => {
  it("returns each vehicle crossings inline", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 17);
    await crossing("KA05XY9999", true, 10);

    const { data } = await list({ includeHistory: "true" });
    const row = byPlate(data, "MH12AB1234");
    expect(row.crossings).toHaveLength(2);
    // Ascending within the vehicle, so an export reads as a timeline.
    expect(row.crossings.map((c) => c.checkin)).toEqual([true, false]);
    expect(byPlate(data, "KA05XY9999").crossings).toHaveLength(1);
  });

  // The join moves ahead of the $group on this path precisely so each crossing
  // keeps its own camera rather than inheriting the parent row's.
  it("gives every crossing its own camera name", async () => {
    await crossing("MH12AB1234", true, 9);
    const [row] = (await list({ includeHistory: "true" })).data;
    expect(row.crossings[0].channelData.customName).toBe("outside view cam");
    expect(row.crossings[0].nvrData.nvrName).toBe("Pride Honda");
  });

  it("omits crossings when not asked for", async () => {
    await crossing("MH12AB1234", true, 9);
    const [row] = (await list()).data;
    expect(row.crossings).toBeUndefined();
  });

  it("still honours the custody filter", async () => {
    await crossing("IN0001", true, 9);
    await crossing("OUT0001", true, 9);
    await crossing("OUT0001", false, 17);

    const { data, totalCount } = await list({ includeHistory: "true", custody: "true" });
    expect(totalCount).toBe(1);
    expect(data[0].vehicleNumber).toBe("IN0001");
    expect(data[0].crossings).toHaveLength(1);
  });

  it("still honours the search filter", async () => {
    await crossing("MH12AB1234", true, 9, { model_name: "Swift" });
    await crossing("KA05XY9999", true, 10, { model_name: "City" });

    const { totalCount } = await list({ includeHistory: "true", search: "swift" });
    expect(totalCount).toBe(1);
  });
});

describe("vehicle check-in/out history", () => {
  it("returns every crossing for one vehicle, newest first", async () => {
    await crossing("MH12AB1234", true, 9);
    await crossing("MH12AB1234", false, 17);
    await crossing("KA05XY9999", true, 10);

    const { data, totalCount } = await history("MH12AB1234");
    expect(totalCount).toBe(2);
    expect(data.map((r) => r.checkin)).toEqual([false, true]);
  });

  it("matches the plate case-insensitively", async () => {
    await crossing("mh12ab1234", true, 9);
    expect((await history("MH12AB1234")).totalCount).toBe(1);
  });

  // The whole reason the list returns a key rather than a plate.
  it("expands an unreadable-plate row to only its own event", async () => {
    await crossing("--", true, 9);
    await crossing("--", true, 10);

    const { data } = await list();
    const { totalCount } = await history(data[0].vehicleKey);
    expect(totalCount).toBe(1);
  });

  it("rejects a missing vehicleKey", async () => {
    const { req, res, next } = serviceCtx({ user_id: USER_ID, query: {} });
    await IncidentsService.getVehicleCheckInOutHistory(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});
