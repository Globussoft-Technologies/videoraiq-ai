import { describe, expect, it, vi } from "vitest";
import config from "config";
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
  it("prefers the configured DS domain over the environment", () => {
    const hasConfig = vi.spyOn(config, "has").mockReturnValue(true);
    const getConfig = vi.spyOn(config, "get").mockReturnValue("https://configured-ds.example.com/");
    try {
      expect(calibrationDsUrl("192.168.1.20", "status"))
        .toBe("https://configured-ds.example.com/v1/calibration/status");
    } finally {
      hasConfig.mockRestore();
      getConfig.mockRestore();
    }
  });

  it("uses the backend DS environment override and removes trailing slashes", () => {
    const hasConfig = vi.spyOn(config, "has").mockReturnValue(false);
    const previous = process.env.MATTRESS_DS_API_URL;
    try {
      process.env.MATTRESS_DS_API_URL = "https://ds.example.com/";
      expect(calibrationDsUrl("192.168.1.20", "status"))
        .toBe("https://ds.example.com/v1/calibration/status");
    } finally {
      hasConfig.mockRestore();
      if (previous === undefined) delete process.env.MATTRESS_DS_API_URL;
      else process.env.MATTRESS_DS_API_URL = previous;
    }
  });

  it("builds calibration URLs on the DS domain", () => {
    expect(calibrationDsUrl("192.168.1.20", "frame.jpg"))
      .toBe("https://mattress-api-dev.videoraiq.com/v1/calibration/frame.jpg");
    expect(calibrationDsUrl("fd00::20", "status"))
      .toBe("https://mattress-api-dev.videoraiq.com/v1/calibration/status");
  });

  it("uses the DS domain regardless of the station address", () => {
    expect(calibrationDsUrl("example.com", "status")).toBe("https://mattress-api-dev.videoraiq.com/v1/calibration/status");
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
    expect(result.value.zone_type).toBe("polygon");
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

  it("accepts a known rectangle with exactly four ordered points and dimensions", () => {
    const rectangle = [...triangle, { x: 0.1, y: 0.9 }];
    const result = calibrationRequestSchema.validate({
      zone_type: "rectangle",
      points: rectangle,
      zone_length_mm: 2300,
      zone_breadth_mm: 2100,
    });
    expect(result.error).toBeUndefined();
    expect(result.value.zone_type).toBe("rectangle");
  });

  it("rejects incomplete rectangles, missing dimensions, and polygon-only dimensions", () => {
    const rectangle = [...triangle, { x: 0.1, y: 0.9 }];
    expect(calibrationRequestSchema.validate({
      zone_type: "rectangle",
      points: triangle,
      zone_length_mm: 2300,
      zone_breadth_mm: 2100,
    }).error).toBeTruthy();
    expect(calibrationRequestSchema.validate({ zone_type: "rectangle", points: rectangle }).error).toBeTruthy();
    expect(calibrationRequestSchema.validate({ points: triangle, zone_length_mm: 2300 }).error).toBeTruthy();
  });

  it("unwraps FastAPI validation lists into a readable message", () => {
    const error = dsError({
      response: {
        status: 422,
        data: { detail: [{ msg: "Value error, the four corners are not convex or the sides cross" }] },
      },
    }, "start");
    expect(error.status).toBe(422);
    expect(error.message).toBe("the four corners are not convex or the sides cross");
  });
});
