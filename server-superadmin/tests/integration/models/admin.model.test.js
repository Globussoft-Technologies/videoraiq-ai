/**
 * Integration test for the Admin Mongoose model.
 * Verifies the schema constraints exposed at the model level — uniqueness,
 * required fields, defaults, timestamps.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";

const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

beforeAll(async () => {
  await connectMongo();
  // Ensure unique indexes are built before we test them.
  await Admin.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("Admin model", () => {
  const base = {
    user_id: "1001",
    login: "admin",
    email: "admin@test.local",
  };

  it("creates a document with sensible defaults", async () => {
    const doc = await Admin.create(base);
    expect(doc._id).toBeDefined();
    expect(doc.name_f).toBe("");
    expect(doc.name_l).toBe("");
    expect(doc.empData).toEqual([]);
    expect(doc.logsSound).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("requires user_id, login, email", async () => {
    for (const key of ["user_id", "login", "email"]) {
      const body = { ...base };
      delete body[key];
      await expect(Admin.create(body)).rejects.toThrow();
    }
  });

  it("enforces uniqueness on user_id, login, email", async () => {
    await Admin.create(base);
    await expect(Admin.create(base)).rejects.toThrow();
    await expect(
      Admin.create({ ...base, login: "other", email: "other@test.local" })
    ).rejects.toThrow();
    await expect(
      Admin.create({ ...base, user_id: "9999", email: "other@test.local" })
    ).rejects.toThrow();
    await expect(
      Admin.create({ ...base, user_id: "9999", login: "other" })
    ).rejects.toThrow();
  });

  it("allows orgId and emp_id to be set explicitly", async () => {
    const doc = await Admin.create({
      ...base,
      orgId: "org-1",
      emp_id: "emp-1",
    });
    expect(doc.orgId).toBe("org-1");
    expect(doc.emp_id).toBe("emp-1");
  });
});
