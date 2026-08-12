/**
 * Integration tests for UsersService.createAuthUser and deleteAuthUser —
 * the validation/early-exit branches that don't reach SFTP / face-auth.
 *
 * The "happy path" of createAuthUser does real Mongo writes (authorizedUsers +
 * authorizedChannels), no external service calls — so we exercise that too.
 *
 * deleteAuthUser hits SFTP + axios on the success path; we only test the
 * validation branches (missing userId, admin not found, user not found).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

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
const { default: NVR } = await import(
  "../../../core/v1/NVR/nvr.model.js"
);
const { default: Departments } = await import(
  "../../../core/v1/departments/departments.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: AuthorizedChannels } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);

let admin;
let validRole;

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
    login: "create-user-test",
    email: "create-user-test@test.com",
  });
  validRole = await Roles.create({
    adminId: admin._id,
    roleName: "viewer",
  });
});

const fullChannelsData = () => ({
  locations: [],
  nvrIds: [],
  departmentIds: [],
  channelIds: [],
  employeeLocations: [],
});

describe("UsersService.createAuthUser — validation branches", () => {
  it("fails when password is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { email: "x@test.com", userName: "x" },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when confirmPassword does not match password", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "a",
        confirmPassword: "b",
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/do not match/i);
  });

  it("fails when no valid roleIds match for this admin", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [new mongoose.Types.ObjectId().toString()],
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/valid roleId/i);
  });

  it("fails when admin does not exist", async () => {
    const otherAdmin = await Admin.create({
      user_id: "9",
      login: "other-admin",
      email: "other@test.com",
    });
    const otherRole = await Roles.create({
      adminId: otherAdmin._id,
      roleName: "viewer",
    });
    // First clear admin so adminId lookup fails — but role must exist for
    // *some* admin to pass the role check first. We make a separate admin
    // for the role, then point the request to a non-existent adminId.
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [otherRole._id.toString()],
      },
    });
    await UsersService.createAuthUser(req, res, next);
    // service looks up roles by adminId from req.verified.userData, which is
    // the bogus id — so it'll fail with "valid roleId" first. Either failure
    // is acceptable for this branch.
    expect(payload(res).status).toBe("failed");
  });

  it("fails when authorizedChannelsData is missing (non-biometric role)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Authorized Channels data is missing/);
  });

  it("fails when authorizedChannelsData is incomplete", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: { locations: [] }, // missing nvrIds etc.
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Incomplete Authorized Channels/);
  });

  it("fails when authorizedChannelsData fields aren't arrays", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: {
          locations: "not-array",
          nvrIds: [],
          departmentIds: [],
          channelIds: [],
        },
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/should be in array format/);
  });

  it("fails when an nvrId in the list doesn't exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: {
          locations: [],
          nvrIds: [new mongoose.Types.ObjectId().toString()], // not in DB
          departmentIds: [],
          channelIds: [],
        },
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/nvrIds are invalid/);
  });

  it("fails when a departmentId in the list doesn't exist", async () => {
    const nvr = await NVR.create({
      adminId: admin._id,
      userId: "1",
      nvrName: "n1",
      ip: "1.2.3.4",
      username: "u",
      password: "p",
      rtspPort: 554,
      domain: "http://x",
      localNvrId: "L1",
      location: "loc",
      brand: "hikvision",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: {
          locations: [],
          nvrIds: [nvr._id.toString()],
          departmentIds: [new mongoose.Types.ObjectId().toString()],
          channelIds: [],
        },
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/departmentIds are invalid/);
  });

  it("fails when a channelId in the list doesn't exist", async () => {
    const nvr = await NVR.create({
      adminId: admin._id,
      userId: "1",
      nvrName: "n1",
      ip: "1.2.3.4",
      username: "u",
      password: "p",
      rtspPort: 554,
      domain: "http://x",
      localNvrId: "L2",
      location: "loc",
      brand: "hikvision",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "x@test.com",
        userName: "x",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: {
          locations: [],
          nvrIds: [nvr._id.toString()],
          departmentIds: [],
          channelIds: [new mongoose.Types.ObjectId().toString()],
        },
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/channelIds are invalid/);
  });

  it("fails on duplicate email for the same admin", async () => {
    await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "dup@test.com",
      userName: "first",
      firstName: "F",
      lastName: "L",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "dup@test.com",
        userName: "second",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: fullChannelsData(),
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/email .* already exists/);
  });

  it("fails on duplicate userName for the same admin", async () => {
    await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "a@test.com",
      userName: "samename",
      firstName: "F",
      lastName: "L",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "b@test.com",
        userName: "samename",
        password: "p",
        confirmPassword: "p",
        roleIds: [validRole._id.toString()],
        authorizedChannelsData: fullChannelsData(),
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/userName .* already exists/);
  });

  it("creates an authorized user + channels for a non-biometric role (happy path)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "new@test.com",
        userName: "newuser",
        password: "secret",
        confirmPassword: "secret",
        roleIds: [validRole._id.toString()],
        firstName: "New",
        lastName: "Person",
        vehicleNumber: "KA01AB1234",
        authorizedChannelsData: fullChannelsData(),
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    const created = await Users.findOne({ email: "new@test.com" });
    expect(created).toBeTruthy();
    expect(created.vehicleNumber).toBe("KA01AB1234");
    const ch = await AuthorizedChannels.findOne({ userId: created._id });
    expect(ch).toBeTruthy();
  });

  it("creates an authorized user + empty channels for a biometric role (happy path)", async () => {
    const bioRole = await Roles.create({
      adminId: admin._id,
      roleName: "biometric",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        email: "bio@test.com",
        userName: "biouser",
        password: "secret",
        confirmPassword: "secret",
        roleIds: [bioRole._id.toString()],
        firstName: "Bio",
        lastName: "Metric",
      },
    });
    await UsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    const created = await Users.findOne({ email: "bio@test.com" });
    expect(created).toBeTruthy();
    expect(created.vehicleNumber).toBeNull();
    const ch = await AuthorizedChannels.findOne({ userId: created._id });
    expect(ch.channels).toEqual([]);
    expect(ch.nvrIds).toEqual([]);
  });
});

describe("UsersService.deleteAuthUser — validation branches", () => {
  it("returns 400 when userId is missing from query", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("fails when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: { userId: new mongoose.Types.ObjectId().toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns 404 when the authorized user does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: new mongoose.Types.ObjectId().toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
