/**
 * Real vertical Supertest contract for `/api/v1/authorized-objects` — mounts the
 * real router on a fresh Express app and hits the actual controller + service
 * with in-memory MongoDB persistence. This file is the first thing that
 * exercises `authorizedObjects.controller.js` (otherwise 0% covered) end to
 * end.
 *
 * The routes file has NO verifyToken / permission middleware attached, so we
 * don't need to mock anything — just inject the `req.verified` envelope the
 * service reads via a tiny fixture middleware.
 *
 * Mocks: 0.
 */
import {
  describe,
  it,
  expect,
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

const { buildApp } = await import("../helpers/app.js");
const { default: authorizedObjectsRoutes } = await import(
  "../../core/v1/authorizedObjects/authorizedObjects.routes.js"
);
const { default: AuthorizedObjects } = await import(
  "../../core/v1/authorizedObjects/authorizedObjects.model.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);

let app;
let admin;
const USER_ID = "ao-real-9001";
const USER_EMAIL = "ao-real@test.com";

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
    login: "ao-real",
    email: USER_EMAIL,
  });
  app = buildApp((a) => {
    // Inject the `verified` envelope the service expects.
    a.use("/api/v1/authorized-objects", (req, _res, next) => {
      req.verified = {
        state: true,
        userData: {
          adminId: admin._id,
          user_id: USER_ID,
          user_email: USER_EMAIL,
          memberId: undefined,
        },
      };
      next();
    });
    a.use("/api/v1/authorized-objects", authorizedObjectsRoutes);
  });
});

/** Unwrap the `{ statusCode, body }` envelope into the inner payload. */
const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /create
// ----------------------------------------------------------------------------
describe("POST /api/v1/authorized-objects/create (real vertical)", () => {
  it("creates a new authorized-objects record", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/create")
      .send({ objectType: "ppe", objectNames: ["helmet", "vest"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const doc = await AuthorizedObjects.findOne({ objectType: "ppe" });
    expect(doc).not.toBeNull();
    expect(doc.objectNames.sort()).toEqual(["helmet", "vest"]);
  });

  it("appends only new unique object names to an existing record", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const res = await request(app)
      .post("/api/v1/authorized-objects/create")
      .send({ objectType: "ppe", objectNames: ["helmet", "gloves"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const doc = await AuthorizedObjects.findOne({ objectType: "ppe" });
    expect(doc.objectNames.sort()).toEqual(["gloves", "helmet"]);
  });

  it("reports failure when all provided names already exist", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const res = await request(app)
      .post("/api/v1/authorized-objects/create")
      .send({ objectType: "ppe", objectNames: ["helmet"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /fetch
// ----------------------------------------------------------------------------
describe("POST /api/v1/authorized-objects/fetch (real vertical)", () => {
  beforeEach(async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet", "vest"],
    });
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "tools",
      objectNames: ["drill"],
    });
  });

  it("returns a flat list of all object names when objectTypes is empty", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/fetch")
      .send({ objectTypes: [] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.sort()).toEqual(["drill", "helmet", "vest"]);
  });

  it("filters by objectTypes when provided", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/fetch")
      .send({ objectTypes: ["tools"] });
    expect(res.status).toBe(200);
    expect(inner(res).data).toEqual(["drill"]);
  });

  it("rejects when objectTypes is not an array", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/fetch")
      .send({ objectTypes: "ppe" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /getAllObjectTypes
// ----------------------------------------------------------------------------
describe("GET /api/v1/authorized-objects/getAllObjectTypes (real vertical)", () => {
  it("returns each object type with its id", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "tools",
      objectNames: ["drill"],
    });
    const res = await request(app).get(
      "/api/v1/authorized-objects/getAllObjectTypes",
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const types = inner(res).data.map((d) => d.objectType).sort();
    expect(types).toEqual(["ppe", "tools"]);
  });

  it("returns an empty list when the admin has no records", async () => {
    const res = await request(app).get(
      "/api/v1/authorized-objects/getAllObjectTypes",
    );
    expect(res.status).toBe(200);
    expect(inner(res).data).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// PUT /update
// ----------------------------------------------------------------------------
describe("PUT /api/v1/authorized-objects/update (real vertical)", () => {
  it("updates the objectNames of an existing record", async () => {
    const rec = await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const res = await request(app)
      .put("/api/v1/authorized-objects/update")
      .send({ _id: rec._id.toString(), objectNames: ["helmet", "vest"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await AuthorizedObjects.findById(rec._id);
    expect(reloaded.objectNames).toEqual(["helmet", "vest"]);
  });

  it("updates the objectType field when provided", async () => {
    const rec = await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const res = await request(app)
      .put("/api/v1/authorized-objects/update")
      .send({ _id: rec._id.toString(), objectType: "safety" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await AuthorizedObjects.findById(rec._id);
    expect(reloaded.objectType).toBe("safety");
  });

  it("returns failure when the record does not exist", async () => {
    const res = await request(app)
      .put("/api/v1/authorized-objects/update")
      .send({
        _id: new mongoose.Types.ObjectId().toString(),
        objectNames: ["x"],
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// DELETE /delete
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/authorized-objects/delete (real vertical)", () => {
  it("deletes an existing record by id", async () => {
    const rec = await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const res = await request(app).delete(
      `/api/v1/authorized-objects/delete?id=${rec._id.toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await AuthorizedObjects.findById(rec._id)).toBeNull();
  });

  it("reports failure when no matching record exists", async () => {
    const res = await request(app).delete(
      `/api/v1/authorized-objects/delete?id=${new mongoose.Types.ObjectId().toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});
