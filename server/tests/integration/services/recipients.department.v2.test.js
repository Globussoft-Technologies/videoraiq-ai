/**
 * A recipient's departments are labels (recipients.departmentIds): set from the
 * Alert Recipients form, shown by recipients/fetch, dropped when a department
 * is deleted. It is never used to decide who gets an alert. Mail / SMS mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: new Proxy({}, { get: (_, name) => (name === "then" ? undefined : () => Promise.resolve()) }),
}));
vi.mock("../../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js", () => ({
  sendVerificationSMS: vi.fn().mockResolvedValue(undefined),
}));

const { default: RecipientsService } = await import("../../../core/v2/verifyRecipients/recipients.service.js");
const { default: DepartmentService } = await import("../../../core/v2/departments/departments.service.js");
const { default: Recipient, selectedRecipientsQuery } = await import("../../../core/v2/verifyRecipients/recipients.model.js");
const { default: Department } = await import("../../../core/v2/departments/departments.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: Access } = await import("../../../core/v2/cameraRestrictions/authorizedChannels.model.js");

let admin;
let warehouse;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: "dept-user", login: "dept-user", email: "dept-admin@test.com" });
  warehouse = await Department.create({ adminId: admin._id, orgId: "org-1", departmentName: "Warehouse" });
});

const call = async (fn, { body, query } = {}) => {
  const { req, res, next } = serviceCtx({ adminId: admin._id, user_id: admin.user_id, body, query });
  await fn(req, res, next);
  return payload(res);
};
const add = (email, departmentIds) => call((req, res, next) => RecipientsService.createRecipients(req, res, next), {
  query: { alertType: "email" },
  body: { email, fullName: "Someone", departmentIds },
});

describe("recipient department label", () => {
  it("is saved from the form and shown with its name in the list", async () => {
    expect((await add("wh@x.com", [String(warehouse._id)])).status).toBe("success");
    const list = await call((req, res, next) => RecipientsService.fetchRecipients(req, res, next), { query: { limit: 10 } });
    expect(list.data.alerts[0].departmentIds).toEqual([expect.objectContaining({ departmentName: "Warehouse" })]);
  });

  it("refuses another admin's department", async () => {
    const other = await Department.create({ adminId: new mongoose.Types.ObjectId(), orgId: "org-2", departmentName: "Other" });
    const res = await add("x@x.com", [String(warehouse._id), String(other._id)]);
    expect(res.status).toBe("failed");
    expect(await Recipient.countDocuments()).toBe(0);
  });

  it("can be cleared on edit", async () => {
    await add("wh@x.com", [String(warehouse._id)]);
    const row = await Recipient.findOne({ value: "wh@x.com" });
    const res = await call((req, res, next) => RecipientsService.updateRecipient(req, res, next), {
      query: { id: String(row._id) },
      body: { departmentIds: [] },
    });
    expect(res.status).toBe("success");
    expect((await Recipient.findById(row._id).lean()).departmentIds).toEqual([]);
  });

  it("is cleared when the department is deleted", async () => {
    await add("wh@x.com", [String(warehouse._id)]);
    await call((req, res, next) => DepartmentService.delete(req, res, next), { query: { departmentId: String(warehouse._id) } });
    expect((await Recipient.findOne({ value: "wh@x.com" }).lean()).departmentIds).toEqual([]);
  });

  it("does not change who gets an alert", async () => {
    await add("wh@x.com", [String(warehouse._id)]);
    const row = await Recipient.findOneAndUpdate({ value: "wh@x.com" }, { verified: true }, { new: true });
    const alerted = await Recipient.find(selectedRecipientsQuery({ ids: [row._id], detectionType: "fireSmokeDetection" })).lean();
    expect(alerted.map((r) => r.value)).toEqual(["wh@x.com"]);
  });
  it("a user's own recipient shows the user's Camera Access departments plus its extras", async () => {
    const hr = await Department.create({ adminId: admin._id, orgId: "org-1", departmentName: "HR" });
    const extra = await Department.create({ adminId: admin._id, orgId: "org-1", departmentName: "Extra" });
    const userId = new mongoose.Types.ObjectId();
    await Access.create({ adminId: admin._id, userId, locations: [], departmentIds: [warehouse._id, hr._id] });
    // Warehouse is both, so it is listed once.
    await Recipient.create({ adminId: admin._id, type: "email", value: "user@x.com", verified: true, userId, departmentIds: [extra._id, warehouse._id] });
    const list = await call((req, res, next) => RecipientsService.fetchRecipients(req, res, next), { query: { limit: 10 } });
    const row = list.data.alerts[0];
    expect(row.departmentIds.map((d) => d.departmentName)).toEqual(["Warehouse", "HR", "Extra"]);
    expect(row.accessDepartmentIds).toEqual([String(warehouse._id), String(hr._id)]);
  });

  it("editing a user's own recipient saves extra departments but not its name", async () => {
    const userId = new mongoose.Types.ObjectId();
    const row = await Recipient.create({ adminId: admin._id, type: "email", value: "user@x.com", fullName: "Ravi", verified: true, userId });
    const res = await call((req, res, next) => RecipientsService.updateRecipient(req, res, next), {
      query: { id: String(row._id) },
      body: { departmentIds: [String(warehouse._id)], fullName: "Someone Else" },
    });
    expect(res.status).toBe("success");
    const saved = await Recipient.findById(row._id).lean();
    expect(saved.departmentIds.map(String)).toEqual([String(warehouse._id)]);
    expect(saved.fullName).toBe("Ravi");
  });
});
