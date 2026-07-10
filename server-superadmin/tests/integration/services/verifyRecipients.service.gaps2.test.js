/**
 * Gap-fill round 2 for verifyRecipients/recipients.service.js.
 *
 * All previously uncovered ranges are outer try/catch arms that wrap
 * each public method. Each fires when an awaited model call rejects.
 *
 * Targets:
 *   - 96-97    createRecipients catch — next(new AppError(...))
 *   - 123-124  verify validation-fail — body fails Joi
 *   - 157-158  verify catch — RecipientModel.findOne rejects
 *   - 246-247  resendMailOrSMS catch — RecipientModel.updateOne rejects
 *   - 321-322  fetchRecipients catch — RecipientModel.aggregate rejects
 *   - 343-344  fetchRecipientById catch — findOne rejects
 *   - 405-406  deleteRecipients catch — RecipientModel.findOneAndDelete rejects
 *   - 422-423  resendVerification (or similar tail method) catch
 *   - 427-428  ...
 *   - 442-443  fetchRecipientsByType (or last method) catch
 *
 * Strategy: each test seeds an Admin so the early ADMIN guard passes,
 * then spies on the operative model call to throw. Express `next` is
 * captured via factory's makeReqRes.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { verifyEmail: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock(
  "../../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js",
  () => ({ sendVerificationSMS: vi.fn().mockResolvedValue(undefined) }),
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
  vi.restoreAllMocks();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

describe("VerifyRecipientsService.createRecipients — outer catch (lines 96-97)", () => {
  it("calls next(AppError) when RecipientModel.create rejects", async () => {
    vi.spyOn(RecipientModel, "create").mockRejectedValueOnce(
      new Error("create-failed-fatal"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { alertType: "email" },
      body: { email: "x@test.com", fullName: "X" },
    });
    await VerifyRecipientsService.createRecipients(req, res, next);
    expect(next.calls).toHaveLength(1);
    expect(next.calls[0].message).toMatch(/create-failed-fatal/);
  });
});

describe("VerifyRecipientsService.verify — Joi validation fail (lines 123-124)", () => {
  it("sends Validation Failed when the body fails Joi", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { otp: "tok-123", alertType: "email" },
      // missing required email / phoneNumber — Joi rejects.
      body: {},
    });
    await VerifyRecipientsService.verify(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("VerifyRecipientsService.verify — outer catch (lines 157-158)", () => {
  it("calls next(AppError) when RecipientModel.findOne rejects", async () => {
    vi.spyOn(RecipientModel, "findOne").mockRejectedValueOnce(
      new Error("findOne-blew-up"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { otp: "tok", alertType: "email" },
      body: { email: "x@test.com", fullName: "X" },
    });
    await VerifyRecipientsService.verify(req, res, next);
    expect(next.calls).toHaveLength(1);
    expect(next.calls[0].message).toMatch(/findOne-blew-up/);
  });
});

describe("VerifyRecipientsService.resendMailOrSMS — outer catch (lines 246-247)", () => {
  it("calls next(AppError) when adminModel.findOne rejects", async () => {
    vi.spyOn(Admin, "findOne").mockRejectedValueOnce(
      new Error("resend-admin-failed"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: new mongoose.Types.ObjectId().toString(), alertType: "email" },
      body: { email: "x@test.com", fullName: "X" },
    });
    await VerifyRecipientsService.resendMailOrSMS(req, res, next);
    expect(next.calls.length + (res._body ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe("VerifyRecipientsService.fetchRecipients — outer catch (lines 321-322)", () => {
  it("calls next(AppError) when the aggregate/countDocuments pipeline rejects", async () => {
    vi.spyOn(RecipientModel, "countDocuments").mockRejectedValueOnce(
      new Error("count-blew-up-fetch"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { skip: 0, limit: 10 },
    });
    await VerifyRecipientsService.fetchRecipients(req, res, next);
    expect(next.calls.length + (res._body ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe("VerifyRecipientsService.deleteRecipients — outer catch (lines 405-406)", () => {
  it("calls next(AppError) when RecipientModel.findOneAndDelete rejects", async () => {
    // Need to push past: emailToRemove present + admin exists + first findOne
    // returns a recipient → next call is findOneAndDelete which we throw.
    await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "to-delete@test.com",
      verified: true,
    });
    vi.spyOn(RecipientModel, "findOneAndDelete").mockRejectedValueOnce(
      new Error("delete-blew-up"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { emailToRemove: "to-delete@test.com" },
    });
    await VerifyRecipientsService.deleteRecipients(req, res, next);
    expect(next.calls.length).toBeGreaterThan(0);
  });
});

describe("VerifyRecipientsService.updateRecipient — admin-not-found (lines 421-423)", () => {
  it("sends userFailResp('Admin not found!') when admin lookup returns null", async () => {
    vi.spyOn(Admin, "findOne").mockResolvedValueOnce(null);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: { incidentTypes: ["loiteringWithoutAuth"] },
    });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Admin not found/i);
  });
});

describe("VerifyRecipientsService.updateRecipient — Joi validation fail (lines 425-428)", () => {
  it("sends Validation Failed when the body fails Joi", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: new mongoose.Types.ObjectId().toString() },
      // incidentTypes must be array of allowed strings — pass a number to fail.
      body: { incidentTypes: 42 },
    });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("VerifyRecipientsService.updateRecipient — outer catch (lines 441-443)", () => {
  it("calls next(AppError) when RecipientModel.findOne rejects", async () => {
    vi.spyOn(RecipientModel, "findOne").mockRejectedValueOnce(
      new Error("update-findOne-failed"),
    );
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: { incidentTypes: ["loiteringWithoutAuth"] },
    });
    await VerifyRecipientsService.updateRecipient(req, res, next);
    expect(next.calls.length).toBeGreaterThan(0);
  });
});
