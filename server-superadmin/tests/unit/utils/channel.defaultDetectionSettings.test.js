/**
 * Unit tests for core/v1/channels/channel.defaultDetectionSettings.js
 *
 * The module is a pure default-export object with default-detection settings
 * for four detector keys (cashier_detection, unauthorised_access_detection,
 * person_detection, fire_and_smoke_detection). The coverage report for
 * `core/v1/channels` flagged it as 0% (lines 1-45 uncovered) — pure data with
 * no side effects, so a single import + shape assertions takes it to 100%.
 *
 * No mocks needed.
 *
 * R84 — server phase (test-only).
 */
import { describe, it, expect } from "vitest";

const { default: defaultDetectionSettings } = await import(
  "../../../core/v1/channels/channel.defaultDetectionSettings.js"
);

describe("channel.defaultDetectionSettings — module shape", () => {
  it("exports an object with the four well-known detector keys", () => {
    expect(defaultDetectionSettings).toBeTypeOf("object");
    expect(defaultDetectionSettings).not.toBeNull();
    expect(Object.keys(defaultDetectionSettings).sort()).toEqual([
      "cashier_detection",
      "fire_and_smoke_detection",
      "person_detection",
      "unauthorised_access_detection",
    ]);
  });

  it("cashier_detection has the expected snake_case keys + medium importance", () => {
    const c = defaultDetectionSettings.cashier_detection;
    expect(c.videoLinkRequirement).toBe(false);
    expect(c.video_min_length).toBeNull();
    expect(c.video_max_length).toBeNull();
    expect(c.level_of_importance).toBe("medium");
    expect(c.alertThreshold).toBe(5);
    expect(c.faceAuth).toBe(false);
    expect(c.videoResolution).toEqual([]);
    expect(c.referencePoints).toEqual({});
  });

  it("unauthorised_access_detection is the only entry that uses camelCase length keys + authorisedUsers", () => {
    const u = defaultDetectionSettings.unauthorised_access_detection;
    expect(u.videoLinkRequirement).toBe(false);
    expect(u.videoMinLength).toBe(10);
    expect(u.videoMaxLength).toBe(60);
    expect(u.levelOfImportance).toBe("medium");
    expect(u.alertThreshold).toBe(5);
    expect(u.videoResolution).toEqual([]);
    expect(u.referencePoints).toEqual({});
    expect(u.authorisedUsers).toEqual([]);
    // unauthorised entry deliberately omits the `faceAuth` field that the
    // other three carry; pin that contract.
    expect(u).not.toHaveProperty("faceAuth");
  });

  it("person_detection carries the 1080x720 default resolution and snake_case length keys", () => {
    const p = defaultDetectionSettings.person_detection;
    expect(p.videoLinkRequirement).toBe(false);
    expect(p.video_min_length).toBeNull();
    expect(p.video_max_length).toBeNull();
    expect(p.level_of_importance).toBe("medium");
    expect(p.alertThreshold).toBe(5);
    expect(p.faceAuth).toBe(false);
    expect(p.videoResolution).toEqual([1080, 720]);
    expect(p.referencePoints).toEqual({});
  });

  it("fire_and_smoke_detection mirrors person_detection but with explicit 10/60 length defaults", () => {
    const f = defaultDetectionSettings.fire_and_smoke_detection;
    expect(f.videoLinkRequirement).toBe(false);
    expect(f.video_min_length).toBe(10);
    expect(f.video_max_length).toBe(60);
    expect(f.level_of_importance).toBe("medium");
    expect(f.alertThreshold).toBe(5);
    expect(f.faceAuth).toBe(false);
    expect(f.videoResolution).toEqual([1080, 720]);
    expect(f.referencePoints).toEqual({});
  });
});
