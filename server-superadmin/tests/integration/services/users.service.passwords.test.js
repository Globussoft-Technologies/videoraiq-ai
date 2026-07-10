/**
 * UsersService — password lifecycle helpers that hadn't been covered:
 *   • resetPassword (validation + token-expiry + happy path)
 *   • changePassword (validation + decrypt comparison + happy path)
 *   • isEmailExist (both branches)
 *
 * All paths are pure-Mongo + cryptoUtils, no axios / SFTP / Mail, so this
 * file ships with zero mocks.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";
import { decrypt } from "../../../utils/cryptoUtils.js";

const { default: UsersService } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Roles } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const mongoose = (await import("mongoose")).default;

let admin;
let role;

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
    login: "pwd-admin",
    email: "pwd-admin@test.com",
  });
  role = await Roles.create({
    adminId: admin._id,
    roleName: "viewer",
  });
});

// ----------------------------------------------------------------------
// resetPassword
// ----------------------------------------------------------------------

describe("UsersService.resetPassword", () => {
  it("returns 400 when token is missing", async () => {
    const { req, res } = serviceCtx({
      body: { newPassword: "new", confirmPassword: "new" },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 400 when newPassword is missing", async () => {
    const { req, res } = serviceCtx({
      body: { token: "tok", confirmPassword: "new" },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when newPassword and confirmPassword differ", async () => {
    const { req, res } = serviceCtx({
      body: {
        token: "tok",
        newPassword: "a",
        confirmPassword: "b",
      },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/do not match/i);
  });

  it("fails when token does not exist", async () => {
    const { req, res } = serviceCtx({
      body: {
        token: "nonexistent-token",
        newPassword: "new",
        confirmPassword: "new",
      },
    });
    await UsersService.resetPassword(req, res);
    // Service returns res.send() with no status change → default 200 + failed payload.
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/invalid|expired/i);
  });

  it("fails when token is expired", async () => {
    const user = await Users.create({
      adminId: admin._id,
      roleIds: role._id,
      email: "reset-expired@test.com",
      userName: "rexp",
      firstName: "R",
      lastName: "E",
      password: "old",
    });
    // expired 1 hour ago
    user.resetPasswordToken = "expired-tok";
    user.resetPasswordExpires = new Date(Date.now() - 60 * 60 * 1000);
    await user.save();

    const { req, res } = serviceCtx({
      body: {
        token: "expired-tok",
        newPassword: "new-pass",
        confirmPassword: "new-pass",
      },
    });
    await UsersService.resetPassword(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("resets password and clears the token on a valid request", async () => {
    const user = await Users.create({
      adminId: admin._id,
      roleIds: role._id,
      email: "reset@test.com",
      userName: "ru",
      firstName: "R",
      lastName: "U",
      password: "old-pass",
    });
    user.resetPasswordToken = "valid-tok";
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const beforeHash = user.password;

    const { req, res } = serviceCtx({
      body: {
        token: "valid-tok",
        newPassword: "brand-new-pass",
        confirmPassword: "brand-new-pass",
      },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");

    const reloaded = await Users.findById(user._id);
    expect(reloaded.password).not.toBe(beforeHash);
    // Pre-save hook re-encrypts, so the stored value should decrypt to the new plain text.
    expect(decrypt(reloaded.password)).toBe("brand-new-pass");
    expect(reloaded.resetPasswordToken).toBeNull();
    expect(reloaded.resetPasswordExpires).toBeNull();
  });
});

// ----------------------------------------------------------------------
// changePassword
// ----------------------------------------------------------------------

describe("UsersService.changePassword", () => {
  it("returns 400 when currentPassword is missing", async () => {
    const { req, res } = serviceCtx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { newPassword: "n", confirmPassword: "n" },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when newPassword + confirmPassword differ", async () => {
    const { req, res } = serviceCtx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: {
        currentPassword: "old",
        newPassword: "a",
        confirmPassword: "b",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/do not match/i);
  });

  it("returns 404 when the target user does not exist", async () => {
    const { req, res } = serviceCtx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: {
        currentPassword: "old",
        newPassword: "n",
        confirmPassword: "n",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when currentPassword does not match the stored one", async () => {
    const user = await Users.create({
      adminId: admin._id,
      roleIds: role._id,
      email: "change-bad@test.com",
      userName: "cb",
      firstName: "C",
      lastName: "B",
      password: "real-old",
    });
    const { req, res } = serviceCtx({
      memberId: user._id.toString(),
      body: {
        currentPassword: "wrong-old",
        newPassword: "n",
        confirmPassword: "n",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/incorrect/i);
  });

  it("changes the password on the happy path", async () => {
    const user = await Users.create({
      adminId: admin._id,
      roleIds: role._id,
      email: "change@test.com",
      userName: "ch",
      firstName: "C",
      lastName: "H",
      password: "old-secret",
    });
    const beforeHash = user.password;
    const { req, res } = serviceCtx({
      memberId: user._id.toString(),
      body: {
        currentPassword: "old-secret",
        newPassword: "new-secret",
        confirmPassword: "new-secret",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");

    const reloaded = await Users.findById(user._id);
    expect(reloaded.password).not.toBe(beforeHash);
    expect(decrypt(reloaded.password)).toBe("new-secret");
  });
});

// ----------------------------------------------------------------------
// isEmailExist
// ----------------------------------------------------------------------

describe("UsersService.isEmailExist", () => {
  it("returns 400 when email is missing from the query", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns exists:false when the email is unknown", async () => {
    const { req, res, next } = serviceCtx({
      query: { email: "nobody@test.com" },
    });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.exists).toBe(false);
  });

  it("returns exists:true for an existing email", async () => {
    // isEmailExist queries the authorizedUsers collection, not the users one.
    await AuthorizedUsers.create({
      adminId: admin._id,
      email: "known@test.com",
      userName: "kn",
      firstName: "K",
      lastName: "N",
    });
    const { req, res, next } = serviceCtx({
      query: { email: "known@test.com" },
    });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.exists).toBe(true);
  });
});
