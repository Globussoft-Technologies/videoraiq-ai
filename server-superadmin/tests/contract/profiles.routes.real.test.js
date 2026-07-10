/**
 * Real vertical Supertest contract for /api/v1/profiles.
 *
 * Mounts the actual profiles router with the real controller + service +
 * Joi validators + Mongo persistence (in-memory). Only the four permission
 * middlewares are stubbed (same pattern as departments.routes.real.test.js).
 *
 * Response envelope: ProfilesService uses `res.status(N).json(Response.xxx(...))`,
 * so HTTP status is honored AND the body is double-nested
 * `{ statusCode, body: { status, message, data } }`.
 *
 * Mocks: 1 (permission middleware module — non-counted infrastructure mock,
 * shared with every *.real.test.js).
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
import mongoose from "mongoose";
import request from "supertest";
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

/** Attach req.verified — profiles.routes.js does not wire verifyToken. */
function attachVerified(req, _res, next) {
  req.verified = {
    state: true,
    userData: {
      adminId: globalThis.__TEST_ADMIN_ID__,
      memberId: undefined,
      user_id: 99,
    },
    authorizedChannel: null,
    permissionConfig: [{ permissionConfig: {} }],
  };
  next();
}

const { buildApp } = await import("../helpers/app.js");
const { default: profilesRoutes } = await import(
  "../../core/v1/profiles/profiles.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Profile } = await import(
  "../../core/v1/profiles/profiles.model.js"
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
    user_id: "801",
    login: "profile-real",
    email: "profilereal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => {
    a.use(attachVerified);
    a.use("/api/v1/profiles", profilesRoutes);
  });
});

const inner = (res) => res.body?.body ?? res.body;

const validBody = (over = {}) => ({
  basics: {
    profileName: "Morning Guard Profile",
    timeZone: "UTC",
    days: {
      monday: [{ startTime: "09:00", endTime: "17:00" }],
    },
  },
  notification: {
    notify: "Digest",
    digestEveryMinutes: 30,
    channels: { email: true },
  },
  evidenceSeverity: {
    evidenceType: "Snapshot",
    time: 10,
  },
  defaultDetectionSettings: {
    objects: {
      personalProtectiveEquipment: [],
      crowdDetection: [],
    },
  },
  ...over,
});

describe("POST /api/v1/profiles/ (real vertical)", () => {
  it("creates a profile and persists it (201)", async () => {
    const res = await request(app).post("/api/v1/profiles/").send(validBody());
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.profile.basics.profileName).toBe(
      "Morning Guard Profile",
    );
    const all = await Profile.find({});
    expect(all).toHaveLength(1);
    expect(all[0].user.toString()).toBe(admin._id.toString());
  });

  it("returns 400 when the body is empty (Joi validation)", async () => {
    const res = await request(app).post("/api/v1/profiles/").send({});
    expect(res.status).toBe(400);
    // addProfile returns a custom error envelope with success:false + errors[]
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("returns 400 when basics.profileName is missing", async () => {
    const body = validBody();
    delete body.basics.profileName;
    const res = await request(app).post("/api/v1/profiles/").send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when basics.days time slots are malformed", async () => {
    const body = validBody({
      basics: {
        profileName: "Bad Slot",
        timeZone: "UTC",
        days: {
          monday: [{ startTime: "9:00", endTime: "17:00" }], // not HH:mm
        },
      },
    });
    const res = await request(app).post("/api/v1/profiles/").send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/v1/profiles/ (real vertical)", () => {
  it("returns paginated profiles + total count", async () => {
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      await Profile.create({
        userType: "Admin",
        createdBy: admin._id,
        user: admin._id,
        basics: { profileName: name },
      });
    }
    const res = await request(app).get("/api/v1/profiles/").query({
      skip: 0,
      limit: 2,
    });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.total).toBe(3);
    expect(inner(res).data.profiles).toHaveLength(2);
  });

  it("filters profiles by case-insensitive name regex", async () => {
    await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Morning Watch" },
    });
    await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Evening Watch" },
    });
    const res = await request(app).get("/api/v1/profiles/").query({
      name: "MORN",
    });
    expect(res.status).toBe(200);
    expect(inner(res).data.profiles).toHaveLength(1);
    expect(inner(res).data.profiles[0].basics.profileName).toBe("Morning Watch");
  });

  it("returns an empty list when no profiles exist for the admin", async () => {
    const res = await request(app).get("/api/v1/profiles/");
    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(0);
    expect(inner(res).data.profiles).toEqual([]);
  });

  it("scopes results to the calling admin", async () => {
    const otherAdmin = await Admin.create({
      user_id: "802",
      login: "other-admin",
      email: "other-admin@test.com",
    });
    await Profile.create({
      userType: "Admin",
      createdBy: otherAdmin._id,
      user: otherAdmin._id,
      basics: { profileName: "Other Admin Profile" },
    });
    await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Mine" },
    });
    const res = await request(app).get("/api/v1/profiles/");
    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(1);
    expect(inner(res).data.profiles[0].basics.profileName).toBe("Mine");
  });
});

