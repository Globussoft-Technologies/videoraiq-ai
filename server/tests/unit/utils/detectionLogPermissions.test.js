import { describe, expect, it } from "vitest";
import {
  DETECTION_LOG_METADATA,
  DETECTION_LOG_PERMISSION_KEYS,
} from "../../../constants/detectionTypes.js";
import {
  adminConfig,
  completeConfig,
  readConfig,
  writeConfig,
} from "../../../core/v2/permission/permissions.config.js";

describe("detection-backed log permissions", () => {
  it("generates every registered log permission in all default role templates", () => {
    for (const permissionKey of DETECTION_LOG_PERMISSION_KEYS) {
      expect(completeConfig.logs[permissionKey]).toEqual({
        view: false, create: false, edit: false, delete: false,
      });
      expect(adminConfig.logs[permissionKey]).toEqual({
        view: true, create: true, edit: true, delete: true,
      });
      expect(readConfig.logs[permissionKey]).toEqual({
        view: true, create: false, edit: false, delete: false,
      });
      expect(writeConfig.logs[permissionKey]).toEqual({
        view: true, create: true, edit: true, delete: false,
      });
    }
  });

  it("registers Fire/Smoke and Person Fall/Sick as detection-backed logs", () => {
    expect(DETECTION_LOG_METADATA.fireSmokeDetectionSettings).toEqual({
      permissionKey: "fireSmokeLogs",
      logsConfigKey: "fireSmokeLogs",
    });
    expect(DETECTION_LOG_METADATA.personFallSickDetectionSettings).toEqual({
      permissionKey: "personFallSickLogs",
      logsConfigKey: "personFallSickLogs",
    });
  });

  it("registers Unauthorized Parking as a detection-backed log", () => {
    expect(DETECTION_LOG_METADATA.unauthorizedParkingDetectionSettings).toEqual({
      permissionKey: "unauthorizedParkingLogs",
      logsConfigKey: "unauthorizedParkingLogs",
    });
    expect(DETECTION_LOG_PERMISSION_KEYS).toContain("unauthorizedParkingLogs");
  });
});
