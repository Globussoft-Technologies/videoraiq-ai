/**
 * Gap-fill round 2 for services/python.service.js.
 *
 * The existing python.service.test.js walks every detection_mode arm
 * EXCEPT the 3 newer ones (vehicleType, loitering, vehicleObstruction)
 * that appear after the "water_spillage" arm in each of:
 *   - startNewDetection (lines 212-234)
 *   - updateNewDetection (lines 367-389)
 *   - stopNewDetection (lines 508-516)
 *
 * Uncovered ranges per v8:
 *   213-218, 221-226, 229-234, 368-373, 376-381, 384-389,
 *   509-510, 512-513, 515-516.
 *
 * UNREACHABLE:
 *   591-593  deregisterChannel — try-block is empty so the catch can
 *            never fire.
 *   597-599  checkChannelHealth — same.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("../../../utils/rtspStream.js", () => ({
  default: vi.fn(),
  buildRTSPUrl: vi.fn(() => "rtsp://fake.test/main"),
  buildStreamingUrl: vi.fn().mockResolvedValue("stream.m3u8"),
}));

const axios = (await import("axios")).default;
const { default: PythonService } = await import(
  "../../../services/python.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PythonService.startNewDetection — tail detection_modes (lines 212-234)", () => {
  const cases = [
    { mode: "vehicleType", name: "vehicleTypeDetectionSettings", carriesObstruction: true },
    { mode: "loitering", name: "loiteringDetectionSettings", carriesObstruction: true },
    { mode: "vehicleObstruction", name: "vehicleObstructionSettings", carriesObstruction: true },
  ];

  it.each(cases)(
    "translates detection_modes=[$mode] -> detector $name (with obstruction_threshold_sec)",
    async ({ mode, name, carriesObstruction }) => {
      axios.post.mockResolvedValueOnce({ data: { ok: true } });
      const zones = [
        [1, 2],
        [3, 4],
      ];
      await PythonService.startNewDetection({
        camera_id: "c1",
        nvr_id: "n1",
        admin_id: "a1",
        stream_url: "rtsp://x",
        detection_modes: [mode],
        zones,
        obstruction_threshold_sec: 7,
        severity: "high",
      });

      const [, body] = axios.post.mock.calls[0];
      const matched = body.detectors.find((d) => d.name === name);
      expect(matched).toBeDefined();
      expect(matched.zones).toEqual([zones]);
      if (carriesObstruction) {
        expect(matched.obstruction_threshold_sec).toBe(7);
      }
    },
  );
});

describe("PythonService.updateNewDetection — tail detection_modes (lines 367-389)", () => {
  const cases = [
    { mode: "vehicleType", name: "vehicleTypeDetectionSettings" },
    { mode: "loitering", name: "loiteringDetectionSettings" },
    { mode: "vehicleObstruction", name: "vehicleObstructionSettings" },
  ];

  it.each(cases)(
    "translates detection_modes=[$mode] -> detector $name on update",
    async ({ mode, name }) => {
      axios.post.mockResolvedValueOnce({ data: { ok: true } });
      const zones = [[5, 6]];
      await PythonService.updateNewDetection({
        camera_id: "c-up",
        nvr_id: "n-up",
        admin_id: "a-up",
        stream_url: "rtsp://up",
        detection_modes: [mode],
        zones,
        obstruction_threshold_sec: 12,
        severity: "low",
      });

      const [, body] = axios.post.mock.calls[0];
      const matched = body.detectors.find((d) => d.name === name);
      expect(matched).toBeDefined();
      expect(matched.obstruction_threshold_sec).toBe(12);
      expect(matched.zones).toEqual([zones]);
    },
  );
});

describe("PythonService.stopNewDetection — tail detection_modes (lines 508-516)", () => {
  const cases = [
    { mode: "vehicleType", name: "vehicleTypeDetectionSettings" },
    { mode: "loitering", name: "loiteringDetectionSettings" },
    { mode: "vehicleObstruction", name: "vehicleObstructionSettings" },
  ];

  it.each(cases)(
    "translates detectionModes=[$mode] -> detector name $name on stop",
    async ({ mode, name }) => {
      axios.post.mockResolvedValueOnce({ data: { ok: true } });
      await PythonService.stopNewDetection("c-stop", "n-stop", [mode]);
      const [, body] = axios.post.mock.calls[0];
      expect(body.detectors).toContain(name);
    },
  );
});
