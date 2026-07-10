import { describe, it, expect } from "vitest";
import UsersValidator from "../../../core/v1/users/users.validate.js";

describe("UsersValidator.createAuthUser", () => {
  const base = {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@test.com",
    profilePics: ["http://cdn.test/jane.jpg"],
    password: "p4ss",
  };

  it("accepts a minimal valid body", () => {
    expect(UsersValidator.createAuthUser(base).error).toBeUndefined();
  });

  it("requires profilePics with at least one entry", () => {
    expect(
      UsersValidator.createAuthUser({ ...base, profilePics: [] }).error
    ).toBeDefined();
    const { error } = UsersValidator.createAuthUser({
      ...base,
      profilePics: undefined,
    });
    expect(error).toBeDefined();
  });

  it("requires password", () => {
    const body = { ...base };
    delete body.password;
    expect(UsersValidator.createAuthUser(body).error).toBeDefined();
  });

  it("rejects invalid email format", () => {
    expect(
      UsersValidator.createAuthUser({ ...base, email: "not-an-email" }).error
    ).toBeDefined();
  });

  it("trims firstName / lastName whitespace", () => {
    const { value } = UsersValidator.createAuthUser({
      ...base,
      firstName: "  Jane  ",
      lastName: "  Doe  ",
    });
    expect(value.firstName).toBe("Jane");
    expect(value.lastName).toBe("Doe");
  });

  it("rejects firstName/lastName > 50 chars", () => {
    expect(
      UsersValidator.createAuthUser({ ...base, firstName: "x".repeat(51) }).error
    ).toBeDefined();
    expect(
      UsersValidator.createAuthUser({ ...base, lastName: "x".repeat(51) }).error
    ).toBeDefined();
  });

  it("accepts departmentId as a string", () => {
    expect(
      UsersValidator.createAuthUser({ ...base, departmentId: "dept_1" }).error
    ).toBeUndefined();
  });

  it("location defaults to null", () => {
    const { value } = UsersValidator.createAuthUser(base);
    expect(value.location).toBeNull();
  });
});

describe("UsersValidator.updateAuthUser", () => {
  it("accepts an empty body (all optional)", () => {
    expect(UsersValidator.updateAuthUser({}).error).toBeUndefined();
  });

  it("validates email format when present", () => {
    expect(UsersValidator.updateAuthUser({ email: "nope" }).error).toBeDefined();
  });

  it("rejects empty profilePics array when provided", () => {
    expect(
      UsersValidator.updateAuthUser({ profilePics: [] }).error
    ).toBeDefined();
  });
});
