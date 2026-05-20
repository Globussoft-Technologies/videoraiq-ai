/**
 * Real vertical Supertest contract for /api/v1/shifts.
 *
 * Mounts the actual shifts router with the real controller + service +
 * Joi validation + Mongo persistence (in-memory). Only verifyToken and the
 * four permission middlewares are stubbed (same pattern as
 * departments.routes.real.test.js / locations.routes.real.test.js).
 *
 * Response envelope: ShiftService uses `res.status(N).json(Response.xxx(...))`,
 * so HTTP status is honored AND the body is double-nested
 * `{ statusCode, body: { status, message, data } }`.
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
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

// shifts.routes.js imports verifyToken but never mounts it on a route, so
// req.verified is never set in production for the /api/v1/shifts surface.
// That's tracked as a separate finding — for this test we attach a verified
// admin to every request via an app-level middleware below (see beforeEach).
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

/** Attach req.verified directly since shifts.routes doesn't wire verifyToken. */
function attachVerified(req, _res, next) {
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
}

const { buildApp } = await import("../helpers/app.js");
const { default: shiftsRoutes } = await import(
  "../../core/v1/shifts/shifts.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Shift } = await import(
  "../../core/v1/shifts/shifts.model.js"
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
    user_id: "701",
    login: "shift-real",
    email: "shiftreal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => {
    a.use(attachVerified);
    a.use("/api/v1/shifts", shiftsRoutes);
  });
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

const validShift = (over = {}) => ({
  name: "Morning Shift",
  color: "#ff0000",
  timings: {
    monday: { enabled: false },
    tuesday: { enabled: true, start: "09:00", end: "17:00" },
  },
  ...over,
});

describe("POST /api/v1/shifts/ (real vertical)", () => {
  it("creates a shift and persists it (201)", async () => {
    const res = await request(app).post("/api/v1/shifts/").send(validShift());
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.shift.name).toBe("Morning Shift");
    const all = await Shift.find({});
    expect(all).toHaveLength(1);
    expect(all[0].adminId.toString()).toBe(admin._id.toString());
  });

  it("returns 400 when name is missing (Joi)", async () => {
    const res = await request(app)
      .post("/api/v1/shifts/")
      .send({ color: "#000", timings: {} });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
    expect(Array.isArray(inner(res).error)).toBe(true);
  });

  it("returns 400 when name is too short", async () => {
    const res = await request(app)
      .post("/api/v1/shifts/")
      .send(validShift({ name: "ab" }));
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("returns 400 when timings is missing", async () => {
    const res = await request(app)
      .post("/api/v1/shifts/")
      .send({ name: "Some Name", color: "#000" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/shifts/ (real vertical)", () => {
  it("returns paginated shifts + total", async () => {
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      await Shift.create({ adminId: admin._id, name, color: "#000" });
    }
    const res = await request(app).get("/api/v1/shifts/").query({ skip: 0, limit: 2 });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.total).toBe(3);
    expect(inner(res).data.shifts).toHaveLength(2);
  });

  it("filters shifts by case-insensitive name regex", async () => {
    await Shift.create({ adminId: admin._id, name: "Morning", color: "#000" });
    await Shift.create({ adminId: admin._id, name: "Evening", color: "#000" });
    const res = await request(app).get("/api/v1/shifts/").query({ name: "MORN" });
    expect(res.status).toBe(200);
    expect(inner(res).data.shifts).toHaveLength(1);
    expect(inner(res).data.shifts[0].name).toBe("Morning");
  });

  it("returns an empty list when no shifts exist", async () => {
    const res = await request(app).get("/api/v1/shifts/");
    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(0);
    expect(inner(res).data.shifts).toEqual([]);
  });
});

describe("GET /api/v1/shifts/list (real vertical)", () => {
  it("returns the trimmed { _id, name } list scoped to the admin", async () => {
    await Shift.create({ adminId: admin._id, name: "Mine", color: "#000" });
    // Another admin's shift should not leak.
    await Shift.create({
      adminId: (await Admin.create({
        user_id: "702",
        login: "other",
        email: "other@test.com",
      }))._id,
      name: "Other",
      color: "#000",
    });
    const res = await request(app).get("/api/v1/shifts/list");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.shifts).toHaveLength(1);
    expect(inner(res).data.shifts[0].name).toBe("Mine");
  });
});

describe("GET /api/v1/shifts/:id (real vertical)", () => {
  it("returns the requested shift", async () => {
    const shift = await Shift.create({
      adminId: admin._id,
      name: "Findable",
      color: "#000",
    });
    const res = await request(app).get(`/api/v1/shifts/${shift._id}`);
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.shift._id.toString()).toBe(shift._id.toString());
  });

  it("returns 200 with null when shift does not exist", async () => {
    const res = await request(app).get(
      "/api/v1/shifts/000000000000000000000000",
    );
    expect(res.status).toBe(200);
    expect(inner(res).data.shift).toBeNull();
  });

  it("returns 400 for a malformed id (cast error)", async () => {
    const res = await request(app).get("/api/v1/shifts/not-a-mongo-id");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

describe("PUT /api/v1/shifts/:id (real vertical)", () => {
  it("updates an existing shift", async () => {
    const shift = await Shift.create({
      adminId: admin._id,
      name: "OldName",
      color: "#000",
    });
    const res = await request(app)
      .put(`/api/v1/shifts/${shift._id}`)
      .send({ name: "NewName" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.shift.name).toBe("NewName");
    const reloaded = await Shift.findById(shift._id);
    expect(reloaded.name).toBe("NewName");
  });

  it("returns 400 when the shift does not exist", async () => {
    const res = await request(app)
      .put("/api/v1/shifts/000000000000000000000000")
      .send({ name: "Whatever" });
    expect(res.status).toBe(400);
    expect(inner(res).message).toMatch(/not found/i);
  });

  it("returns 400 for an invalid update body (Joi)", async () => {
    const shift = await Shift.create({
      adminId: admin._id,
      name: "Old",
      color: "#000",
    });
    const res = await request(app)
      .put(`/api/v1/shifts/${shift._id}`)
      .send({ name: "ab" }); // below min length
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

describe("DELETE /api/v1/shifts/:id (real vertical)", () => {
  it("deletes the shift", async () => {
    const shift = await Shift.create({
      adminId: admin._id,
      name: "Doomed",
      color: "#000",
    });
    const res = await request(app).delete(`/api/v1/shifts/${shift._id}`);
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    expect(await Shift.countDocuments()).toBe(0);
  });

  it("returns 400 for a malformed id (cast error)", async () => {
    const res = await request(app).delete("/api/v1/shifts/not-an-id");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});
