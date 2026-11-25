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
vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({
  putMediaV2: vi.fn(async ({ originalName }) => `/v2/test/${originalName}`),
  deleteMediaV2: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("axios", () => ({
  default: { post: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: AuthUsersService } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.service.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Shift } = await import("../../../core/v2/shifts/shifts.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: Department } = await import("../../../core/v2/departments/departments.model.js");
const { default: axios } = await import("axios");
const { sendPayloadToUser } = await import("../../../socket.js");

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
    expect(axios.post.mock.calls[0][1].profileImages).toEqual([
      expect.stringContaining("/api/v2/uploads/v2/test/a.jpg"),
      expect.stringContaining("/api/v2/uploads/v2/test/b.jpg"),
      expect.stringContaining("/api/v2/uploads/v2/test/c.jpg"),
    ]);
    expect(sendPayloadToUser).toHaveBeenCalledWith(
      null,
      `authorizedUsers_${admin._id}`,
      expect.objectContaining({ action: "created", userId: created._id })
    );
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


describe("updateAuthUser ? optional DS profile images", () => {
  const update = async ({ retained = ['/v2/test/old.jpg'], files = [], missingInDs = false } = {}) => {
    const employee = await AuthorizedUsers.create({
      adminId: admin._id, firstName: 'Before', lastName: 'User',
      email: 'update@test.com', profilePics: ['/v2/test/old.jpg', '/v2/test/second.jpg'],
    });
    const c = serviceCtx({ adminId: admin._id, query: { userId: String(employee._id) }, body: {
      firstName: 'After', lastName: 'User', email: employee.email, profilePics: retained,
    } });
    c.req.files = files;
    if (missingInDs) {
      axios.put.mockRejectedValueOnce({ response: { data: { message: 'User not found in this collection' } } });
      axios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
    } else axios.put.mockResolvedValueOnce({ data: { status: 'ok' } });
    await AuthUsersService.updateAuthUser(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(200);
    expect(payload(c.res).status).toBe('success');
    return employee;
  };

  it('omits profileImages for details-only edits and retains database paths', async () => {
    const retained = ['/v2/test/old.jpg', '/v2/test/second.jpg'];
    const employee = await update({ retained });
    expect(axios.put.mock.calls[0][0]).toContain('/update_user_info');
    expect(axios.put.mock.calls[0][1]).not.toHaveProperty('profileImages');
    expect(axios.put.mock.calls[0][1].firstName).toBe('After');
    const saved = await AuthorizedUsers.findById(employee._id);
    expect(saved.profilePics).toEqual(retained);
  });

  it('sends the full remaining image list after a removal', async () => {
    await update();
    expect(axios.put.mock.calls[0][1].profileImages).toEqual([expect.stringContaining('/v2/test/old.jpg')]);
  });

  it('sends retained and uploaded images after adding an image', async () => {
    await update({ retained: ['/v2/test/old.jpg', '/v2/test/second.jpg'], files: threeFiles().slice(0, 1) });
    expect(axios.put.mock.calls[0][1].profileImages).toEqual([
      expect.stringContaining('/v2/test/old.jpg'), expect.stringContaining('/v2/test/second.jpg'), expect.stringContaining('/v2/test/a.jpg'),
    ]);
  });

  it('sends replacement images when the final image count is unchanged', async () => {
    await update({ files: threeFiles().slice(0, 1) });
    expect(axios.put.mock.calls[0][1].profileImages).toEqual([
      expect.stringContaining('/v2/test/old.jpg'), expect.stringContaining('/v2/test/a.jpg'),
    ]);
  });

  it('includes saved images in registration when DS is missing the user', async () => {
    await update({ retained: ['/v2/test/old.jpg', '/v2/test/second.jpg'], missingInDs: true });
    expect(axios.put.mock.calls[0][1]).not.toHaveProperty('profileImages');
    expect(axios.post.mock.calls[0][0]).toContain('/register');
    expect(axios.post.mock.calls[0][1].profileImages).toEqual([
      expect.stringContaining('/v2/test/old.jpg'), expect.stringContaining('/v2/test/second.jpg'),
    ]);
  });
});

describe('employee attendance camera assignments', () => {
  const camera = async (userId = admin.user_id, fields = {}) => String((await Channel.create({
    nvrId: admin._id, userId, isAdded: true, ...fields,
  }))._id);

  const createDepartment = async (name) => String((await Department.create({ adminId: admin._id, departmentName: name }))._id);
  const departmentCamera = (departmentId, checkType) => camera(admin.user_id, { department: [departmentId], checkType });

  const employeeWith = (assignments) => AuthorizedUsers.create({
    adminId: admin._id, firstName: 'Test', lastName: 'Employee', profilePics: ['/face.jpg'], ...assignments,
  });

  const updateCameras = async (employee, fields, dsError) => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id, query: { userId: String(employee._id) },
      body: { firstName: employee.firstName, lastName: employee.lastName, profilePics: employee.profilePics, ...fields },
    });
    req.files = [];
    if (dsError) axios.put.mockRejectedValueOnce({ response: { data: { message: dsError } } });
    else axios.put.mockResolvedValueOnce({ data: { status: 'ok' } });
    await AuthUsersService.updateAuthUser(req, res, next);
    return res;
  };

  it('registers multiple check-in cameras and a single multipart check-out camera with DS', async () => {
    const checkinCameraIds = [await camera(), await camera()];
    const checkout = await camera();
    const res = await createEmployee({ firstName: 'Test', lastName: 'User', checkinCameraIds, checkoutCameraIds: checkout });
    expect(res.statusCode).toBe(201);
    expect(axios.post.mock.calls[0][1]).toMatchObject({ checkinCameraIds, checkoutCameraIds: [checkout] });
    const saved = await AuthorizedUsers.findById(payload(res).data._id);
    expect(saved.checkinCameraIds.map(String)).toEqual(checkinCameraIds);
    expect(saved.checkoutCameraIds.map(String)).toEqual([checkout]);
  });

  it('uses link assignments and fills an unassigned direction from the employee department', async () => {
    const checkinCameraIds = [await camera(), await camera()];
    const departmentId = await createDepartment('Testing');
    await departmentCamera(departmentId, 'checkin');
    const checkout = await departmentCamera(departmentId, 'checkout');
    await Admin.updateOne({ _id: admin._id }, { registrationLink: {
      linkId: 'invite', expiresAt: new Date(Date.now() + 60_000), checkinCameraIds, checkoutCameraIds: [],
    } });
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {
      firstName: 'Link', lastName: 'User', departmentId, checkinCameraIds: [],
    } });
    req.verified.userData.registrationLinkId = 'invite';
    req.files = threeFiles();
    axios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
    await AuthUsersService.createAuthUser(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(axios.post.mock.calls[0][1]).toMatchObject({ checkinCameraIds, checkoutCameraIds: [checkout] });
  });

  it('defaults to same-client department cameras by direction during registration', async () => {
    const departmentId = await createDepartment('Testing');
    const checkin = await departmentCamera(departmentId, 'checkin');
    const checkout = await departmentCamera(departmentId, 'checkout');
    await departmentCamera(departmentId, 'none');
    await camera('other-tenant', { department: [departmentId], checkType: 'checkin' });
    await departmentCamera(await createDepartment('Other'), 'checkout');
    const res = await createEmployee({ firstName: 'Test', lastName: 'User', departmentId });
    expect(res.statusCode).toBe(201);
    expect(axios.post.mock.calls[0][1]).toMatchObject({ checkinCameraIds: [checkin], checkoutCameraIds: [checkout] });
  });

  it('fills missing camera choices for an existing department and preserves manual choices', async () => {
    const departmentId = await createDepartment('Testing');
    await departmentCamera(departmentId, 'checkin');
    const checkout = await departmentCamera(departmentId, 'checkout');
    const employee = await employeeWith({ departmentId, checkinCameraIds: [] });
    const res = await updateCameras(employee, {});
    expect(res.statusCode).toBe(200);
    expect(axios.put.mock.calls[0][1]).not.toHaveProperty('checkinCameraIds');
    expect(axios.put.mock.calls[0][1].checkoutCameraIds).toEqual([checkout]);
  });

  it('replaces department camera defaults on department change and accepts a manual override', async () => {
    const oldDepartment = await createDepartment('Old');
    const departmentId = await createDepartment('New');
    const oldCheckin = await departmentCamera(oldDepartment, 'checkin');
    const oldCheckout = await departmentCamera(oldDepartment, 'checkout');
    const checkout = await departmentCamera(departmentId, 'checkout');
    const employee = await employeeWith({ departmentId: oldDepartment, checkinCameraIds: [oldCheckin], checkoutCameraIds: [oldCheckout] });
    const res = await updateCameras(employee, { departmentId, checkinCameraIds: [oldCheckin] });
    expect(res.statusCode).toBe(200);
    expect(axios.put.mock.calls[0][1]).toMatchObject({ checkinCameraIds: [oldCheckin], checkoutCameraIds: [checkout] });
  });

  it('clears check-out with an empty multipart field and leaves omitted check-in unchanged', async () => {
    const checkin = await camera();
    const employee = await employeeWith({ checkInCameraId: checkin, checkoutCameraIds: [await camera()] });
    const res = await updateCameras(employee, { checkoutCameraIds: '' });
    expect(res.statusCode).toBe(200);
    const body = axios.put.mock.calls[0][1];
    expect(body).not.toHaveProperty('checkinCameraIds');
    expect(body.checkoutCameraIds).toEqual([]);
    const saved = await AuthorizedUsers.findById(employee._id);
    expect(String(saved.checkInCameraId)).toBe(checkin);
    expect(saved.checkoutCameraIds).toEqual([]);
  });

  it('re-registers an employee missing in DS with the changed and previously stored camera lists', async () => {
    const checkin = await camera();
    const employee = await employeeWith({ checkInCameraId: checkin });
    const checkoutCameraIds = [await camera(), await camera()];
    axios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
    const res = await updateCameras(employee, { checkoutCameraIds }, 'User not found in this collection');
    expect(res.statusCode).toBe(200);
    expect(axios.post.mock.calls[0][1]).toMatchObject({ checkinCameraIds: [checkin], checkoutCameraIds });
  });

  it('keeps the saved camera list if DS rejects the update', async () => {
    const checkin = await camera();
    const employee = await employeeWith({ checkinCameraIds: [checkin] });
    const res = await updateCameras(employee, { checkinCameraIds: [] }, 'Service unavailable');
    expect(res.statusCode).toBe(500);
    expect(axios.put.mock.calls[0][1].checkinCameraIds).toEqual([]);
    expect((await AuthorizedUsers.findById(employee._id)).checkinCameraIds.map(String)).toEqual([checkin]);
  });

  it('rejects a camera owned by another client before calling DS', async () => {
    const res = await createEmployee({ firstName: 'Wrong', lastName: 'Tenant', checkinCameraIds: [await camera('other-tenant')] });
    expect(res.statusCode).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
