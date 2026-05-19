/**
 * Integration test for DashboardService — the sidebar-config methods against
 * in-memory MongoDB. The heavy aggregation methods (headerStats,
 * criticalityStats, charts) are not exercised here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DashboardService } = await import(
  "../../../core/v1/dashboard/dashboard.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: DashboardSidebar } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
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

describe("DashboardService.getSidebarConfig", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
    });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns notFound when no sidebar config exists", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the sidebar config when it exists", async () => {
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [{ detectionType: "countPersons" }],
    });
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("DashboardService.updateSidebarConfig", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: { detectionConfigs: [] },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns notFound when no sidebar config exists", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { detectionConfigs: [] },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("updates a detection config's isEnabled flag", async () => {
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: false },
      ],
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        detectionConfigs: [{ detectionType: "countPersons", isEnabled: true }],
      },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("success");
    const cfg = await DashboardSidebar.findOne({ adminId: admin._id });
    expect(cfg.detectionConfigs[0].isEnabled).toBe(true);
  });
});
