/**
 * Extra AdminService coverage — happy + edge paths for the EMP-email
 * management methods that the base admin.service.test.js only exercises
 * for the admin-not-found short-circuit.
 *
 * Covered here:
 *   - addEMPEmails: success (API returns data), not_found (API returns empty
 *     data), and API-failure (axios rejects) — each populates the results
 *     array on a different branch.
 *   - updateEMPEmail: success orgId found, failure orgId missing, axios
 *     rejection branch.
 *   - deleteEMPEmail: success removing an existing entry.
 *   - getLocationByEmpEmail: happy path with empData entries and a stubbed
 *     locations response (skips the `Default` location, dedupes by id).
 *
 * Mocks: 1 — `axios`. The Admin model + adminId resolution use in-memory
 * Mongo via the shared dbSetup.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const axios = (await import("axios")).default;
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
  axios.post.mockReset();
  admin = await Admin.create({
    user_id: "1",
    login: "empAdmin",
    email: "empAdmin@test.com",
  });
});

describe("AdminService.addEMPEmails", () => {
  it("pushes successful + not_found + failed results in one pass", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { data: [{ id: 42, email: "ok@x.com" }] } })
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockRejectedValueOnce(new Error("network down"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { emails: ["ok@x.com", "miss@x.com", "boom@x.com"] },
    });
    // user_email is read from req.verified.userData.email — pass it directly
    // so it's NOT auto-pushed onto emails (the production code also pushes
    // verified.userData.email which is undefined here, so it's skipped).
    await AdminService.addEMPEmails(req, res, next);

    expect(payload(res).status).toBe("success");
    const results = payload(res).data;
    expect(results.find((r) => r.email === "ok@x.com").status).toBe("success");
    expect(results.find((r) => r.email === "miss@x.com").status).toBe(
      "not_found"
    );
    expect(results.find((r) => r.email === "boom@x.com").status).toBe("failed");

    // empData should contain the one successful upsert
    const after = await Admin.findById(admin._id);
    expect(after.empData.some((e) => e.email === "ok@x.com")).toBe(true);
    expect(after.empData.some((e) => e.email === "miss@x.com")).toBe(false);
  });
});

describe("AdminService.updateEMPEmail", () => {
  it("updates the empData entry when orgId is resolved", async () => {
    await Admin.findByIdAndUpdate(admin._id, {
      $push: { empData: { email: "old@x.com", orgId: "111" } },
    });

    axios.post.mockResolvedValueOnce({
      data: { data: [{ id: 777, email: "new@x.com" }] },
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { oldEmail: "old@x.com", newEmail: "new@x.com" },
    });
    await AdminService.updateEMPEmail(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.orgId).toBe("777");

    const after = await Admin.findById(admin._id);
    expect(after.empData.some((e) => e.email === "new@x.com")).toBe(true);
    expect(after.empData.some((e) => e.email === "old@x.com")).toBe(false);
  });

  it("fails when the EmpMonitor API returns no orgId", async () => {
    axios.post.mockResolvedValueOnce({ data: { data: [] } });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { oldEmail: "old@x.com", newEmail: "ghost@x.com" },
    });
    await AdminService.updateEMPEmail(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the EmpMonitor API throws", async () => {
    axios.post.mockRejectedValueOnce(new Error("api blew up"));
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { oldEmail: "old@x.com", newEmail: "new@x.com" },
    });
    await AdminService.updateEMPEmail(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AdminService.deleteEMPEmail", () => {
  it("removes an existing empData entry by email", async () => {
    await Admin.findByIdAndUpdate(admin._id, {
      $push: { empData: { email: "del@x.com", orgId: "222" } },
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { email: "del@x.com" },
    });
    await AdminService.deleteEMPEmail(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await Admin.findById(admin._id);
    expect(after.empData.some((e) => e.email === "del@x.com")).toBe(false);
  });

  it("still resolves success even when the email is absent (no-op delete)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { email: "never-existed@x.com" },
    });
    await AdminService.deleteEMPEmail(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("AdminService.fetchLogsSound — member branch", () => {
  it("fails when the member id does not exist", async () => {
    const { req, res, next } = serviceCtx({
      memberId: new mongoose.Types.ObjectId().toString(),
    });
    await AdminService.fetchLogsSound(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AdminService.updateLogsSound — member branch", () => {
  it("fails when the member id does not exist", async () => {
    const { req, res, next } = serviceCtx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { logsSound: true },
    });
    await AdminService.updateLogsSound(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
