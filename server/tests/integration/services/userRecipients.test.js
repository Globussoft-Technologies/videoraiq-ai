/**
 * Every login user has one email alert recipient, linked by recipient.userId
 * (core/v1/verifyRecipients/userRecipients.js): created or adopted when the
 * user is saved, kept in sync on edit, removed or unlinked on delete. Mail is
 * mocked.
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

const { default: UsersService } = await import("../../../core/v2/users/users.service.js");
const { default: RecipientsService } = await import("../../../core/v2/verifyRecipients/recipients.service.js");
const { syncUserRecipient, removeUserRecipients } = await import("../../../core/v1/verifyRecipients/userRecipients.js");
const { default: Recipient } = await import("../../../core/v1/verifyRecipients/recipients.model.js");
const { DetectionSetting } = await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { default: Profile } = await import("../../../core/v1/profiles/profiles.model.js");
const { default: EmailVerification } = await import("../../../core/v2/users/emailVerification.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: Roles } = await import("../../../core/v1/roles/roles.model.js");

let admin;
let role;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  await Recipient.syncIndexes();
  admin = await Admin.create({ user_id: "ur1", login: "ur-admin", email: "ur-admin@test.com" });
  role = await Roles.create({ adminId: admin._id, roleName: "viewer" });
});

const call = async (fn, { body, query } = {}) => {
  const { req, res, next } = serviceCtx({ adminId: admin._id, user_id: admin.user_id, body, query });
  await fn(req, res, next);
  return payload(res);
};
const oid = () => new mongoose.Types.ObjectId();
const user = (fields) => ({ _id: oid(), adminId: admin._id, firstName: "Ravi", lastName: "K", ...fields });
// Membership lists hold bare ids; insert raw so no unrelated validation applies.
const listing = async (Model, doc) => (await Model.collection.insertOne(doc)).insertedId;
const idsIn = async (Model, _id, path) => {
  const doc = await Model.collection.findOne({ _id });
  return path.split(".").reduce((value, key) => value?.[key], doc).map(String);
};

describe("user recipients through the v2 Users service", () => {
  it("create links a verified recipient, edit renames it, bulk delete removes it", async () => {
    await EmailVerification.create({ adminId: admin._id, email: "ravi@test.com", verifiedAt: new Date() });
    const created = await call((req, res, next) => UsersService.createAuthUser(req, res, next), {
      body: {
        email: "ravi@test.com",
        userName: "ravi",
        firstName: "Ravi",
        lastName: "K",
        password: "Secret#123",
        confirmPassword: "Secret#123",
        roleIds: [role._id.toString()],
        authorizedChannelsData: { locations: [], nvrIds: [], departmentIds: [], channelIds: [], employeeLocations: [] },
      },
    });
    expect(created.status).toBe("success");
    const userId = created.data.newUser._id;

    const row = await Recipient.findOne({ userId }).lean();
    expect(row).toMatchObject({
      type: "email",
      value: "ravi@test.com",
      fullName: "Ravi K",
      verified: true,
      autoCreated: true,
      incidentTypes: [],
    });

    const updated = await call((req, res, next) => UsersService.updateAuthUser(req, res, next), {
      query: { userId: String(userId) },
      body: { email: "ravi@test.com", userName: "ravi", firstName: "Ravindra", lastName: "K", roleIds: [role._id.toString()] },
    });
    expect(updated.status).toBe("success");
    expect((await Recipient.findOne({ userId }).lean()).fullName).toBe("Ravindra K");

    await call((req, res, next) => UsersService.bulkDeleteAuthUser(req, res, next), { body: { userIds: [String(userId)] } });
    expect(await Recipient.countDocuments()).toBe(0);
  });
});

describe("syncUserRecipient", () => {
  it("adopts an existing row with the same address in any case, keeping its subscriptions", async () => {
    const existing = await Recipient.create({
      adminId: admin._id, type: "email", value: "Ravi@Test.com", fullName: "old name",
      verified: false, incidentTypes: ["fireSmokeDetection"],
    });
    const u = user({ email: "ravi@test.com" });

    await syncUserRecipient(u);

    const rows = await Recipient.find().lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0]._id)).toBe(String(existing._id));
    expect(rows[0]).toMatchObject({ value: "ravi@test.com", fullName: "Ravi K", verified: false, incidentTypes: ["fireSmokeDetection"] });
    expect(String(rows[0].userId)).toBe(String(u._id));
    expect(rows[0].autoCreated).toBeUndefined();

    // Deleting the user only unlinks a row an admin added: it keeps alerting.
    await removeUserRecipients(u._id);
    const after = await Recipient.findById(existing._id).lean();
    expect(after.userId).toBeUndefined();
    expect(after.incidentTypes).toEqual(["fireSmokeDetection"]);
  });

  it("on an email change, folds a row that already had the new address into the user's row", async () => {
    const u = user({ email: "old@test.com" });
    const mine = await syncUserRecipient(u, { verified: true });
    const theirs = await Recipient.create({
      adminId: admin._id, type: "email", value: "new@test.com", verified: true, incidentTypes: ["crowdDetection"],
    });
    const settingA = await listing(DetectionSetting, { alerts: [mine._id] });
    const settingB = await listing(DetectionSetting, { alerts: [theirs._id] });
    const profile = await listing(Profile, { notification: { recipients: [theirs._id] } });

    await syncUserRecipient({ ...u, email: "new@test.com" });

    expect(await Recipient.exists({ _id: theirs._id })).toBeNull();
    const row = await Recipient.findById(mine._id).lean();
    expect(row).toMatchObject({ value: "new@test.com", verified: true });
    expect(row.incidentTypes).toEqual(["crowdDetection"]);
    expect(await idsIn(DetectionSetting, settingA, "alerts")).toEqual([String(mine._id)]);
    expect(await idsIn(DetectionSetting, settingB, "alerts")).toEqual([String(mine._id)]);
    expect(await idsIn(Profile, profile, "notification.recipients")).toEqual([String(mine._id)]);
  });

  it("marks a changed address unverified when nothing verified it", async () => {
    const u = user({ email: "a@test.com" });
    await syncUserRecipient(u, { verified: true });
    const row = await syncUserRecipient({ ...u, email: "b@test.com" });
    expect(row).toMatchObject({ value: "b@test.com", verified: false });
  });

  it("never throws", async () => {
    expect(await syncUserRecipient(null)).toBeNull();
    expect(await syncUserRecipient(user({ email: "" }))).toBeNull();
    await expect(removeUserRecipients(["not-an-id"])).resolves.toBeUndefined();
  });
});

describe("removeUserRecipients", () => {
  it("deletes a row made for the user and takes it out of every list", async () => {
    const u = user({ email: "gone@test.com" });
    const mine = await syncUserRecipient(u);
    const setting = await listing(DetectionSetting, { alerts: [mine._id] });
    const camera = await listing(Channel, { alerts: [mine._id] });

    await removeUserRecipients([u._id]);

    expect(await Recipient.countDocuments()).toBe(0);
    expect(await idsIn(DetectionSetting, setting, "alerts")).toEqual([]);
    expect(await idsIn(Channel, camera, "alerts")).toEqual([]);
  });
});

describe("Alert Recipients page and user rows", () => {
  it("refuses to delete a user's row, and keeps its name when edited", async () => {
    const mine = await syncUserRecipient(user({ email: "kept@test.com" }), { verified: true });

    const deleted = await call((req, res, next) => RecipientsService.deleteRecipients(req, res, next), {
      body: { emailToRemove: "kept@test.com" },
    });
    expect(deleted.status).toBe("failed");
    expect(deleted.message).toMatch(/belongs to a user/);
    expect(await Recipient.exists({ _id: mine._id })).not.toBeNull();

    const edited = await call((req, res, next) => RecipientsService.updateRecipient(req, res, next), {
      query: { id: String(mine._id) },
      body: { fullName: "Someone Else", incidentTypes: ["fireSmokeDetection"] },
    });
    expect(edited.status).toBe("success");
    const row = await Recipient.findById(mine._id).lean();
    expect(row).toMatchObject({ fullName: "Ravi K", incidentTypes: ["fireSmokeDetection"] });
  });

  it("will not add a second row for a user's address in another letter case", async () => {
    await syncUserRecipient(user({ email: "case@test.com" }), { verified: true });
    const added = await call((req, res, next) => RecipientsService.createRecipients(req, res, next), {
      query: { alertType: "email" },
      body: { email: "Case@Test.com", fullName: "Dup" },
    });
    expect(added.status).toBe("failed");
    expect(await Recipient.countDocuments()).toBe(1);
  });
});