describe("GET /api/v1/profiles/:id (real vertical)", () => {
  it("returns the profile when found", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Lookup Me" },
    });
    const res = await request(app).get(`/api/v1/profiles/${p._id}`);
    expect(res.status).toBe(200);
    expect(inner(res).data.profile.basics.profileName).toBe("Lookup Me");
  });

  it("returns 400 when the id is unknown (service maps not-found to 400)", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/v1/profiles/${missingId}`);
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

describe("PUT /api/v1/profiles/:id (real vertical)", () => {
  it("updates an existing profile (200)", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Before" },
    });
    const res = await request(app)
      .put(`/api/v1/profiles/${p._id}`)
      .send({
        basics: {
          profileName: "After",
          timeZone: "UTC",
          days: {},
        },
      });
    expect(res.status).toBe(200);
    expect(inner(res).data.profile.basics.profileName).toBe("After");
    const reloaded = await Profile.findById(p._id);
    expect(reloaded.basics.profileName).toBe("After");
  });

  it("returns 400 when the body is empty / no valid fields", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Stay" },
    });
    const res = await request(app)
      .put(`/api/v1/profiles/${p._id}`)
      .send({
        basics: { profileName: "X" /* missing days */ },
      });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the profile is not found", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).put(`/api/v1/profiles/${missingId}`).send({
      basics: {
        profileName: "Won't matter",
        timeZone: "UTC",
        days: {},
      },
    });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

describe("DELETE /api/v1/profiles/:id (real vertical)", () => {
  it("deletes an existing profile (200)", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "Bye" },
    });
    const res = await request(app).delete(`/api/v1/profiles/${p._id}`);
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await Profile.findById(p._id)).toBeNull();
  });

  it("returns 400 when the id does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/api/v1/profiles/${missingId}`);
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

describe("POST /api/v1/profiles/bulk-delete (real vertical)", () => {
  it("bulk-deletes multiple profiles", async () => {
    const p1 = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "A" },
    });
    const p2 = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "B" },
    });
    const res = await request(app)
      .post("/api/v1/profiles/bulk-delete")
      .send({ ids: [p1._id.toString(), p2._id.toString()] });
    // bulkDeleteProfiles returns res.json(...) without an explicit status → default 200.
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).message).toMatch(/2 profiles deleted/);
    expect(await Profile.countDocuments()).toBe(0);
  });

  it("returns 400 when ids is missing", async () => {
    const res = await request(app)
      .post("/api/v1/profiles/bulk-delete")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when none of the ids match", async () => {
    const res = await request(app)
      .post("/api/v1/profiles/bulk-delete")
      .send({ ids: [new mongoose.Types.ObjectId().toString()] });
    expect(res.status).toBe(404);
  });
});
