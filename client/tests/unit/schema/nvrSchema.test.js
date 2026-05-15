import { describe, it, expect } from "vitest";
import { nvrSchema } from "../../../src/schema/NVR/addNVR.jsx";

const validBase = {
  ip: "192.168.1.100",
  port: 80,
  rtspPort: 554,
  username: "admin",
  location: "Head Office",
  brand: "hikvision",
  password: "secret",
};

/** Validate against the schema; resolve to null on success or the error message. */
async function check(data, context = { isEdit: false }) {
  try {
    await nvrSchema.validate(data, { context, abortEarly: false });
    return null;
  } catch (err) {
    return err.errors;
  }
}

describe("nvrSchema — create mode (isEdit: false)", () => {
  it("accepts a fully valid NVR", async () => {
    expect(await check(validBase)).toBeNull();
  });

  it("rejects a malformed IP", async () => {
    const errs = await check({ ...validBase, ip: "999.1.1.1" });
    expect(errs).toEqual(expect.arrayContaining([expect.stringMatching(/IP/i)]));
  });

  it("rejects a missing IP", async () => {
    const { ip, ...noIp } = validBase;
    const errs = await check(noIp);
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/IP address is required/i)])
    );
  });

  it("rejects ports outside 1-65535", async () => {
    expect(await check({ ...validBase, port: 0 })).not.toBeNull();
    expect(await check({ ...validBase, port: 70000 })).not.toBeNull();
    expect(await check({ ...validBase, rtspPort: 0 })).not.toBeNull();
  });

  it("rejects a non-numeric port", async () => {
    const errs = await check({ ...validBase, port: "abc" });
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/must be a number/i)])
    );
  });

  it("enforces username length 3-32", async () => {
    expect(await check({ ...validBase, username: "ab" })).not.toBeNull();
    expect(await check({ ...validBase, username: "x".repeat(33) })).not.toBeNull();
  });

  it("enforces location length 3-150", async () => {
    expect(await check({ ...validBase, location: "HQ" })).not.toBeNull();
    expect(await check({ ...validBase, location: "x".repeat(151) })).not.toBeNull();
  });

  it("only allows brand hikvision or cpplus", async () => {
    expect(await check({ ...validBase, brand: "cpplus" })).toBeNull();
    expect(await check({ ...validBase, brand: "dahua" })).not.toBeNull();
  });

  it("requires password in create mode", async () => {
    const { password, ...noPass } = validBase;
    const errs = await check(noPass);
    expect(errs).toEqual(
      expect.arrayContaining([expect.stringMatching(/Password is required/i)])
    );
  });

  it("rejects nvrName with disallowed characters", async () => {
    const errs = await check({ ...validBase, nvrName: "bad<name>" });
    expect(errs).not.toBeNull();
  });

  it("accepts nvrName with letters, digits, spaces, hyphen, underscore", async () => {
    expect(await check({ ...validBase, nvrName: "Lobby_Cam-01 A" })).toBeNull();
  });

  it("enforces nvrName length 3-50", async () => {
    expect(await check({ ...validBase, nvrName: "ab" })).not.toBeNull();
    expect(await check({ ...validBase, nvrName: "x".repeat(51) })).not.toBeNull();
  });
});

describe("nvrSchema — edit mode (isEdit: true)", () => {
  it("does not require password, but requires old + new password", async () => {
    const { password, ...noPass } = validBase;
    const errs = await check(noPass, { isEdit: true });
    expect(errs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Old password is required/i),
        expect.stringMatching(/New password is required/i),
      ])
    );
  });

  it("accepts edit payload with old + new password", async () => {
    const { password, ...rest } = validBase;
    const errs = await check(
      { ...rest, oldPassword: "old", newPassword: "new" },
      { isEdit: true }
    );
    expect(errs).toBeNull();
  });
});
