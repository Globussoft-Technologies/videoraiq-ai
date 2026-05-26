/**
 * Integration tests for AuthUsersService module — the exported helper
 * `deleteFileFromStorage` (lines 1317-1402 of authorizedUsers.service.js).
 *
 * The helper deletes a batch of files from local cache + remote SFTP and
 * returns a per-path success/failure breakdown. It currently has 0%
 * coverage. The function pulls in `checkSftpConnection` (returns a
 * sftp-promise-style client with `exists` + `delete`) and `fs.existsSync /
 * lstatSync / unlinkSync` on the local cache side.
 *
 * Branches exercised here:
 *   - empty / non-array input → throw "remoteFilePaths must be a non-empty array"
 *   - falsy filePath entries → skipped via `continue`
 *   - local cache file exists + isFile → unlinked
 *   - local cache exists but is not a regular file → no unlink
 *   - URI-encoded paths get decoded before SFTP delegation
 *   - remote exists returns false → success:false "Remote file does not exist"
 *   - remote exists returns a non-"-" type (e.g. "d" for directory) →
 *     success:false "Remote path is not a file"
 *   - remote exists returns "-" → sftp.delete called, success:true
 *   - per-path try/catch → sftp.exists rejecting is caught, recorded as failed
 *   - outer try/catch → checkSftpConnection rejecting bubbles up
 *
 * Mocks: 3 — `utils/sftpConnectionCheck` (for checkSftpConnection),
 * `axios` and `utils/newSFTPConnectionCheck` (top-level dependencies of
 * the service module, irrelevant to this helper but pulled in by import).
 * `fs` is spied on per-test rather than mocked — a top-level `vi.mock("fs")`
 * trips utils/logger's `mkdirSync(logDir)` at module load.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
} from "vitest";
import fs from "fs";

// sftp client returned by checkSftpConnection — `exists` returns one of
// `false` | "-" | "d" | other; `delete` resolves to undefined.
const sftpClient = {
  exists: vi.fn(),
  delete: vi.fn(),
};
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue(sftpClient),
}));

// axios + newSFTPConnectionCheck are unrelated but get pulled in by the
// service's top-level imports; stub them to avoid network/disk.
vi.mock("axios", () => ({
  default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
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

const { checkSftpConnection } = await import(
  "../../../utils/sftpConnectionCheck.js"
);
const { deleteFileFromStorage } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.service.js"
);

let existsSpy;
let lstatSpy;
let unlinkSpy;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm the default checkSftpConnection resolution after clearAllMocks
  // wipes the mockResolvedValue from the factory.
  checkSftpConnection.mockResolvedValue(sftpClient);
  // Default: nothing in local cache. Tests opt-in to true via mockReturnValueOnce.
  existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
  lstatSpy = vi.spyOn(fs, "lstatSync").mockReturnValue({ isFile: () => false });
  unlinkSpy = vi.spyOn(fs, "unlinkSync").mockReturnValue(undefined);
});

afterEach(() => {
  existsSpy.mockRestore();
  lstatSpy.mockRestore();
  unlinkSpy.mockRestore();
});

describe("authorizedUsers.service.deleteFileFromStorage", () => {
  it("throws when remoteFilePaths is not an array", async () => {
    await expect(deleteFileFromStorage(null, "/tmp/c")).rejects.toThrow(
      /non-empty array/
    );
  });

  it("throws when remoteFilePaths is an empty array", async () => {
    await expect(deleteFileFromStorage([], "/tmp/c")).rejects.toThrow(
      /non-empty array/
    );
  });

  it("skips falsy entries and continues with the rest", async () => {
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);

    const out = await deleteFileFromStorage(["", "/remote/real.jpg"], "/tmp/c");

    expect(out.success).toBe(true);
    expect(out.total).toBe(2); // total reflects input length
    // only the real path produced a result; "" is short-circuited via `continue`
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toEqual({
      path: "/remote/real.jpg",
      success: true,
      message: "File deleted successfully",
    });
  });

  it("unlinks the local cache file when it exists and is a regular file", async () => {
    existsSpy.mockReturnValueOnce(true);
    lstatSpy.mockReturnValueOnce({ isFile: () => true });
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);

    const out = await deleteFileFromStorage(
      ["/remote/dir/photo.jpg"],
      "/tmp/cache"
    );

    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    // basename joined with cacheDir
    expect(unlinkSpy.mock.calls[0][0]).toContain("photo.jpg");
    expect(sftpClient.delete).toHaveBeenCalledWith("/remote/dir/photo.jpg");
    expect(out.results[0].success).toBe(true);
  });

  it("does NOT unlink when the cached path is not a regular file", async () => {
    existsSpy.mockReturnValueOnce(true);
    lstatSpy.mockReturnValueOnce({ isFile: () => false });
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);

    const out = await deleteFileFromStorage(["/remote/foo.jpg"], "/tmp/cache");

    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(out.results[0].success).toBe(true);
  });

  it("decodes URI-encoded paths before delegating to sftp", async () => {
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);

    const encoded = "/remote/space%20here/img.jpg";
    const out = await deleteFileFromStorage([encoded], "/tmp/cache");

    expect(sftpClient.exists).toHaveBeenCalledWith(
      "/remote/space here/img.jpg"
    );
    expect(sftpClient.delete).toHaveBeenCalledWith(
      "/remote/space here/img.jpg"
    );
    expect(out.results[0].path).toBe("/remote/space here/img.jpg");
  });

  it("records 'Remote file does not exist' when sftp.exists returns false", async () => {
    sftpClient.exists.mockResolvedValueOnce(false);

    const out = await deleteFileFromStorage(["/remote/gone.jpg"], "/tmp/cache");

    expect(sftpClient.delete).not.toHaveBeenCalled();
    expect(out.results[0]).toEqual({
      path: "/remote/gone.jpg",
      success: false,
      message: "Remote file does not exist",
    });
  });

  it("records 'Remote path is not a file' when sftp.exists returns a non-'-' type", async () => {
    sftpClient.exists.mockResolvedValueOnce("d"); // directory marker

    const out = await deleteFileFromStorage(["/remote/folder"], "/tmp/cache");

    expect(sftpClient.delete).not.toHaveBeenCalled();
    expect(out.results[0]).toEqual({
      path: "/remote/folder",
      success: false,
      message: "Remote path is not a file",
    });
  });

  it("per-path try/catch: records err.message and continues to the next path", async () => {
    // first path: sftp.exists rejects → caught at per-path level
    sftpClient.exists.mockRejectedValueOnce(new Error("boom"));
    // second path: succeeds
    sftpClient.exists.mockResolvedValueOnce("-");
    sftpClient.delete.mockResolvedValueOnce(undefined);

    const out = await deleteFileFromStorage(
      ["/remote/a.jpg", "/remote/b.jpg"],
      "/tmp/cache"
    );

    expect(out.success).toBe(true);
    expect(out.total).toBe(2);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toEqual({
      path: "/remote/a.jpg",
      success: false,
      message: "boom",
    });
    expect(out.results[1].success).toBe(true);
  });

  it("returns the aggregate envelope { success, total, results } on the happy path", async () => {
    sftpClient.exists.mockResolvedValue("-");
    sftpClient.delete.mockResolvedValue(undefined);

    const out = await deleteFileFromStorage(
      ["/r/1.jpg", "/r/2.jpg", "/r/3.jpg"],
      "/tmp/cache"
    );

    expect(out).toMatchObject({
      success: true,
      total: 3,
      results: expect.any(Array),
    });
    expect(out.results).toHaveLength(3);
    expect(out.results.every((r) => r.success === true)).toBe(true);
    expect(sftpClient.delete).toHaveBeenCalledTimes(3);
  });

  it("outer try/catch: rethrows when checkSftpConnection itself fails", async () => {
    checkSftpConnection.mockRejectedValueOnce(new Error("no sftp"));

    await expect(
      deleteFileFromStorage(["/remote/x.jpg"], "/tmp/cache")
    ).rejects.toThrow(/no sftp/);
  });
});
