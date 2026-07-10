/**
 * AUTHService.registerAdminIfNotExists — branch where the admin already
 * exists AND the dashboard sidebar config is also already present, so the
 * service should be a strict no-op (no second config row inserted).
 *
 * Existing tests in auth.service.test.js cover the create branch and the
 * "admin exists but no config" implicit upsert; this targets the
 * `if (!isDashboardConfigAvailable) create()` skip path.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: AUTHService } = await import(
  "../../../core/v1/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: DashboardSidebar } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("AUTHService.registerAdminIfNotExists — sidebar-config branches", () => {
  it("creates a dashboard sidebar config alongside a brand-new admin", async () => {
    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "200",
      login: "l200",
      email: "e200@test.com",
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);

    const admin = await Admin.findOne({ user_id: "200" });
    const cfg = await DashboardSidebar.findOne({ adminId: admin._id });
    expect(cfg).not.toBeNull();
    expect(cfg.detectionConfigs).toHaveLength(3); // 3 defaults seeded
  });

  it("backfills a sidebar config when the admin exists but the config is missing", async () => {
    await Admin.create({
      user_id: "201",
      login: "l201",
      email: "e201@test.com",
    });
    const before = await DashboardSidebar.countDocuments({});
    expect(before).toBe(0);

    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "201",
      login: "l201",
      email: "e201@test.com",
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);

    const after = await DashboardSidebar.countDocuments({});
    expect(after).toBe(1);
  });

  it("is a strict no-op when both admin and config exist", async () => {
    const admin = await Admin.create({
      user_id: "202",
      login: "l202",
      email: "e202@test.com",
    });
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [
        {
          detectionType: "countPersons",
          isEnabled: true,
          allowedDetection: true,
        },
      ],
    });

    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "202",
      login: "l202",
      email: "e202@test.com",
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);

    // Still exactly one config doc — no duplicate row inserted.
    const count = await DashboardSidebar.countDocuments({
      adminId: admin._id,
    });
    expect(count).toBe(1);
    // The existing config is untouched
    const cfg = await DashboardSidebar.findOne({ adminId: admin._id });
    expect(cfg.detectionConfigs).toHaveLength(1);
  });
});
