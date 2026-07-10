/**
 * UsersService — 500-catch (and warn) arms for the lighter user-management
 * methods. These tail catches were the largest reachable cluster of uncovered
 * statements after R78 (lines 938-942, 982-984, 994-996, 1030-1032,
 * 1065-1067, 1085-1087, 1106-1108, 1391-1395, 1410-1412 in
 * users.service.js). R77 noted that the 1428-1860 internal helpers are
 * unreachable from public API (call sites commented out in createAuthUser /
 * updateAuthUser), so the catch arms are the largest *reachable* uncovered
 * cluster.
 *
 * Coverage pinned:
 *   • bulkDeleteAuthUser outer catch (lines 937-942) via spy on Admin.findOne
 *   • forgotPassword email-send warn arm (lines 981-984) via MailHelper
 *     mock that rejects — the password reset still succeeds, but the warn
 *     branch fires
 *   • forgotPassword outer catch (lines 993-996) via spy on user.save
 *   • resetPassword outer catch (lines 1029-1032) via spy on user.save
 *   • changePassword outer catch (lines 1064-1067) via spy on findById
 *   • checkEmpAdmin outer catch (lines 1084-1087) via getEmpAuthInfo
 *     mock that throws a non-404 axios error → re-thrown by helperFunctions
 *   • isEmailExist outer catch (lines 1105-1108) via spy on
 *     authorizedUsers.findOne
 *   • getImportProgress outer catch (lines 1409-1412) via planted import job
 *     whose successful path is forced to throw inside `Response.userSuccessResp`
 *
 * Mocks declared (module-scope vi.mock count): 3 — axios, mail.helper.js,
 * helperFunctions.js. Per-test vi.spyOn on mongoose models are spies, not
 * module mocks, so they don't count against the 8-mock budget.
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
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// --- module mocks (declared BEFORE the SUT import) ------------------------
// 1. axios — checkEmpAdmin's getEmpAuthInfo helper uses axios.post.
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

// 2. MailHelper — forgotPassword calls sendForgotPasswordEmail. We need to
//    drive a rejection to exercise the warn branch.
const sendForgotPasswordEmailMock = vi.fn();
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: {
    sendForgotPasswordEmail: (...a) => sendForgotPasswordEmailMock(...a),
    sendPasswordUpdatedEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// 3. helperFunctions — stub getEmpAuthInfo so we can drive checkEmpAdmin's
//    catch arm directly, plus keep autoSyncLocations a no-op.
const getEmpAuthInfoMock = vi.fn();
vi.mock("../../../utils/helperFunctions.js", async () => {
  const actual = await vi.importActual("../../../utils/helperFunctions.js");
  return {
    ...actual,
    getEmpAuthInfo: (...a) => getEmpAuthInfoMock(...a),
    autoSyncLocations: vi.fn().mockResolvedValue(undefined),
    syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
  };
});

const usersServiceModule = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: UsersService, importJobs } = usersServiceModule;
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const Response = (await import("../../../utils/response.js")).default;

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  sendForgotPasswordEmailMock.mockReset();
  getEmpAuthInfoMock.mockReset();
  admin = await Admin.create({
    user_id: "1",
    login: "errcatch",
    email: "errcatch@test.com",
  });
  importJobs.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// bulkDeleteAuthUser — 500 catch (lines 937-942)
// ---------------------------------------------------------------------------
describe("UsersService.bulkDeleteAuthUser — outer catch", () => {
  it("returns 500 when Admin.findOne rejects", async () => {
    const findOneSpy = vi
      .spyOn(Admin, "findOne")
      .mockRejectedValueOnce(new Error("db-down-bulk"));
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { userIds: ["507f1f77bcf86cd799439011"] },
    });
    await UsersService.bulkDeleteAuthUser(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    // Response.errorResp wraps the actual error in `.error` field; the message
    // text comes from the outer 500 wrapper.
    expect(payload(res).message).toMatch(/Failed to bulk delete/i);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// forgotPassword — email-send warn arm (lines 981-984)
// ---------------------------------------------------------------------------
describe("UsersService.forgotPassword — email send rejects (warn arm)", () => {
  it("still returns 200 with a resetToken when sendForgotPasswordEmail throws", async () => {
    // forgotPassword uses `authorizedUsersModel` (the `./users.model.js`
    // import), not the authorizedUsers collection — seed via Users.
    await Users.create({
      adminId: admin._id,
      roleIds: new mongoose.Types.ObjectId(),
      firstName: "Fp",
      lastName: "User",
      email: "fp.warn@test.com",
      userName: "fp.warn",
      password: "x",
    });
    sendForgotPasswordEmailMock.mockRejectedValueOnce(
      new Error("sendgrid-down")
    );

    const { req, res } = serviceCtx({ body: { email: "fp.warn@test.com" } });
    await UsersService.forgotPassword(req, res);

    // The reset token is generated and persisted BEFORE the email-send try
    // block, so a rejected email leaves the route at 200 with a token.
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.resetToken).toEqual(expect.any(String));
    expect(payload(res).data.resetToken.length).toBeGreaterThan(20);
    expect(sendForgotPasswordEmailMock).toHaveBeenCalledTimes(1);

    // The token actually landed in DB.
    const reloaded = await Users.findOne({ email: "fp.warn@test.com" });
    expect(reloaded.resetPasswordToken).toEqual(
      payload(res).data.resetToken
    );
  });
});

// ---------------------------------------------------------------------------
// forgotPassword — outer 500 catch (lines 993-996)
// ---------------------------------------------------------------------------
describe("UsersService.forgotPassword — outer catch", () => {
  it("returns 500 when user.save rejects after the user was found", async () => {
    const user = await Users.create({
      adminId: admin._id,
      roleIds: new mongoose.Types.ObjectId(),
      firstName: "Fp",
      lastName: "Catch",
      email: "fp.catch@test.com",
      userName: "fp.catch",
      password: "x",
    });
    // Spy on Users.prototype.save (this is the model forgotPassword uses).
    const saveSpy = vi
      .spyOn(Users.prototype, "save")
      .mockRejectedValueOnce(new Error("write-conflict"));

    const { req, res } = serviceCtx({ body: { email: "fp.catch@test.com" } });
    await UsersService.forgotPassword(req, res);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Failed to generate reset token/i);
    expect(saveSpy).toHaveBeenCalled();
    // The token field on the DB was never persisted (rolled back by the throw).
    const reloaded = await Users.findById(user._id);
    expect(reloaded.resetPasswordToken).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// resetPassword — outer 500 catch (lines 1029-1032)
// ---------------------------------------------------------------------------
describe("UsersService.resetPassword — outer catch", () => {
  it("returns 500 when user.save rejects on the happy branch", async () => {
    const tokenExpiry = Date.now() + 15 * 60 * 1000;
    await Users.create({
      adminId: admin._id,
      roleIds: new mongoose.Types.ObjectId(),
      firstName: "Rp",
      lastName: "Catch",
      email: "rp.catch@test.com",
      userName: "rp.catch",
      password: "old",
      resetPasswordToken: "valid-token-rp",
      resetPasswordExpires: tokenExpiry,
    });
    vi
      .spyOn(Users.prototype, "save")
      .mockRejectedValueOnce(new Error("db-conflict-reset"));

    const { req, res } = serviceCtx({
      body: {
        token: "valid-token-rp",
        newPassword: "newpw",
        confirmPassword: "newpw",
      },
    });
    await UsersService.resetPassword(req, res);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Failed to reset password/i);
  });
});

// ---------------------------------------------------------------------------
// changePassword — outer 500 catch (lines 1064-1067)
// ---------------------------------------------------------------------------
describe("UsersService.changePassword — outer catch", () => {
  it("returns 500 when authorizedUsersModel.findById throws", async () => {
    // memberId arbitrary — findById will throw before any decryption.
    const memberId = "507f1f77bcf86cd799439099";
    const findByIdSpy = vi
      .spyOn(Users, "findById")
      .mockRejectedValueOnce(new Error("db-down-change"));

    const { req, res } = serviceCtx({
      memberId,
      body: {
        currentPassword: "old",
        newPassword: "new",
        confirmPassword: "new",
      },
    });
    await UsersService.changePassword(req, res);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Failed to change password/i);
    expect(findByIdSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// checkEmpAdmin — outer 500 catch (lines 1084-1087)
// ---------------------------------------------------------------------------
describe("UsersService.checkEmpAdmin — outer catch", () => {
  it("returns 500 when getEmpAuthInfo rethrows a non-404 error", async () => {
    // The mocked getEmpAuthInfo throws an Error directly — checkEmpAdmin
    // doesn't gate on err.response.status, the whole outer try/catch fires.
    getEmpAuthInfoMock.mockRejectedValueOnce(new Error("upstream-500"));

    const { req, res, next } = serviceCtx({ body: { email: "x@y.com" } });
    await UsersService.checkEmpAdmin(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Failed to check EMP Admin status/i);
    expect(getEmpAuthInfoMock).toHaveBeenCalledTimes(1);
    expect(getEmpAuthInfoMock).toHaveBeenCalledWith("x@y.com");
  });
});

// ---------------------------------------------------------------------------
// isEmailExist — outer 500 catch (lines 1105-1108)
// ---------------------------------------------------------------------------
describe("UsersService.isEmailExist — outer catch", () => {
  it("returns 500 when authorizedUsers.findOne rejects", async () => {
    const findOneSpy = vi
      .spyOn(AuthorizedUsers, "findOne")
      .mockRejectedValueOnce(new Error("db-down-email"));

    const { req, res, next } = serviceCtx({ query: { email: "z@y.com" } });
    await UsersService.isEmailExist(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Failed to check email existence/i);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// importUsers outer catch (lines 1391-1395) + getImportProgress catch
// (lines 1409-1412).
// ---------------------------------------------------------------------------
describe("UsersService.importUsers — outer catch", () => {
  it("returns 500 when rolesModel.findOne throws before runImport spins up", async () => {
    // Force rolesModel.findOne to reject — short-circuits the function before
    // the fire-and-forget runImport, hitting the outer catch.
    const Roles = (await import("../../../core/v1/roles/roles.model.js"))
      .default;
    const findOneSpy = vi
      .spyOn(Roles, "findOne")
      .mockReturnValueOnce({
        select: () =>
          Promise.reject(new Error("roles-collection-down")),
      });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          { email: "ok@test.com", first_name: "X", organization_id: 1 },
        ],
      },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Something went wrong/i);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });
});

describe("UsersService.getImportProgress — outer catch", () => {
  it("returns 500 when the response builder throws on a planted job", async () => {
    // Plant a job under the same adminId so the function reaches the
    // success-response builder, then make that builder throw.
    importJobs.set(String(admin._id), {
      adminId: String(admin._id),
      status: "Completed",
      totalUsers: 1,
      processedUsers: 1,
      imported: 1,
      skipped: 0,
      failedUsers: [],
      percentage: 100,
    });
    const successSpy = vi
      .spyOn(Response, "userSuccessResp")
      .mockImplementationOnce(() => {
        throw new Error("response-boom");
      });

    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await UsersService.getImportProgress(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(
      /Something went wrong fetching import progress/i
    );
    expect(successSpy).toHaveBeenCalled();
  });
});
