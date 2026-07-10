import { describe, it, expect } from "vitest";
import RoleValidation from "../../../core/v1/roles/roles.validate.js";

describe("RoleValidation.createRole", () => {
  it("accepts a minimal valid body", () => {
    const { error } = RoleValidation.createRole({});
    expect(error).toBeUndefined();
  });

  it("accepts rolesDetails with alpha-starting strings", () => {
    const { error } = RoleValidation.createRole({
      rolesDetails: ["admin", "editor", "viewer"],
    });
    expect(error).toBeUndefined();
  });

  it("rejects rolesDetails with duplicates", () => {
    const { error } = RoleValidation.createRole({
      rolesDetails: ["admin", "admin"],
    });
    expect(error?.details[0].message).toMatch(/unique/i);
  });

  it("rejects role names starting with a non-letter (regex)", () => {
    const { error } = RoleValidation.createRole({
      rolesDetails: ["1admin"],
    });
    expect(error).toBeDefined();
  });

  it("accepts an explicit is_default boolean", () => {
    const { value } = RoleValidation.createRole({ is_default: true });
    expect(value.is_default).toBe(true);
  });

  it("defaults is_default to false when omitted", () => {
    const { value } = RoleValidation.createRole({});
    expect(value.is_default).toBe(false);
  });

  it("accepts locationIds as an array of strings", () => {
    const { error } = RoleValidation.createRole({
      locationIds: ["loc1", "loc2"],
    });
    expect(error).toBeUndefined();
  });
});

describe("RoleValidation.fetchRole", () => {
  it("defaults skipValue=0 and limitValue=10", () => {
    const { value } = RoleValidation.fetchRole({});
    expect(value.skipValue).toBe(0);
    expect(value.limitValue).toBe(10);
  });

  it("rejects unknown orderby values", () => {
    const { error } = RoleValidation.fetchRole({ orderby: "wat" });
    expect(error).toBeDefined();
  });

  it("accepts known orderby values", () => {
    const { error } = RoleValidation.fetchRole({ orderby: "createdAt" });
    expect(error).toBeUndefined();
  });
});

describe("RoleValidation.updateRole", () => {
  it("accepts partial updates", () => {
    const { error } = RoleValidation.updateRole({ roleEdit: true });
    expect(error).toBeUndefined();
  });

  it("rejects non-letter-starting roleName", () => {
    const { error } = RoleValidation.updateRole({ roleName: "1bad" });
    expect(error).toBeDefined();
  });
});

describe("RoleValidation.roleFilter", () => {
  it("accepts null roleName", () => {
    const { error } = RoleValidation.roleFilter({ roleName: null });
    expect(error).toBeUndefined();
  });

  it("rejects assignMember with duplicate ids", () => {
    const { error } = RoleValidation.roleFilter({
      assignMember: [{ id: "a" }, { id: "a" }],
    });
    expect(error).toBeDefined();
  });

  it("accepts date ranges", () => {
    const { error } = RoleValidation.roleFilter({
      createdAt: { startDate: "2024-01-01", endDate: "2024-12-31" },
    });
    expect(error).toBeUndefined();
  });
});
