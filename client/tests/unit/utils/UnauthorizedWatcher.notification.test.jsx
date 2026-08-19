/**
 * Covers the browser Notification path of UnauthorizedWatcher:
 *  - asks permission on first detection when permission === "default"
 *  - when the tab is hidden + permission granted, creates a Notification
 *    instead of dispatching a sonner toast
 *  - the notification click handler focuses the window
 *  - line crossing notifications route to the line crossing logs page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
const detectionState = vi.hoisted(() => ({ allDetections: [] }));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => detectionState,
}));

const UnauthorizedWatcherModule = await import(
  "../../../src/utils/UnauthorizedWatcher.jsx"
);
const UnauthorizedWatcher = UnauthorizedWatcherModule.default;

describe("UnauthorizedWatcher browser Notification path", () => {
  const origNotification = globalThis.Notification;
  const origLocation = window.location;
  let notifInstances;
  let requestPermissionMock;
  let assignMock;

  beforeEach(() => {
    notifInstances = [];
    requestPermissionMock = vi.fn().mockResolvedValue("granted");

    function FakeNotification(title, options) {
      this.title = title;
      this.options = options;
      this.onclick = null;
      notifInstances.push(this);
    }

    FakeNotification.permission = "default";
    FakeNotification.requestPermission = requestPermissionMock;
    globalThis.Notification = FakeNotification;
    window.Notification = FakeNotification;

    assignMock = vi.fn();
    delete window.location;
    window.location = {
      ...origLocation,
      pathname: "/dashboard",
      assign: assignMock,
    };

    toastMock.info.mockClear();
    toastMock.warning.mockClear();
    toastMock.error.mockClear();
    detectionState.allDetections = [];

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
  });

  afterEach(() => {
    if (origNotification) {
      globalThis.Notification = origNotification;
      window.Notification = origNotification;
    } else {
      delete globalThis.Notification;
      delete window.Notification;
    }
    window.location = origLocation;
    vi.restoreAllMocks();
  });

  it("requests Notification permission on the first detection", () => {
    detectionState.allDetections = [
      {
        nvrId: "n",
        cameraId: "c",
        channelName: "Lobby",
        incidentType: "Intrusion",
        severity: "high",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];

    render(<UnauthorizedWatcher />);

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });

  it("posts a Notification instead of a toast when permission is granted and the tab is hidden", () => {
    globalThis.Notification.permission = "granted";
    window.Notification.permission = "granted";
    detectionState.allDetections = [
      {
        nvrId: "n",
        cameraId: "c",
        channelName: "Lobby",
        incidentType: "Fire",
        severity: "high",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];

    render(<UnauthorizedWatcher />);

    expect(notifInstances).toHaveLength(1);
    expect(notifInstances[0].title).toContain("Fire");
    expect(notifInstances[0].options.body).toContain("Lobby");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("focuses the window when a notification is clicked", () => {
    globalThis.Notification.permission = "granted";
    window.Notification.permission = "granted";
    detectionState.allDetections = [
      {
        nvrId: "n",
        cameraId: "c",
        incidentType: "Loitering",
        severity: "low",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];

    const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});

    render(<UnauthorizedWatcher />);

    expect(notifInstances).toHaveLength(1);
    notifInstances[0].onclick();
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("routes line crossing notifications to the line crossing logs page", () => {
    globalThis.Notification.permission = "granted";
    window.Notification.permission = "granted";
    detectionState.allDetections = [
      {
        nvrId: "n",
        cameraId: "c",
        incidentType: "lineCrossing",
        severity: "moderate",
        timeOfIncident: "2024-01-01T00:00:00Z",
      },
    ];
    vi.spyOn(window, "focus").mockImplementation(() => {});

    render(<UnauthorizedWatcher />);

    expect(notifInstances).toHaveLength(1);
    notifInstances[0].onclick();
    expect(assignMock).toHaveBeenCalledWith("/logs/line-crossing");
  });
});
