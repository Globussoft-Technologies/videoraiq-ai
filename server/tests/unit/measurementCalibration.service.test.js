import { describe, expect, it } from "vitest";
import {
  calibrationDsUrl,
  dsError,
} from "../../core/v2/measurementCalibration/measurementCalibration.service.js";
import {
  calibrationRequestSchema,
  calibrationZoneSchema,
} from "../../core/v2/measurementCalibration/measurementCalibration.validation.js";

const triangle = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.5, y: 0.9 },
];

describe("measurement calibration v2 proxy", () => {
  it("builds DS calibration URLs from a registered station IP", () => {
    expect(calibrationDsUrl("192.168.1.20", "frame.jpg"))
      .toBe("http://192.168.1.20:8000/v1/calibration/frame.jpg");
    expect(calibrationDsUrl("fd00::20", "status"))
      .toBe("http://[fd00::20]:8000/v1/calibration/status");
  });

  it("rejects non-IP station targets", () => {
    expect(() => calibrationDsUrl("example.com", "status")).toThrow("invalid IP address");
  });

  it("preserves actionable DS HTTP failures", () => {
    const error = dsError({ response: { status: 409, data: { detail: "RealSense camera is busy" } } }, "capture");
    expect(error.status).toBe(409);
    expect(error.message).toBe("RealSense camera is busy");

    const binaryError = dsError({
      response: { status: 404, data: Buffer.from('{"detail":"Capture a calibration frame first"}') },
    }, "frame preview");
    expect(binaryError.status).toBe(404);
    expect(binaryError.message).toBe("Capture a calibration frame first");
  });

  it("accepts normalized polygons and applies DS defaults", () => {
    const result = calibrationRequestSchema.validate({ points: triangle });
    expect(result.error).toBeUndefined();
    expect(result.value.min_zone_flat_ratio).toBe(0.85);
    expect(result.value.inlier_tolerance_mm).toBe(20);
  });

  it("rejects incomplete, out-of-frame, and unknown calibration values", () => {
    expect(calibrationRequestSchema.validate({ points: triangle.slice(0, 2) }).error).toBeTruthy();
    expect(calibrationRequestSchema.validate({ points: [...triangle.slice(0, 2), { x: 1.1, y: 0.5 }] }).error).toBeTruthy();
    expect(calibrationRequestSchema.validate({ points: triangle, extra: true }).error).toBeTruthy();
  });

  it("allows a saved editor zone to be cleared without weakening calibration validation", () => {
    expect(calibrationZoneSchema.validate({ points: [] }).error).toBeUndefined();
    expect(calibrationRequestSchema.validate({ points: [] }).error).toBeTruthy();
  });
});
