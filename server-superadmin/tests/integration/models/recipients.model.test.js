/**
 * Integration test for the recipients Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Recipient } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
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

describe("recipients model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires adminId, type, and value", async () => {
    await expect(
      Recipient.create({ type: "email", value: "x@test.com" })
    ).rejects.toThrow();
    await expect(
      Recipient.create({ adminId, value: "x@test.com" })
    ).rejects.toThrow();
    await expect(Recipient.create({ adminId, type: "email" })).rejects.toThrow();
  });

  it("only allows type email or phone", async () => {
    await expect(
      Recipient.create({ adminId, type: "fax", value: "123" })
    ).rejects.toThrow();
    await expect(
      Recipient.create({ adminId, type: "phone", value: "+15555550000" })
    ).resolves.toBeDefined();
  });

  it("defaults verified=false, fullName=null, incidentTypes=[]", async () => {
    const r = await Recipient.create({
      adminId,
      type: "email",
      value: "a@test.com",
    });
    expect(r.verified).toBe(false);
    expect(r.fullName).toBeNull();
    expect(r.incidentTypes).toEqual([]);
  });

  it("stores OTP + expiry fields", async () => {
    const exp = new Date(Date.now() + 600_000);
    const r = await Recipient.create({
      adminId,
      type: "email",
      value: "b@test.com",
      verifyOTP: "123456",
      otpExpireDate: exp,
    });
    expect(r.verifyOTP).toBe("123456");
    expect(r.otpExpireDate.getTime()).toBe(exp.getTime());
  });
});
