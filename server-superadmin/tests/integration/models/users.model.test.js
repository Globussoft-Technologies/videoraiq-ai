/**
 * Integration test for the users (sub-user) Mongoose model.
 * Notably verifies the password-encryption pre-save hook and the
 * compound unique index { adminId, email }.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { decrypt } from "../../../utils/cryptoUtils.js";

const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);

beforeAll(async () => {
  await connectMongo();
  await Users.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("users model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const roleId = new mongoose.Types.ObjectId();
  const base = () => ({
    adminId,
    roleIds: roleId,
    email: "sub@test.com",
    firstName: "Sub",
    lastName: "User",
  });

  it("requires adminId and roleIds", async () => {
    await expect(Users.create({ email: "x@test.com" })).rejects.toThrow();
    await expect(Users.create({ adminId, email: "x@test.com" })).rejects.toThrow();
  });

  it("applies defaults (active, permission, location, profilePics)", async () => {
    const u = await Users.create(base());
    expect(u.active).toBe(true);
    expect(u.permission).toBe("Read");
    expect(u.location).toBe("default");
    expect(u.profilePics).toEqual([]);
    expect(u.resetPasswordToken).toBeNull();
  });

  it("encrypts the password on save and decrypts via the instance method", async () => {
    const u = await Users.create({ ...base(), password: "plaintextPass" });
    // Stored value must not be the plaintext.
    expect(u.password).not.toBe("plaintextPass");
    // The decrypt helper round-trips it.
    expect(decrypt(u.password)).toBe("plaintextPass");
    expect(u.getDecryptedPassword()).toBe("plaintextPass");
  });

  it("does not re-encrypt the password when it is not modified", async () => {
    const u = await Users.create({ ...base(), password: "secret1" });
    const stored = u.password;
    u.firstName = "Renamed";
    await u.save();
    const reloaded = await Users.findById(u._id);
    expect(reloaded.password).toBe(stored);
  });

  it("enforces the compound unique index { adminId, email }", async () => {
    await Users.create(base());
    await expect(Users.create(base())).rejects.toThrow();
  });

  it("allows the same email under a different admin", async () => {
    await Users.create(base());
    const otherAdmin = new mongoose.Types.ObjectId();
    await expect(
      Users.create({ ...base(), adminId: otherAdmin })
    ).resolves.toBeDefined();
  });

  it("coerces profilePics elements to strings (Mongoose [String] cast)", async () => {
    // The schema declares `profilePics: [String]`, so Mongoose casts each
    // element to a string *before* the custom validator runs — the validator
    // therefore never sees a raw non-string. 123 is stored as "123".
    const u = await Users.create({ ...base(), profilePics: ["ok", 123] });
    expect(u.profilePics).toEqual(["ok", "123"]);
  });
});
