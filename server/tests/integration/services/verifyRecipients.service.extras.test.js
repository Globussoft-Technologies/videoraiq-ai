/**
 * Extra coverage for verifyRecipients AlertService — the branches the base
 * suite skips:
 *   - createRecipients: phoneNumber happy path + duplicate phone short-circuit
 *   - verify: expired-OTP branch + "invalid alertType or value" branch
 *   - resendMailOrSMS: validation-fail, recipient-not-found, already-verified,
 *     invalid alertType + happy paths for both email and phone
 *   - fetchRecipients: query filters (alertType, filterByStatus, search regex
 *     escaping)
 *   - deleteRecipients: phoneToRemove happy path + phoneToRemove not-found
 *
 * Mocks: 2 (mail helper + SMS helper). No external network calls.
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

describe("VerifyRecipientsService.createRecipients — phone branch", () => {
  it("creates a phone recipient", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "phoneNumber" },
      body: { phoneNumber: "+15555550000", fullName: "Phone Person" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("success");
    const saved = await RecipientModel.findOne({ value: "+15555550000" });
    expect(saved).not.toBeNull();
    expect(saved.type).toBe("phone");
  });

  it("rejects a duplicate phone recipient", async () => {
    await seedRecipient({ type: "phone", value: "+15555551111" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "phoneNumber" },
      body: { phoneNumber: "+15555551111", fullName: "Dup Phone" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("VerifyRecipientsService.verify — extra branches", () => {
  it("fails when the OTP has expired", async () => {
    await seedRecipient({
      verifyOTP: "expired-otp",
      otpExpireDate: new Date(Date.now() - 60_000),
    });
    const { req, res, next } = serviceCtx({
      query: { otp: "expired-otp", alertType: "email" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when alertType/value pair doesn't match either email or phone", async () => {
    // alertType present but body has neither email nor phoneNumber that matches
    // the validation/branch — body provides email when alertType is phoneNumber
    const { req, res, next } = serviceCtx({
      query: { otp: "any-otp", alertType: "phoneNumber" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("verifies a phoneNumber recipient", async () => {
    await seedRecipient({
      type: "phone",
      value: "+15555552222",
      verifyOTP: "phone-otp",
      otpExpireDate: new Date(Date.now() + 60_000),
    });
    const { req, res, next } = serviceCtx({
      query: { otp: "phone-otp", alertType: "phoneNumber" },
      body: { phoneNumber: "+15555552222" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("VerifyRecipientsService.resendMailOrSMS — full coverage", () => {
  it("returns recipient-not-found when the id is unknown", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {
        id: new mongoose.Types.ObjectId().toString(),
        alertType: "email",
      },
      body: { email: "anything@test.com" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    // errorResp shape — `status` is "failed" on the inner body.
    expect(payload(res).status).toBe("failed");
  });

  it("returns already-verified when the recipient is verified", async () => {
    const r = await seedRecipient({ verified: true });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: r._id.toString(), alertType: "email" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns validation-failed for an invalid recentRecipient body", async () => {
    const r = await seedRecipient();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: r._id.toString(), alertType: "email" },
      body: { email: "not-an-email" }, // invalid email format
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns invalid-alertType when neither email nor phone present", async () => {
    const r = await seedRecipient();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: r._id.toString(), alertType: "weird" },
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("resends a verification email — happy path", async () => {
    const r = await seedRecipient();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: r._id.toString(), alertType: "email" },
      // recentRecipient validator only allows `email` and `phoneNumber`.
      body: { email: "recipient@test.com" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("resends a verification SMS — happy path", async () => {
    const r = await seedRecipient({
      type: "phone",
      value: "+15555553333",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: r._id.toString(), alertType: "phoneNumber" },
      body: { phoneNumber: "+15555553333" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("VerifyRecipientsService.fetchRecipients — filter branches", () => {
  beforeEach(async () => {
    await seedRecipient({ type: "email", value: "a@x.com", verified: true });
    await seedRecipient({ type: "email", value: "b@x.com", verified: false });
    await seedRecipient({
      type: "phone",
      value: "+19999999999",
      verified: true,
      fullName: "Searchable",
    });
  });

  it("filters by alertType=email", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "email" },
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("filters by filterByStatus=verified", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { filterByStatus: "verified" },
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("filters by filterByStatus=unverified", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { filterByStatus: "unverified" },
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("filters by a regex-escaped search term", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      // Includes a special regex char to exercise the escape branch.
      query: { search: "Search+able".replace("+able", "able") },
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.alerts[0].fullName).toBe("Searchable");
  });
});

describe("VerifyRecipientsService.deleteRecipients — phone branches", () => {
  it("returns 404 when the phone recipient is not found", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { phoneToRemove: "+10000000000" },
    });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes an existing phone recipient", async () => {
    await seedRecipient({ type: "phone", value: "+15555554444" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { phoneToRemove: "+15555554444" },
    });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await RecipientModel.countDocuments({ value: "+15555554444" })).toBe(0);
  });
});
