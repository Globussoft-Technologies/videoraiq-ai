import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
vi.mock("../../../utils/database.js", () => ({ redis: {} }));
vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: "http://ds.test" }),
}));

const { default: axios } = await import("axios");
const { default: pythonService } = await import("../../../services/python.service.js");
const { PersonalProtectiveEquipmentSetting } = await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
const { default: validation } = await import("../../../core/v2/detectionSettings/detectionSettings.validate.js");

const name = "personalProtectiveEquipmentSettings";
const zones = [
  [[0, 0], [640, 0], [640, 694], [0, 694]],
  [[640, 0], [1280, 0], [1280, 694], [640, 694]],
];
const payload = {
  camera_id: "camera",
  nvr_id: "nvr",
  admin_id: "admin",
  stream_url: "rtsp://camera.example/live",
  detection_modes: ["helmet", "vest"],
  severity: "moderate",
};

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ data: { status: "ok" } });
});

describe("PPE zone settings", () => {
  it.each(["startNewDetection", "updateNewDetection"])("%s sends required items for each saved zone", async (method) => {
    const configs = [
      { name: "Paint booth", required_items: ["head_cap", "mask", "dangri"] },
      { name: "Loading area", required_items: ["helmet", "vest"] },
    ];
    expect(validation.validateNewDetectorSettings(name, { zone_configs: configs }).error).toBeUndefined();
    const doc = new PersonalProtectiveEquipmentSetting({ settings: { zone_configs: configs } });
    const saved = PersonalProtectiveEquipmentSetting.hydrate(doc.toObject());

    await pythonService[method]({ ...payload, zones, zone_configs: saved.settings.zone_configs });

    expect(axios.post.mock.calls[0][1].detectors).toEqual([{
      name,
      severity: "moderate",
      zones,
      zone_configs: configs,
      ppe_options: {
        provider: "jev",
        sample_interval_sec: 1,
        best_crop_window_sec: 1,
        refresh_sec: 60,
        retry_sec: 15,
        dangri_upper_color: "blue",
        dangri_lower_color: "blue",
        mask_require_nose_mouth: false,
      },
    }]);
  });

  it("keeps the legacy payload for zones saved without a selection", async () => {
    const configs = [{ name: "Paint booth" }];
    const doc = new PersonalProtectiveEquipmentSetting({ settings: { zone_configs: configs } });
    expect(doc.settings.zone_configs[0].required_items).toBeUndefined();

    await pythonService.startNewDetection({ ...payload, zones: zones[0], zone_configs: configs });

    expect(axios.post.mock.calls[0][1].detectors).toEqual([
      { name, severity: "moderate", zones: zones[0], zone_configs: configs },
    ]);
  });

  it("sends an empty list if a zone selection is cleared", async () => {
    await pythonService.updateNewDetection({
      ...payload,
      zones: zones[0],
      zone_configs: [{ name: "Paint booth", required_items: [] }],
    });

    expect(axios.post.mock.calls[0][1].detectors[0]).toMatchObject({
      zones: [zones[0]],
      zone_configs: [{ name: "Paint booth", required_items: [] }],
    });
  });

  it("does not add items to an unconfigured zone alongside a configured zone", async () => {
    await pythonService.updateNewDetection({
      ...payload,
      zones,
      zone_configs: [{ name: "Paint booth", required_items: ["mask"] }, { name: "Loading area" }],
    });

    expect(axios.post.mock.calls[0][1].detectors[0].zone_configs).toEqual([
      { name: "Paint booth", required_items: ["mask"] },
      { name: "Loading area", required_items: [] },
    ]);
  });

  it.each([
    { items: ["boots"] },
    { items: ["mask", "mask"] },
  ])("rejects invalid required items $items", ({ items }) => {
    expect(validation.validateNewDetectorSettings(name, { zone_configs: [{ required_items: items }] }).error).toBeDefined();
  });
});
