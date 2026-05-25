/**
 * Unit coverage for core/v1/detectionSettings/detectionSettings.controller.js.
 *
 * The controller is a thin pass-through to DetectionSettingService — every
 * handler is a one-liner `return DetectionSettingService.<method>(req, res,
 * next)`. We mock the service module so only the controller's own delegation
 * logic runs; the service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors shifts.controller.test.js (R41 reference) and
 * detectionObjects.controller.test.js (R32 reference, sibling controller).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock(
  "../../../core/v1/detectionSettings/detectionSettings.service.js",
  () => ({
    default: {
      getDetectionTypes: vi.fn(),
      createDetectionSettings: vi.fn(),
      deleteDetectionSettings: vi.fn(),
      updateDetectionSettings: vi.fn(),
      getDetectionSettings: vi.fn(),
      getAllDetectionSettings: vi.fn(),
      getDetectionExamples: vi.fn(),
      attachDetectionSetting: vi.fn(),
      detachDetectionSetting: vi.fn(),
    },
  })
);

import DetectionSettingService from "../../../core/v1/detectionSettings/detectionSettings.service.js";
const { default: detectionSettingsController } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "getDetectionTypes",
  "createDetectionSettings",
  "deleteDetectionSettings",
  "updateDetectionSettings",
  "getDetectionSettings",
  "getAllDetectionSettings",
  "getDetectionExamples",
  "attachDetectionSetting",
  "detachDetectionSetting",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(DetectionSettingService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(DetectionSettingService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DetectionSettingsController", () => {
  describe("getDetectionTypes", () => {
    it("delegates to DetectionSettingService.getDetectionTypes and returns its result", async () => {
      DetectionSettingService.getDetectionTypes.mockResolvedValueOnce({
        types: [
          "motionDetection",
          "countPersons",
          "lineCrossing",
          "genericObjectDetection",
        ],
      });
      const { req, res, next } = makeReqRes();

      const out = await detectionSettingsController.getDetectionTypes(
        req,
        res,
        next
      );

      expect(out).toEqual({
        types: [
          "motionDetection",
          "countPersons",
          "lineCrossing",
          "genericObjectDetection",
        ],
      });
      expect(DetectionSettingService.getDetectionTypes).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getDetectionTypes");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.getDetectionTypes.mockRejectedValueOnce(
        new Error("registry unavailable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.getDetectionTypes(req, res, next)
      ).rejects.toThrow("registry unavailable");
    });
  });

  describe("createDetectionSettings", () => {
    it("delegates to DetectionSettingService.createDetectionSettings and returns its result", async () => {
      DetectionSettingService.createDetectionSettings.mockResolvedValueOnce({
        _id: "ds_1",
        name: "Entry gate motion",
        settingType: "motionDetectionSettings",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        name: "Entry gate motion",
        settingType: "motionDetectionSettings",
        config: { threshold: 0.5 },
      };

      const out = await detectionSettingsController.createDetectionSettings(
        req,
        res,
        next
      );

      expect(out).toEqual({
        _id: "ds_1",
        name: "Entry gate motion",
        settingType: "motionDetectionSettings",
      });
      expect(
        DetectionSettingService.createDetectionSettings
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("createDetectionSettings");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.createDetectionSettings.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.createDetectionSettings(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("deleteDetectionSettings", () => {
    it("delegates to DetectionSettingService.deleteDetectionSettings and returns its result", async () => {
      DetectionSettingService.deleteDetectionSettings.mockResolvedValueOnce({
        deleted: 1,
        message: "detection setting deleted",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ds_1" };

      const out = await detectionSettingsController.deleteDetectionSettings(
        req,
        res,
        next
      );

      expect(out).toEqual({ deleted: 1, message: "detection setting deleted" });
      expect(
        DetectionSettingService.deleteDetectionSettings
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteDetectionSettings");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.deleteDetectionSettings.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.deleteDetectionSettings(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("updateDetectionSettings", () => {
    it("delegates to DetectionSettingService.updateDetectionSettings and returns its result", async () => {
      DetectionSettingService.updateDetectionSettings.mockResolvedValueOnce({
        _id: "ds_1",
        name: "Entry gate motion (v2)",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ds_1" };
      req.body = { name: "Entry gate motion (v2)" };

      const out = await detectionSettingsController.updateDetectionSettings(
        req,
        res,
        next
      );

      expect(out).toEqual({ _id: "ds_1", name: "Entry gate motion (v2)" });
      expect(
        DetectionSettingService.updateDetectionSettings
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateDetectionSettings");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.updateDetectionSettings.mockRejectedValueOnce(
        new Error("conflict")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.updateDetectionSettings(req, res, next)
      ).rejects.toThrow("conflict");
    });
  });

  describe("getDetectionSettings", () => {
    it("delegates to DetectionSettingService.getDetectionSettings and returns its result", async () => {
      DetectionSettingService.getDetectionSettings.mockResolvedValueOnce({
        _id: "ds_1",
        name: "Entry gate motion",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ds_1" };

      const out = await detectionSettingsController.getDetectionSettings(
        req,
        res,
        next
      );

      expect(out).toEqual({ _id: "ds_1", name: "Entry gate motion" });
      expect(DetectionSettingService.getDetectionSettings).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getDetectionSettings");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.getDetectionSettings.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.getDetectionSettings(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("getAllDetectionSettings", () => {
    it("delegates to DetectionSettingService.getAllDetectionSettings and returns its result", async () => {
      DetectionSettingService.getAllDetectionSettings.mockResolvedValueOnce({
        data: [
          { _id: "ds_1", name: "Entry gate motion" },
          { _id: "ds_2", name: "Lobby line crossing" },
        ],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        skip: "0",
        limit: "10",
        name: "ent",
        settingType: "motionDetectionSettings",
      };

      const out = await detectionSettingsController.getAllDetectionSettings(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [
          { _id: "ds_1", name: "Entry gate motion" },
          { _id: "ds_2", name: "Lobby line crossing" },
        ],
        total: 2,
      });
      expect(
        DetectionSettingService.getAllDetectionSettings
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getAllDetectionSettings");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.getAllDetectionSettings.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.getAllDetectionSettings(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("getDetectionExamples", () => {
    it("delegates to DetectionSettingService.getDetectionExamples and returns its result", async () => {
      DetectionSettingService.getDetectionExamples.mockResolvedValueOnce({
        examples: [{ name: "Sample motion detection", settingType: "motionDetectionSettings" }],
      });
      const { req, res, next } = makeReqRes();

      const out = await detectionSettingsController.getDetectionExamples(
        req,
        res,
        next
      );

      expect(out).toEqual({
        examples: [
          { name: "Sample motion detection", settingType: "motionDetectionSettings" },
        ],
      });
      expect(DetectionSettingService.getDetectionExamples).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getDetectionExamples");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.getDetectionExamples.mockRejectedValueOnce(
        new Error("upstream failure")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.getDetectionExamples(req, res, next)
      ).rejects.toThrow("upstream failure");
    });
  });

  describe("attachDetectionSetting", () => {
    it("delegates to DetectionSettingService.attachDetectionSetting and returns its result", async () => {
      DetectionSettingService.attachDetectionSetting.mockResolvedValueOnce({
        attached: true,
        channelId: "chan_1",
        settingId: "ds_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { channelId: "chan_1", settingId: "ds_1" };

      const out = await detectionSettingsController.attachDetectionSetting(
        req,
        res,
        next
      );

      expect(out).toEqual({
        attached: true,
        channelId: "chan_1",
        settingId: "ds_1",
      });
      expect(
        DetectionSettingService.attachDetectionSetting
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("attachDetectionSetting");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.attachDetectionSetting.mockRejectedValueOnce(
        new Error("channel not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.attachDetectionSetting(req, res, next)
      ).rejects.toThrow("channel not found");
    });
  });

  describe("detachDetectionSetting", () => {
    it("delegates to DetectionSettingService.detachDetectionSetting and returns its result", async () => {
      DetectionSettingService.detachDetectionSetting.mockResolvedValueOnce({
        detached: true,
        channelId: "chan_1",
        settingId: "ds_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { channelId: "chan_1", settingId: "ds_1" };

      const out = await detectionSettingsController.detachDetectionSetting(
        req,
        res,
        next
      );

      expect(out).toEqual({
        detached: true,
        channelId: "chan_1",
        settingId: "ds_1",
      });
      expect(
        DetectionSettingService.detachDetectionSetting
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("detachDetectionSetting");
    });

    it("propagates rejections from the service", async () => {
      DetectionSettingService.detachDetectionSetting.mockRejectedValueOnce(
        new Error("setting not attached")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        detectionSettingsController.detachDetectionSetting(req, res, next)
      ).rejects.toThrow("setting not attached");
    });
  });
});
