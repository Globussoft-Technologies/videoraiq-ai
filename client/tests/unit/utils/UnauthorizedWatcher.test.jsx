/**
 * UnauthorizedWatcher subscribes to AllDetectionContext.allDetections and
 * dispatches sonner toasts (or browser notifications when the tab is
 * hidden). It doesn't render anything visible — we test the side effects.
 *
 * We mock:
 *   - sonner: capture toast.info / .warning / .error calls
 *   - @/context/Sockets/AllDetectionContext: feed allDetections via a fake
 *     useAllDetections() hook so we can rerender with new data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

const detectionState = vi.hoisted(() => ({ allDetections: [] }));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => detectionState,
}));

import UnauthorizedWatcher from "../../../src/utils/UnauthorizedWatcher.jsx";

describe("utils/UnauthorizedWatcher", () => {
  beforeEach(() => {
    detectionState.allDetections = [];
    toastMock.info.mockClear();
    toastMock.warning.mockClear();
    toastMock.error.mockClear();
    // Default: tab is visible so we go down the toast path, not Notification.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing (null component)", () => {
    const { container } = render(<UnauthorizedWatcher />);
    expect(container.firstChild).toBeNull();
  });

  it("does not call toast when allDetections is empty", () => {
    render(<UnauthorizedWatcher />);
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("dispatches toast.info for a low-severity detection", () => {
    detectionState.allDetections = [
      {
        nvrId: "n1",
        cameraId: "c1",
        channelName: "Front Door",
        incidentType: "Motion",
        severity: "low",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];
    render(<UnauthorizedWatcher />);
    expect(toastMock.info).toHaveBeenCalledTimes(1);
    const [title, payload] = toastMock.info.mock.calls[0];
    expect(title).toContain("Motion");
    expect(payload.description).toContain("Front Door");
    expect(payload.position).toBe("bottom-left");
  });

  it("uses toast.warning for moderate severity", () => {
    detectionState.allDetections = [
      {
        nvrId: "n1",
        cameraId: "c2",
        incidentType: "Intrusion",
        severity: "moderate",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];
    render(<UnauthorizedWatcher />);
    expect(toastMock.warning).toHaveBeenCalledTimes(1);
    expect(toastMock.warning.mock.calls[0][1].className).toContain(
      "bg-yellow-500"
    );
  });

  it("uses toast.error for high severity", () => {
    detectionState.allDetections = [
      {
        nvrId: "n1",
        cameraId: "c3",
        incidentType: "Fire",
        severity: "high",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];
    render(<UnauthorizedWatcher />);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error.mock.calls[0][1].className).toContain("bg-red-500");
  });

  it("falls back to 'Detection' incidentType and 'Camera' channelName when missing", () => {
    detectionState.allDetections = [
      {
        nvrId: "n1",
        cameraId: "c4",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];
    render(<UnauthorizedWatcher />);
    const [title, payload] = toastMock.info.mock.calls[0];
    expect(title).toContain("Detection");
    expect(payload.description).toContain("Camera");
  });

  it("uses 'Unknown time' when timeOfIncident is missing", () => {
    detectionState.allDetections = [
      {
        nvrId: "n1",
        cameraId: "c5",
        incidentType: "Loitering",
        severity: "low",
      },
    ];
    render(<UnauthorizedWatcher />);
    const [, payload] = toastMock.info.mock.calls[0];
    expect(payload.description).toContain("Unknown time");
  });

  it("deduplicates detections sharing the same composite key", () => {
    const dup = {
      nvrId: "n1",
      cameraId: "c6",
      incidentType: "Motion",
      severity: "low",
      timeOfIncident: "2024-02-01T00:00:00Z",
    };
    detectionState.allDetections = [dup, { ...dup }];
    render(<UnauthorizedWatcher />);
    expect(toastMock.info).toHaveBeenCalledTimes(1);
  });
});
