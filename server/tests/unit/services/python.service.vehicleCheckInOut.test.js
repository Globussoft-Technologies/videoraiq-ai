/**
 * The check-in/out geometry has to reach the DS /stream payload.
 *
 * Direction is derived by DS from which side of `line_coordinates` a vehicle
 * ends up on relative to `inside_reference_point`. Ship the detector without
 * them and DS sees the vehicle but cannot tell an arrival from a departure —
 * silently, with no error anywhere.
 *
 * These assert on the payload actually handed to the HTTP call, because the
 * previous defect was invisible at every other level: the parameter existed,
 * the picker worked, and nothing ever populated the argument.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn().mockResolvedValue({ data: { status: "ok" } });
vi.mock("axios", () => ({
  default: { post, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../core/v1/nvr/nvr.model.js", () => ({
  default: { findById: vi.fn().mockResolvedValue({ _id: "nvr1", userId: "1" }) },
}));

const { default: pythonService } = await import(
  "../../../services/python.service.js"
);

const channel = {
  _id: "cam1",
  nvrId: { _id: "nvr1" },
  name: "Main Gate",
  streamingPath: "/Streaming/Channels/101",
};

const SETTINGS = {
  line_coordinates: [
    [100, 500],
    [1800, 500],
  ],
  inside_reference_point: [900, 300],
  zone_name: "Main Gate",
};

/** The detector entry DS receives for our type, from the last axios.post. */
const sentDetector = () => {
  const body = post.mock.calls.at(-1)?.[1] || {};
  return (body.detectors || []).find((d) => d.name === "vehicleCheckInOutSettings");
};

beforeEach(() => {
  post.mockClear();
});

describe("python.service — vehicleCheckInOut detector payload", () => {
  it("sends the line and reference point on start", async () => {
    await pythonService.handleDetectionStartStop(
      channel,
      "admin1",
      true,
      "vehicleCheckInOutSettings",
      [[[50, 400]]],
      [],
      [1920, 1080],
      0,
      "moderate",
      {},
      {},
      SETTINGS,
    );

    const detector = sentDetector();
    expect(detector).toBeTruthy();
    expect(detector.line_coordinates).toEqual(SETTINGS.line_coordinates);
    expect(detector.inside_reference_point).toEqual(SETTINGS.inside_reference_point);
    expect(detector.zone_name).toBe("Main Gate");
  });

  // The update path had a subtler bug: its callers pass a mobile-phone value in
  // the position the vehicle settings were added to, so the wrong object landed
  // in the slot. Pinning the argument order stops that recurring.
  it("sends the line and reference point on update", async () => {
    await pythonService.handleDetectionUpdate(
      channel,
      "admin1",
      "vehicleCheckInOutSettings",
      [[[50, 400]]],
      [1920, 1080],
      [],
      0,
      "moderate",
      [],
      {},
      {},
      { mobile_phone_confidence: 0.9 },
      SETTINGS,
    );

    const detector = sentDetector();
    expect(detector).toBeTruthy();
    expect(detector.line_coordinates).toEqual(SETTINGS.line_coordinates);
    expect(detector.inside_reference_point).toEqual(SETTINGS.inside_reference_point);
  });

  // Omitting the geometry is a configuration error DS should report, not
  // something to paper over with an invented default line.
  it("omits the keys entirely when the settings carry no geometry", async () => {
    await pythonService.handleDetectionStartStop(
      channel,
      "admin1",
      true,
      "vehicleCheckInOutSettings",
      [[[50, 400]]],
      [],
      [1920, 1080],
      0,
      "moderate",
      {},
      {},
      {},
    );

    const detector = sentDetector();
    expect(detector).toBeTruthy();
    expect(detector).not.toHaveProperty("line_coordinates");
    expect(detector).not.toHaveProperty("inside_reference_point");
  });

  it("leaves other detectors untouched", async () => {
    await pythonService.handleDetectionStartStop(
      channel,
      "admin1",
      true,
      "lineCrossingSettings",
      [[[50, 400]]],
      [],
      [1920, 1080],
      0,
      "moderate",
      {},
      { inside_reference_point: [10, 20], count_mode: "entry" },
      {},
    );

    const body = post.mock.calls.at(-1)?.[1] || {};
    const lineCrossing = (body.detectors || []).find(
      (d) => d.name === "lineCrossingSettings",
    );
    expect(lineCrossing.inside_reference_point).toEqual([10, 20]);
    expect(sentDetector()).toBeUndefined();
  });
});
