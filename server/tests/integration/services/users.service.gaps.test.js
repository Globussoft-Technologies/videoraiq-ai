/**
 * Gap-fill for users.service.js → deleteAuthorizedUserById local-cache
 * branch (lines 1923-1941). The existing
 * users.service.deleteAuthorizedUserById.test.js covers the SFTP and AI
 * arms exhaustively but never makes `fs.existsSync(cachedFilePath)` return
 * true, so:
 *   - Line 1935 (closing brace after rmSync/unlinkSync inner-if) is cold.
 *   - Lines 1937-1941 (the catch arm pushing `Local cache error: …`) are cold.
 *
 * We mock `fs` so existsSync returns true and lstatSync drives both arms
 * (file + directory), and one test forces fs.existsSync to throw so the
 * catch handler runs.
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

// ---- mocks (declared BEFORE the SUT import) ----------------------------

const fsState = {
  exists: true,
  isDir: false,
  throwOnExists: false,
};

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn((p) => {
        if (fsState.throwOnExists) throw new Error("fs-blew-up");
        // The product also reads existsSync on logDir at module load → defer
        // to the real impl for paths that are clearly the logs directory.
        if (typeof p === "string" && p.includes("logs")) {
          return actual.default.existsSync(p);
        }
        return fsState.exists;
      }),
      lstatSync: vi.fn(() => ({ isDirectory: () => fsState.isDir })),
      rmSync: vi.fn(),
      unlinkSync: vi.fn(),
      mkdirSync: actual.default.mkdirSync,
    },
    existsSync: vi.fn(() => false),
    mkdirSync: actual.mkdirSync,
  };
});

// Minimal axios + sftp + mail stubs (same shape as the existing test file).
vi.mock("axios", () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    rmdir: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { sendMail: vi.fn().mockResolvedValue(undefined) },
}));

const { deleteAuthorizedUserById } = await import(
  "../../../core/v1/users/users.service.js"
);
const authorizedUsers = (
  await import("../../../core/v1/AuthorizedUsers/authorizedUsers.model.js")
).default;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  fsState.exists = true;
  fsState.isDir = false;
  fsState.throwOnExists = false;
});

async function seedUser(over = {}) {
  return authorizedUsers.create({
    firstName: "GapUser",
    lastName: "Doe",
    verified: true,
    adminId: new mongoose.Types.ObjectId(),
    ...over,
  });
}

describe("deleteAuthorizedUserById local-cache branch (gap-fill)", () => {
  it("calls fs.unlinkSync when the cached path is a file (line 1933)", async () => {
    const fs = (await import("fs")).default;
    fsState.exists = true;
    fsState.isDir = false;
    const u = await seedUser({ firstName: "FileUser" });

    const result = await deleteAuthorizedUserById(u._id);

    expect(fs.unlinkSync).toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
    // The DB delete happens regardless of fs outcome; result is always an
    // object with deletedFromDb. If the helper hit a critical pre-flight
    // error, deletedFromDb is undefined (the prefetched failure). Either way,
    // the assertion below ensures the helper returned a structured object.
    expect(result).toBeDefined();
    expect(result.status?.deletedFromDb).toBe(true);
  });

  it("calls fs.rmSync(recursive) when the cached path is a directory (line 1931)", async () => {
    const fs = (await import("fs")).default;
    fsState.exists = true;
    fsState.isDir = true;
    const u = await seedUser({ firstName: "DirUser" });

    const result = await deleteAuthorizedUserById(u._id);

    expect(fs.rmSync).toHaveBeenCalled();
    // `rmSync` may also be called by other paths (e.g. logger setup); look
    // for the call whose second arg matches our recursive+force option bag.
    const matchingCall = fs.rmSync.mock.calls.find(
      (c) => c[1]?.recursive === true && c[1]?.force === true,
    );
    expect(matchingCall).toBeDefined();
    expect(result.status?.deletedFromDb).toBe(true);
  });

  it("logs + pushes to status.errors when fs throws (lines 1937-1941)", async () => {
    fsState.throwOnExists = true;
    const u = await seedUser({ firstName: "ErrorUser" });

    const result = await deleteAuthorizedUserById(u._id);

    // The local-cache IIFE caught the error and pushed onto status.errors.
    expect(result.status?.errors?.some((e) => /Local cache error/.test(e))).toBe(true);
    expect(result.status?.deletedFromDb).toBe(true);
  });
});
