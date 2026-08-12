/**
 * Integration tests for UsersService.updateAuthUser and deleteAuthUser
 * — the deep happy paths past the validation gates already covered in
 * users.service.create.test.js.
 *
 * Mocks (4 modules, well under the 8-mock ceiling):
 *   1. `axios`            — deleteAuthUser's call to face-auth /delete/:id
 *   2. `utils/sftpConnectionCheck.js` — checkSftpConnection() in deleteAuthUser
 *   3. `mailService/mail.helper.js`  — sendPasswordUpdatedEmail in updateAuthUser
 *   4. `utils/helperFunctions.js`    — `syncPermissionLocations` (touched by the
 *                                      authUserLogin path; not exercised here
 *                                      but kept stubbed so the import surface
 *                                      stays predictable across rounds).
 *
 * What this covers:
 *   • updateAuthUser happy path (no password change, no channels update)   — ~50 LOC
 *   • updateAuthUser with channels update (the big 150-line block)         — ~150 LOC
 *   • updateAuthUser with a new password (encrypt + Mail send)             — ~30 LOC
 *   • deleteAuthUser full happy path (cache file branch + SFTP + axios)    — ~80 LOC
 *   • deleteAuthUser with directory-style cached path                      — branch
 *   • deleteAuthUser when axios.delete rejects (catch branch)              — branch
 *   • deleteAuthUser when sftp.exists returns 'd' / '-' / false            — branches
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
import fs from "fs";
import path from "path";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";
// Users.create runs a pre-save hook that encrypts plain-text passwords.
// We pass plain text and let the hook do the work — that matches what
// the real `createAuthUser` path does.
// (encrypt() not needed here but kept in the import list for future tests.)
// eslint-disable-next-line no-unused-vars
import { encrypt } from "../../../utils/cryptoUtils.js";

// --- mocks (declared before importing the SUT) ---
const axiosDeleteMock = vi.fn();
vi.mock("axios", () => ({
  default: {
    delete: (...args) => axiosDeleteMock(...args),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const sftpExistsMock = vi.fn();
const sftpRmdirMock = vi.fn();
const sftpDeleteMock = vi.fn();
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue({
    exists: (...args) => sftpExistsMock(...args),
    rmdir: (...args) => sftpRmdirMock(...args),
    delete: (...args) => sftpDeleteMock(...args),
  }),
}));

const sendPasswordUpdatedEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: {
    sendPasswordUpdatedEmail: (...args) =>
      sendPasswordUpdatedEmailMock(...args),
    // Other helpers used elsewhere in the service file — keep them stubbed
    // so any incidental import still resolves.
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendForgotPasswordEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// users.service.js eagerly creates /tmp/media-cache at module scope via fs.
// That's already covered by the create-tests. Keep helperFunctions stubbed.
vi.mock("../../../utils/helperFunctions.js", async () => {
  const actual = await vi.importActual(
    "../../../utils/helperFunctions.js"
  );
  return {
    ...actual,
    syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
    autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  };
});

// --- imports (after mocks) ---
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
  axiosDeleteMock.mockReset();
  sftpExistsMock.mockReset();
  sftpRmdirMock.mockReset();
  sftpDeleteMock.mockReset();
  sendPasswordUpdatedEmailMock.mockClear();
  admin = await Admin.create({
    user_id: "1",
    login: "update-user-test",
    email: "update-user-test@test.com",
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

// ----------------------------------------------------------------------
// updateAuthUser
// ----------------------------------------------------------------------

describe("UsersService.updateAuthUser — happy paths", () => {
  it("returns 400 when userId is missing in query", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { email: "x@test.com" },
      query: {},
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("fails when roleIds contains an unknown id", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "a@test.com",
      userName: "a",
      firstName: "A",
      lastName: "B",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [new mongoose.Types.ObjectId().toString()],
        email: "a@test.com",
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when admin doesn't exist", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "a@test.com",
      userName: "a",
      firstName: "A",
      lastName: "B",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "a@test.com",
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns 404 when target user does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: new mongoose.Types.ObjectId().toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "a@test.com",
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 on duplicate email for a different user", async () => {
    const u1 = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "one@test.com",
      userName: "one",
      firstName: "A",
      lastName: "B",
      password: "p",
    });
    const u2 = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "two@test.com",
      userName: "two",
      firstName: "C",
      lastName: "D",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u1._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "two@test.com", // owned by u2
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
  });

  it("updates basic fields and returns 200 (no password change, no channels block)", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "first@test.com",
      userName: "first",
      firstName: "First",
      lastName: "Last",
      password: "orig-pass",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "first@test.com",
        userName: "first-updated",
        firstName: "FirstUpdated",
        lastName: "LastUpdated",
        vehicleNumber: "KA02CD5678",
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Users.findById(existing._id);
    expect(reloaded.userName).toBe("first-updated");
    expect(reloaded.firstName).toBe("FirstUpdated");
    expect(reloaded.vehicleNumber).toBe("KA02CD5678");
    // No password change → MailHelper.sendPasswordUpdatedEmail should NOT fire.
    expect(sendPasswordUpdatedEmailMock).not.toHaveBeenCalled();
  });

  it("does not re-encrypt the password when the new plain-text matches the stored one", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "stable@test.com",
      userName: "stable",
      firstName: "A",
      lastName: "B",
      vehicleNumber: "KA03EF9012",
      // Users.create runs a pre-save hook that calls encrypt() — pass plain text.
      password: "samepass",
    });
    const before = existing.password;
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "stable@test.com",
        password: "samepass", // same plain text — service should skip update
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Users.findById(existing._id);
    expect(reloaded.password).toBe(before); // unchanged
    expect(reloaded.vehicleNumber).toBe("KA03EF9012");
    expect(sendPasswordUpdatedEmailMock).not.toHaveBeenCalled();
  });

  it("encrypts a new password, persists it, and fires the password-updated mail", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "pwd@test.com",
      userName: "pwduser",
      firstName: "A",
      lastName: "B",
      password: "oldpass",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "pwd@test.com",
        password: "newpass-123", // different plain text
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Users.findById(existing._id);
    expect(reloaded.password).not.toBe(existing.password);
    // Mail helper invoked synchronously inside the service.
    expect(sendPasswordUpdatedEmailMock).toHaveBeenCalledTimes(1);
    const [toEmail, _name, _alias, newPwd] =
      sendPasswordUpdatedEmailMock.mock.calls[0];
    expect(toEmail).toBe("pwd@test.com");
    expect(newPwd).toBe("newpass-123");
  });

  it("upserts authorizedChannels with locations/nvr/department/channel arrays", async () => {
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "ch@test.com",
      userName: "chuser",
      firstName: "A",
      lastName: "B",
      password: "p",
    });
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
      location: "loc-A",
      brand: "hikvision",
    });
    const dept = await Departments.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "dept-A",
    });
    const channel = await Channel.create({
      nvrId: nvr._id,
      userId: "1",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "cam",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "ch@test.com",
        authorizedChannelsData: {
          locations: ["loc-A", "loc-A"], // dup string → uniqueStrings keeps one
          nvrIds: [nvr._id.toString(), nvr._id.toString()], // dup ObjectId
          departmentIds: [dept._id.toString()],
          channelIds: [channel._id.toString()],
          employeeLocations: ["empLoc"],
        },
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    const ch = await AuthorizedChannels.findOne({ userId: existing._id });
    expect(ch).toBeTruthy();
    expect(ch.locations).toEqual(["loc-A"]);
    expect(ch.nvrIds.map((x) => x.toString())).toEqual([nvr._id.toString()]);
    expect(ch.departmentIds.map((x) => x.toString())).toEqual([
      dept._id.toString(),
    ]);
    expect(ch.channels.map((x) => x.toString())).toEqual([
      channel._id.toString(),
    ]);
    expect(ch.employeeLocations).toEqual(["empLoc"]);
  });

  it("returns 500 when something throws inside the body (catch branch)", async () => {
    // Force the rolesModel.find() chain to blow up by stubbing the model.
    const findSpy = vi
      .spyOn(Roles, "find")
      .mockImplementationOnce(() => {
        throw new Error("boom-update");
      });
    const existing = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "boom@test.com",
      userName: "boom",
      firstName: "A",
      lastName: "B",
      password: "p",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: existing._id.toString() },
      body: {
        roleIds: [validRole._id.toString()],
        email: "boom@test.com",
      },
    });
    await UsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(500);
    findSpy.mockRestore();
  });
});

// ----------------------------------------------------------------------
// deleteAuthUser
// ----------------------------------------------------------------------

describe("UsersService.deleteAuthUser — happy paths", () => {
  it("deletes the user, cleans SFTP (directory branch), and calls face-auth", async () => {
    const u = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "del-d@test.com",
      userName: "delD",
      firstName: "DelDir",
      lastName: "X",
      password: "p",
    });
    sftpExistsMock.mockResolvedValue("d"); // it's a directory on SFTP
    axiosDeleteMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    // User row gone.
    expect(await Users.findById(u._id)).toBeNull();
    // SFTP dir branch hit (rmdir, not delete).
    expect(sftpRmdirMock).toHaveBeenCalledTimes(1);
    expect(sftpDeleteMock).not.toHaveBeenCalled();
    // axios.delete to the face-auth endpoint.
    expect(axiosDeleteMock).toHaveBeenCalledTimes(1);
    const [url] = axiosDeleteMock.mock.calls[0];
    expect(url).toContain(`/delete/${u._id.toString()}`);
  });

  it("deletes the user, cleans SFTP (file branch), and tolerates a face-auth 404", async () => {
    const u = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "del-f@test.com",
      userName: "delF",
      firstName: "DelFile",
      lastName: "X",
      password: "p",
    });
    sftpExistsMock.mockResolvedValue("-"); // it's a file on SFTP
    // axios.delete rejects with a 404 — the service catch should swallow it.
    const err = new Error("face-auth gone");
    err.response = { status: 404, data: { message: "not found" } };
    axiosDeleteMock.mockRejectedValue(err);

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(sftpDeleteMock).toHaveBeenCalledTimes(1);
    expect(sftpRmdirMock).not.toHaveBeenCalled();
  });

  it("tolerates a face-auth error with no response object (else branch in catch)", async () => {
    const u = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "del-n@test.com",
      userName: "delN",
      firstName: "DelNet",
      lastName: "X",
      password: "p",
    });
    sftpExistsMock.mockResolvedValue(false); // not on SFTP at all
    axiosDeleteMock.mockRejectedValue(new Error("ECONNRESET"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(sftpDeleteMock).not.toHaveBeenCalled();
    expect(sftpRmdirMock).not.toHaveBeenCalled();
  });

  it("cleans the local cache file when one exists", async () => {
    const u = await Users.create({
      adminId: admin._id,
      roleIds: validRole._id,
      email: "del-cache@test.com",
      userName: "delCache",
      firstName: "CacheUser",
      lastName: "X",
      password: "p",
    });
    // users.service.js created `/tmp/media-cache` at module load. The cache
    // file is keyed by the basename of `/emp-cctv-dev-media/uploads/images/${firstName}`,
    // i.e. `CacheUser`. Drop a temp file there.
    const cacheDir = path.join("/tmp", "media-cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, "CacheUser");
    fs.writeFileSync(cacheFile, "stub");
    expect(fs.existsSync(cacheFile)).toBe(true);

    sftpExistsMock.mockResolvedValue(false);
    axiosDeleteMock.mockResolvedValue({ status: 200, data: {} });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
    });
    await UsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    // Local cache file should now be gone.
    expect(fs.existsSync(cacheFile)).toBe(false);
  });
});
