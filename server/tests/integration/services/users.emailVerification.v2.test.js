/**
 * v2 Add User email verification: a user can only be created with an address
 * verified from the link mailed to it (send → verify → create), and the
 * verification is used up once the user exists. Mail is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const mail = vi.hoisted(() => ({ sent: [] }));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: new Proxy({}, {
    get: (_, name) => (name === "then" ? undefined : (...args) => {
      if (name === "verifyEmail") mail.sent.push({ to: args[0], link: args[1], purpose: args[2] });
      return Promise.resolve();
    }),
  }),
}));

const { default: UsersService } = await import("../../../core/v2/users/users.service.js");
const { default: Verification } = await import("../../../core/v2/users/emailVerification.service.js");
const { default: EmailVerification } = await import("../../../core/v2/users/emailVerification.model.js");
const { default: Users } = await import("../../../core/v2/users/users.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: Roles } = await import("../../../core/v1/roles/roles.model.js");

let admin;
let role;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  mail.sent = [];
  admin = await Admin.create({ user_id: "ev1", login: "ev-admin", email: "ev-admin@test.com" });
  role = await Roles.create({ adminId: admin._id, roleName: "viewer" });
});

const call = async (fn, { body, query } = {}) => {
  const { req, res, next } = serviceCtx({ adminId: admin._id, user_id: admin.user_id, body, query });
  await fn(req, res, next);
  return payload(res);
};

const createUser = (email) => call((req, res, next) => UsersService.createAuthUser(req, res, next), {
  body: {
    email,
    userName: "newuser",
    firstName: "New",
    lastName: "User",
    password: "Secret#123",
    confirmPassword: "Secret#123",
    roleIds: [role._id.toString()],
    authorizedChannelsData: { locations: [], nvrIds: [], departmentIds: [], channelIds: [], employeeLocations: [] },
  },
});

describe("Add User email verification (v2)", () => {
  it("refuses to create a user whose email was not verified", async () => {
    const res = await createUser("new.user@test.com");
    expect(res.status).toBe("failed");
    expect(res.message).toMatch(/Verify this email address/);
    expect(await Users.countDocuments()).toBe(0);
  });

  it("send → click the mailed link → create succeeds and uses the verification up", async () => {
    const sent = await call((req, res) => Verification.send(req, res), { body: { email: "New.User@test.com" } });
    expect(sent.status).toBe("success");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "new.user@test.com", purpose: "user" });

    // What the /verify page does with the link: ?token=…&value=…&kind=user
    const token = new URLSearchParams(mail.sent[0].link.slice(1)).get("token");
    const verified = await call((req, res) => Verification.verify(req, res), { query: { token }, body: { email: "new.user@test.com" } });
    expect(verified.status).toBe("success");

    const status = await call((req, res) => Verification.status(req, res), { query: { email: "new.user@test.com" } });
    expect(status.data.verified).toBe(true);

    const created = await createUser("new.user@test.com");
    expect(created.status).toBe("success");
    expect(await Users.countDocuments({ email: "new.user@test.com" })).toBe(1);
    expect(await EmailVerification.countDocuments()).toBe(0);
  });

  it("rejects a wrong token and an expired link", async () => {
    await call((req, res) => Verification.send(req, res), { body: { email: "late@test.com" } });
    const bad = await call((req, res) => Verification.verify(req, res), { query: { token: "nope" }, body: { email: "late@test.com" } });
    expect(bad.status).toBe("failed");

    await EmailVerification.updateOne({ email: "late@test.com" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const token = new URLSearchParams(mail.sent[0].link.slice(1)).get("token");
    const expired = await call((req, res) => Verification.verify(req, res), { query: { token }, body: { email: "late@test.com" } });
    expect(expired.message).toMatch(/expired/);
  });

  it("does not mail an address that already belongs to a user", async () => {
    await Users.create({ adminId: admin._id, roleIds: role._id, email: "taken@test.com", userName: "t", firstName: "T", lastName: "T", password: "p" });
    const res = await call((req, res) => Verification.send(req, res), { body: { email: "TAKEN@test.com" } });
    expect(res.status).toBe("failed");
    expect(mail.sent).toHaveLength(0);
  });
});
