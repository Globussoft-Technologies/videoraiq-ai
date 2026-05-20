/**
 * UsersService — additional read / sort / search branches that the original
 * users.service.test.js didn't reach. Stays away from the SFTP / AI / aMember
 * heavy paths.
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

// MailHelper reads sendgrid.key at call time; stub the whole module so
// forgotPassword's happy path doesn't blow up on missing config.
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: {
    sendForgotPasswordEmail: vi.fn().mockResolvedValue(true),
  },
}));

const { default: UsersService } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Roles } = await import(
  "../../../core/v1/roles/roles.model.js"
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
    login: "a",
    email: "a@test.com",
  });
});

function seedUser(over = {}) {
  return Users.create({
    adminId: admin._id,
    roleIds: new mongoose.Types.ObjectId(),
    firstName: "Emp",
    lastName: "One",
    email: `emp${Math.random()}@test.com`,
    userName: `emp${Math.random()}`,
    password: "x",
    ...over,
  });
}

describe("UsersService.fetchAuthUser — search/sort branches", () => {
  it("matches by firstName via searchQuery", async () => {
    await seedUser({ firstName: "Zara", userName: "u1", email: "u1@t.test" });
    await seedUser({ firstName: "Bob", userName: "u2", email: "u2@t.test" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { searchQuery: "Zara" },
      body: {},
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.users[0].firstName).toBe("Zara");
  });

  it("matches by lastName via searchQuery", async () => {
    await seedUser({ lastName: "Bravo", userName: "u3", email: "u3@t.test" });
    await seedUser({ lastName: "Alpha", userName: "u4", email: "u4@t.test" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { searchQuery: "Bravo" },
      body: {},
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.users[0].lastName).toBe("Bravo");
  });

  it("includes users whose roleName matches the searchQuery", async () => {
    const role = await Roles.create({ adminId: admin._id, roleName: "biometric" });
    await seedUser({
      roleIds: role._id,
      userName: "bio-u",
      email: "bio@t.test",
      firstName: "Plain",
      lastName: "Plain",
    });
    await seedUser({
      userName: "other-u",
      email: "other@t.test",
      firstName: "Plain",
      lastName: "Plain",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { searchQuery: "biometric" },
      body: {},
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    // The user wired to the matched role comes back via the $or.
    const names = payload(res).data.users.map((u) => u.userName);
    expect(names).toContain("bio-u");
  });

  it("filters by roleIds when a valid role is provided", async () => {
    const role = await Roles.create({ adminId: admin._id, roleName: "read" });
    await seedUser({ roleIds: role._id, userName: "r1", email: "r1@t.test" });
    await seedUser({ userName: "r2", email: "r2@t.test" }); // random roleIds
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: { roleIds: [role._id.toString()] },
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.users[0].userName).toBe("r1");
  });

  it("applies the orderBy + sort='asc' branch", async () => {
    await seedUser({ userName: "zeta", email: "z@t.test" });
    await seedUser({ userName: "alpha", email: "a@t.test" });
    await seedUser({ userName: "mike", email: "m@t.test" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { orderBy: "userName", sort: "asc", limit: 10 },
      body: {},
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    const names = payload(res).data.users.map((u) => u.userName);
    expect(names).toEqual(["alpha", "mike", "zeta"]);
  });

  it("respects skip + limit pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await seedUser({
        userName: `u-${i}`,
        email: `u-${i}@t.test`,
        firstName: `F${i}`,
      });
    }
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { skip: 2, limit: 2 },
      body: {},
    });
    await UsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(5);
    expect(payload(res).data.users).toHaveLength(2);
  });
});

describe("UsersService.forgotPassword — happy path", () => {
  it("generates a reset token + 200 for a known email", async () => {
    const user = await seedUser({ email: "forgot@test.com" });
    const { req, res } = serviceCtx({ body: { email: "forgot@test.com" } });
    await UsersService.forgotPassword(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Users.findById(user._id);
    expect(typeof reloaded.resetPasswordToken).toBe("string");
    expect(reloaded.resetPasswordToken.length).toBeGreaterThan(20);
    expect(reloaded.resetPasswordExpires).toBeDefined();
  });
});

describe("UsersService.bulkDeleteAuthUser — additional", () => {
  it("returns deletedCount:0 when ids do not match", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { userIds: [new mongoose.Types.ObjectId().toString()] },
    });
    await UsersService.bulkDeleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.deletedCount).toBe(0);
  });
});
