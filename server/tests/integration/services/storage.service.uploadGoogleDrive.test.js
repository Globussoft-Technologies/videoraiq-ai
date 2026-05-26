/**
 * Integration coverage for StorageService.uploadFile → uploadToGoogleDrive
 * branch + the `findOrCreateFolder` helper. After R73 (streamFromGoogleDrive)
 * + R74 (SFTP stream pool), the upload-side Google Drive path remained
 * uncovered: lines ~732-829 (uploadToGoogleDrive body + findOrCreateFolder).
 *
 * Branches pinned (R75 server):
 *   - uploadFile lookup → google_drive_oauth case → uploadToGoogleDrive
 *     (storage.findOne, JSON.parse(decryptJSON), switch).
 *   - findOrCreateFolder "miss" branch: drive.files.list returns 0 files →
 *     drive.files.create with the folder mimeType + parents=[] then with
 *     parents=[parentFolderId]. Two list+create round-trips per upload (one
 *     per folder).
 *   - findOrCreateFolder "hit" branch: drive.files.list returns an existing
 *     folder → uses its id, NO files.create for that folder. Second-call
 *     hit branch is verified by having the "Incidents" subfolder already
 *     exist on the next list call.
 *   - uploadToGoogleDrive success path: drive.files.create third call
 *     uploads the media body, returns {data: {id}}, Files row persisted,
 *     safeTempFileDelete unlinks the temp file under uploads/, 200 JSON
 *     {fileId}.
 *   - uploadToGoogleDrive catch arm: drive.files.create (upload) rejects →
 *     500 JSON, safeTempFileDelete still runs, no Files row created.
 *
 * Mocks (5, under the 8-mock ceiling):
 *   1. `googleapis` — google.auth.OAuth2 + google.drive (files.list/create)
 *   2. `@aws-sdk/client-s3` — quiet the module-scope import
 *   3. `ssh2-sftp-client` — quiet the module-scope import
 *   4. `mime-types` — fixed extension
 *   5. `utils/newSFTPConnectionCheck.js` — quiet the sftp-cleanup interval
 *
 * Real cryptoUtils is used end-to-end so credentials decryption mirrors
 * production. A real Storage row + real mongo-memory-server are used so
 * the storage.findOne lookup actually exercises mongoose.
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
import fs from "fs";
import path from "path";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";
import { encryptJSON } from "../../../utils/cryptoUtils.js";

// --- mocks ---

// googleapis: track each call to files.list and files.create so the test
// can drive the folder-find vs folder-create vs upload-create branches.
const filesListMock = vi.fn();
const filesCreateMock = vi.fn();
const driveFactoryMock = vi.fn(() => ({
  files: {
    list: filesListMock,
    create: filesCreateMock,
  },
}));
const setCredentialsMock = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: setCredentialsMock,
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
      })),
      JWT: vi.fn().mockImplementation(() => ({})),
    },
    drive: driveFactoryMock,
  },
}));

// Quiet the AWS SDK + SFTP module-scope imports.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));
vi.mock("ssh2-sftp-client", () => ({
  default: vi.fn(),
}));

// mime-types: stable extension.
vi.mock("mime-types", () => ({
  default: {
    extension: vi.fn(() => "mp4"),
    lookup: vi.fn(() => "video/mp4"),
  },
  extension: vi.fn(() => "mp4"),
  lookup: vi.fn(() => "video/mp4"),
}));

// Quiet the SFTP-pool cleanup interval (module-load side effect).
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

// --- imports (after mocks) ---
const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Files } = await import(
  "../../../core/v1/files/files.model.js"
);

let admin;
let tempPath;

// Use `<repo>/uploads/...` so `safeTempFileDelete` (which only unlinks
// paths under the resolved uploads dir) actually fires.
const UPLOADS_DIR = path.resolve("uploads");

beforeAll(async () => {
  await connectMongo();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  filesListMock.mockReset();
  filesCreateMock.mockReset();
  setCredentialsMock.mockClear();
  driveFactoryMock.mockClear();
  admin = await Admin.create({
    user_id: "1",
    login: "gdrive-upload-test",
    email: "gdu@test.com",
  });
  tempPath = path.join(
    UPLOADS_DIR,
    `gdrive-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  );
  fs.writeFileSync(tempPath, "gdrive-content");
});

// The lazy ReadStream created inside uploadToGoogleDrive can emit ENOENT
// on a later tick once safeTempFileDelete has unlinked the file. Swallow
// only ENOENTs for our temp paths.
process.on("uncaughtException", (err) => {
  if (err && err.code === "ENOENT" && err.path?.includes("gdrive-upload-")) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[storage.service.uploadGoogleDrive.test] unhandled:", err);
});

/** Persist an active google_drive_oauth Storage row with encrypted creds. */
async function seedActiveDriveStorage() {
  const creds = {
    clientId: "CID_TEST",
    clientSecret: "CSECRET_TEST",
    refresh_token: "RT_TEST",
  };
  const row = await Storage.create({
    userId: admin._id,
    name: "active-gdrive",
    type: "google_drive_oauth",
    credentials: encryptJSON(JSON.stringify(creds)),
  });
  expect(row.active).toBe(true);
  return row;
}

