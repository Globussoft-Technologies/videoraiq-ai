/**
 * Integration test for the recipients service (AlertService) — CRUD against
 * in-memory MongoDB with the mail + SMS senders mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// Mute the external senders — no real email / SMS during tests.
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { verifyEmail: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock(
  "../../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js",
  () => ({ sendVerificationSMS: vi.fn().mockResolvedValue(undefined) })
);

const { default: RecipientService } = await import(
  "../../../core/v1/verifyRecipients/recipients.service.js"
);
const { default: Recipient } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
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
    login: "admin",
    email: "a@test.com",
  });
});

function adminCtx(extra = {}) {
  return serviceCtx({ adminId: admin._id, ...extra });
}

describe("RecipientService.createRecipients", () => {
  it("creates an email recipient (unverified, with an OTP)", async () => {
    const { req, res, next } = adminCtx({
      query: { alertType: "email" },
      body: { email: "alerts@test.com", fullName: "Ops" },
    });
    await RecipientService.createRecipients(req, res, next);

    expect(payload(res).status).toBe("success");
    const doc = await Recipient.findOne({ value: "alerts@test.com" });
    expect(doc.type).toBe("email");
    expect(doc.verified).toBe(false);
    expect(doc.verifyOTP).toBeTruthy();
  });

  it("creates a phone recipient", async () => {
    const { req, res, next } = adminCtx({
      query: { alertType: "phoneNumber" },
      body: { phoneNumber: "+15555550000" },
    });
    await RecipientService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(await Recipient.findOne({ type: "phone" })).not.toBeNull();
  });

  it("rejects a duplicate email for the same admin", async () => {
    await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "dup@test.com",
    });
    const { req, res, next } = adminCtx({
      query: { alertType: "email" },
      body: { email: "dup@test.com" },
    });
    await RecipientService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/already exists/i);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: { alertType: "email" },
      body: { email: "x@test.com" },
    });
    await RecipientService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects an invalid email format", async () => {
    const { req, res, next } = adminCtx({
      query: { alertType: "email" },
      body: { email: "not-an-email" },
    });
    await RecipientService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("RecipientService.verify", () => {
  it("verifies a recipient with a valid OTP", async () => {
    await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "v@test.com",
      verifyOTP: "tok123",
      otpExpireDate: new Date(Date.now() + 600_000),
    });
    const { req, res, next } = adminCtx({
      query: { otp: "tok123", alertType: "email" },
      body: { email: "v@test.com" },
    });
    await RecipientService.verify(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await Recipient.findOne({ value: "v@test.com" })).verified).toBe(true);
  });

  it("rejects an expired OTP", async () => {
    await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "exp@test.com",
      verifyOTP: "old",
      otpExpireDate: new Date(Date.now() - 1000),
    });
    const { req, res, next } = adminCtx({
      query: { otp: "old", alertType: "email" },
      body: { email: "exp@test.com" },
    });
    await RecipientService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/expired/i);
  });

  it("rejects an unknown OTP", async () => {
    const { req, res, next } = adminCtx({
      query: { otp: "nope", alertType: "email" },
      body: { email: "ghost@test.com" },
    });
    await RecipientService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("requires otp + alertType in the query", async () => {
    const { req, res, next } = adminCtx({ query: {}, body: {} });
    await RecipientService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("RecipientService.fetchRecipients", () => {
  beforeEach(async () => {
    await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "a@x.com",
      verified: true,
    });
    await Recipient.create({
      adminId: admin._id,
      type: "phone",
      value: "+15555550001",
      verified: false,
    });
  });

  it("returns all recipients with a total count", async () => {
    const { req, res, next } = adminCtx({ query: {} });
    await RecipientService.fetchRecipients(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("filters by alertType", async () => {
    const { req, res, next } = adminCtx({ query: { alertType: "email" } });
    await RecipientService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("filters by verified status", async () => {
    const { req, res, next } = adminCtx({
      query: { filterByStatus: "unverified" },
    });
    await RecipientService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });
});

describe("RecipientService.updateRecipient", () => {
  it("updates incidentTypes", async () => {
    const r = await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "u@x.com",
    });
    const { req, res, next } = adminCtx({
      query: { id: r._id.toString() },
      body: { incidentTypes: ["fire", "intrusion"] },
    });
    await RecipientService.updateRecipient(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await Recipient.findById(r._id)).incidentTypes).toEqual([
      "fire",
      "intrusion",
    ]);
  });

  it("returns failed for an unknown recipient", async () => {
    const { req, res, next } = adminCtx({
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: { incidentTypes: [] },
    });
    await RecipientService.updateRecipient(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("RecipientService.deleteRecipients", () => {
  it("deletes an email recipient", async () => {
    await Recipient.create({
      adminId: admin._id,
      type: "email",
      value: "del@x.com",
    });
    const { req, res, next } = adminCtx({ body: { emailToRemove: "del@x.com" } });
    await RecipientService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Recipient.findOne({ value: "del@x.com" })).toBeNull();
  });

  it("returns 400 when neither email nor phone is given", async () => {
    const { req, res, next } = adminCtx({ body: {} });
    await RecipientService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the email recipient is not found", async () => {
    const { req, res, next } = adminCtx({
      body: { emailToRemove: "missing@x.com" },
    });
    await RecipientService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
