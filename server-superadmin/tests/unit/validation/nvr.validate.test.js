import { describe, it, expect } from "vitest";
import NVRValidation from "../../../core/v1/NVR/nvr.validate.js";

describe("NVRValidation.createNvr", () => {
  const base = {
    userId: "user_1",
    nvrName: "Camera 1",
    ipAddress: "192.168.1.100",
    port: 554,
  };

  it("accepts a minimal valid body", () => {
    expect(NVRValidation.createNvr(base).error).toBeUndefined();
  });

  it("rejects an invalid IP", () => {
    const { error } = NVRValidation.createNvr({ ...base, ipAddress: "not-an-ip" });
    expect(error?.details[0].message).toMatch(/ip/i);
  });

  it("rejects port < 1 or > 65535", () => {
    expect(NVRValidation.createNvr({ ...base, port: 0 }).error).toBeDefined();
    expect(NVRValidation.createNvr({ ...base, port: 70000 }).error).toBeDefined();
  });

  it("requires nvrName / ipAddress / port", () => {
    for (const key of ["nvrName", "ipAddress", "port"]) {
      const body = { ...base };
      delete body[key];
      expect(NVRValidation.createNvr(body).error).toBeDefined();
    }
  });

  it("allows empty username + password", () => {
    expect(
      NVRValidation.createNvr({ ...base, username: "", password: "" }).error
    ).toBeUndefined();
  });
});

describe("NVRValidation.registerNVR", () => {
  const base = {
    ip: "192.168.1.100",
    port: 80,
    rtspPort: 554,
    nvrName: "Front Lobby",
    username: "admin",
    password: "secret",
    brand: "hikvision",
    location: "HQ",
  };

  it("accepts a valid Hikvision NVR", () => {
    expect(NVRValidation.registerNVR(base).error).toBeUndefined();
  });

  it("rejects nvrName containing script-related characters", () => {
    for (const ch of ['<', '>', '"', "'", "`", "\\", "(", "{", "[", "]"]) {
      const body = { ...base, nvrName: `name${ch}x` };
      expect(NVRValidation.registerNVR(body).error).toBeDefined();
    }
  });

  it("rejects CIDR notation in ip", () => {
    expect(
      NVRValidation.registerNVR({ ...base, ip: "192.168.1.0/24" }).error
    ).toBeDefined();
  });

  it("requires streamEndpoint when brand=camera", () => {
    const { error } = NVRValidation.registerNVR({ ...base, brand: "camera" });
    expect(error).toBeDefined();
    const ok = NVRValidation.registerNVR({
      ...base,
      brand: "camera",
      streamEndpoint: "/Streaming/Channels/101",
    });
    expect(ok.error).toBeUndefined();
  });
});

describe("NVRValidation.nvrSchema (Joi factory)", () => {
  it("only accepts brand ∈ {hikvision, cpplus, dahua, prama}", () => {
    const schema = NVRValidation.nvrSchema();
    const make = (brand) => ({
      nvrName: "n",
      brand,
      domain: "http://nvr.local",
      localNvrId: "local-1",
    });
    expect(schema.validate(make("hikvision")).error).toBeUndefined();
    expect(schema.validate(make("dahua")).error).toBeUndefined();
    expect(schema.validate(make("axis")).error).toBeDefined();
  });

  it("requires a valid URI for domain", () => {
    const schema = NVRValidation.nvrSchema();
    expect(
      schema.validate({
        nvrName: "n",
        brand: "hikvision",
        domain: "not a uri",
        localNvrId: "x",
      }).error
    ).toBeDefined();
  });
});

describe("NVRValidation.registerNvrMetadataSchema", () => {
  const nvr = {
    nvrName: "n",
    brand: "hikvision",
    domain: "http://nvr.local",
    localNvrId: "local-1",
  };
  const camera = {
    name: "cam-1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
  };

  it("requires at least one camera", () => {
    const { error } = NVRValidation.registerNvrMetadataSchema({ nvr, cameras: [] });
    expect(error).toBeDefined();
  });

  it("accepts nvr + one camera", () => {
    const { error } = NVRValidation.registerNvrMetadataSchema({
      nvr,
      cameras: [camera],
    });
    expect(error).toBeUndefined();
  });
});

describe("NVRValidation.updateNvrLocalSchema", () => {
  it("all fields optional — empty body is valid", () => {
    expect(NVRValidation.updateNvrLocalSchema({}).error).toBeUndefined();
  });

  it("validates brand if present", () => {
    expect(NVRValidation.updateNvrLocalSchema({ brand: "axis" }).error).toBeDefined();
  });
});