function makeFileReq() {
  return {
    file: {
      path: tempPath,
      mimetype: "video/mp4",
      size: fs.statSync(tempPath).size,
      originalname: "clip.mp4",
    },
    body: { adminId: admin._id.toString() },
  };
}

describe("StorageService.uploadFile — Google Drive happy path", () => {
  it("creates both folders when neither exists, uploads the file, persists Files row", async () => {
    const storage = await seedActiveDriveStorage();

    // findOrCreateFolder("VideoraIQ", null) → list empty, then create folder
    filesListMock.mockResolvedValueOnce({ data: { files: [] } });
    filesCreateMock.mockResolvedValueOnce({ data: { id: "FOLDER_VIDEORAIQ" } });

    // findOrCreateFolder("Incidents", "FOLDER_VIDEORAIQ") → list empty, create
    filesListMock.mockResolvedValueOnce({ data: { files: [] } });
    filesCreateMock.mockResolvedValueOnce({ data: { id: "FOLDER_INCIDENTS" } });

    // Final upload: drive.files.create with media body
    filesCreateMock.mockResolvedValueOnce({ data: { id: "DRIVE_FILE_999" } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(setCredentialsMock).toHaveBeenCalledWith({
      refresh_token: "RT_TEST",
    });

    // Two list calls for the two findOrCreateFolder invocations.
    expect(filesListMock).toHaveBeenCalledTimes(2);
    const list1 = filesListMock.mock.calls[0][0];
    expect(list1.q).toContain("name='VideoraIQ'");
    expect(list1.q).toContain("mimeType='application/vnd.google-apps.folder'");
    // First call has NO parent filter (parentId === null).
    expect(list1.q).not.toContain("in parents");

    const list2 = filesListMock.mock.calls[1][0];
    expect(list2.q).toContain("name='Incidents'");
    // Second call constrains to the VideoraIQ parent.
    expect(list2.q).toContain("'FOLDER_VIDEORAIQ' in parents");

    // Three create calls: VideoraIQ folder, Incidents subfolder, the file.
    expect(filesCreateMock).toHaveBeenCalledTimes(3);

    const folderCreate1 = filesCreateMock.mock.calls[0][0];
    expect(folderCreate1.resource.name).toBe("VideoraIQ");
    expect(folderCreate1.resource.mimeType).toBe(
      "application/vnd.google-apps.folder"
    );
    expect(folderCreate1.resource.parents).toEqual([]);

    const folderCreate2 = filesCreateMock.mock.calls[1][0];
    expect(folderCreate2.resource.name).toBe("Incidents");
    expect(folderCreate2.resource.parents).toEqual(["FOLDER_VIDEORAIQ"]);

    const upload = filesCreateMock.mock.calls[2][0];
    expect(upload.resource.name).toMatch(/\.mp4$/);
    expect(upload.resource.parents).toEqual(["FOLDER_INCIDENTS"]);
    expect(upload.media.mimeType).toBe("video/mp4");
    expect(upload.media.body).toBeDefined();

    // A Files row was persisted with the Drive file id + the storage row id.
    const stored = await Files.findOne({ userId: admin._id });
    expect(stored).not.toBeNull();
    expect(stored.fileId).toBe("DRIVE_FILE_999");
    expect(stored.storageId.toString()).toBe(storage._id.toString());

    // safeTempFileDelete runs async via fs.unlink callback — give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it("reuses an existing 'VideoraIQ' folder (findOrCreateFolder hit branch)", async () => {
    await seedActiveDriveStorage();

    // VideoraIQ already exists → no create for parent folder.
    filesListMock.mockResolvedValueOnce({
      data: { files: [{ id: "EXISTING_VIDEORAIQ" }] },
    });
    // Incidents subfolder still needs to be created.
    filesListMock.mockResolvedValueOnce({ data: { files: [] } });
    filesCreateMock.mockResolvedValueOnce({ data: { id: "FOLDER_INCIDENTS" } });
    // Upload call.
    filesCreateMock.mockResolvedValueOnce({ data: { id: "DRIVE_FILE_REUSED" } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    // Only TWO create calls now: Incidents folder + the actual upload.
    expect(filesCreateMock).toHaveBeenCalledTimes(2);
    expect(filesCreateMock.mock.calls[0][0].resource.name).toBe("Incidents");
    expect(filesCreateMock.mock.calls[0][0].resource.parents).toEqual([
      "EXISTING_VIDEORAIQ",
    ]);

    const stored = await Files.findOne({ userId: admin._id });
    expect(stored.fileId).toBe("DRIVE_FILE_REUSED");
  });

  it("returns 500 when the Drive file upload rejects (catch arm)", async () => {
    await seedActiveDriveStorage();

    filesListMock.mockResolvedValueOnce({ data: { files: [] } });
    filesCreateMock.mockResolvedValueOnce({ data: { id: "FOLDER_VIDEORAIQ" } });
    filesListMock.mockResolvedValueOnce({ data: { files: [] } });
    filesCreateMock.mockResolvedValueOnce({ data: { id: "FOLDER_INCIDENTS" } });
    // Upload itself rejects — drives the catch arm.
    filesCreateMock.mockRejectedValueOnce(new Error("Drive quota exceeded"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(500);
    // No Files row should have been persisted.
    expect(await Files.countDocuments()).toBe(0);
    // safeTempFileDelete still runs from the catch arm.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(tempPath)).toBe(false);
  });
});
