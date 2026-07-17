/**
 * services/python.service.js — branch-coverage round R85.
 *
 * Sibling `python.service.test.js` (R~50s) covered:
 *   - startNewDetection: ALL 11 detection_modes → detector mappings
 *   - updateNewDetection: only `vehicle_obstruction` + empty-modes
 *   - stopNewDetection:  only the combo {helmet, crowd, vehicles, intrusion}
 *
 * That left the per-mode branches in updateNewDetection (lines 263-333)
 * and the missing-mode branches in stopNewDetection (lines 422-451) cold.
 * This file pins each remaining mode → detector translation for both
 * methods. The mappings mirror startNewDetection, EXCEPT:
 *   - updateNewDetection accepts `vehicle_obstruction` (handled by the
 *     sibling test) — no ANPR branch here, that one only lives in
 *     startNewDetection.
 *   - stopNewDetection emits detector NAMES as bare strings, not objects.
 *
 * Mocks (3 — well below the 8 cap, identical surface to sibling):
 *   1. axios            — POST returns a settled stub
 *   2. NVR model        — `findById` stub (not exercised here but pinned
 *                         so the module loads under the same APP_ENV path
 *                         the sibling test uses)
 *   3. rtspStream       — `buildStreamingUrl` stub (also not exercised
 *                         by the methods under test — both are pure
 *                         translators that don't touch rtsp paths)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: {
    findById: vi.fn(),
  },
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

// ---------------------------------------------------------------------------
// updateNewDetection — per-mode detector translation
// ---------------------------------------------------------------------------
describe("PythonService.updateNewDetection — per-mode branches", () => {
  // Each remaining mode → detector entry. line_crossing forwards `zones`
  // raw under `line_coordinates` (matching startNewDetection); all others
  // wrap zones in an outer array.
  const cases = [
    { mode: "helmet", name: "personalProtectiveEquipmentSettings" },
    { mode: "vest", name: "personalProtectiveEquipmentSettings" },
    { mode: "crowd", name: "crowdDetectionSettings" },
    {
      mode: "line_crossing",
      name: "lineCrossingSettings",
      zonesKey: "line_coordinates",
    },
    { mode: "vehicles", name: "countVehiclesSettings" },
    { mode: "countPersons", name: "countPersonsSettings" },
    { mode: "intrusion", name: "zoneIntrusionSettings" },
    { mode: "conveyor", name: "conveyorDetectionSettings" },
    { mode: "crusher", name: "crusherDetectionSettings" },
    { mode: "water_spillage", name: "waterSpillageDetectionSettings" },
  ];

  it.each(cases)(
    "translates update detection_modes=[$mode] -> detector $name",
    async ({ mode, name, zonesKey }) => {
      axios.post.mockResolvedValueOnce({ data: { updated: true } });
      const zones = [
        [10, 10],
        [30, 30],
      ];
      const out = await PythonService.updateNewDetection({
        camera_id: "cu",
        nvr_id: "nu",
        admin_id: "au",
        stream_url: "rtsp://u",
        detection_modes: [mode],
        zones,
        severity: "moderate",
      });

      expect(out).toEqual({ updated: true });

      const [url, body] = axios.post.mock.calls[0];
      expect(url).toBe("http://detection.test/detectors/update");
      expect(body.camera_id).toBe("cu");
      expect(body.nvr_id).toBe("nu");
      expect(body.admin_id).toBe("au");
      expect(body.stream_url).toBe("rtsp://u");

      const matched = body.detectors.find((d) => d.name === name);
      expect(matched).toBeDefined();
      expect(matched.severity).toBe("moderate");
      if (zonesKey === "line_coordinates") {
        // line_crossing spreads zones directly, not wrapped.
        expect(matched.line_coordinates).toEqual(zones);
      } else {
        // Source forwards `zones` directly (zones || []), not wrapped.
        expect(matched.zones).toEqual(zones);
      }
    },
  );

  it("emits multiple detectors when several modes are supplied (helmet+intrusion+crusher)", async () => {
    axios.post.mockResolvedValueOnce({ data: { updated: true } });
    await PythonService.updateNewDetection({
      camera_id: "c",
      nvr_id: "n",
      admin_id: "a",
      detection_modes: ["helmet", "intrusion", "crusher"],
      zones: [[0, 0]],
      severity: "low",
    });
    const body = axios.post.mock.calls[0][1];
    const names = body.detectors.map((d) => d.name).sort();
    expect(names).toEqual(
      [
        "zoneIntrusionSettings",
        "crusherDetectionSettings",
        "personalProtectiveEquipmentSettings",
      ].sort(),
    );
  });

  it("omits stream_url from the update payload when not supplied", async () => {
    axios.post.mockResolvedValueOnce({ data: { updated: true } });
    await PythonService.updateNewDetection({
      camera_id: "c",
      nvr_id: "n",
      admin_id: "a",
      detection_modes: ["crowd"],
      zones: [[0, 0]],
      severity: "low",
    });
    const body = axios.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("stream_url");
  });

  it("rethrows axios errors", async () => {
    axios.post.mockRejectedValueOnce(new Error("update backend 500"));
    await expect(
      PythonService.updateNewDetection({
        camera_id: "c",
        nvr_id: "n",
        admin_id: "a",
        detection_modes: ["crowd"],
        zones: [],
        severity: "low",
      }),
    ).rejects.toThrow("update backend 500");
  });
});

// ---------------------------------------------------------------------------
// stopNewDetection — remaining per-mode detector-name branches
// ---------------------------------------------------------------------------
describe("PythonService.stopNewDetection — remaining mode branches", () => {
  // The sibling test covered {helmet, crowd, vehicles, intrusion}. This run
  // covers everything else: vest (which shares the PPE branch with helmet),
  // line_crossing, persons, vehicle_obstruction, conveyor, crusher,
  // water_spillage. Each asserts the detector NAME appears as a bare string
  // (not an object — distinct from start/update).
  const cases = [
    { mode: "vest", name: "personalProtectiveEquipmentSettings" },
    { mode: "line_crossing", name: "lineCrossingSettings" },
    { mode: "countPersons", name: "countPersonsSettings" },
    { mode: "vehicleObstruction", name: "vehicleObstructionSettings" },
    { mode: "conveyor", name: "conveyorDetectionSettings" },
    { mode: "crusher", name: "crusherDetectionSettings" },
    { mode: "water_spillage", name: "waterSpillageDetectionSettings" },
  ];

  it.each(cases)(
    "stops detection for modes=[$mode] and emits detector name '$name'",
    async ({ mode, name }) => {
      axios.post.mockResolvedValueOnce({ data: { stopped: true } });
      const out = await PythonService.stopNewDetection("cs", "ns", [mode]);
      expect(out).toEqual({ stopped: true });

      const [url, body] = axios.post.mock.calls[0];
      expect(url).toBe("http://detection.test/stream/stop");
      expect(body.camera_id).toBe("cs");
      expect(body.nvr_id).toBe("ns");
      expect(body.detectors).toContain(name);
      expect(body.detectors).toHaveLength(1);
    },
  );

  it("emits ALL detector names when every mode is supplied", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    await PythonService.stopNewDetection("ca", "na", [
      "helmet",
      "vest",
      "crowd",
      "line_crossing",
      "vehicles",
      "countPersons",
      "vehicleObstruction",
      "intrusion",
      "conveyor",
      "crusher",
      "water_spillage",
    ]);
    const body = axios.post.mock.calls[0][1];
    // helmet and vest both push the SAME PPE name, but the `some(...)` guard
    // only fires once total — so PPE appears exactly once in the array.
    const ppeCount = body.detectors.filter(
      (n) => n === "personalProtectiveEquipmentSettings",
    ).length;
    expect(ppeCount).toBe(1);
    expect(body.detectors).toEqual(
      expect.arrayContaining([
        "personalProtectiveEquipmentSettings",
        "crowdDetectionSettings",
        "lineCrossingSettings",
        "countVehiclesSettings",
        "countPersonsSettings",
        "vehicleObstructionSettings",
        "zoneIntrusionSettings",
        "conveyorDetectionSettings",
        "crusherDetectionSettings",
        "waterSpillageDetectionSettings",
      ]),
    );
  });
});
