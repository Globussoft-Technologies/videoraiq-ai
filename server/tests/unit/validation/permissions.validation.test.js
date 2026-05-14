import { describe, it, expect } from "vitest";
import PermissionValidation from "../../../core/v1/permission/permissions.validation.js";
import {
  adminConfig,
  readConfig,
  writeConfig,
  completeConfig,
} from "../../../core/v1/permission/permissions.config.js";

describe("PermissionValidation.createPermission", () => {
  it("accepts a minimal valid body", () => {
    const { error } = PermissionValidation.createPermission({
      permissionName: "adminPermission",
      permissionConfig: { NVR: { view: true } },
    });
    expect(error).toBeUndefined();
  });

  it("requires permissionName", () => {
    const { error } = PermissionValidation.createPermission({
      permissionConfig: { NVR: { view: true } },
    });
    expect(error).toBeDefined();
  });

  it("requires permissionConfig with at least one entry", () => {
    const { error } = PermissionValidation.createPermission({
      permissionName: "x",
      permissionConfig: {},
    });
    expect(error).toBeDefined();
  });

  it("rejects permissionName longer than 30 chars", () => {
    const { error } = PermissionValidation.createPermission({
      permissionName: "x".repeat(31),
      permissionConfig: { NVR: { view: true } },
    });
    expect(error).toBeDefined();
  });

  it("accepts adminConfig (canonical complete config)", () => {
    const { error } = PermissionValidation.createPermission({
      permissionName: "adminPerm",
      permissionConfig: adminConfig,
    });
    expect(error).toBeUndefined();
  });

  it("accepts readConfig and writeConfig", () => {
    expect(
      PermissionValidation.createPermission({
        permissionName: "r",
        permissionConfig: readConfig,
      }).error
    ).toBeUndefined();

    expect(
      PermissionValidation.createPermission({
        permissionName: "w",
        permissionConfig: writeConfig,
      }).error
    ).toBeUndefined();
  });

  it("accepts completeConfig (all-false canonical)", () => {
    const { error } = PermissionValidation.createPermission({
      permissionName: "empty",
      permissionConfig: completeConfig,
    });
    expect(error).toBeUndefined();
  });
});

describe("PermissionValidation.updatePermission", () => {
  it("permits permissionName only", () => {
    const { error } = PermissionValidation.updatePermission({
      permissionName: "x",
    });
    expect(error).toBeUndefined();
  });

  it("permits permissionConfig only", () => {
    const { error } = PermissionValidation.updatePermission({
      permissionConfig: { NVR: { view: true } },
    });
    expect(error).toBeUndefined();
  });
});

describe("PermissionValidation.additionalPermission", () => {
  it("requires all four flags", () => {
    const { error } = PermissionValidation.additionalPermission({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
    expect(error).toBeUndefined();
  });

  it("rejects missing flags", () => {
    const { error } = PermissionValidation.additionalPermission({ view: true });
    expect(error).toBeDefined();
  });
});

describe("PermissionValidation.updateBulkPermission", () => {
  it("validates each entry needs moduleName", () => {
    const { error } = PermissionValidation.updateBulkPermission({
      permissionConfig: [{ view: true }],
    });
    expect(error).toBeDefined();
  });

  it("accepts a well-formed batch", () => {
    const { error } = PermissionValidation.updateBulkPermission({
      permissionConfig: [
        { moduleName: "NVR", view: true, create: false, edit: false, delete: false },
        { moduleName: "channels", view: true, create: true, edit: true, delete: false },
      ],
    });
    expect(error).toBeUndefined();
  });
});
