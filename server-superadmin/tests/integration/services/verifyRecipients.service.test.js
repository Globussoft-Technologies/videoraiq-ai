/**
 * Integration test for the verifyRecipients AlertService — the
 * create/verify/resend/fetch/delete/update recipient paths against in-memory
 * MongoDB. Mail + SMS side effects are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { verifyEmail: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock(
  "../../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js",
  () => ({ sendVerificationSMS: vi.fn().mockResolvedValue(undefined) })
);

const { default: VerifyRecipientsService } = await import(
  "../../../core/v1/verifyRecipients/recipients.service.js"
);
const { default: RecipientModel } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
await import("../../../core/v1/alerts/alerts.model.js");
await import("../../../core/v1/detectionSettings/detectionSettings.model.js");

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

function seedRecipient(over = {}) {
  return RecipientModel.create({
    adminId: admin._id,
    type: "email",
    value: "recipient@test.com",
    verified: false,
    ...over,
  });
}

describe("VerifyRecipientsService.createRecipients", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: { alertType: "email" },
      body: { email: "new@test.com" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails validation for a malformed email", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "email" },
      body: { email: "not-an-email" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails for an invalid alertType", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: { email: "new@test.com" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("creates an email recipient", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "email" },
      body: { email: "new@test.com", fullName: "New Recipient" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(await RecipientModel.countDocuments()).toBe(1);
  });

  it("rejects a duplicate email recipient", async () => {
    await seedRecipient({ value: "dup@test.com" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "email" },
      body: { email: "dup@test.com" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("VerifyRecipientsService.verify", () => {
  it("fails when otp/alertType are missing", async () => {
    const { req, res, next } = serviceCtx({ query: {}, body: {} });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails for an unknown OTP", async () => {
    const { req, res, next } = serviceCtx({
      query: { otp: "nope", alertType: "email" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("verifies a recipient with a matching OTP", async () => {
    await seedRecipient({
      verifyOTP: "otp-123",
      otpExpireDate: new Date(Date.now() + 60_000),
    });
    const { req, res, next } = serviceCtx({
      query: { otp: "otp-123", alertType: "email" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await RecipientModel.findOne({ value: "recipient@test.com" })).verified).toBe(
      true
    );
  });
});

describe("VerifyRecipientsService.resendMailOrSMS", () => {
  it("fails when id/alertType are missing", async () => {
    const { req, res, next } = serviceCtx({ query: {}, body: {} });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: { id: new mongoose.Types.ObjectId().toString(), alertType: "email" },
      body: {},
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("VerifyRecipientsService.fetchRecipients", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the admin's recipients with a total count (200)", async () => {
    await seedRecipient();
    await seedRecipient({ value: "second@test.com" });
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });
});

describe("VerifyRecipientsService.deleteRecipients", () => {
  it("returns 400 when neither email nor phone is provided", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the email recipient is not found", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { emailToRemove: "missing@test.com" },
    });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes an existing email recipient (200)", async () => {
    await seedRecipient({ value: "delete@test.com" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { emailToRemove: "delete@test.com" },
    });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await RecipientModel.countDocuments()).toBe(0);
  });
});

describe("VerifyRecipientsService.updateRecipient", () => {
  it("fails when the recipient id is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails for an unknown recipient", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: {},
    });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("updates the incidentTypes of an existing recipient", async () => {
    const recipient = await seedRecipient();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: recipient._id.toString() },
      body: { incidentTypes: ["fire", "intrusion"] },
    });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await RecipientModel.findById(recipient._id)).incidentTypes).toEqual([
      "fire",
      "intrusion",
    ]);
  });
});
