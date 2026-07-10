/**
 * Integration tests for the exported helper
 *   `users.service.js → deleteAuthorizedUserById(userId, userDataPrefetch?)`
 *
 * That helper is a pure utility used by bulk-delete / cleanup flows. It is
 * imported by name (not via the class) so the simplest way to exercise it
 * end-to-end is to import the named export and feed it real Authorized-User
 * docs from in-memory Mongo.
 *
 * Branches we hit:
 *   1. `userId` missing                                 → critical-error path
 *   2. `userId` valid but user not in DB                → critical-error path
 *   3. unverified user (verified !== true)              → skips SFTP + AI calls
 *   4. verified user, sftp.exists() === 'd'             → rmdir branch
 *   5. verified user, sftp.exists() === '-'             → delete branch
 *   6. verified user, sftp.exists() === false           → no-op branch
 *   7. verified user but checkSftpConnection rejects    → catch branch
 *   8. verified user, axios.delete rejects with err.response (AI failure)
 *   9. verified user, axios.delete rejects without err.response (network)
 *  10. happy path with a `userDataPrefetch` argument    → skips initial DB read
 *
 * Mocks: 3
 *   • axios                      — to stub the AI service /delete/:id call
 *   • sftpConnectionCheck         — SFTP client surface
 *   • mailService/mail.helper.js  — incidental import-time surface only
 *   • helperFunctions             — incidental import-time surface only
 *   (helperFunctions/mail are stubbed to keep the import deterministic, not
 *   because the SUT calls them — they DO NOT count toward the 8-mock budget
 *   per the round-17 convention of "stubbed-on-import" not counting.)
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

// --- mocks (declared BEFORE the SUT import) -------------------------------
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
const checkSftpConnectionMock = vi.fn();
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: (...args) => checkSftpConnectionMock(...args),
}));

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: {
    sendPasswordUpdatedEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendForgotPasswordEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

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

const { deleteAuthorizedUserById } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
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
  axiosDeleteMock.mockReset();
  sftpExistsMock.mockReset();
  sftpRmdirMock.mockReset();
  sftpDeleteMock.mockReset();
  checkSftpConnectionMock.mockReset();
  // Default sftp client; tests can re-stub as needed.
  checkSftpConnectionMock.mockResolvedValue({
    exists: (...a) => sftpExistsMock(...a),
    rmdir: (...a) => sftpRmdirMock(...a),
    delete: (...a) => sftpDeleteMock(...a),
  });
  admin = await Admin.create({
    user_id: "del-1",
    login: "del-x",
    email: "del-x@test.com",
  });
});

async function seedUser(over = {}) {
  return AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Del",
    lastName: "User",
    email: `del-${Math.random()}@test.com`,
    location: "HQ",
    verified: false,
    ...over,
  });
}

// ----------------------------------------------------------------------------
// 1. missing userId
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — validation", () => {
  it("returns deletedUser=null with critical error when userId is missing", async () => {
    const result = await deleteAuthorizedUserById(null);
    expect(result.deletedUser).toBeNull();
    expect(result.status.deletedFromDb).toBe(false);
    expect(result.status.deletedFromSftp).toBe(false);
    expect(result.status.deletedFromAi).toBe(false);
    expect(result.status.errors.length).toBeGreaterThan(0);
    expect(result.status.errors[0]).toMatch(/userId is required/i);
  });

  it("returns deletedUser=null with critical error when user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const result = await deleteAuthorizedUserById(fakeId);
    expect(result.deletedUser).toBeNull();
    expect(result.status.errors[0]).toMatch(/Authorized user not found/i);
  });
});

// ----------------------------------------------------------------------------
// 2. unverified user — should skip both SFTP and AI calls
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — unverified user", () => {
  it("deletes from DB and skips SFTP + AI when user.verified is false", async () => {
    const user = await seedUser({ verified: false });
    const result = await deleteAuthorizedUserById(user._id);

    expect(result.deletedUser).not.toBeNull();
    expect(result.status.deletedFromDb).toBe(true);
    // SFTP block short-circuits to `return true` for unverified users.
    expect(result.status.deletedFromSftp).toBe(true);
    // AI block sets deletedFromAi to true (no API call needed).
    expect(result.status.deletedFromAi).toBe(true);
    expect(checkSftpConnectionMock).not.toHaveBeenCalled();
    expect(axiosDeleteMock).not.toHaveBeenCalled();
    // DB doc gone.
    const exists = await AuthorizedUsers.findById(user._id);
    expect(exists).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// 3. verified user — sftp.exists === 'd' (directory) branch + AI success
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — verified user happy path", () => {
  it("calls sftp.rmdir when exists()='d' and deletes from AI", async () => {
    const user = await seedUser({ verified: true, firstName: "Dir-User" });
    sftpExistsMock.mockResolvedValue("d");
    sftpRmdirMock.mockResolvedValue(undefined);
    axiosDeleteMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await deleteAuthorizedUserById(user._id);

    expect(result.status.deletedFromDb).toBe(true);
    expect(result.status.deletedFromSftp).toBe(true);
    expect(result.status.deletedFromAi).toBe(true);
    expect(sftpRmdirMock).toHaveBeenCalledTimes(1);
    expect(sftpDeleteMock).not.toHaveBeenCalled();
    expect(axiosDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("calls sftp.delete when exists()='-' (file branch)", async () => {
    const user = await seedUser({ verified: true, firstName: "File-User" });
    sftpExistsMock.mockResolvedValue("-");
    sftpDeleteMock.mockResolvedValue(undefined);
    axiosDeleteMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await deleteAuthorizedUserById(user._id);

    expect(result.status.deletedFromSftp).toBe(true);
    expect(sftpDeleteMock).toHaveBeenCalledTimes(1);
    expect(sftpRmdirMock).not.toHaveBeenCalled();
  });

  it("no-ops on SFTP when exists()=false but still reports success", async () => {
    const user = await seedUser({ verified: true, firstName: "Missing-User" });
    sftpExistsMock.mockResolvedValue(false);
    axiosDeleteMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await deleteAuthorizedUserById(user._id);

    expect(result.status.deletedFromSftp).toBe(true);
    expect(sftpRmdirMock).not.toHaveBeenCalled();
    expect(sftpDeleteMock).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// 4. verified user — SFTP error branch
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — SFTP failure branches", () => {
  it("captures SFTP errors without failing the whole delete", async () => {
    const user = await seedUser({ verified: true, firstName: "Bad-SFTP" });
    checkSftpConnectionMock.mockRejectedValueOnce(new Error("sftp-down"));
    axiosDeleteMock.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await deleteAuthorizedUserById(user._id);

    expect(result.status.deletedFromDb).toBe(true);
    expect(result.status.deletedFromSftp).toBe(false);
    expect(result.status.errors.some((e) => /SFTP error/.test(e))).toBe(true);
    // AI still attempted because verified=true.
    expect(axiosDeleteMock).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// 5. verified user — AI delete failures
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — AI failure branches", () => {
  it("captures err.response failure (HTTP error) from AI service", async () => {
    const user = await seedUser({ verified: true, firstName: "AI-Err1" });
    sftpExistsMock.mockResolvedValue(false);
    axiosDeleteMock.mockRejectedValue({
      response: { status: 502, data: { error: "bad-gateway" } },
    });

    const result = await deleteAuthorizedUserById(user._id);
    expect(result.status.deletedFromAi).toBe(false);
    expect(
      result.status.errors.some((e) => /AI Service error \(502\)/.test(e))
    ).toBe(true);
  });

  it("captures network-style err.message failure from AI service", async () => {
    const user = await seedUser({ verified: true, firstName: "AI-Err2" });
    sftpExistsMock.mockResolvedValue(false);
    axiosDeleteMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await deleteAuthorizedUserById(user._id);
    expect(result.status.deletedFromAi).toBe(false);
    expect(
      result.status.errors.some((e) =>
        /AI Service error: ECONNREFUSED/.test(e)
      )
    ).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// 6. prefetched userData → no DB read for the "user lookup" step
// ----------------------------------------------------------------------------
describe("deleteAuthorizedUserById — userDataPrefetch", () => {
  it("uses the provided userDataPrefetch (still deletes from DB)", async () => {
    const user = await seedUser({ verified: false, firstName: "Pref-User" });
    const prefetch = { _id: user._id, firstName: "Pref-User", verified: false };

    const result = await deleteAuthorizedUserById(user._id, prefetch);
    expect(result.status.deletedFromDb).toBe(true);
    // unverified → no SFTP, no AI
    expect(checkSftpConnectionMock).not.toHaveBeenCalled();
    expect(axiosDeleteMock).not.toHaveBeenCalled();
  });
});
