/**
 * Integration test for UsersService — the login / password-management /
 * bulk-delete / lookup paths against in-memory MongoDB.
 *
 * Note: in users.service.js `authorizedUsersModel` is actually the `users`
 * model (users.model.js); `authorizedUsers` is the authorizedUsers model.
 * The SFTP/AI-heavy create/update/delete/import paths and the aMember-backed
 * authUserLogin happy path are not exercised.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

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
await import("../../../core/v1/roles/roles.model.js");

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

/** Seed a `users` doc (the model users.service.js calls authorizedUsersModel). */
function seedUser(over = {}) {
  return Users.create({
    adminId: admin._id,
    roleIds: new mongoose.Types.ObjectId(),
    firstName: "Emp",
    lastName: "One",
    email: `emp${Math.random()}@test.com`,
    userName: `emp${Math.random()}`,
    password: "correct-password",
    ...over,
  });
}

describe("UsersService.authUserLogin", () => {
  it("returns 400 when credentials are missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await UsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an unknown user", async () => {
    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "ghost@test.com", password: "x" },
    });
    await UsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 for a deactivated account", async () => {
    const user = await seedUser({ email: "off@test.com", active: false });
    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "off@test.com", password: "correct-password" },
    });
    await UsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for an incorrect password", async () => {
    await seedUser({ email: "user@test.com" });
    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "user@test.com", password: "wrong-password" },
    });
    await UsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("UsersService.bulkDeleteAuthUser", () => {
  it("returns 400 when userIds is empty", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { userIds: [] },
    });
    await UsersService.bulkDeleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: { userIds: [new mongoose.Types.ObjectId().toString()] },
    });
    await UsersService.bulkDeleteAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes the listed users", async () => {
    const a = await seedUser();
    const b = await seedUser();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { userIds: [a._id.toString(), b._id.toString()] },
    });
    await UsersService.bulkDeleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Users.countDocuments()).toBe(0);
  });
});

describe("UsersService.forgotPassword", () => {
  it("returns 400 when email is missing", async () => {
    const { req, res } = serviceCtx({ body: {} });
    await UsersService.forgotPassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown email", async () => {
    const { req, res } = serviceCtx({ body: { email: "ghost@test.com" } });
    await UsersService.forgotPassword(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("generates a reset token + 200 for a known email", async () => {
    const user = await seedUser({ email: "pwd@test.com" });
    const { req, res } = serviceCtx({ body: { email: "pwd@test.com" } });
    await UsersService.forgotPassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.resetToken).toBeDefined();
    expect(payload(res).data.resetLink).toContain("reset-password?token=");
  });
});

describe("UsersService.resetPassword", () => {
  it("returns 400 when fields are missing", async () => {
    const { req, res } = serviceCtx({ body: { token: "t" } });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when passwords do not match", async () => {
    const { req, res } = serviceCtx({
      body: { token: "t", newPassword: "a", confirmPassword: "b" },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("fails for an invalid/expired token", async () => {
    const { req, res } = serviceCtx({
      body: { token: "nope", newPassword: "x", confirmPassword: "x" },
    });
    await UsersService.resetPassword(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("resets the password for a valid token", async () => {
    await seedUser({
      email: "reset@test.com",
      resetPasswordToken: "valid-token",
      resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000),
    });
    const { req, res } = serviceCtx({
      body: {
        token: "valid-token",
        newPassword: "new-pass",
        confirmPassword: "new-pass",
      },
    });
    await UsersService.resetPassword(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("UsersService.changePassword", () => {
  it("returns 400 when passwords are missing", async () => {
    const { req, res } = serviceCtx({ body: {} });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when new passwords do not match", async () => {
    const { req, res } = serviceCtx({
      body: {
        currentPassword: "a",
        newPassword: "b",
        confirmPassword: "c",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const { req, res } = serviceCtx({
      memberId: new mongoose.Types.ObjectId(),
      body: {
        currentPassword: "a",
        newPassword: "b",
        confirmPassword: "b",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when the current password is wrong", async () => {
    const user = await seedUser();
    const { req, res } = serviceCtx({
      memberId: user._id,
      body: {
        currentPassword: "wrong",
        newPassword: "new-pass",
        confirmPassword: "new-pass",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("changes the password when the current password is correct", async () => {
    const user = await seedUser();
    const { req, res } = serviceCtx({
      memberId: user._id,
      body: {
        currentPassword: "correct-password",
        newPassword: "brand-new-pass",
        confirmPassword: "brand-new-pass",
      },
    });
    await UsersService.changePassword(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("UsersService.checkEmpAdmin", () => {
  it("returns 400 when email is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await UsersService.checkEmpAdmin(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("UsersService.isEmailExist", () => {
  it("returns 400 when email is missing", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("reports exists:false for an unknown email", async () => {
    const { req, res, next } = serviceCtx({
      query: { email: "ghost@test.com" },
    });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.exists).toBe(false);
  });

  it("reports exists:true for a known authorized user", async () => {
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Emp",
      lastName: "One",
      email: "known@test.com",
    });
    const { req, res, next } = serviceCtx({
      query: { email: "known@test.com" },
    });
    await UsersService.isEmailExist(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.exists).toBe(true);
  });
});

describe("UsersService.getImportProgress", () => {
  it("returns 400 when there is no admin context", async () => {
    const { req, res, next } = serviceCtx();
    await UsersService.getImportProgress(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when no import job is in progress", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await UsersService.getImportProgress(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});
