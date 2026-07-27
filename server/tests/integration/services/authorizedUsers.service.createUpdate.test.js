/**
 * Integration tests for AuthUsersService — covers the two largest still-
 * uncovered methods on `core/v1/authorizedUsers/authorizedUsers.service.js`:
 *
 *   - `createAuthUser` (lines 345-542, ~197 stmts) — was 0% covered.
 *     Pins: admin-not-found guard, missing required field guard
 *     (firstName/lastName/email), <3 profile pic guard (req.files),
 *     invalid departmentId format guard, invalid departmentId not-found
 *     guard, invalid shiftId guard, duplicate email 409, AI-service
 *     "User already registered" branch (409, with rollback delete),
 *     AI-service "No valid face detected" branch (409, with rollback
 *     delete), AI-service generic error branch (500, marks user
 *     verified:false), AI-service happy path (201 → user created).
 *
 *   - `updateAuthUser` (lines 595-937, ~343 stmts) — was 0% covered.
 *     Pins: missing userId guard, invalid shiftId guard, admin-not-found
 *     guard, invalid departmentId guard, user-not-found guard, duplicate
 *     email guard, profile-pic count !=3 guard, AI service "User
 *     already registered" branch (409), AI-service "Identity verification
 *     failed" branch (500 with deleteFileFromStorage cleanup),
 *     AI-service generic error branch (500, marks verified:false), happy
 *     path (200 → updated user, marks verified:true).
 *
 * Mocks: 3 — `axios` (POST/PUT/DELETE), `utils/sftpConnectionCheck`
 * (deleteFileFromStorage helper uses `checkSftpConnection`),
 * `utils/newSFTPConnectionCheck` (createAuthUser/updateAuthUser call
 * `connectSFTP` at top of method). Well under the 8-mock budget.
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

// ---------------------------------------------------------------------------
// Mock surface (3 mocks total)
// ---------------------------------------------------------------------------
const sftpClient = {
  exists: vi.fn().mockResolvedValue(false),
  delete: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue(sftpClient),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue(sftpClient),
  releaseSFTP: vi.fn(),
  // createAuthUser/updateAuthUser now acquire the pooled connection only for
  // the upload itself, via withSFTPConnection (acquire + auto-release).
  withSFTPConnection: vi.fn(async (cb) => cb(sftpClient)),
}));
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

const { default: AuthUsersService } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.service.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
const { default: Shift } = await import(
  "../../../core/v1/shifts/shifts.model.js"
);
const { default: axios } = await import("axios");

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
    user_id: "777",
    login: "cu-test",
    email: "cu-test@test.com",
  });
  vi.clearAllMocks();
});

// Build a fake multer file ({buffer, originalname, mimetype}) for req.files
function fakeFile(name = "pic.jpg") {
  return {
    buffer: Buffer.from("fake-image-data"),
    originalname: name,
    mimetype: "image/jpeg",
  };
}
function threeFiles() {
  return [fakeFile("a.jpg"), fakeFile("b.jpg"), fakeFile("c.jpg")];
}

// ===========================================================================
// createAuthUser
// ===========================================================================
describe("AuthUsersService.createAuthUser", () => {
  it("returns 'Admin not found' when admin lookup misses", async () => {
    const fakeAdminId = new mongoose.Types.ObjectId();
    const { req, res, next } = serviceCtx({
      adminId: fakeAdminId.toString(),
      body: { firstName: "A", lastName: "B", email: "a@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns 400 when firstName / lastName / email is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "Only" }, // missing lastName + email
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/Missing required fields/);
  });

  it("returns 400 when no profile pics are uploaded", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "A", lastName: "B", email: "a@b.com" },
    });
    req.files = []; // no files
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).error).toMatch(/At least 1 profile pic/);
  });

  it("rejects invalid departmentId format string", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        departmentId: "not-an-objectid",
      },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid DepartmentId format/);
  });

  it("rejects unknown departmentId (valid id but no department)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        departmentId: new mongoose.Types.ObjectId().toString(),
      },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid DepartmentId/);
  });

  it("rejects unknown shiftId", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        shiftId: new mongoose.Types.ObjectId().toString(),
      },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/ShiftId does not Exist/);
  });

  it("returns 409 when an authorized user with the same email already exists", async () => {
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Pre",
      lastName: "Existing",
      email: "dup@b.com",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "A", lastName: "B", email: "dup@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
    expect(payload(res).message).toMatch(/already exists/);
  });

  it("happy path → 201 with new user; axios.post(register) succeeds", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "Happy", lastName: "Path", email: "happy@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.firstName).toBe("Happy");
    // AI registration call fired
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/register"),
      expect.objectContaining({ uid: expect.any(String) }),
      expect.any(Object)
    );
  });

  it("AI service 'User already registered' → 409 and rollback-deletes the new user", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { message: "User already registered" } },
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "Dup", lastName: "Face", email: "dupface@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
    expect(payload(res).message).toMatch(/similar facial data is already registered/);
    // The rollback delete should have removed the just-created user
    const remaining = await AuthorizedUsers.findOne({ email: "dupface@b.com" });
    expect(remaining).toBeNull();
  });

  it("AI service 'No valid face detected' → 409 and rollback-deletes the new user", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { message: "No valid face detected" } },
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "Bad", lastName: "Pic", email: "badpic@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
    const remaining = await AuthorizedUsers.findOne({ email: "badpic@b.com" });
    expect(remaining).toBeNull();
  });

  it("AI service generic failure → 500, user remains but marked verified:false", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { message: "AI timeout" } },
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { firstName: "Soft", lastName: "Fail", email: "softfail@b.com" },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(500);
    const user = await AuthorizedUsers.findOne({ email: "softfail@b.com" });
    expect(user).not.toBeNull();
    expect(user.verified).toBe(false);
  });

  it("happy path with valid shiftId + departmentId → 201 with linked refs", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
    const dept = await Department.create({
      adminId: admin._id,
      departmentName: "Eng",
    });
    const shift = await Shift.create({
      adminId: admin._id,
      name: "Morning",
      color: "#FF0000",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        firstName: "With",
        lastName: "Refs",
        email: "withrefs@b.com",
        departmentId: dept._id.toString(),
        shiftId: shift._id.toString(),
      },
    });
    req.files = threeFiles();
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(201);
    // createAuthUser saves the department doc { _id } directly under
    // departmentId (the result of .findById().select('_id')), so the
    // stored value is an object — pull _id out.
    const got = payload(res).data;
    const storedDeptId = got.departmentId?._id || got.departmentId;
    expect(storedDeptId.toString()).toBe(dept._id.toString());
    expect(got.shiftId.toString()).toBe(shift._id.toString());
  });
});

// ===========================================================================
// updateAuthUser
// ===========================================================================
describe("AuthUsersService.updateAuthUser", () => {
  async function seedUser(over = {}) {
    return AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Up",
      lastName: "Date",
      email: `up-${Math.random()}@b.com`,
      profilePics: ["/uploads/images/UpDate/1-a.jpg", "/uploads/images/UpDate/2-b.jpg", "/uploads/images/UpDate/3-c.jpg"],
      verified: true,
      ...over,
    });
  }

  it("returns 400 when userId is missing in query", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: {},
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/Missing userId/);
  });

  it("rejects unknown shiftId in body", async () => {
    const user = await seedUser();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
      body: { shiftId: new mongoose.Types.ObjectId().toString() },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/ShiftId does not Exist/);
  });

  it("returns admin-not-found when adminId resolves nothing", async () => {
    const user = await seedUser();
    const orphanAdmin = new mongoose.Types.ObjectId();
    const { req, res, next } = serviceCtx({
      adminId: orphanAdmin.toString(),
      query: { userId: user._id.toString() },
      body: {},
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("rejects unknown departmentId", async () => {
    const user = await seedUser();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
      body: { departmentId: new mongoose.Types.ObjectId().toString() },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid DepartmentId/);
  });

  it("returns 404 when the user being updated does not exist", async () => {
    const ghostId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: ghostId },
      body: {},
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(payload(res).message).toMatch(/Authorized user not found/);
  });

  it("returns 409 when another user already has the requested email", async () => {
    const u1 = await seedUser({ email: "keep@b.com" });
    await seedUser({ email: "taken@b.com" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u1._id.toString() },
      body: { email: "taken@b.com" },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
    expect(payload(res).message).toMatch(/already exists/);
  });

  it("rejects when final profilePic count is less than 1", async () => {
    const u = await seedUser();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
      // sending no pics + no new files → final count = 0
      body: { profilePics: [], email: u.email },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/At least 1 profile image/);
  });

  it("happy path → 200, axios.put succeeds, user is marked verified:true", async () => {
    axios.put.mockResolvedValueOnce({ data: { status: "ok" } });
    const u = await seedUser({ verified: false });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
      body: {
        firstName: "Renamed",
        lastName: "Person",
        email: u.email,
        profilePics: u.profilePics, // keep all 3 existing
      },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    const after = await AuthorizedUsers.findById(u._id);
    expect(after.verified).toBe(true);
    expect(after.firstName).toBe("Renamed");
  });

  it("AI service 'User already registered' → 409", async () => {
    axios.put.mockRejectedValueOnce({
      response: { data: { message: "User already registered" } },
    });
    const u = await seedUser();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
      body: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        profilePics: u.profilePics,
      },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(409);
    expect(payload(res).message).toMatch(/similar facial data is already registered/);
  });

  it("AI service generic error → 500 and user marked verified:false", async () => {
    axios.put.mockRejectedValueOnce({
      response: { data: { message: "AI exploded" } },
    });
    const u = await seedUser({ verified: true });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
      body: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        profilePics: u.profilePics,
      },
    });
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(500);
    const after = await AuthorizedUsers.findById(u._id);
    expect(after.verified).toBe(false);
  });

  it("AI service 'Identity verification failed' → 500 with file cleanup", async () => {
    // Reaching the cleanup branch (lines 892-903) requires:
    //   - axios.put rejects with the exact 'Identity verification failed' message
    //   - uploadedFiles must be a non-empty array (so deleteFileFromStorage
    //     doesn't throw at the "non-empty array" guard).
    // We send 3 new req.files with 0 retained existing pics → uploadedFiles
    // ends up as the 3 sftp paths, newProfilePics has exactly 3 items, and
    // deleteFileFromStorage iterates them (sftp.exists returns false →
    // "Remote file does not exist" rows, no throw).
    axios.put.mockRejectedValueOnce({
      response: { data: { message: "Identity verification failed. Please upload a valid photo" } },
    });
    const u = await seedUser({ verified: true, profilePics: [] });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: u._id.toString() },
      body: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        // no retained profilePics → newProfilePics starts empty;
        // 3 new files will be uploaded and appended.
      },
    });
    req.files = threeFiles();
    await AuthUsersService.updateAuthUser(req, res, next);
    expect(res.statusCode).toBe(500);
    // payload(res).message is err.response.data.message ('Identity verification…')
    expect(payload(res).message).toMatch(/Identity verification failed/);
    // user should be marked unverified after the failure
    const after = await AuthorizedUsers.findById(u._id);
    expect(after.verified).toBe(false);
  });
});
