import { describe, it, expect } from "vitest";
import { addRoleSchema } from "../../../src/schema/Role/index.jsx";

async function check(data) {
  try {
    await addRoleSchema.validate(data);
    return null;
  } catch (err) {
    return err.errors;
  }
}

describe("addRoleSchema", () => {
  it("accepts a valid role name", async () => {
    expect(await check({ roles: "Administrator" })).toBeNull();
  });

  it("requires the roles field", async () => {
    const errs = await check({});
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/required/i)])
    );
  });

  it("rejects a name shorter than 3 characters", async () => {
    const errs = await check({ roles: "ab" });
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least 3/i)])
    );
  });

  it("rejects a name longer than 32 characters", async () => {
    const errs = await check({ roles: "x".repeat(33) });
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/exceed 32/i)])
    );
  });

  it("accepts the boundary lengths 3 and 32", async () => {
    expect(await check({ roles: "abc" })).toBeNull();
    expect(await check({ roles: "x".repeat(32) })).toBeNull();
  });
});
