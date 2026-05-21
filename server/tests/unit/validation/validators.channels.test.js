/**
 * Pure-Joi validator tests for camera-/alert-/report-shaped modules:
 *   - channels.validate.js
 *   - alerts.validate.js
 *   - detectionSettings.validate.js
 *   - autoEmailReport.validation.js
 *
 * No DB or mocks. Pure schema validation.
 */
import { describe, it, expect } from "vitest";

import ChannelValidator from "../../../core/v1/channels/channels.validate.js";
import AlertValidation from "../../../core/v1/alerts/alerts.validate.js";
import DetectionSettingsValidation from "../../../core/v1/detectionSettings/detectionSettings.validate.js";
import ReportValidation from "../../../core/v1/autoEmailReport/autoEmailReport.validation.js";

// ---------------------------------------------------------------------------
// channels.validate.js
// ---------------------------------------------------------------------------
describe("ChannelValidator.getChannel", () => {
  it("requires nvrId", () => {
    const { error } = ChannelValidator.getChannel({ channelId: "c1" });
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain("nvrId");
  });

  it("accepts nvrId-only", () => {
    const { error } = ChannelValidator.getChannel({ nvrId: "n1" });
    expect(error).toBeUndefined();
  });

  it("rejects unknown keys", () => {
    const { error } = ChannelValidator.getChannel({
      nvrId: "n1",
      foo: "bar",
    });
    expect(error).toBeDefined();
  });
});

describe("ChannelValidator.updateChannel", () => {
  const base = { channelId: "c1", nvrId: "n1" };

  it("accepts the minimum required pair", () => {
    expect(ChannelValidator.updateChannel(base).error).toBeUndefined();
  });

  it("requires channelId + nvrId", () => {
    expect(
      ChannelValidator.updateChannel({ nvrId: "n1" }).error,
    ).toBeDefined();
    expect(
      ChannelValidator.updateChannel({ channelId: "c1" }).error,
    ).toBeDefined();
  });

  it("rejects non-numeric channelNumber", () => {
    const { error } = ChannelValidator.updateChannel({
      ...base,
      channelNumber: "abc",
    });
    expect(error).toBeDefined();
  });

  it("rejects non-boolean isActive", () => {
    const { error } = ChannelValidator.updateChannel({
      ...base,
      isActive: "no",
    });
    expect(error).toBeDefined();
  });

  it("accepts optional name/resolution/streamUrl/channelNumber", () => {
    const { error } = ChannelValidator.updateChannel({
      ...base,
      name: "Front",
      resolution: "1080p",
      streamUrl: "rtsp://x",
      channelNumber: 1,
      isActive: true,
    });
    expect(error).toBeUndefined();
  });
});

describe("ChannelValidator.deleteChannel", () => {
  it("accepts the minimum required pair", () => {
    expect(
      ChannelValidator.deleteChannel({ channelId: "c1", nvrId: "n1" })
        .error,
    ).toBeUndefined();
  });

  it("requires both ids", () => {
    expect(ChannelValidator.deleteChannel({}).error).toBeDefined();
  });
});

