import { describe, expect, it } from "vitest";
import NVRValidation from "../../../core/v2/NVR/nvr.validate.js";

describe("v2 direct NVR validation", () => {
  const valid = {
    nvrName: "Manual NVR",
    location: "HQ",
    brand: "dahua",
    cameras: [{ name: "Camera 1", rtspUrl: "rtsp://user:pass@10.0.0.1:554/live" }],
  };

  it("accepts RTSP cameras, permits blank URLs only for existing cameras", () => {
    expect(NVRValidation.directNVR(valid).error).toBeUndefined();
    expect(NVRValidation.directNVR({
      ...valid,
      cameras: [{ _id: "507f1f77bcf86cd799439011", name: "Camera 1", rtspUrl: "" }],
    }).error).toBeUndefined();
    expect(NVRValidation.directNVR({
      ...valid,
      cameras: [{ name: "Camera 1", rtspUrl: "http://wrong" }],
    }).error).toBeDefined();
  });
});
