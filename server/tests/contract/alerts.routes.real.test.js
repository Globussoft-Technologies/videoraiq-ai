/**
 * Real vertical Supertest contract for `/api/v1/alerts` — mounts the real
 * router on a fresh Express app and exercises the actual controller + service
 * + Mongo. Targets `alerts.controller.js` (0% covered) end-to-end.
 *
 * The routes file has no verifyToken / permission middleware attached, so the
 * test only needs to inject `req.verified.userData` via a tiny fixture
 * middleware. We mock the mail helper because createAlert may try to send
 * verification emails when phoneNumbers/emails are non-empty.
 *
 * Mocks:
 *   1. mailService/mail.helper.js
 *   2. messagingService/IncidentsSMSFunction/sms.incidentsFunction.js
 *
 * Total: 2 mocks.
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

vi.mock("../../mailService/mail.helper.js", () => ({
  default: {
    verifyEmail: vi.fn().mockResolvedValue(undefined),
    sendIncidentMail: vi.fn().mockResolvedValue(undefined),
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
const { default: alertsRoutes } = await import(
  "../../core/v1/alerts/alerts.routes.js"
);
const { default: AlertsConfig } = await import(
  "../../core/v1/alerts/alerts.model.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: NVR } = await import("../../core/v1/NVR/nvr.model.js");

const USER_ID = "alerts-real-1";
const USER_EMAIL = "alerts-real@test.com";

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
    login: "alerts-real",
    email: USER_EMAIL,
  });
  app = buildApp((a) => {
    a.use("/api/v1/alerts", (req, _res, next) => {
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
    a.use("/api/v1/alerts", alertsRoutes);
  });
});

const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /create  →  createAlert
// ----------------------------------------------------------------------------
describe("POST /api/v1/alerts/create (real vertical)", () => {
  // alertValidation.validateCreateAlert requires all 5 arrays present.
  const validBody = {
    detectionTypes: ["countPersons"],
    emails: [],
    phoneNumbers: [],
    selectedNVRs: [],
    selectedCameras: [],
  };

  it("creates an NVR-based alert successfully", async () => {
    const nvr = await NVR.create({
      userId: "u1",
      nvrName: "NVR-1",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "local-1",
    });
    const res = await request(app)
      .post("/api/v1/alerts/create?alertBasedOn=NVR")
      .send({ ...validBody, selectedNVRs: [nvr._id.toString()] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await AlertsConfig.countDocuments()).toBe(1);
  });

  it("rejects an invalid alertBasedOn", async () => {
    const res = await request(app)
      .post("/api/v1/alerts/create?alertBasedOn=Drone")
      .send(validBody);
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects NVR alerts with no selected NVRs", async () => {
    const res = await request(app)
      .post("/api/v1/alerts/create?alertBasedOn=NVR")
      .send({ ...validBody, selectedNVRs: [] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects a payload missing required validation arrays", async () => {
    const res = await request(app)
      .post("/api/v1/alerts/create?alertBasedOn=NVR")
      .send({ detectionTypes: ["countPersons"] }); // missing emails/phoneNumbers/etc
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /fetch  →  fetchAllAlerts
// ----------------------------------------------------------------------------
describe("GET /api/v1/alerts/fetch (real vertical)", () => {
  beforeEach(async () => {
    await AlertsConfig.create([
      {
        adminId: admin._id,
        alertBasedOn: "NVR",
        detectionTypes: ["countPersons"],
      },
      {
        adminId: admin._id,
        alertBasedOn: "Camera",
        detectionTypes: ["motionDetection"],
      },
      {
        adminId: admin._id,
        alertBasedOn: "NVR",
        detectionTypes: ["countVehicles"],
      },
    ]);
  });

  it("returns all alerts with totalCount", async () => {
    const res = await request(app).get("/api/v1/alerts/fetch");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(3);
    expect(body.data.alerts).toHaveLength(3);
  });

  it("paginates with skip + limit", async () => {
    const res = await request(app).get("/api/v1/alerts/fetch?skip=1&limit=1");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.data.alerts).toHaveLength(1);
    expect(body.data.totalCount).toBe(3);
  });
});

// ----------------------------------------------------------------------------
// DELETE /delete  →  deleteAlerts
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/alerts/delete (real vertical)", () => {
  it("deletes an existing alert", async () => {
    const alert = await AlertsConfig.create({
      adminId: admin._id,
      alertBasedOn: "NVR",
      detectionTypes: ["countPersons"],
    });
    const res = await request(app).delete(
      `/api/v1/alerts/delete?id=${alert._id.toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await AlertsConfig.findById(alert._id)).toBeNull();
  });

  it("fails when alertId is missing", async () => {
    const res = await request(app).delete("/api/v1/alerts/delete");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when the alert does not exist", async () => {
    const res = await request(app).delete(
      `/api/v1/alerts/delete?id=${new mongoose.Types.ObjectId().toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});
