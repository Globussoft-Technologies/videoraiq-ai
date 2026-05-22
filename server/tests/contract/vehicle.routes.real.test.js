/**
 * Real vertical Supertest contract for /api/v1/vehicle — exercises the actual
 * controller + service + Mongo persistence for the `getVehicles` and
 * `getVehicleEntries` endpoints, which together are the read surface of the
 * vehicle vertical.
 *
 * The `log` endpoint funnels through mailHelper / sendPayloadToUser /
 * JobsService side-effects (already covered by vehicle.service.log + the
 * existing vehicle.service.test) — kept out of this real-vertical to stay
 * inside the 8-mock ceiling.
 *
 * Mocks: 2 — verifyToken + permissionMiddleware.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    req.verified = {
      state: true,
      userData: {
        adminId: globalThis.__TEST_ADMIN_ID__,
        user_id: 99,
        memberId: undefined,
      },
      authorizedChannel: null,
      permissionConfig: [{ permissionConfig: {} }],
    };
    next();
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: vehicleRoutes } = await import(
  "../../core/v1/vehicle/vehicle.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Vehicle } = await import(
  "../../core/v1/vehicle/vehicle.model.js"
);
const { default: VehicleLog } = await import(
  "../../core/v1/vehicle/vehicle.log.model.js"
);

let app;
let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "611",
    login: "vehicle-real",
    email: "vehiclereal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/vehicle", vehicleRoutes));
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

describe("GET /api/v1/vehicle/vehicles (real vertical)", () => {
  it("returns all vehicles sorted by vehicleNumber when no search is provided", async () => {
    await Vehicle.create([
      { vehicleNumber: "ZZ-9999" },
      { vehicleNumber: "AA-1111" },
      { vehicleNumber: "MM-5555" },
    ]);
    const res = await request(app).get("/api/v1/vehicle/vehicles");
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data?.vehicles).toHaveLength(3);
    // Sorted ascending.
    expect(data.vehicles[0].vehicleNumber).toBe("AA-1111");
    expect(data.vehicles[2].vehicleNumber).toBe("ZZ-9999");
  });

  it("filters by case-insensitive substring search", async () => {
    await Vehicle.create([
      { vehicleNumber: "MH-01-AB-1234" },
      { vehicleNumber: "DL-02-XY-9999" },
    ]);
    const res = await request(app)
      .get("/api/v1/vehicle/vehicles")
      .query({ search: "mh-01" });
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0].vehicleNumber).toBe("MH-01-AB-1234");
  });

  it("returns an empty list when search has no matches", async () => {
    await Vehicle.create({ vehicleNumber: "MH-01-AB-1234" });
    const res = await request(app)
      .get("/api/v1/vehicle/vehicles")
      .query({ search: "no-such" });
    expect(res.status).toBe(200);
    expect(inner(res).data.vehicles).toHaveLength(0);
  });
});

describe("GET /api/v1/vehicle/vehicle/:vehicleId (real vertical)", () => {
  it("400 when the vehicleId is not a valid ObjectId", async () => {
    const res = await request(app).get("/api/v1/vehicle/vehicle/not-an-id");
    expect(res.status).toBe(400);
  });

  it("returns an empty list when the vehicle has no logs", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "NO-LOGS-1" });
    const res = await request(app).get(
      `/api/v1/vehicle/vehicle/${vehicle._id}`,
    );
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data?.entries).toEqual([]);
  });

  it("returns the existing log entries for the vehicle", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "HAS-LOGS-1" });
    // Insert directly through the collection — the subdoc `images` validator
    // requires a `.vehicle` string, which we don't care about for this test.
    await VehicleLog.collection.insertOne({
      adminId: admin._id,
      vehicleId: vehicle._id,
      events: [
        {
          timestamp: new Date(),
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await request(app).get(
      `/api/v1/vehicle/vehicle/${vehicle._id}`,
    );
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data?.entries).toHaveLength(1);
  });

  it("filters log entries by startDate range", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "FILTER-RANGE" });
    // Within range — direct insert to control createdAt.
    const inRangeId = new mongoose.Types.ObjectId();
    await VehicleLog.collection.insertOne({
      _id: inRangeId,
      adminId: admin._id,
      vehicleId: vehicle._id,
      events: [],
      createdAt: new Date("2024-06-15T10:00:00Z"),
      updatedAt: new Date("2024-06-15T10:00:00Z"),
    });
    const olderId = new mongoose.Types.ObjectId();
    await VehicleLog.collection.insertOne({
      _id: olderId,
      adminId: admin._id,
      vehicleId: vehicle._id,
      events: [],
      createdAt: new Date("2020-01-01"),
      updatedAt: new Date("2020-01-01"),
    });

    const res = await request(app)
      .get(`/api/v1/vehicle/vehicle/${vehicle._id}`)
      .query({ startDate: "2024-01-01", endDate: "2024-12-31" });
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data?.entries.length).toBe(1);
    expect(data.entries[0]._id).toBe(inRangeId.toString());
  });

  it("startDate only (no endDate) still narrows the result", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "START-ONLY" });
    const newerId = new mongoose.Types.ObjectId();
    const olderId = new mongoose.Types.ObjectId();
    await VehicleLog.collection.insertMany([
      {
        _id: newerId,
        adminId: admin._id,
        vehicleId: vehicle._id,
        events: [],
        createdAt: new Date("2024-06-01"),
        updatedAt: new Date("2024-06-01"),
      },
      {
        _id: olderId,
        adminId: admin._id,
        vehicleId: vehicle._id,
        events: [],
        createdAt: new Date("2020-01-01"),
        updatedAt: new Date("2020-01-01"),
      },
    ]);
    const res = await request(app)
      .get(`/api/v1/vehicle/vehicle/${vehicle._id}`)
      .query({ startDate: "2024-01-01" });
    expect(res.status).toBe(200);
    const ids = inner(res).data.entries.map((e) => e._id);
    expect(ids).toContain(newerId.toString());
    expect(ids).not.toContain(olderId.toString());
  });

  it("endDate only narrows the result", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "END-ONLY" });
    const olderId = new mongoose.Types.ObjectId();
    const newerId = new mongoose.Types.ObjectId();
    await VehicleLog.collection.insertMany([
      {
        _id: olderId,
        adminId: admin._id,
        vehicleId: vehicle._id,
        events: [],
        createdAt: new Date("2020-01-01"),
        updatedAt: new Date("2020-01-01"),
      },
      {
        _id: newerId,
        adminId: admin._id,
        vehicleId: vehicle._id,
        events: [],
        createdAt: new Date("2024-06-01"),
        updatedAt: new Date("2024-06-01"),
      },
    ]);
    const res = await request(app)
      .get(`/api/v1/vehicle/vehicle/${vehicle._id}`)
      .query({ endDate: "2022-01-01" });
    expect(res.status).toBe(200);
    const ids = inner(res).data.entries.map((e) => e._id);
    expect(ids).toContain(olderId.toString());
    expect(ids).not.toContain(newerId.toString());
  });
});
