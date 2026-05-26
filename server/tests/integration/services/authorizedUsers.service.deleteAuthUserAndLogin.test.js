/**
 * Integration tests for AuthUsersService — three previously-uncovered
 * methods on `core/v1/authorizedUsers/authorizedUsers.service.js`:
 *
 *   - `deleteAuthUser` (lines 940-1038, ~100 stmts) — was 0% covered.
 *     Pins: missing userId guard, admin-not-found guard, user-not-found
 *     guard, the local-cache + SFTP cleanup branches (file vs directory
 *     vs absent), the AI-delete inner try/catch (axios success and
 *     axios.response error and axios non-response error branches), and
 *     the outer error path via a deliberate DB failure.
 *
 *   - `authUserLogin` (lines 1040-1093) — the existing `*.extras` test
 *     hits the missing-field and unknown-user branches, but the happy
 *     path (correct password → JWT issued) and the wrong-password 400
 *     branch are still uncovered. We seed an AuthorizedUser whose
 *     `password` is auto-encrypted by the pre-save hook so the
 *     production `decrypt(...)` actually round-trips.
 *
 *   - `verifyUser` (lines 544-593) — only the missing-file 400 branch
 *     was covered. Here we mock `axios.post` to return the three
 *     downstream shapes the route handles: empty results array (→ "No
 *     match found"), explicit `recognized:false` (→ "User not
 *     verified"), and a recognised hit (→ "User verified"). Each one
 *     pins a different code path in the response branching.
 *
 * Mocks: 3 — `axios` (POST + DELETE), `utils/sftpConnectionCheck`
 * (deleteAuthUser uses `checkSftpConnection`), `utils/newSFTPConnectionCheck`
 * (top-level import; irrelevant to these methods but pulled in). `fs.*`
 * uses `vi.spyOn` per-test rather than `vi.mock("fs")` because the
 * latter clobbers utils/logger's load-time `mkdirSync(logDir)` — this
 * is the same constraint R64's deleteFileFromStorage test discovered.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import fs from "fs";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// ---------------------------------------------------------------------------
// Mock surface (3 mocks total, well under the 8-mock budget).
// ---------------------------------------------------------------------------
const sftpClient = {
  exists: vi.fn(),
  delete: vi.fn(),
  rmdir: vi.fn(),
  end: vi.fn(),
};
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue(sftpClient),
}));
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  }),
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
const { checkSftpConnection } = await import(
  "../../../utils/sftpConnectionCheck.js"
);
const { default: axios } = await import("axios");

let admin;
let existsSpy;
let lstatSpy;
let unlinkSpy;
let rmSpy;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "42",
    login: "del-test",
    email: "del-test@test.com",
  });

  vi.clearAllMocks();
  checkSftpConnection.mockResolvedValue(sftpClient);

  // Default fs spies: nothing on disk. Tests opt in to true via mockReturnValueOnce.
  existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
  lstatSpy = vi.spyOn(fs, "lstatSync").mockReturnValue({
    isFile: () => false,
    isDirectory: () => false,
  });
  unlinkSpy = vi.spyOn(fs, "unlinkSync").mockReturnValue(undefined);
  rmSpy = vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
});
afterEach(() => {
  existsSpy.mockRestore();
  lstatSpy.mockRestore();
  unlinkSpy.mockRestore();
  rmSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// deleteAuthUser
// ---------------------------------------------------------------------------
describe("AuthUsersService.deleteAuthUser", () => {
  async function seedUser(over = {}) {
    return AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Dave",
      lastName: "Doe",
      email: `dave-${Math.random()}@test.com`,
      ...over,
    });
  }

  it("returns 400 when userId is missing from the query", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";
    await AuthUsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the admin lookup returns no record", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: new mongoose.Types.ObjectId().toString() },
    });
    // Mismatched user_id/email so the adminModel.findOne returns null.
    req.verified.userData.user_id = "9999";
    req.verified.userData.user_email = "ghost@test.com";
    await AuthUsersService.deleteAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns 404 when the user does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: new mongoose.Types.ObjectId().toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";
    await AuthUsersService.deleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(payload(res).status).toBe("failed");
  });

  it("happy path: deletes the user when local cache is empty and SFTP exists returns false", async () => {
    const user = await seedUser();
    // sftp.exists returns false → no rmdir/delete branch on SFTP side.
    sftpClient.exists.mockResolvedValueOnce(false);
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(axios.delete).toHaveBeenCalledTimes(1);
    // The AI delete URL should include uid + db query string.
    const url = axios.delete.mock.calls[0][0];
    expect(url).toContain("/delete?uid=");
    expect(url).toContain("&db=");

    // Confirm DB delete actually happened.
    const remaining = await AuthorizedUsers.findById(user._id);
    expect(remaining).toBeNull();
  });

  it("deletes the local cache file branch (existsSync=true + isFile=true → fs.unlinkSync)", async () => {
    const user = await seedUser({ firstName: "Cachefile" });
    existsSpy.mockReturnValueOnce(true);
    lstatSpy.mockReturnValueOnce({
      isFile: () => true,
      isDirectory: () => false,
    });
    sftpClient.exists.mockResolvedValueOnce(false);
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    expect(rmSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("deletes the local cache directory branch (existsSync=true + isDirectory=true → fs.rmSync)", async () => {
    const user = await seedUser({ firstName: "Cachedir" });
    existsSpy.mockReturnValueOnce(true);
    lstatSpy.mockReturnValueOnce({
      isFile: () => false,
      isDirectory: () => true,
    });
    sftpClient.exists.mockResolvedValueOnce(false);
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(rmSpy).toHaveBeenCalledTimes(1);
    expect(rmSpy.mock.calls[0][1]).toMatchObject({
      recursive: true,
      force: true,
    });
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("SFTP file branch: exists returns '-' → calls sftp.delete on the remote path", async () => {
    const user = await seedUser({ firstName: "SftpFile" });
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(sftpClient.delete).toHaveBeenCalledTimes(1);
    expect(sftpClient.rmdir).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("SFTP directory branch: exists returns 'd' → calls sftp.rmdir(path, true)", async () => {
    const user = await seedUser({ firstName: "SftpDir" });
    sftpClient.exists.mockResolvedValueOnce("d");
    sftpClient.rmdir.mockResolvedValueOnce(undefined);
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(sftpClient.rmdir).toHaveBeenCalledTimes(1);
    expect(sftpClient.rmdir.mock.calls[0][1]).toBe(true);
    expect(sftpClient.delete).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("AI-delete inner catch: axios.delete rejects with response → does not fail the request", async () => {
    const user = await seedUser({ firstName: "AxiosResp" });
    sftpClient.exists.mockResolvedValueOnce(false);
    const err = new Error("ai delete failed");
    err.response = { status: 500, data: { message: "boom" } };
    axios.delete.mockRejectedValueOnce(err);

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    // The inner catch swallows AI errors — overall request still succeeds.
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("AI-delete inner catch: axios.delete rejects without a response object", async () => {
    const user = await seedUser({ firstName: "AxiosNoResp" });
    sftpClient.exists.mockResolvedValueOnce(false);
    axios.delete.mockRejectedValueOnce(new Error("network down"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    // Same — inner catch handles err.message, request still 200.
    expect(res.statusCode).toBe(200);
  });

  it("outer error path: returns 500 when checkSftpConnection itself rejects", async () => {
    const user = await seedUser({ firstName: "OuterErr" });
    checkSftpConnection.mockRejectedValueOnce(new Error("sftp gone"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: user._id.toString() },
    });
    req.verified.userData.user_id = "42";
    req.verified.userData.user_email = "del-test@test.com";

    await AuthUsersService.deleteAuthUser(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// authUserLogin — happy + wrong-password (extras covers the other two
// branches: missing fields and unknown-user-decrypts-undefined-throws-500).
// ---------------------------------------------------------------------------
describe("AuthUsersService.authUserLogin — happy + wrong-password", () => {
  async function seedLoginUser(plainPwd = "secret123") {
    // Model's pre-save hook encrypts `password` via cryptoUtils.encrypt;
    // the test config seeds a deterministic 32-byte key / 16-byte IV.
    return AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Logan",
      lastName: "Lee",
      userName: "logan",
      email: "logan@test.com",
      password: plainPwd,
    });
  }

  it("happy path: issues a JWT for matching email + password", async () => {
    await seedLoginUser("topsecret");

    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "logan@test.com", password: "topsecret" },
    });
    await AuthUsersService.authUserLogin(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.token).toEqual(expect.any(String));
    expect(payload(res).data.userData.user_email).toBe("logan@test.com");
    expect(payload(res).data.userData.userName).toBe("logan");
  });

  it("returns 400 when the password does not match the decrypted DB value", async () => {
    await seedLoginUser("rightpass");

    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "logan@test.com", password: "wrongpass" },
    });
    await AuthUsersService.authUserLogin(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/incorrect/i);
  });

  it("also accepts firstName as the usernameOrEmail (the $or branch)", async () => {
    await seedLoginUser("byfirstname");

    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "Logan", password: "byfirstname" },
    });
    await AuthUsersService.authUserLogin(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// verifyUser — happy paths (the missing-file 400 branch is covered by extras).
// ---------------------------------------------------------------------------
describe("AuthUsersService.verifyUser — downstream branches", () => {
  function ctxWithFile() {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    req.file = {
      buffer: Buffer.from("not-a-real-image"),
      mimetype: "image/jpeg",
      originalname: "face.jpg",
    };
    return { req, res, next };
  }

  it("returns 'No match found' (verified=false) when the AI service returns an empty results array", async () => {
    axios.post.mockResolvedValueOnce({ data: { results: [] } });

    const { req, res, next } = ctxWithFile();
    await AuthUsersService.verifyUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.match).toBe(false);
    expect(payload(res).data.details).toBeNull();
  });

  it("returns 'User not verified' when the first result has recognized=false", async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        results: [{ recognized: false, message: "No match" }],
      },
    });

    const { req, res, next } = ctxWithFile();
    await AuthUsersService.verifyUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.verified).toBe(false);
  });

  it("returns 'User verified' with identity when the first result is a successful recognition", async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        results: [
          {
            recognized: true,
            identity: { firstName: "Logan", id: "abc" },
          },
        ],
      },
    });

    const { req, res, next } = ctxWithFile();
    await AuthUsersService.verifyUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.verified).toBe(true);
    expect(payload(res).data.identity).toEqual({
      firstName: "Logan",
      id: "abc",
    });
  });

  it("returns 500 when the AI service call itself throws", async () => {
    axios.post.mockRejectedValueOnce(new Error("AI down"));

    const { req, res, next } = ctxWithFile();
    await AuthUsersService.verifyUser(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
  });
});
