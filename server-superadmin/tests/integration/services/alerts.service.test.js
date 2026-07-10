/**
 * Integration test for the alerts service (AlertService) — CRUD against
 * in-memory MongoDB. The admin is looked up by user_id + email.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: AlertService } = await import(
  "../../../core/v1/alerts/alerts.service.js"
);
const { default: AlertsConfig } = await import(
  "../../../core/v1/alerts/alerts.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");

let admin;
const USER_ID = "5001";
const USER_EMAIL = "admin@test.com";

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
    login: "admin",
    email: USER_EMAIL,
  });
});

function adminCtx(extra = {}) {
  return serviceCtx({ user_id: USER_ID, user_email: USER_EMAIL, ...extra });
}

async function makeNVR() {
  return NVR.create({
    userId: "u1",
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "local-1",
  });
}

describe("AlertService.createAlert", () => {
  // validateCreateAlert requires every one of these arrays to be present.
  const validBody = {
    detectionTypes: ["countPersons"],
    emails: [],
    phoneNumbers: [],
    selectedNVRs: [],
    selectedCameras: [],
  };

  it("creates an NVR-based alert", async () => {
    const nvr = await makeNVR();
    const { req, res, next } = adminCtx({
      query: { alertBasedOn: "NVR" },
      body: { ...validBody, selectedNVRs: [nvr._id.toString()] },
    });
    await AlertService.createAlert(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(await AlertsConfig.countDocuments()).toBe(1);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "9999",
      user_email: "ghost@test.com",
      query: { alertBasedOn: "NVR" },
      body: validBody,
    });
    await AlertService.createAlert(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects an invalid alertBasedOn", async () => {
    const { req, res, next } = adminCtx({
      query: { alertBasedOn: "Drone" },
      body: validBody,
    });
    await AlertService.createAlert(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects an NVR alert with no selected NVRs", async () => {
    const { req, res, next } = adminCtx({
      query: { alertBasedOn: "NVR" },
      body: { ...validBody, selectedNVRs: [] },
    });
    await AlertService.createAlert(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects an invalid detectionType", async () => {
    const { req, res, next } = adminCtx({
      query: { alertBasedOn: "NVR" },
      body: { ...validBody, detectionTypes: ["notAType"] },
    });
    await AlertService.createAlert(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AlertService.fetchAllAlerts", () => {
  beforeEach(async () => {
    await AlertsConfig.create({
      adminId: admin._id,
      alertBasedOn: "NVR",
      detectionTypes: ["countPersons"],
    });
    await AlertsConfig.create({
      adminId: admin._id,
      alertBasedOn: "Camera",
      detectionTypes: ["motionDetection"],
    });
  });

  it("returns alerts scoped to the admin with a total count", async () => {
    const { req, res, next } = adminCtx({ query: {} });
    await AlertService.fetchAllAlerts(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.alerts).toHaveLength(2);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "0",
      user_email: "no@test.com",
      query: {},
    });
    await AlertService.fetchAllAlerts(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AlertService.deleteAlerts", () => {
  it("deletes an alert by id", async () => {
    const alert = await AlertsConfig.create({
      adminId: admin._id,
      alertBasedOn: "NVR",
    });
    const { req, res, next } = adminCtx({ query: { id: alert._id.toString() } });
    await AlertService.deleteAlerts(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(await AlertsConfig.countDocuments()).toBe(0);
  });

  it("requires an alert id", async () => {
    const { req, res, next } = adminCtx({ query: {} });
    await AlertService.deleteAlerts(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails for a non-existent alert", async () => {
    const { req, res, next } = adminCtx({
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await AlertService.deleteAlerts(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AlertService.updateAlert", () => {
  it("updates an existing alert's detection types", async () => {
    const alert = await AlertsConfig.create({
      adminId: admin._id,
      alertBasedOn: "NVR",
      detectionTypes: ["countPersons"],
    });
    const { req, res, next } = adminCtx({
      query: { alertBasedOn: "NVR", alertId: alert._id.toString() },
      body: {
        detectionTypes: ["countVehicles"],
        emails: [],
        phoneNumbers: [],
        selectedNVRs: [],
        selectedCameras: [],
      },
    });
    await AlertService.updateAlert(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await AlertsConfig.findById(alert._id);
    expect(reloaded.detectionTypes).toEqual(
      expect.arrayContaining(["countPersons", "countVehicles"])
    );
  });

  it("fails for an unknown alertId", async () => {
    const { req, res, next } = adminCtx({
      query: {
        alertBasedOn: "NVR",
        alertId: new mongoose.Types.ObjectId().toString(),
      },
      body: {
        detectionTypes: ["countPersons"],
        emails: [],
        phoneNumbers: [],
        selectedNVRs: [],
        selectedCameras: [],
      },
    });
    await AlertService.updateAlert(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
