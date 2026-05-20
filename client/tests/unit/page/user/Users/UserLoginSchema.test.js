/**
 * src/page/user/Users/Schema/UserLoginSchema.jsx — Yup login schema. Pure
 * schema, no mocks. Verify both fields are required and that a valid payload
 * passes.
 */
import { describe, it, expect } from "vitest";
import { userLoginSchema } from "../../../../../src/page/user/Users/Schema/UserLoginSchema.jsx";

describe("page/Users userLoginSchema", () => {
  it("accepts a valid login payload", async () => {
    await expect(
      userLoginSchema.validate({ usernameOrEmail: "alice", password: "secret" })
    ).resolves.toEqual({ usernameOrEmail: "alice", password: "secret" });
  });

  it("rejects when usernameOrEmail is empty", async () => {
    await expect(
      userLoginSchema.validate({ usernameOrEmail: "", password: "secret" })
    ).rejects.toThrow(/Username or Email is required/);
  });

  it("rejects when password is empty", async () => {
    await expect(
      userLoginSchema.validate({ usernameOrEmail: "alice", password: "" })
    ).rejects.toThrow(/Password is required/);
  });

  it("rejects when both fields are missing", async () => {
    await expect(userLoginSchema.validate({})).rejects.toThrow(
      /required/
    );
  });
});
