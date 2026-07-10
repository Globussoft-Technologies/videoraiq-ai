/**
 * Integration test for UsersService.authUserLogin — the happy path body
 * (lines 866-908 of users.service.js).
 *
 * The base `users.service.test.js` covers only the early-rejection branches:
 *   - missing credentials
 *   - unknown user
 *   - deactivated account
 *   - incorrect password
 * The 42-line success body (logsSound migration → admin.findById →
 * AuthService.getAmemberAccessByUserId → extractSubscriptions → token
 * payload → generateToken → syncPermissionLocations → 200 JSON) was 0%.
 *
 * This file pins:
 *   1. Happy path: matched by email — returns 200, JSON body contains the
 *      issued JWT + userData payload, and `syncPermissionLocations` is
 *      invoked with the correct adminId.
 *   2. Happy path: matched by userName — same 200 result, but the lookup
 *      uses the `$or: [{userName}]` branch.
 *   3. `logsSound` migration branch — when the existing user has no
 *      `logsSound` field, the conditional updateOne fires and the user
 *      gets `logsSound: false` persisted in DB.
 *   4. AuthService catch — when `getAmemberAccessByUserId` throws, the
 *      service responds 500 via the outer catch instead of issuing a token.
 *
 * Mocks: 3 — AuthService.getAmemberAccessByUserId (spy),
 *             AuthService.extractSubscriptions (spy),
 *             helperFunctions.syncPermissionLocations (partial mock).
 *
 * No real network. `decrypt` is exercised against an actual encrypt() so
 * we don't need to mock cryptoUtils — the seeded password is encrypted by
 * the users.model pre-save hook.
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
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// --- mocks (declared BEFORE the SUT import) -------------------------------
const syncPermissionLocationsMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../utils/helperFunctions.js", async () => {
  const actual = await vi.importActual("../../../utils/helperFunctions.js");
  return {
    ...actual,
    syncPermissionLocations: (...a) => syncPermissionLocationsMock(...a),
    autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  };
});

// Stub the AuthService surface so we don't hit aMember's HTTP endpoint.
vi.mock("../../../core/v1/Auth/auth.service.js", () => {
  return {
    default: {
      getAmemberAccessByUserId: vi.fn(),
      extractSubscriptions: vi.fn(),
    },
  };
});

const { default: UsersService } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthService } = await import(
  "../../../core/v1/Auth/auth.service.js"
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
  syncPermissionLocationsMock.mockReset();
  syncPermissionLocationsMock.mockResolvedValue(undefined);
  AuthService.getAmemberAccessByUserId.mockReset();
  AuthService.extractSubscriptions.mockReset();
  admin = await Admin.create({
    user_id: "42",
    login: "happy-admin",
    email: "happy-admin@test.com",
  });
});

/** Seed a users-collection doc; pre-save hook encrypts the password. */
async function seedUserDoc(over = {}) {
  return Users.create({
    adminId: admin._id,
    roleIds: new (await import("mongoose")).default.Types.ObjectId(),
    firstName: "Happy",
    lastName: "User",
    email: "happy.user@test.com",
    userName: "happy-login",
    password: "correct-password",
    phoneNumber: "555",
    profilePics: [],
    ...over,
  });
}

describe("UsersService.authUserLogin — happy path body", () => {
  it("returns 200 with a JWT + userData when credentials match by email", async () => {
    const user = await seedUserDoc();
    AuthService.getAmemberAccessByUserId.mockResolvedValue({ items: [] });
    AuthService.extractSubscriptions.mockReturnValue([{ plan: "basic" }]);

    const { req, res } = serviceCtx({
      body: {
        usernameOrEmail: "happy.user@test.com",
        password: "correct-password",
      },
    });
    await UsersService.authUserLogin(req, res, () => {});

    expect(res.statusCode).toBe(200);
    const body = payload(res);
    expect(body.status).toBe("success");
    expect(body.data).toBeTruthy();
    expect(body.data.token).toEqual(expect.any(String));
    expect(body.data.token.split(".").length).toBe(3); // JWT shape
    expect(body.data.userData).toMatchObject({
      status: true,
      user_id: 42,
      login: "happy-login",
      user_email: "happy.user@test.com",
      name_f: "Happy",
      name_l: "User",
      created_from: "EMP",
      memberId: user._id,
      userSubscriptionType: [{ plan: "basic" }],
    });
    expect(AuthService.getAmemberAccessByUserId).toHaveBeenCalledWith(42);
    expect(syncPermissionLocationsMock).toHaveBeenCalledTimes(1);
    expect(String(syncPermissionLocationsMock.mock.calls[0][0])).toBe(
      String(admin._id)
    );
  });

  it("returns 200 when credentials match by userName (the $or branch)", async () => {
    await seedUserDoc({
      email: "by-name@test.com",
      userName: "username-only",
    });
    AuthService.getAmemberAccessByUserId.mockResolvedValue({});
    AuthService.extractSubscriptions.mockReturnValue([]);

    const { req, res } = serviceCtx({
      body: {
        usernameOrEmail: "username-only",
        password: "correct-password",
      },
    });
    await UsersService.authUserLogin(req, res, () => {});

    expect(res.statusCode).toBe(200);
    const body = payload(res);
    expect(body.data.userData.login).toBe("username-only");
    expect(body.data.userData.userSubscriptionType).toEqual([]);
  });

  it("migrates legacy users missing logsSound by setting it to false", async () => {
    const user = await seedUserDoc({ email: "legacy@test.com" });
    // Force-remove logsSound to mimic a legacy doc — direct collection write
    // so the schema default doesn't re-apply.
    await Users.collection.updateOne(
      { _id: user._id },
      { $unset: { logsSound: "" } }
    );
    const before = await Users.collection.findOne({ _id: user._id });
    expect(before.logsSound).toBeUndefined();

    AuthService.getAmemberAccessByUserId.mockResolvedValue({});
    AuthService.extractSubscriptions.mockReturnValue([]);

    const { req, res } = serviceCtx({
      body: {
        usernameOrEmail: "legacy@test.com",
        password: "correct-password",
      },
    });
    await UsersService.authUserLogin(req, res, () => {});

    expect(res.statusCode).toBe(200);
    const after = await Users.collection.findOne({ _id: user._id });
    expect(after.logsSound).toBe(false);
  });

  it("responds 500 when AuthService.getAmemberAccessByUserId throws", async () => {
    await seedUserDoc({ email: "boom@test.com" });
    AuthService.getAmemberAccessByUserId.mockRejectedValue(
      new Error("aMember unreachable")
    );

    const { req, res } = serviceCtx({
      body: {
        usernameOrEmail: "boom@test.com",
        password: "correct-password",
      },
    });
    await UsersService.authUserLogin(req, res, () => {});

    expect(res.statusCode).toBe(500);
    const body = payload(res);
    expect(body.status).toBe("failed");
    // No JWT issued, no syncPermissionLocations call on the failure arm.
    expect(syncPermissionLocationsMock).not.toHaveBeenCalled();
  });
});
