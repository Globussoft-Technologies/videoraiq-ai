/**
 * Integration coverage for the default-shift fallback in
 * `core/v2/authorizedUsers/authorizedUsers.service.js` createAuthUser.
 *
 * The Create Shift form's "Default Shift" toggle marks one shift per
 * organisation. This is the only thing that reads it: an employee created
 * without an explicit shiftId inherits it, so a tenant that configured a
 * default doesn't have to assign every new hire by hand.
 *
 * Mock surface mirrors authorizedUsers.service.createUpdate.test.js — axios
 * (the AI registration call) plus the two SFTP helpers the upload path uses.
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
  withSFTPConnection: vi.fn(async (cb) => cb(sftpClient)),
}));
vi.mock("axios", () => ({
  default: { post: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));

const { default: AuthUsersService } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.service.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Shift } = await import("../../../core/v2/shifts/shifts.model.js");
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
    user_id: "802",
    login: "default-shift",
    email: "defaultshift@test.com",
  });
  vi.clearAllMocks();
});

const threeFiles = () =>
  ["a.jpg", "b.jpg", "c.jpg"].map((originalname) => ({
    buffer: Buffer.from("fake-image-data"),
    originalname,
    mimetype: "image/jpeg",
  }));

const createEmployee = async (body) => {
  axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
  const { req, res, next } = serviceCtx({ adminId: admin._id, body });
  req.files = threeFiles();
  await AuthUsersService.createAuthUser(req, res, next);
  return res;
};

describe("createAuthUser — default shift", () => {
  it("assigns the org's default shift when none is given", async () => {
    await Shift.create({ adminId: admin._id, name: "Evening" });
    const fallback = await Shift.create({
      adminId: admin._id,
      name: "General",
      isDefault: true,
    });

    const res = await createEmployee({
      firstName: "No",
      lastName: "Shift",
      email: "noshift@b.com",
    });

    expect(res.statusCode).toBe(201);
    const created = await AuthorizedUsers.findOne({ email: "noshift@b.com" });
    expect(String(created.shiftId)).toBe(String(fallback._id));
  });

  it("leaves an explicitly chosen shift alone", async () => {
    await Shift.create({ adminId: admin._id, name: "General", isDefault: true });
    const chosen = await Shift.create({ adminId: admin._id, name: "Night" });

    await createEmployee({
      firstName: "Picked",
      lastName: "Shift",
      email: "picked@b.com",
      shiftId: chosen._id.toString(),
    });

    const created = await AuthorizedUsers.findOne({ email: "picked@b.com" });
    expect(String(created.shiftId)).toBe(String(chosen._id));
  });

  it("leaves the employee unassigned when the org has no default", async () => {
    await Shift.create({ adminId: admin._id, name: "Evening" });

    await createEmployee({
      firstName: "None",
      lastName: "Default",
      email: "nodefault@b.com",
    });

    const created = await AuthorizedUsers.findOne({ email: "nodefault@b.com" });
    expect(created.shiftId).toBeNull();
  });

  it("never inherits another tenant's default shift", async () => {
    const otherAdmin = await Admin.create({
      user_id: "803",
      login: "other-tenant",
      email: "other@test.com",
    });
    await Shift.create({ adminId: otherAdmin._id, name: "Theirs", isDefault: true });

    await createEmployee({
      firstName: "Mine",
      lastName: "Only",
      email: "mineonly@b.com",
    });

    const created = await AuthorizedUsers.findOne({ email: "mineonly@b.com" });
    expect(created.shiftId).toBeNull();
  });

  it("ignores a default shift that has been deactivated", async () => {
    await Shift.create({
      adminId: admin._id,
      name: "Retired",
      isDefault: true,
      isActive: false,
    });

    await createEmployee({
      firstName: "Inactive",
      lastName: "Default",
      email: "inactivedefault@b.com",
    });

    const created = await AuthorizedUsers.findOne({ email: "inactivedefault@b.com" });
    expect(created.shiftId).toBeNull();
  });
});
