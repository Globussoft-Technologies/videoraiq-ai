/**
 * Door open/close detection, Node -> DS (DS door contract §3, DS's live start
 * payload of 2026-10-22): the detector sent on POST /stream and
 * /detectors/update, the stop, the checks Node makes before calling DS, and
 * the update -> start fallback when DS says door detection isn't running.
 * axios, NVR lookup and host resolution are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: { findById: vi.fn().mockResolvedValue({ _id: "n1", userId: "u1" }) },
}));
vi.mock("../../../utils/rtspStream.js", () => ({
  default: vi.fn(),
  buildRTSPUrl: vi.fn(() => "rtsp://fake.test/main"),
  buildStreamingUrl: vi.fn().mockResolvedValue("stream/n1-c1/playlist.m3u8"),
  resolveHost: vi.fn().mockResolvedValue("https://stream.test"),
}));
vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: "http://ds.test" }),
}));

const axios = (await import("axios")).default;
const { default: PythonService, buildDoorDetector } = await import("../../../services/python.service.js");

const door = [[631, 216], [773, 193], [811, 435], [672, 445]];
const configs = [{ name: "Stock Door", threshold_sec: 300, telegramChatIds: ["x"] }];
const settings = { door_alert_mode: "closed", trigger_notification: false };
const doorSent = () => axios.post.mock.calls.at(-1)[1].detectors.find((d) => d.name === "doorDetectionSettings");

beforeEach(() => vi.clearAllMocks());

describe("door detector sent to DS", () => {
  it("POST /stream sends DS's start payload, points unchanged", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
    await PythonService.startNewDetection({
      camera_id: "c1", nvr_id: "n1", admin_id: "a1", stream_url: "https://stream.test/x.m3u8",
      detection_modes: ["door"], zones: [door], zone_configs: configs, severity: "moderate",
      confidence_thresholds: { door_alert_mode: "open", trigger_notification: true },
    });
    expect(axios.post.mock.calls[0][0]).toBe("http://ds.test/stream");
    expect(axios.post.mock.calls[0][1]).toEqual({
      camera_id: "c1",
      nvr_id: "n1",
      admin_id: "a1",
      stream_url: "https://stream.test/x.m3u8",
      detectors: [{
        name: "doorDetectionSettings",
        zones: [door],
        zone_configs: [{ name: "Stock Door", threshold_sec: 300 }],
        door_alert_mode: "open",
        severity: "moderate",
        trigger_notification: true,
      }],
    });
  });

  it("POST /stream/stop stops only door detection", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
    await PythonService.stopNewDetection("c1", "n1", ["door"], "a1");
    expect(axios.post.mock.calls[0][0]).toBe("http://ds.test/stream/stop");
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: "c1", nvr_id: "n1", detectors: ["doorDetectionSettings"] });
  });

  it("POST /detectors/update sends the same complete door object", async () => {
    axios.post.mockResolvedValueOnce({ data: { status: "ok" } });
    await PythonService.updateNewDetection({
      camera_id: "c1", nvr_id: "n1", admin_id: "a1",
      detection_modes: ["door"], zones: [door], zone_configs: configs, severity: "moderate", confidence_thresholds: {},
    });
    expect(axios.post.mock.calls[0][0]).toBe("http://ds.test/detectors/update");
    expect(doorSent()).toMatchObject({ zones: [door], door_alert_mode: "open", trigger_notification: true });
  });

  it("wraps a single stored polygon as one door", () => {
    expect(buildDoorDetector(door, configs, "low").zones).toEqual([door]);
  });

  it("refuses before calling DS: no points, a door without its config, under a minute", () => {
    expect(() => buildDoorDetector([], configs)).toThrow(/no door points/);
    expect(() => buildDoorDetector([door, door], configs)).toThrow(/2 doors, 1 configured/);
    expect(() => buildDoorDetector([door], [{ name: "Back Door", threshold_sec: 30 }])).toThrow(/Back Door needs .* at least 1 minute/);
  });

  it("shows DS's reason instead of the bare status code", async () => {
    axios.post.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { detail: "camera c1 is not onboarded for door detection" } },
    }));
    await expect(PythonService.startNewDetection({
      camera_id: "c1", nvr_id: "n1", admin_id: "a1", detection_modes: ["door"], zones: [door], zone_configs: configs,
    })).rejects.toThrow("camera c1 is not onboarded for door detection");

    axios.post.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 422"), {
      response: { status: 422, data: { detail: [{ loc: ["body", "detectors", 0, "zones"], msg: "zones do not match the onboarded door points" }] } },
    }));
    await expect(PythonService.startNewDetection({
      camera_id: "c1", nvr_id: "n1", admin_id: "a1", detection_modes: ["door"], zones: [door], zone_configs: configs,
    })).rejects.toThrow("zones do not match the onboarded door points");
  });

  it("an update DS refuses with 400 (not running) is sent as a start instead", async () => {
    axios.post
      .mockRejectedValueOnce(Object.assign(new Error("400"), { response: { status: 400, data: {} } }))
      .mockResolvedValueOnce({ data: { status: "ok" } });
    const channel = { _id: "c1", nvrId: { _id: "n1" }, name: "Gate" };
    await PythonService.handleDetectionUpdate(
      channel, "a1", "doorDetectionSettings", [door], [], configs, 0, "moderate", [], settings, {}, {}, {},
    );
    expect(axios.post.mock.calls.map(([url]) => url)).toEqual(["http://ds.test/detectors/update", "http://ds.test/stream"]);
    expect(doorSent()).toMatchObject({ door_alert_mode: "closed", trigger_notification: false });
  });
});