describe("ChannelValidator.validateUpdateChannelConfig", () => {
  const base = {
    videoLinkRequirement: true,
    level_of_importance: "low",
  };

  it("accepts a minimal valid body and defaults referencePoints", () => {
    const { error, value } =
      ChannelValidator.validateUpdateChannelConfig(base);
    expect(error).toBeUndefined();
    expect(value.referencePoints).toEqual({});
  });

  it("rejects an invalid level_of_importance", () => {
    const { error } = ChannelValidator.validateUpdateChannelConfig({
      ...base,
      level_of_importance: "extreme",
    });
    expect(error).toBeDefined();
  });

  it("requires videoLinkRequirement + level_of_importance", () => {
    expect(
      ChannelValidator.validateUpdateChannelConfig({
        level_of_importance: "low",
      }).error,
    ).toBeDefined();
    expect(
      ChannelValidator.validateUpdateChannelConfig({
        videoLinkRequirement: true,
      }).error,
    ).toBeDefined();
  });

  it("accepts a properly shaped referencePoints", () => {
    const { error } = ChannelValidator.validateUpdateChannelConfig({
      ...base,
      referencePoints: {
        zone_1: [
          [10, 20],
          [30, 40],
        ],
        zone_2: [[5, 5]],
      },
    });
    expect(error).toBeUndefined();
  });

  it("rejects referencePoints with wrong tuple length", () => {
    const { error } = ChannelValidator.validateUpdateChannelConfig({
      ...base,
      referencePoints: { zone_1: [[1, 2, 3]] },
    });
    expect(error).toBeDefined();
  });

  it("rejects negative videoResolution numbers", () => {
    const { error } = ChannelValidator.validateUpdateChannelConfig({
      ...base,
      videoResolution: [-1, 2],
    });
    expect(error).toBeDefined();
  });

  it("accepts video_min_length/max_length null + alertThreshold", () => {
    const { error } = ChannelValidator.validateUpdateChannelConfig({
      ...base,
      video_min_length: null,
      video_max_length: null,
      alertThreshold: 0,
      faceAuth: true,
    });
    expect(error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// alerts.validate.js
// ---------------------------------------------------------------------------
describe("alertValidation.getChannel", () => {
  it("requires nvrId", () => {
    expect(AlertValidation.getChannel({}).error).toBeDefined();
  });

  it("accepts nvrId only", () => {
    expect(AlertValidation.getChannel({ nvrId: "n1" }).error).toBeUndefined();
  });
});

describe("alertValidation.validateCreateAlert", () => {
  const base = {
    detectionTypes: ["motionDetection"],
    emails: [{ value: "a@b.com", verified: false }],
    phoneNumbers: [{ value: "+15555550000", verified: false }],
    selectedNVRs: ["n1"],
    selectedCameras: ["c1"],
  };

  it("accepts a minimal valid body", () => {
    expect(AlertValidation.validateCreateAlert(base).error).toBeUndefined();
  });

  it("rejects unknown detection type", () => {
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      detectionTypes: ["mysteryDetection"],
    });
    expect(error).toBeDefined();
  });

  it("rejects invalid email", () => {
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      emails: [{ value: "bad-email", verified: false }],
    });
    expect(error).toBeDefined();
  });

  it("allows email value=null", () => {
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      emails: [{ value: null, verified: false }],
    });
    expect(error).toBeUndefined();
  });

  it("rejects malformed phone number", () => {
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      phoneNumbers: [{ value: "abc", verified: false }],
    });
    expect(error).toBeDefined();
  });

  it("defaults removeCameras/removeNVRs to []", () => {
    const { value } = AlertValidation.validateCreateAlert(base);
    expect(value.removeCameras).toEqual([]);
    expect(value.removeNVRs).toEqual([]);
    expect(value.removeEmails).toEqual([]);
    expect(value.removePhones).toEqual([]);
    expect(value.removeDetectionTypes).toEqual([]);
  });

  it("rejects non-hex24 removeCameras", () => {
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      removeCameras: ["not-hex"],
    });
    expect(error).toBeDefined();
  });

  it("accepts hex24 removeCameras / removeNVRs", () => {
    const hex24 = "0123456789abcdef01234567";
    const { error } = AlertValidation.validateCreateAlert({
      ...base,
      removeCameras: [hex24],
      removeNVRs: [hex24],
    });
    expect(error).toBeUndefined();
  });

  it("requires detectionTypes / selectedNVRs / selectedCameras", () => {
    for (const key of ["detectionTypes", "selectedNVRs", "selectedCameras"]) {
      const body = { ...base };
      delete body[key];
      expect(AlertValidation.validateCreateAlert(body).error).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// detectionSettings.validate.js
// ---------------------------------------------------------------------------
describe("DetectionSettingsValidation.createDetectionSettingsValidation", () => {
  const base = {
    name: "PPE",
    settingType: "object",
    channelId: ["c1"],
    NVRId: "n1",
    enabled: true,
    settings: { threshold: 0.7 },
  };

  it("accepts a minimal valid body and defaults alerts=[]", () => {
    const { error, value } =
      DetectionSettingsValidation.createDetectionSettingsValidation(base);
    expect(error).toBeUndefined();
    expect(value.alerts).toEqual([]);
  });

  it("rejects missing required keys", () => {
    for (const key of [
      "name",
      "settingType",
      "channelId",
      "NVRId",
      "enabled",
      "settings",
    ]) {
      const body = { ...base };
      delete body[key];
      expect(
        DetectionSettingsValidation.createDetectionSettingsValidation(body)
          .error,
      ).toBeDefined();
    }
  });

  it("rejects when channelId is not an array", () => {
    const { error } =
      DetectionSettingsValidation.createDetectionSettingsValidation({
        ...base,
        channelId: "c1",
      });
    expect(error).toBeDefined();
  });

  it("rejects non-boolean enabled", () => {
    const { error } =
      DetectionSettingsValidation.createDetectionSettingsValidation({
        ...base,
        enabled: "yes",
      });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// autoEmailReport.validation.js
// ---------------------------------------------------------------------------
describe("ReportValidation.sendReport", () => {
  it("rejects missing reportsTitle", () => {
    expect(ReportValidation.sendReport({}).error).toBeDefined();
  });

  it("accepts a single Daily frequency", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Daily Summary",
      frequency: [{ Daily: 1, Weekly: 0, Monthly: 0 }],
    });
    expect(error).toBeUndefined();
  });

  it("rejects multiple frequency types selected at once", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Bad",
      frequency: [{ Daily: 1, Weekly: 1, Monthly: 0 }],
    });
    expect(error).toBeDefined();
  });

  it("rejects when no frequency at all", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Nothing",
      frequency: [{ Daily: 0, Weekly: 0, Monthly: 0 }],
    });
    expect(error).toBeDefined();
  });

  it("accepts a Time-only frequency", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Hourly",
      frequency: [{ Daily: 0, Weekly: 0, Monthly: 0, Time: "09:00" }],
    });
    expect(error).toBeUndefined();
  });

  it("rejects Time + frequency-number combined", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Mix",
      frequency: [{ Daily: 1, Time: "09:00" }],
    });
    expect(error).toBeDefined();
  });

  it("rejects Time + Date combined", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Mix",
      frequency: [
        {
          Time: "09:00",
          Date: { startDate: new Date("2024-01-01") },
        },
      ],
    });
    expect(error).toBeDefined();
  });

  it("accepts a Date-only frequency", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Range",
      frequency: [
        {
          Date: {
            startDate: new Date("2024-01-01"),
            endDate: new Date("2024-12-31"),
          },
        },
      ],
    });
    expect(error).toBeUndefined();
  });

  it("accepts Recipients / Content / ReportsType / filter", () => {
    const { error } = ReportValidation.sendReport({
      reportsTitle: "Full",
      frequency: [{ Weekly: 1 }],
      Recipients: ["a@b.com"],
      Content: [{ consolidatedReport: 1, leaves: 0 }],
      ReportsType: [{ pdf: 1, csv: 0 }],
      filter: { wholeOrganization: 1 },
      sendTestMail: true,
    });
    expect(error).toBeUndefined();
  });
});

describe("ReportValidation.updateReport", () => {
  it("requires reportsTitle", () => {
    expect(ReportValidation.updateReport({}).error).toBeDefined();
  });

  it("accepts a single Monthly frequency", () => {
    const { error } = ReportValidation.updateReport({
      reportsTitle: "Monthly Summary",
      frequency: [{ Monthly: 1 }],
    });
    expect(error).toBeUndefined();
  });

  it("rejects two frequencies selected", () => {
    const { error } = ReportValidation.updateReport({
      reportsTitle: "Bad",
      frequency: [{ Daily: 1, Monthly: 1 }],
    });
    expect(error).toBeDefined();
  });
});
