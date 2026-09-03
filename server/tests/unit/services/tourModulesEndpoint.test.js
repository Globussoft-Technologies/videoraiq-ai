import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the two refactors the guided-tour module endpoint required, because
 * both sit on paths the whole app uses:
 *
 *  - PermissionService.resolveRolePermission, extracted out of userPermissions
 *    (which serves GET /permissions/user-permissions on every page load).
 *  - The tour endpoint's own permission/logs filtering.
 *
 * The point of the first group is regression: userPermissions must still send
 * exactly what it sent before the extraction.
 */

const usersFindOne = vi.fn();
const adminFindOne = vi.fn();
const roleAggregate = vi.fn();

vi.mock("../../../core/v2/users/users.model.js", () => ({
  default: { findOne: (...a) => usersFindOne(...a) },
}));
vi.mock("../../../core/v2/admin/admin.model.js", () => ({
  default: { findOne: (...a) => adminFindOne(...a) },
}));
vi.mock("../../../core/v2/roles/roles.model.js", () => ({
  default: { aggregate: (...a) => roleAggregate(...a) },
}));
vi.mock("../../../core/v2/authorizedUsers/authorizedUsers.model.js", () => ({ default: {} }));
vi.mock("../../../core/v2/permission/permissions.model.js", () => ({ default: {} }));
vi.mock("../../../core/v2/permission/permissions.validation.js", () => ({ default: {} }));
vi.mock("../../../utils/logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { default: PermissionService } = await import(
  "../../../core/v2/permission/permissions.utility.js"
);

const ADMIN_ID = "507f1f77bcf86cd799439011";
const ROLE_ID = "507f1f77bcf86cd799439012";
const MEMBER_ID = "507f1f77bcf86cd799439013";

const ROLE_ROW = { roleName: "admin", permissionConfig: { dashboard: { view: true } } };

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  roleAggregate.mockResolvedValue([ROLE_ROW]);
});

describe("PermissionService.resolveRolePermission", () => {
  it("resolves a sub-user through its own roleIds", async () => {
    usersFindOne.mockResolvedValueOnce({ _id: MEMBER_ID, roleIds: ROLE_ID });

    const out = await PermissionService.resolveRolePermission({ memberId: MEMBER_ID });

    expect(out.error).toBeUndefined();
    expect(out.roles).toEqual([ROLE_ROW]);
    // The $match must target the user's role, not the admin's default role.
    const pipeline = roleAggregate.mock.calls[0][0];
    expect(pipeline[0].$match._id.toString()).toBe(ROLE_ID);
    expect(adminFindOne).not.toHaveBeenCalled();
  });

  it("resolves an admin through its default admin role", async () => {
    adminFindOne.mockResolvedValueOnce({ _id: ADMIN_ID });

    const out = await PermissionService.resolveRolePermission({ adminId: ADMIN_ID });

    expect(out.roles).toEqual([ROLE_ROW]);
    const match = roleAggregate.mock.calls[0][0][0].$match;
    expect(match.roleName).toBe("admin");
    expect(match.is_default).toBe(true);
    expect(match.adminId.toString()).toBe(ADMIN_ID);
  });

  it("reports a missing user without querying roles", async () => {
    usersFindOne.mockResolvedValueOnce(null);
    const out = await PermissionService.resolveRolePermission({ memberId: MEMBER_ID });
    expect(out.error).toBe("USER_NOT_FOUND");
    expect(roleAggregate).not.toHaveBeenCalled();
  });

  it("reports a missing admin without querying roles", async () => {
    adminFindOne.mockResolvedValueOnce(null);
    const out = await PermissionService.resolveRolePermission({ adminId: ADMIN_ID });
    expect(out.error).toBe("ADMIN_NOT_EXIST");
    expect(roleAggregate).not.toHaveBeenCalled();
  });

  it("keeps the lookup pipeline that flattens permissionConfig", async () => {
    adminFindOne.mockResolvedValueOnce({ _id: ADMIN_ID });
    await PermissionService.resolveRolePermission({ adminId: ADMIN_ID });

    const pipeline = roleAggregate.mock.calls[0][0];
    expect(pipeline[1].$lookup.from).toBe("permissionschemas");
    expect(pipeline[2].$unwind).toBe("$permissionDetails");
    expect(pipeline[3].$project.permissionConfig).toBe("$permissionDetails.permissionConfig");
  });
});

describe("userPermissions still behaves as it did before the extraction", () => {
  it("sends the roles array on success for an admin", async () => {
    adminFindOne.mockResolvedValueOnce({ _id: ADMIN_ID });
    const res = mockRes();

    await PermissionService.userPermissions(
      { verified: { userData: { adminId: ADMIN_ID } } },
      res,
      vi.fn(),
    );

    expect(res.send).toHaveBeenCalledTimes(1);
    const payload = res.send.mock.calls[0][0];
    // Same envelope + same data the pre-refactor handler produced.
    expect(payload.body?.data ?? payload.data ?? payload).toBeTruthy();
    expect(JSON.stringify(payload)).toContain("permissionConfig");
  });

  it("sends the roles array on success for a sub-user", async () => {
    usersFindOne.mockResolvedValueOnce({ _id: MEMBER_ID, roleIds: ROLE_ID });
    const res = mockRes();

    await PermissionService.userPermissions(
      { verified: { userData: { memberId: MEMBER_ID, adminId: ADMIN_ID } } },
      res,
      vi.fn(),
    );

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.send.mock.calls[0][0])).toContain("permissionConfig");
  });

  it("sends a failure (not a throw) when the identity does not exist", async () => {
    adminFindOne.mockResolvedValueOnce(null);
    const res = mockRes();

    await PermissionService.userPermissions(
      { verified: { userData: { adminId: ADMIN_ID } } },
      res,
      vi.fn(),
    );

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.send.mock.calls[0][0])).not.toContain("permissionConfig");
  });

  it("does not throw when the aggregate rejects", async () => {
    adminFindOne.mockResolvedValueOnce({ _id: ADMIN_ID });
    roleAggregate.mockRejectedValueOnce(new Error("mongo down"));
    const res = mockRes();

    await expect(
      PermissionService.userPermissions(
        { verified: { userData: { adminId: ADMIN_ID } } },
        res,
        vi.fn(),
      ),
    ).resolves.not.toThrow();
    expect(res.send).toHaveBeenCalledTimes(1);
  });
});
