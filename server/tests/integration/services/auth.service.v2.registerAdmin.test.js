import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
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

describe("v2 AUTHService.registerAdminIfNotExists", () => {
  it("reconciles a legacy user_id when the aMember login already exists", async () => {
    const existing = await Admin.create({
      user_id: "legacy-101",
      login: "pridehonda",
      email: "old-pridehonda@example.com",
      orgId: "existing-org",
    });

    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "101",
      login: "pridehonda",
      email: "pridehonda@example.com",
      name_f: "Pride",
      name_l: "Honda",
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(result.admin._id.toString()).toBe(existing._id.toString());
    expect(result.admin).toMatchObject({
      user_id: "101",
      login: "pridehonda",
      email: "pridehonda@example.com",
      name_f: "Pride",
      name_l: "Honda",
      orgId: "existing-org",
    });
    expect(await Admin.countDocuments({ login: "pridehonda" })).toBe(1);
  });

  it("reuses the existing record when the aMember username changes", async () => {
    const existing = await Admin.create({
      user_id: "202",
      login: "old-username",
      email: "same@example.com",
    });

    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "202",
      login: "new-username",
      email: "same@example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.admin._id.toString()).toBe(existing._id.toString());
    expect(result.admin.login).toBe("new-username");
    expect(await Admin.countDocuments({ user_id: "202" })).toBe(1);
  });

  it("reports conflicting legacy records instead of choosing one", async () => {
    await Admin.create({
      user_id: "303",
      login: "first-user",
      email: "first@example.com",
    });
    await Admin.create({
      user_id: "legacy-303",
      login: "second-user",
      email: "second@example.com",
    });

    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "303",
      login: "second-user",
      email: "new@example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Conflicting admin records");
  });
});
