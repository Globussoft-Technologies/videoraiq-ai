/**
 * stopNewDetection must never turn a single-detector stop into a camera-wide one.
 *
 * The payload omits `detectors` when the list is empty, and DS reads that as
 * "stop the whole camera". Door, Light and Guard Absence appear in
 * DETECTION_MODES_MAP but neither stopNewDetection nor startNewDetection maps
 * them to a DS detector name, so switching one of them off used to stop every
 * other detection running on that camera.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../../../utils/rtspStream.js", () => ({
  default: vi.fn(),
  buildRTSPUrl: vi.fn(() => "rtsp://fake.test/main"),
  buildStreamingUrl: vi.fn().mockResolvedValue("stream.m3u8"),
  resolveHost: vi.fn().mockResolvedValue("http://stream.test"),
}));
vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: vi.fn(async () => ({
    detectionUrl: "http://detection.test",
    attendanceUrl: "http://attendance.test",
  })),
}));

const axios = (await import("axios")).default;
const { default: PythonService } = await import("../../../services/python.service.js");
const { DETECTION_TYPES, DETECTION_MODES_MAP } = await import(
  "../../../constants/detectionTypes.js"
);

beforeEach(() => { vi.clearAllMocks(); });

describe("stopNewDetection — unmapped detector guard", () => {
  it.each(["door", "light", "guard_absence"])(
    "refuses a camera-wide stop for the unmapped mode %s",
    async (mode) => {
      await expect(
        PythonService.stopNewDetection("c1", "n1", [mode], "admin-1"),
      ).rejects.toThrow(/No DS detector mapping/);
      // Crucially, nothing was sent — the other detections keep running.
      expect(axios.post).not.toHaveBeenCalled();
    },
  );

  it("still allows a deliberate whole-camera stop when no modes are given", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    await PythonService.stopNewDetection("c-all", "n-all", [], "admin-1");
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1].detectors).toBeUndefined();
  });

  it("sends a partial stop for a mapped mode", async () => {
    axios.post.mockResolvedValueOnce({ data: { stopped: true } });
    await PythonService.stopNewDetection("c2", "n2", ["crowd"], "admin-1");
    expect(axios.post.mock.calls[0][1].detectors).toEqual(["crowdDetectionSettings"]);
  });

  it("documents exactly which detection types are still unmapped", async () => {
    const unmapped = [];
    for (const settingType of Object.keys(DETECTION_TYPES)) {
      const modes = DETECTION_MODES_MAP[settingType];
      if (!modes?.length) continue;
      vi.clearAllMocks();
      axios.post.mockResolvedValue({ data: {} });
      try {
        await PythonService.stopNewDetection("c", "n", modes, "a");
      } catch {
        unmapped.push(settingType);
      }
    }
    // Update this list (and add the DS branches) once DS confirms the enum
    // names. Anything here cannot currently be stopped independently.
    expect(unmapped.sort()).toEqual([
      "doorDetectionSettings",
      "guardAbsenceSettings",
      "lightDetectionSettings",
    ]);
  });
});

describe("fetchDsDetectorNames / syncDsDetectorNames", () => {
  // DS is FastAPI and has never disabled openapi_url, so its DetectionLogic
  // enum — the list every detector name is validated against — is already
  // served at /openapi.json. No DS-side work is needed to sync.
  const openapi = (names) => ({
    data: { components: { schemas: { DetectionLogic: { enum: names } } } },
  });

  it("reads the DetectionLogic enum out of DS's OpenAPI schema", async () => {
    axios.get
      .mockRejectedValueOnce(new Error("no /detectors endpoint"))
      .mockResolvedValueOnce(openapi(["crowdDetectionSettings", "carModelDetectionSettings"]));

    const out = await PythonService.fetchDsDetectorNames();
    expect(out.source).toBe("/openapi.json");
    expect(out.names).toEqual(["crowdDetectionSettings", "carModelDetectionSettings"]);
  });

  it("prefers a dedicated catalog endpoint if DS ever adds one", async () => {
    axios.get.mockResolvedValueOnce({ data: { detectors: ["crowdDetectionSettings"] } });
    const out = await PythonService.fetchDsDetectorNames();
    expect(out.source).toBe("/detectors");
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("returns null when DS answers neither", async () => {
    axios.get.mockRejectedValue(new Error("unreachable"));
    expect(await PythonService.fetchDsDetectorNames()).toBeNull();
    await expect(PythonService.syncDsDetectorNames()).resolves.toBeNull();
  });

  it("reports names DS rejects and modes DS has no engine for", async () => {
    axios.get
      .mockRejectedValueOnce(new Error("no /detectors"))
      .mockResolvedValueOnce(openapi(["crowdDetectionSettings"]));

    const result = await PythonService.syncDsDetectorNames();
    expect(result.source).toBe("/openapi.json");
    // Everything else we send is absent from this stub enum.
    expect(result.weSendButDsRejects).toContain("lineCrossingSettings");
    expect(result.stillUnnamed.sort()).toEqual(["door", "guard_absence", "light"]);
  });

  it("reconciles cleanly against DS's real DetectionLogic enum", async () => {
    // The actual 18 values from cv-faceauth/api_obj/models/schemas.py. This is
    // the regression guard: if either side gains a detector and the other does
    // not, this fails.
    const real = [
      "personalProtectiveEquipmentSettings", "crowdDetectionSettings",
      "lineCrossingSettings", "countVehiclesSettings", "countPersonsSettings",
      "vehicleTypeDetectionSettings", "vehicleObstructionSettings",
      "loiteringDetectionSettings", "zoneIntrusionSettings",
      "deskAbsenceDetectionSettings", "tableOccupancySettings",
      "foodServicePPEDetection", "conveyorDetectionSettings",
      "crusherDetectionSettings", "waterSpillageDetectionSettings",
      "numberPlateDetectionSettings", "mobilePhoneDetectionSettings",
      "carModelDetectionSettings",
    ];
    axios.get
      .mockRejectedValueOnce(new Error("no /detectors"))
      .mockResolvedValueOnce(openapi(real));

    const result = await PythonService.syncDsDetectorNames();
    expect(result.weSendButDsRejects).toEqual([]);
    expect(result.dsHasButWeNeverSend).toEqual([]);
    // Door / Light / Guard Absence are not in DS at all — they are not a
    // mapping oversight, DS simply has no engine for them.
    expect(result.stillUnnamed.sort()).toEqual(["door", "guard_absence", "light"]);
  });
});
