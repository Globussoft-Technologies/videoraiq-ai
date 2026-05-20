/**
 * Yup schema gating the detection-settings form. The tests pin down the
 * required fields, the `levelOfImportance` whitelist, and the `channelId`
 * minimum-length rule so accidental relaxations get caught at PR time.
 */
import { describe, it, expect } from "vitest";
import { DetectionSettingsFormSchema } from "../../../src/components/DetectionSettingsFormSchema.jsx";

const validPayload = () => ({
  name: "Front gate",
  settingType: "global",
  channelId: ["cam-1"],
  NVRId: "nvr-1",
  enabled: true,
  alerts: ["recipient-1"],
  settings: {
    imageRequired: true,
    levelOfImportance: "high",
  },
});

describe("DetectionSettingsFormSchema", () => {
  it("accepts a fully-formed payload", async () => {
    await expect(
      DetectionSettingsFormSchema.validate(validPayload())
    ).resolves.toEqual(expect.objectContaining({ name: "Front gate" }));
  });

  it("rejects a missing setting name", async () => {
    const payload = validPayload();
    delete payload.name;
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).rejects.toThrow(/Setting name is required/);
  });

  it("rejects when no cameras are selected", async () => {
    const payload = validPayload();
    payload.channelId = [];
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).rejects.toThrow(/Select at least one camera/);
  });

  it("rejects a missing NVR id", async () => {
    const payload = validPayload();
    delete payload.NVRId;
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).rejects.toThrow(/NVR is required/);
  });

  it("rejects an unsupported levelOfImportance", async () => {
    const payload = validPayload();
    payload.settings.levelOfImportance = "extreme";
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).rejects.toThrow();
  });

  it("accepts each of the whitelisted importance levels", async () => {
    for (const level of ["low", "medium", "high", "moderate"]) {
      const payload = validPayload();
      payload.settings.levelOfImportance = level;
      await expect(
        DetectionSettingsFormSchema.validate(payload)
      ).resolves.toBeTruthy();
    }
  });

  it("requires settings.levelOfImportance", async () => {
    const payload = validPayload();
    delete payload.settings.levelOfImportance;
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).rejects.toThrow(/Importance is required/);
  });

  it("allows an empty alerts array", async () => {
    const payload = validPayload();
    payload.alerts = [];
    await expect(
      DetectionSettingsFormSchema.validate(payload)
    ).resolves.toBeTruthy();
  });

  it("collects multiple errors with abortEarly:false", async () => {
    const payload = { settings: {} };
    try {
      await DetectionSettingsFormSchema.validate(payload, { abortEarly: false });
      throw new Error("expected validation to throw");
    } catch (err) {
      // Yup ValidationError aggregates errors in `.errors`
      expect(err.errors.length).toBeGreaterThan(1);
      expect(err.errors.join("|")).toMatch(/Setting name is required/);
      expect(err.errors.join("|")).toMatch(/NVR is required/);
      expect(err.errors.join("|")).toMatch(/Importance is required/);
    }
  });
});
