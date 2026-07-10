/**
 * Integration test for the authorizedUsers (employee) Mongoose model —
 * password encryption hook and the { adminId, email } unique index.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { decrypt } from "../../../utils/cryptoUtils.js";

const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);

beforeAll(async () => {
  await connectMongo();
  await AuthorizedUsers.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("authorizedUsers model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const base = (over = {}) => ({
    adminId,
    firstName: "Emp",
    lastName: "One",
    email: "emp@test.com",
    ...over,
  });

  it("requires adminId", async () => {
    await expect(
      AuthorizedUsers.create({ firstName: "x", email: "y@test.com" })
    ).rejects.toThrow();
  });

  it("applies defaults — verified true, permission Read, location default", async () => {
    const u = await AuthorizedUsers.create(base());
    expect(u.verified).toBe(true);
    expect(u.permission).toBe("Read");
    expect(u.location).toBe("default");
    expect(u.profilePics).toEqual([]);
  });

  it("encrypts a password on save and decrypts it back", async () => {
    const u = await AuthorizedUsers.create(base({ password: "empPass1" }));
    expect(u.password).not.toBe("empPass1");
    expect(decrypt(u.password)).toBe("empPass1");
    expect(u.getDecryptedPassword()).toBe("empPass1");
  });

  it("leaves a null password untouched (hook guards on truthy password)", async () => {
    const u = await AuthorizedUsers.create(base());
    expect(u.password).toBeNull();
  });

  it("enforces unique { adminId, email }", async () => {
    await AuthorizedUsers.create(base());
    await expect(AuthorizedUsers.create(base())).rejects.toThrow();
  });

  it("coerces profilePics elements to strings (Mongoose [String] cast)", async () => {
    // `profilePics: [String]` — Mongoose casts each element to a string
    // before the custom validator runs, so 5 is stored as "5".
    const u = await AuthorizedUsers.create(base({ profilePics: ["ok", 5] }));
    expect(u.profilePics).toEqual(["ok", "5"]);
  });
});
