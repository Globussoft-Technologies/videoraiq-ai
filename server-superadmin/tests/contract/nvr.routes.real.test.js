/**
 * Real vertical Supertest contract for `/api/v1/nvr` — mounts the real router
 * on a fresh Express app and exercises the actual controller + service +
 * Mongo. Targets `nvr.controller.js` (0% covered) and a slice of
 * `nvr.service.js` for read/list/locations/delete paths.
 *
 * The NVR routes use only permissionMiddleware (no verifyToken), so the
 * fixture middleware below attaches req.verified directly. We mock the
 * delete.service so deleteNvr / deleteAllNvrs don't reach axios/redis.
 *
 * Mocks:
 *   1. middlewares/permissionMiddleware.js — wave all CRUD verbs through
 *   2. services/delete.service.js          — stub deleteNVR
 *
 * Total: 2 mocks. Service, model hooks, Joi validation, and Mongo run real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

vi.mock("../../services/delete.service.js", () => ({
  default: {
    deleteNVR: vi.fn().mockResolvedValue(true),
    deleteChannel: vi.fn().mockResolvedValue(true),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: nvrRoutes } = await import(
  "../../core/v1/NVR/nvr.routes.js"
);
const { default: NVR } = await import("../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");

const USER_ID = "nvr-real-user-1";

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
    user_id: USER_ID,
    login: "nvr-real",
    email: "nvr-real@test.com",
  });
  app = buildApp((a) => {
    a.use("/api/v1/nvr", (req, _res, next) => {
      req.verified = {
        state: true,
        userData: {
          user_id: USER_ID,
          adminId: admin._id,
          memberId: undefined,
        },
        authorizedChannel: null,
      };
      next();
    });
    a.use("/api/v1/nvr", nvrRoutes);
  });
});

const inner = (res) => res.body?.body ?? res.body;

const seedNvr = (overrides = {}) =>
  NVR.create({
    userId: USER_ID,
    nvrName: "n1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "lnvr-1",
    ...overrides,
  });

// ----------------------------------------------------------------------------
// GET /all-nvrs  →  allNvrs
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr/all-nvrs (real vertical)", () => {
  it("returns all NVRs (just _id) with total", async () => {
    await seedNvr();
    await seedNvr({ nvrName: "n2", localNvrId: "lnvr-2", location: "Lab" });
    const res = await request(app).get("/api/v1/nvr/all-nvrs");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.total).toBe(2);
    expect(body.data.nvrs).toHaveLength(2);
  });

  it("returns total 0 when no NVRs exist", async () => {
    const res = await request(app).get("/api/v1/nvr/all-nvrs");
    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// GET /locations  →  getNVRLocations
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr/locations (real vertical)", () => {
  it("returns distinct locations for the user", async () => {
    await seedNvr({ location: "HQ" });
    await seedNvr({ nvrName: "n2", localNvrId: "lnvr-2", location: "Lab" });
    await seedNvr({ nvrName: "n3", localNvrId: "lnvr-3", location: "HQ" });
    const res = await request(app).get("/api/v1/nvr/locations");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(new Set(body.data.locations)).toEqual(new Set(["HQ", "Lab"]));
  });

  it("fails when user_id is missing", async () => {
    // override the fixture middleware to drop user_id
    app = buildApp((a) => {
      a.use("/api/v1/nvr", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: { adminId: admin._id },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/nvr", nvrRoutes);
    });
    const res = await request(app).get("/api/v1/nvr/locations");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /  →  getAllNvrs (paginated, admin user lookup)
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr (real vertical)", () => {
  it("returns paginated NVRs with total", async () => {
    await seedNvr();
    await seedNvr({ nvrName: "n2", localNvrId: "lnvr-2" });
    await seedNvr({ nvrName: "n3", localNvrId: "lnvr-3" });
    const res = await request(app).get("/api/v1/nvr?skip=0&limit=2");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.total).toBe(3);
    expect(body.data.nvrs).toHaveLength(2);
  });

  it("fails when admin does not exist for adminId", async () => {
    // adminId in middleware points to a non-existent admin so user_id lookup
    // returns undefined.
    app = buildApp((a) => {
      a.use("/api/v1/nvr", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: undefined,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/nvr", nvrRoutes);
    });
    const res = await request(app).get("/api/v1/nvr");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /:id  →  getNvrById
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr/:id (real vertical)", () => {
  it("returns an NVR by its id", async () => {
    const doc = await seedNvr();
    const res = await request(app).get(`/api/v1/nvr/${doc._id.toString()}`);
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.nvr._id).toBe(doc._id.toString());
  });

  it("fails when NVR id does not exist", async () => {
    const res = await request(app).get(
      `/api/v1/nvr/${new mongoose.Types.ObjectId().toString()}`,
    );
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// DELETE /:id  →  deleteNvr
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/nvr/:id (real vertical)", () => {
  it("deletes an NVR by its localNvrId (APP_ENV=local)", async () => {
    await seedNvr({ localNvrId: "to-del-1" });
    const res = await request(app).delete("/api/v1/nvr/to-del-1");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
  });

  it("fails when localNvrId is unknown", async () => {
    const res = await request(app).delete("/api/v1/nvr/never-existed");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /delete-all  →  deleteAllNvrs
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr/delete-all (real vertical)", () => {
  it("fails when no NVRs exist for the user", async () => {
    const res = await request(app).get("/api/v1/nvr/delete-all");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("returns success when NVRs exist (mocked DeleteService)", async () => {
    await seedNvr();
    await seedNvr({ nvrName: "n2", localNvrId: "lnvr-2" });
    const res = await request(app).get("/api/v1/nvr/delete-all");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
  });
});

// ----------------------------------------------------------------------------
// GET /with-channels  →  getNVRsWithChannels (settingType missing branch)
// ----------------------------------------------------------------------------
describe("GET /api/v1/nvr/with-channels (real vertical)", () => {
  it("fails when settingType is missing for admin user", async () => {
    const res = await request(app).get("/api/v1/nvr/with-channels");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("returns NVRs (without channels) when settingType is provided", async () => {
    await seedNvr();
    const res = await request(app).get(
      "/api/v1/nvr/with-channels?settingType=motionDetectionSettings",
    );
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.nvrs).toHaveLength(1);
    expect(body.data.nvrs[0].channels).toEqual([]);
  });
});
