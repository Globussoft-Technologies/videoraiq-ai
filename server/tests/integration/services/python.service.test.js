/**
 * services/python.service.js — previously at 0% coverage. This service
 * orchestrates calls to the external Python detection/attendance backends
 * (axios POSTs) and builds detector payloads from detection-mode strings.
 *
 * Strategy: mock axios + the NVR model + rtspStream.buildStreamingUrl so we
 * can exercise pure mapping/branch logic without spinning up Mongo. Each test
 * asserts the request shape, the response shape, and (where applicable) the
 * detection_modes -> detectors translation.
 *
 * Mocks: 3 (axios, NVR model, rtspStream).
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
  // stream_url is now made absolute on every start, not only when APP_ENV is
  // "cloud", so resolveHost is always consulted and has to be mocked.
  resolveHost: vi.fn().mockResolvedValue("http://stream.test"),
}));

vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: vi.fn(async () => ({
    detectionUrl: "http://detection.test",
    attendanceUrl: "http://attendance.test",
  })),
}));

const axios = (await import("axios")).default;
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { buildStreamingUrl } = await import("../../../utils/rtspStream.js");
const { default: PythonService } = await import(
  "../../../services/python.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PythonService.startDetection", () => {
  it("POSTs to the attendance host /api/v1/cameras/start and returns data", async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true, started: ["cam-1"] } });
    const payload = { camera_id: "cam-1", admin_id: "admin-1" };
    const out = await PythonService.startDetection(payload);

    expect(out).toEqual({ ok: true, started: ["cam-1"] });
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe("http://attendance.test/api/v1/cameras/start");
    expect(body).toEqual(payload);
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("rethrows on axios failure", async () => {
    axios.post.mockRejectedValueOnce(new Error("attendance down"));
    await expect(
      PythonService.startDetection({ camera_id: "cam-x" }),
    ).rejects.toThrow("attendance down");
  });
});

describe("PythonService.stopDetection", () => {
  it("sends {camera_id, force:true} to the attendance /stop endpoint", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    const out = await PythonService.stopDetection("cam-2");
    expect(out).toEqual({ stopped: true });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://attendance.test/api/v1/cameras/stop");
    expect(body).toEqual({ camera_id: "cam-2", force: true });
  });

  it("rethrows on axios failure", async () => {
    axios.post.mockRejectedValueOnce(new Error("nope"));
    await expect(PythonService.stopDetection("cam-3")).rejects.toThrow("nope");
  });
});

describe("PythonService.toggleCamerasBulk", () => {
  it("sends admin_id + a single camera_id to both resume-all endpoints", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { status: "ok", resumed: ["cam-1:crowd"] } })
      .mockResolvedValueOnce({ data: { success: true, resumed: ["cam-1:face_auth"] } });

    const out = await PythonService.toggleCamerasBulk("admin-1", "cam-1", true);

    expect(out).toEqual({
      detection: { status: "ok", resumed: ["cam-1:crowd"] },
      attendance: { success: true, resumed: ["cam-1:face_auth"] },
    });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "http://detection.test/stream/resume-all",
      { admin_id: "admin-1", camera_id: "cam-1" },
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      "http://attendance.test/api/v1/cameras/resume-all",
      { admin_id: "admin-1", camera_id: "cam-1" },
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends admin_id + a camera_id array to both stop-all endpoints", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { status: "ok", stopped: ["cam-1:crowd", "cam-2:line"] } })
      .mockResolvedValueOnce({ data: { success: true, stopped: ["cam-1:face_auth", "cam-2:face_auth"] } });

    const out = await PythonService.toggleCamerasBulk(
      "admin-2",
      ["cam-1", "cam-2"],
      false,
    );

    expect(out).toEqual({
      detection: { status: "ok", stopped: ["cam-1:crowd", "cam-2:line"] },
      attendance: {
        success: true,
        stopped: ["cam-1:face_auth", "cam-2:face_auth"],
      },
    });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "http://detection.test/stream/stop-all",
      { admin_id: "admin-2", camera_id: ["cam-1", "cam-2"] },
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      "http://attendance.test/api/v1/cameras/stop-all",
      { admin_id: "admin-2", camera_id: ["cam-1", "cam-2"] },
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("throws when admin_id is missing", async () => {
    await expect(
      PythonService.toggleCamerasBulk("", ["cam-1"], true),
    ).rejects.toThrow("admin_id is required");
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("PythonService.startNewDetection", () => {
  // Every detection_modes -> detector translation. Each entry asserts that
  // the resulting `detectors[]` includes exactly the expected name and
  // forwards `severity` and `[zones]`. We keep the assertions tight so a
  // future mapping bug surfaces immediately.
  const cases = [
    { mode: "helmet", name: "personalProtectiveEquipmentSettings" },
    { mode: "vest", name: "personalProtectiveEquipmentSettings" },
    { mode: "crowd", name: "crowdDetectionSettings" },
    { mode: "line_crossing", name: "lineCrossingSettings", zonesKey: "line_coordinates" },
    { mode: "vehicles", name: "countVehiclesSettings" },
    { mode: "countPersons", name: "countPersonsSettings" },
    { mode: "ANPR", name: "numberPlateDetectionSettings" },
    { mode: "intrusion", name: "zoneIntrusionSettings" },
    { mode: "conveyor", name: "conveyorDetectionSettings" },
    { mode: "crusher", name: "crusherDetectionSettings" },
    { mode: "water_spillage", name: "waterSpillageDetectionSettings" },
  ];

  it.each(cases)(
    "translates detection_modes=[$mode] -> detector $name",
    async ({ mode, name, zonesKey }) => {
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
        severity: "high",
      });

      const [url, body] = axios.post.mock.calls[0];
      expect(url).toBe("http://detection.test/stream");
      expect(body.camera_id).toBe("c1");
      expect(body.nvr_id).toBe("n1");
      expect(body.admin_id).toBe("a1");
      expect(body.stream_url).toBe("rtsp://x");

      // Detector list must include exactly one matching entry with our
      // severity tag attached. line_crossing uses `line_coordinates`
      // instead of `zones`, per the source.
      const matched = body.detectors.find((d) => d.name === name);
      expect(matched).toBeDefined();
      expect(matched.severity).toBe("high");
      if (zonesKey === "line_coordinates") {
        // The source spreads `zones` directly here, not wrapped in another array.
        expect(matched.line_coordinates).toEqual(zones);
      } else {
        // Source forwards `zones` directly (zones || []), not wrapped.
        expect(matched.zones).toEqual(zones);
      }
    },
  );

  it("emits multiple detectors when multiple modes are supplied", async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    await PythonService.startNewDetection({
      camera_id: "c",
      nvr_id: "n",
      admin_id: "a",
      stream_url: "rtsp://s",
      detection_modes: ["helmet", "crowd", "countPersons"],
      zones: [[0, 0]],
      severity: "low",
    });
    const body = axios.post.mock.calls[0][1];
    const names = body.detectors.map((d) => d.name).sort();
    expect(names).toEqual(
      ["countPersonsSettings", "crowdDetectionSettings", "personalProtectiveEquipmentSettings"].sort(),
    );
  });

  it("throws 'No configurations found' when detection_modes is empty", async () => {
    await expect(
      PythonService.startNewDetection({
        camera_id: "c",
        nvr_id: "n",
        admin_id: "a",
        detection_modes: [],
      }),
    ).rejects.toThrow("No configurations found");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("omits stream_url from the payload when not supplied", async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    await PythonService.startNewDetection({
      camera_id: "c",
      nvr_id: "n",
      admin_id: "a",
      detection_modes: ["countPersons"],
      zones: [[0, 0]],
      severity: "low",
    });
    const body = axios.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("stream_url");
  });

  it("rethrows axios errors", async () => {
    axios.post.mockRejectedValueOnce(new Error("detection backend 500"));
    await expect(
      PythonService.startNewDetection({
        camera_id: "c",
        nvr_id: "n",
        admin_id: "a",
        detection_modes: ["countPersons"],
        zones: [],
        severity: "low",
      }),
    ).rejects.toThrow("detection backend 500");
  });
});

describe("PythonService.updateNewDetection", () => {
  it("POSTs to /detectors/update with vehicle_obstruction carrying obstruction_threshold_sec", async () => {
    axios.post.mockResolvedValueOnce({ data: { updated: true } });
    const out = await PythonService.updateNewDetection({
      camera_id: "c",
      nvr_id: "n",
      admin_id: "a",
      stream_url: "rtsp://u",
      detection_modes: ["vehicle_obstruction"],
      zones: [[10, 10]],
      obstruction_threshold_sec: 7,
      severity: "moderate",
    });
    expect(out).toEqual({ updated: true });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://detection.test/detectors/update");
    const det = body.detectors.find((d) => d.name === "vehicleObstructionSettings");
    expect(det).toBeDefined();
    expect(det.obstruction_threshold_sec).toBe(7);
  });

  it("throws when detection_modes yields no detectors", async () => {
    await expect(
      PythonService.updateNewDetection({
        camera_id: "c",
        nvr_id: "n",
        admin_id: "a",
        detection_modes: [],
      }),
    ).rejects.toThrow("No configurations found");
  });
});

describe("PythonService.stopNewDetection", () => {
  it("POSTs to /stream/stop with only camera_id+nvr_id when no detection modes given", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    const out = await PythonService.stopNewDetection("c1", "n1");
    expect(out).toEqual({ stopped: true });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://detection.test/stream/stop");
    expect(body).toEqual({ camera_id: "c1", nvr_id: "n1" });
    expect(body.detectors).toBeUndefined();
  });

  it("includes the mapped detector names when modes are given", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    await PythonService.stopNewDetection("c2", "n2", [
      "helmet",
      "crowd",
      "vehicles",
      "intrusion",
    ]);
    const body = axios.post.mock.calls[0][1];
    expect(body.detectors).toEqual(
      expect.arrayContaining([
        "personalProtectiveEquipmentSettings",
        "crowdDetectionSettings",
        "countVehiclesSettings",
        "zoneIntrusionSettings",
      ]),
    );
  });

  it("rethrows axios errors", async () => {
    axios.post.mockRejectedValueOnce(new Error("can't stop"));
    // Must be a MAPPED mode: an unmapped one is now rejected before the request
    // is made, so it would no longer exercise axios error propagation.
    // ("persons" is not mapped — DETECTION_MODES_MAP declares countPersonsSettings
    // twice and the second, ["countPersons"], wins.)
    await expect(
      PythonService.stopNewDetection("c3", "n3", ["crowd"]),
    ).rejects.toThrow("can't stop");
  });
});

describe("PythonService.handleDetectionStartStop", () => {
  it("disable=false stops detection via stopNewDetection and skips NVR lookup", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    const channel = {
      _id: { toString: () => "cam-7" },
      nvrId: { _id: { toString: () => "nvr-7" } },
    };
    const out = await PythonService.handleDetectionStartStop(
      channel,
      "admin",
      false,
    );
    expect(out).toEqual({ stopped: true });
    // It should call /stream/stop.
    expect(axios.post.mock.calls[0][0]).toBe("http://detection.test/stream/stop");
    // Should not call NVR.findById on the stop path.
    expect(NVR.findById).not.toHaveBeenCalled();
  });

  it("enable=true with a missing NVR throws 'NVR not found'", async () => {
    NVR.findById.mockResolvedValueOnce(null);
    await expect(
      PythonService.handleDetectionStartStop(
        { _id: { toString: () => "c" }, nvrId: { _id: "nvr-x" } },
        "admin",
        true,
        "crowdDetectionSettings",
        [[0, 0]],
        [1920, 1080],
        0,
        "low",
      ),
    ).rejects.toThrow("NVR not found");
  });

  it("enable=true with a known type builds the payload and calls /stream", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-9", brand: "hikvision" });
    axios.post.mockResolvedValueOnce({ data: { started: true } });

    const channel = {
      _id: { toString: () => "cam-9" },
      nvrId: { _id: { toString: () => "nvr-9" } },
      customName: "Lobby",
      checkType: "attendance",
    };

    const out = await PythonService.handleDetectionStartStop(
      channel,
      "admin-9",
      true,
      "crowdDetectionSettings",
      [[1, 1]],
      [640, 480],
      0,
      "high",
    );
    expect(out).toEqual({ started: true });
    expect(buildStreamingUrl).toHaveBeenCalledTimes(1);
    const body = axios.post.mock.calls[0][1];
    expect(body.camera_id).toBe("cam-9");
    expect(body.nvr_id).toBe("nvr-9");
    expect(body.admin_id).toBe("admin-9");
    expect(body.detectors.find((d) => d.name === "crowdDetectionSettings")).toBeDefined();
    // Absolute, not the bare path buildStreamingUrl returned. DS fetches this
    // URL directly, so a relative "stream/<nvr>-<cam>/playlist.m3u8" produced a
    // pipeline that started and then had nothing to read - the camera showed as
    // running while no detections ever fired.
    expect(body.stream_url).toBe("http://stream.test/stream.m3u8");
  });

  it("enable=true with an unknown detection type yields empty modes and rejects", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-10", brand: "hikvision" });
    await expect(
      PythonService.handleDetectionStartStop(
        {
          _id: { toString: () => "cam-10" },
          nvrId: { _id: { toString: () => "nvr-10" } },
        },
        "admin",
        true,
        "thisIsNotARealType",
        [],
        [640, 480],
        0,
        "low",
      ),
    ).rejects.toThrow("No configurations found");
  });
});

describe("PythonService.handleDetectionUpdate", () => {
  it("throws 'NVR not found' when the NVR lookup returns null", async () => {
    NVR.findById.mockResolvedValueOnce(null);
    await expect(
      PythonService.handleDetectionUpdate(
        {
          _id: { toString: () => "cam-u" },
          nvrId: { _id: "nvr-u" },
        },
        "admin",
        "personalProtectiveEquipmentSettings",
        [[0, 0]],
        [1920, 1080],
        5,
        "moderate",
      ),
    ).rejects.toThrow("NVR not found");
  });

  it("calls /detectors/update with the mapped detectors and stream_url", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-u2", brand: "hikvision" });
    axios.post.mockResolvedValueOnce({ data: { updated: true } });

    const channel = {
      _id: { toString: () => "cam-u2" },
      nvrId: { _id: { toString: () => "nvr-u2" } },
      checkType: "ppe",
      customName: "Yard",
    };

    const out = await PythonService.handleDetectionUpdate(
      channel,
      "admin-u2",
      "personalProtectiveEquipmentSettings",
      [[1, 1]],
      [640, 480],
      9,
      "high",
    );
    expect(out).toEqual({ updated: true });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://detection.test/detectors/update");
    expect(body.camera_id).toBe("cam-u2");
    expect(body.nvr_id).toBe("nvr-u2");
    expect(body.detectors.find((d) => d.name === "personalProtectiveEquipmentSettings")).toBeDefined();
  });
});

describe("PythonService.processVideoJob", () => {
  it("POSTs the payload to <base>/video-process/jobs and returns data", async () => {
    axios.post.mockResolvedValueOnce({ data: { job_id: "job-1", status: "queued" } });
    const payload = {
      admin_id: "64b7f5b8e45c9a0012ab34cd",
      video_id: "demo-video-001",
      source_url: "https://media.test/uploads/videos/demo.mp4",
      detectors: [{ name: "countPersonsSettings" }],
    };
    const out = await PythonService.processVideoJob(payload);
    expect(out).toEqual({ job_id: "job-1", status: "queued" });

    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/video-process\/jobs$/);
    expect(body).toEqual(payload);
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("rethrows on axios failure", async () => {
    axios.post.mockRejectedValueOnce(new Error("process service down"));
    await expect(
      PythonService.processVideoJob({ admin_id: "a", video_id: "v" }),
    ).rejects.toThrow("process service down");
  });
});

describe("PythonService.registerChannel", () => {
  it("returns undefined when admin_id is falsy (early-return branch)", async () => {
    // Even if NVR.findById returns a NVR, the falsy admin_id short-circuits
    // the inner body so axios is never called and the function resolves
    // undefined.
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-r" });
    const out = await PythonService.registerChannel(
      { nvrId: "nvr-r", _id: "cam-r", name: "n" },
      "live",
      null,
    );
    expect(out).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("returns undefined when the NVR lookup misses (no axios call)", async () => {
    NVR.findById.mockResolvedValueOnce(null);
    const out = await PythonService.registerChannel(
      { nvrId: "missing", _id: "c", name: "n" },
      "live",
      "admin",
    );
    expect(out).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  // A populated attendanceSettings link (the `id.settings` branch) so the
  // guard passes without a DetectionSetting.findById DB call.
  const attendanceLink = (cameraId) => ({
    attendanceSettings: {
      id: {
        settings: {
          referencePoints: {
            [cameraId]: [
              [
                [100, 100],
                [600, 100],
                [600, 500],
                [100, 500],
              ],
            ],
          },
          zone_configs: [{ name: "Entrance Zone" }],
        },
      },
    },
  });

  it("calls startDetection with the right payload on the happy path", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-1", brand: "hikvision" });
    axios.post.mockResolvedValueOnce({ data: { ok: true } });

    const channel = {
      _id: { toString: () => "cam-1" },
      nvrId: { _id: { toString: () => "nvr-1" } },
      name: "Front Lobby",
      detections: attendanceLink("cam-1"),
    };

    const out = await PythonService.registerChannel(channel, "live", "admin-1");
    expect(out).toEqual({ ok: true });

    // Ensure the wrapping startDetection sent the expected camera payload.
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://attendance.test/api/v1/cameras/start");
    expect(body.camera_id).toBe("cam-1");
    expect(body.admin_id).toBe("admin-1");
    expect(body.camera_type).toBe("live");
    expect(body.zones).toEqual([
      [
        [100, 100],
        [600, 100],
        [600, 500],
        [100, 500],
      ],
    ]);
    expect(body.zone_configs).toEqual([{ name: "Entrance Zone" }]);
    expect(body.camera_name).toBe("Front Lobby");
    expect(body.detection_modes).toEqual(["face"]);
  });

  it("starts with empty zones when no attendanceSettings is linked (optional)", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-1", brand: "hikvision" });
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    const out = await PythonService.registerChannel(
      {
        _id: { toString: () => "cam-1" },
        nvrId: { _id: { toString: () => "nvr-1" } },
        name: "Front Lobby",
      },
      "live",
      "admin-1",
    );
    expect(out).toEqual({ ok: true });
    const [, body] = axios.post.mock.calls[0];
    expect(body.zones).toEqual([]);
    expect(body.zone_configs).toEqual([]);
  });

  it("rethrows when startDetection fails", async () => {
    NVR.findById.mockResolvedValueOnce({ _id: "nvr-1", brand: "hikvision" });
    axios.post.mockRejectedValueOnce(new Error("attendance failed"));
    await expect(
      PythonService.registerChannel(
        {
          _id: { toString: () => "x" },
          nvrId: { _id: { toString: () => "n" } },
          name: "x",
          detections: attendanceLink("x"),
        },
        "live",
        "admin",
      ),
    ).rejects.toThrow("attendance failed");
  });
});

describe("PythonService.deregisterChannel / checkChannelHealth", () => {
  // Empty try/catch helpers — confirm they don't throw and return undefined.
  it("deregisterChannel resolves to undefined for any channel", async () => {
    await expect(PythonService.deregisterChannel({})).resolves.toBeUndefined();
  });

  it("checkChannelHealth resolves to undefined for any channel", async () => {
    await expect(PythonService.checkChannelHealth({})).resolves.toBeUndefined();
  });
});

