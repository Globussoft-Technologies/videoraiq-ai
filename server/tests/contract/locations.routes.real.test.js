/**
 * Real vertical Supertest contract for /api/v1/locations.
 *
 * Mounts the actual locations router with the real controller + service +
 * validation + Mongo persistence (in-memory). verifyToken and the four
 * permission middlewares are stubbed (same pattern as
 * departments.routes.real.test.js).
 *
 * Response envelope: services use `res.status(N).json(Response.xxx(...))`,
 * so the outer HTTP status is honored AND the body is double-nested
 * `{ statusCode, body: { status, message, ... } }`.
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
import { connectMongo, disconnectMongo, clearCollections } from "../integration/dbSetup.js";

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
const { default: locationsRoutes } = await import(
  "../../core/v1/locations/location.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Locations } = await import(
  "../../core/v1/locations/location.model.js"
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
    user_id: "601",
    login: "loc-real",
    email: "locreal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/locations", locationsRoutes));
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

describe("POST /api/v1/locations/create (real vertical)", () => {
  it("creates a location and persists it", async () => {
    const res = await request(app)
      .post("/api/v1/locations/create")
      .send({ locationName: "HQ" });
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    const all = await Locations.find({});
    expect(all).toHaveLength(1);
    // Service normalizes locationName to lowercase on create.
    expect(all[0].locationName).toBe("hq");
  });

  it("400s when locationName is missing (Joi)", async () => {
    const res = await request(app)
      .post("/api/v1/locations/create")
      .send({});
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("409s on duplicate locationName (case-insensitive)", async () => {
    await Locations.create({ adminId: admin._id, locationName: "HQ" });
    const res = await request(app)
      .post("/api/v1/locations/create")
      .send({ locationName: "hq" });
    expect(res.status).toBe(409);
    expect(inner(res).status).toBe("failed");
  });

  it("409s on duplicate empLocationId", async () => {
    await Locations.create({
      adminId: admin._id,
      locationName: "A",
      empLocationId: "emp-1",
    });
    const res = await request(app)
      .post("/api/v1/locations/create")
      .send({ locationName: "B", empLocationId: "emp-1" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/v1/locations/fetch (real vertical)", () => {
  it("returns paginated locations + totalCount", async () => {
    await Locations.create([
      { adminId: admin._id, locationName: "alpha" },
      { adminId: admin._id, locationName: "beta" },
      { adminId: admin._id, locationName: "gamma" },
    ]);
    const res = await request(app)
      .post("/api/v1/locations/fetch")
      .query({ skip: 0, limit: 2 });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.totalCount).toBe(3);
    expect(inner(res).data.locations).toHaveLength(2);
  });

  it("filters by case-insensitive search", async () => {
    await Locations.create([
      { adminId: admin._id, locationName: "Engineering" },
      { adminId: admin._id, locationName: "Marketing" },
    ]);
    const res = await request(app)
      .post("/api/v1/locations/fetch")
      .query({ search: "eng" });
    expect(res.status).toBe(200);
    expect(inner(res).data.totalCount).toBe(1);
  });
});

describe("POST /api/v1/locations/fetch-by-id (real vertical)", () => {
  it("400s when id query param missing", async () => {
    const res = await request(app).post("/api/v1/locations/fetch-by-id");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("404s when location not found", async () => {
    const res = await request(app)
      .post("/api/v1/locations/fetch-by-id")
      .query({ id: "000000000000000000000000" });
    expect(res.status).toBe(404);
  });

  it("returns the location when found", async () => {
    const loc = await Locations.create({
      adminId: admin._id,
      locationName: "Findable",
    });
    const res = await request(app)
      .post("/api/v1/locations/fetch-by-id")
      .query({ id: loc._id.toString() });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.locationName).toBe("Findable");
  });
});

describe("PUT /api/v1/locations/update (real vertical)", () => {
  it("400s when id query param missing", async () => {
    const res = await request(app)
      .put("/api/v1/locations/update")
      .send({ locationName: "renamed" });
    expect(res.status).toBe(400);
  });

  it("404s when location not found", async () => {
    const res = await request(app)
      .put("/api/v1/locations/update")
      .query({ id: "000000000000000000000000" })
      .send({ locationName: "renamed" });
    expect(res.status).toBe(404);
  });

  it("updates a location successfully", async () => {
    const loc = await Locations.create({
      adminId: admin._id,
      locationName: "old",
    });
    const res = await request(app)
      .put("/api/v1/locations/update")
      .query({ id: loc._id.toString() })
      .send({ locationName: "new" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await Locations.findById(loc._id);
    expect(reloaded.locationName).toBe("new");
  });

  it("409s on duplicate locationName from another row", async () => {
    const a = await Locations.create({
      adminId: admin._id,
      locationName: "alpha",
    });
    await Locations.create({
      adminId: admin._id,
      locationName: "beta",
    });
    const res = await request(app)
      .put("/api/v1/locations/update")
      .query({ id: a._id.toString() })
      .send({ locationName: "beta" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/v1/locations/delete (real vertical)", () => {
  it("400s when id missing", async () => {
    const res = await request(app).delete("/api/v1/locations/delete");
    expect(res.status).toBe(400);
  });

  it("404s when location not found", async () => {
    const res = await request(app)
      .delete("/api/v1/locations/delete")
      .query({ id: "000000000000000000000000" });
    expect(res.status).toBe(404);
  });

  it("deletes the location and creates a 'default' fallback", async () => {
    const loc = await Locations.create({
      adminId: admin._id,
      locationName: "to-delete",
    });
    const res = await request(app)
      .delete("/api/v1/locations/delete")
      .query({ id: loc._id.toString() });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const remaining = await Locations.find({});
    expect(remaining.map((d) => d.locationName)).toContain("default");
  });
});

describe("POST /api/v1/locations/employee-location (real vertical)", () => {
  it("returns empty array when no employees have locations", async () => {
    const res = await request(app).post("/api/v1/locations/employee-location");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.totalCount).toBe(0);
    expect(inner(res).data.locations).toEqual([]);
  });
});
