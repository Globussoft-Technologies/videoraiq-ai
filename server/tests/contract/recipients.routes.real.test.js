/**
 * Real vertical Supertest contract for `/api/v1/recipients` — mounts the real
 * router on a fresh Express app and exercises the actual controller + service
 * + Mongo persistence. This is the first thing that hits the
 * `recipients.controller.js` (0% covered otherwise).
 *
 * Mocks:
 *   1. middlewares/verifyToken.js     — attach admin to req.verified
 *   2. middlewares/permissionMiddleware.js — wave all CRUD verbs through
 *   3. mailService/mail.helper.js     — stub verifyEmail (no SMTP in tests)
 *   4. messagingService/IncidentsSMSFunction/sms.incidentsFunction.js
 *                                     — stub sendVerificationSMS (no SMS gateway)
 *
 * Total: 4 mocks. Service still owns all the DB writes, validation, and
 * branch decisions.
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
        user_id: 901,
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

vi.mock("../../mailService/mail.helper.js", () => ({
  default: {
    verifyEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock(
  "../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js",
  () => ({
    sendVerificationSMS: vi.fn().mockResolvedValue(undefined),
    sendIncidentSMS: vi.fn().mockResolvedValue(undefined),
  }),
);

const { buildApp } = await import("../helpers/app.js");
const { default: recipientsRoutes } = await import(
  "../../core/v1/verifyRecipients/recipients.routes.js"
);
const { default: RecipientModel } = await import(
  "../../core/v1/verifyRecipients/recipients.model.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: alertModel } = await import(
  "../../core/v1/alerts/alerts.model.js"
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
    user_id: "rec-real-1",
    login: "rec-real",
    email: "rec-real@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/recipients", recipientsRoutes));
});

/** Response.userSuccessResp returns `{ statusCode, body }`. */
const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /create  →  createRecipients
// ----------------------------------------------------------------------------
describe("POST /api/v1/recipients/create (real vertical)", () => {
  it("creates an email recipient with verification fields", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/create?alertType=email")
      .send({ email: "alice@test.com", fullName: "Alice" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const doc = await RecipientModel.findOne({ value: "alice@test.com" });
    expect(doc).not.toBeNull();
    expect(doc.type).toBe("email");
    expect(doc.verified).toBe(false);
    expect(doc.verifyOTP).toBeTruthy();
  });

  it("creates a phone-number recipient", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/create?alertType=phoneNumber")
      .send({ phoneNumber: "+15551234567", fullName: "Bob" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const doc = await RecipientModel.findOne({ value: "+15551234567" });
    expect(doc).not.toBeNull();
    expect(doc.type).toBe("phone");
  });

  it("rejects when the email already exists for the admin", async () => {
    await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "dup@test.com",
    });
    const res = await request(app)
      .post("/api/v1/recipients/create?alertType=email")
      .send({ email: "dup@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
    expect(inner(res).message).toMatch(/already exists/i);
  });

  it("rejects when alertType and body don't match (no email + email type)", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/create?alertType=email")
      .send({ phoneNumber: "+15551234567" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects an invalid email payload (validation)", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/create?alertType=email")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /verify  →  verify
// ----------------------------------------------------------------------------
describe("POST /api/v1/recipients/verify (real vertical)", () => {
  it("marks a recipient verified given the right OTP", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "v@test.com",
      verifyOTP: "TOKEN-X",
      otpExpireDate: future,
      verified: false,
    });
    const res = await request(app)
      .post("/api/v1/recipients/verify?alertType=email&otp=TOKEN-X")
      .send({ email: "v@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await RecipientModel.findOne({ value: "v@test.com" });
    expect(reloaded.verified).toBe(true);
  });

  it("fails when OTP is missing in the query", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/verify?alertType=email")
      .send({ email: "v@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when token does not match any recipient", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/verify?alertType=email&otp=NO-SUCH")
      .send({ email: "v@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when OTP has expired", async () => {
    const past = new Date(Date.now() - 60 * 1000);
    await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "expired@test.com",
      verifyOTP: "EXP",
      otpExpireDate: past,
      verified: false,
    });
    const res = await request(app)
      .post("/api/v1/recipients/verify?alertType=email&otp=EXP")
      .send({ email: "expired@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
    expect(inner(res).message).toMatch(/expired/i);
  });
});

// ----------------------------------------------------------------------------
// GET /fetch  →  fetchRecipients
// ----------------------------------------------------------------------------
describe("GET /api/v1/recipients/fetch (real vertical)", () => {
  beforeEach(async () => {
    await RecipientModel.create([
      {
        adminId: admin._id,
        type: "email",
        value: "a@test.com",
        fullName: "Alice",
        verified: true,
      },
      {
        adminId: admin._id,
        type: "email",
        value: "b@test.com",
        fullName: "Bob",
        verified: false,
      },
      {
        adminId: admin._id,
        type: "phone",
        value: "+15551111111",
        fullName: "Carol",
        verified: true,
      },
    ]);
  });

  it("returns all recipients with totalCount and detectionCount fields", async () => {
    const res = await request(app).get("/api/v1/recipients/fetch");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(3);
    expect(body.data.alerts).toHaveLength(3);
    expect(body.data.alerts[0]).toHaveProperty("detectionCount");
  });

  it("filters by alertType=email", async () => {
    const res = await request(app).get("/api/v1/recipients/fetch?alertType=email");
    expect(inner(res).data.totalCount).toBe(2);
  });

  it("filters by filterByStatus=verified", async () => {
    const res = await request(app).get(
      "/api/v1/recipients/fetch?filterByStatus=verified",
    );
    expect(inner(res).data.totalCount).toBe(2);
  });

  it("filters by filterByStatus=unverified", async () => {
    const res = await request(app).get(
      "/api/v1/recipients/fetch?filterByStatus=unverified",
    );
    expect(inner(res).data.totalCount).toBe(1);
  });

  it("filters by search across fullName + value", async () => {
    const res = await request(app).get("/api/v1/recipients/fetch?search=alice");
    expect(inner(res).data.totalCount).toBe(1);
    expect(inner(res).data.alerts[0].value).toBe("a@test.com");
  });

  it("paginates with skip + limit", async () => {
    const res = await request(app).get("/api/v1/recipients/fetch?skip=1&limit=1");
    expect(inner(res).data.alerts).toHaveLength(1);
    expect(inner(res).data.totalCount).toBe(3);
  });

  it("escapes regex special chars in the search string", async () => {
    // 'a@test.com' contains '.' — a naive regex would match anything.
    const res = await request(app).get(
      "/api/v1/recipients/fetch?search=a%40test.com",
    );
    // Should match exactly the one record, not also +15551111111 etc.
    expect(inner(res).data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// DELETE /delete  →  deleteRecipients
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/recipients/delete (real vertical)", () => {
  it("deletes an email recipient and removes it from alertModel", async () => {
    await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "del@test.com",
    });
    await alertModel.create({
      adminId: admin._id,
      alertBasedOn: "NVR",
      emails: ["del@test.com"],
      phoneNumbers: [],
    });
    const res = await request(app)
      .delete("/api/v1/recipients/delete")
      .send({ emailToRemove: "del@test.com" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(
      await RecipientModel.findOne({ value: "del@test.com" }),
    ).toBeNull();
    const alert = await alertModel.findOne({ adminId: admin._id });
    expect(alert.emails).not.toContain("del@test.com");
  });

  it("deletes a phone recipient", async () => {
    await RecipientModel.create({
      adminId: admin._id,
      type: "phone",
      value: "+19998887777",
    });
    const res = await request(app)
      .delete("/api/v1/recipients/delete")
      .send({ phoneToRemove: "+19998887777" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(
      await RecipientModel.findOne({ value: "+19998887777" }),
    ).toBeNull();
  });

  it("400s when neither emailToRemove nor phoneToRemove is given", async () => {
    const res = await request(app).delete("/api/v1/recipients/delete").send({});
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("404s when the email recipient is not found", async () => {
    const res = await request(app)
      .delete("/api/v1/recipients/delete")
      .send({ emailToRemove: "ghost@test.com" });
    expect(res.status).toBe(404);
  });
});

// ----------------------------------------------------------------------------
// PUT /update  →  updateRecipient
// ----------------------------------------------------------------------------
describe("PUT /api/v1/recipients/update (real vertical)", () => {
  it("updates incidentTypes on an existing recipient", async () => {
    const rec = await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "u@test.com",
      incidentTypes: [],
    });
    const res = await request(app)
      .put(`/api/v1/recipients/update?id=${rec._id.toString()}`)
      .send({ incidentTypes: ["fire", "intrusion"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await RecipientModel.findById(rec._id);
    expect(reloaded.incidentTypes.sort()).toEqual(["fire", "intrusion"]);
  });

  it("fails when id is missing", async () => {
    const res = await request(app)
      .put("/api/v1/recipients/update")
      .send({ incidentTypes: ["fire"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when the recipient does not exist", async () => {
    const res = await request(app)
      .put(
        `/api/v1/recipients/update?id=${new mongoose.Types.ObjectId().toString()}`,
      )
      .send({ incidentTypes: ["fire"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});
