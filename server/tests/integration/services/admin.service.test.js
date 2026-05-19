/**
 * Integration test for AdminService — the tractable signup/fetch/update and
 * EMP-email management paths against in-memory MongoDB. axios (EmpMonitor
 * API) is mocked; the AI/SFTP-heavy bulk-deletion path is not exercised.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const { default: AdminService } = await import(
  "../../../core/v1/admin/admin.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

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
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

describe("AdminService.signUP", () => {
  it("creates a new admin (200)", async () => {
    const { req, res, next } = serviceCtx({
      body: { user_id: "99", login: "newlogin", email: "new@test.com" },
    });
    await AdminService.signUP(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(await Admin.findOne({ user_id: "99" })).not.toBeNull();
  });

  it("is idempotent for an existing admin (200)", async () => {
    const { req, res, next } = serviceCtx({
      body: { user_id: "1", login: "a", email: "a@test.com" },
    });
    await AdminService.signUP(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("AdminService.fetch", () => {
  it("fails when the admin email is unknown", async () => {
    const { req, res, next } = serviceCtx({ user_email: "nope@test.com" });
    await AdminService.fetch(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the admin details (200)", async () => {
    const { req, res, next } = serviceCtx({ user_email: "a@test.com" });
    await AdminService.fetch(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.adminDetails.email).toBe("a@test.com");
  });
});

describe("AdminService.updateAdmin", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        adminId: new mongoose.Types.ObjectId().toString(),
        email: "x@test.com",
        name_f: "X",
        name_l: "Y",
      },
    });
    await AdminService.updateAdmin(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("updates an existing admin", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        email: "updated@test.com",
        name_f: "Up",
        name_l: "Dated",
      },
    });
    await AdminService.updateAdmin(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await Admin.findById(admin._id)).email).toBe("updated@test.com");
  });
});

describe("AdminService EMP-email management", () => {
  it("getEmpEmployees fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await AdminService.getEmpEmployees(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("importEMPUsers fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: { usersData: [] },
    });
    await AdminService.importEMPUsers(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("getEMPEmails fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
    });
    await AdminService.getEMPEmails(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("getEMPEmails returns an empty list for a fresh admin", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await AdminService.getEMPEmails(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toEqual([]);
  });

  it("updateEMPEmail fails without oldEmail/newEmail", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await AdminService.updateEMPEmail(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("deleteEMPEmail fails without an email", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await AdminService.deleteEMPEmail(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("getLocationByEmpEmail returns zero locations for a fresh admin", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await AdminService.getLocationByEmpEmail(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalUnique).toBe(0);
  });
});

describe("AdminService.getDeletionProgress", () => {
  it("fails when email is missing", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await AdminService.getDeletionProgress(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when no job exists for the email", async () => {
    const { req, res, next } = serviceCtx({ query: { email: "x@test.com" } });
    await AdminService.getDeletionProgress(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AdminService.updateLogsSound", () => {
  it("fails when logsSound is not a boolean", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { logsSound: "yes" },
    });
    await AdminService.updateLogsSound(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("updates logsSound for an admin", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { logsSound: true },
    });
    await AdminService.updateLogsSound(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await Admin.findById(admin._id)).logsSound).toBe(true);
  });
});

describe("AdminService.fetchLogsSound", () => {
  it("fails when there is no admin or member context", async () => {
    const { req, res, next } = serviceCtx();
    await AdminService.fetchLogsSound(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns logsSound (default false) for an admin", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await AdminService.fetchLogsSound(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.logsSound).toBe(false);
  });
});
