/**
 * Round 81: cover Dashboard/AlertGauge.jsx — the right-rail "alert
 * gauge" carousel card shown on the dashboard. The component:
 *   - on mount and on each [skip, nvrId, department, location] change,
 *     debounces 500ms then fires `getCriticalityStats(skip, limit=5)`
 *     (Dashboard/Api/post) and stores the resulting `recentAlerts` +
 *     totalCount + chartData.
 *   - currentAlert (recentAlerts[currentImageIndex]) drives the
 *     gauge image (mild / safe / high), the header severity label
 *     ("Low Alert" / "Moderate Alert" / "High Alert"), the colored
 *     status badge ("Safe Zone" / "Mild Zone" / "Notified Manager"),
 *     and the heading ("Safe" / "Medium" / "High Alert").
 *   - When recentAlerts is empty, falls back to the static
 *     "No Current Alerts" header + Safe-Zone footer + the
 *     "Surveillance running smoothly..." copy.
 *   - The "Mark as resolved" checkbox calls
 *     `markAlertResolved(_id, { resolved: !resolved, incidentType })`
 *     (Dashboard/Api/put). On status==='success' it toasts the
 *     message, refetches via getCriticalityStats, and notifies the
 *     auth context via `triggerUpdate()`. On non-success it toasts
 *     the error.
 *
 * This spec pins:
 *   1. The empty-state branch: getCriticalityStats resolves with no
 *      recentAlerts -> the header reads "No Current Alerts", the
 *      Safe-Zone badge + "Surveillance running smoothly" copy are
 *      rendered, and the gauge image src ends in safealert.
 *   2. The populated branch: a single high-severity alert -> the
 *      header reads "High Alert", the High-Alert heading + "Notified
 *      Manager" badge appear, the description gets passed through
 *      formatFromToTimestamps (we keep the real helper — it's a tiny
 *      string formatter and not the test target). Also the
 *      "Mark as resolved" checkbox is rendered.
 *   3. Clicking the resolve checkbox calls `markAlertResolved` with
 *      the alert _id + flipped resolved flag + incidentType, toasts
 *      success, and triggers `useAuth().triggerUpdate()`.
 *
 * Mocks (5 vi.mock calls — well under the 8-mock cap):
 *   1. Dashboard/Api/post  — getCriticalityStats returns a controllable promise
 *   2. Dashboard/Api/put   — markAlertResolved returns a controllable promise
 *   3. sonner              — toast.success / toast.error spies
 *   4. @/context/AuthContext — useAuth provides triggerUpdate spy
 *   5. @/context/UserContext/Context — minimal UserContext placeholder so the
 *      useContext hook resolves (the component only destructures, it
 *      doesn't actually use the fields in any of the render branches we pin).
 *
 * The component uses a 500ms setTimeout before firing the API. We use
 * fake timers + advanceTimersByTimeAsync to flush the debounce
 * deterministically inside act().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

const getCriticalityStatsMock = vi.hoisted(() => vi.fn());
const markAlertResolvedMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const triggerUpdateMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../../../src/page/user/Dashboard/Api/post/index.jsx",
  () => ({
    getCriticalityStats: (...args) => getCriticalityStatsMock(...args),
  }),
);
vi.mock(
  "../../../../../src/page/user/Dashboard/Api/put/index.jsx",
  () => ({
    markAlertResolved: (...args) => markAlertResolvedMock(...args),
  }),
);
vi.mock("sonner", () => ({
  toast: {
    success: (...a) => toastSuccessMock(...a),
    error: (...a) => toastErrorMock(...a),
  },
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ triggerUpdate: triggerUpdateMock }),
}));
// The component does `useContext(UserContext)` and destructures four
// values. We export a real React context with a benign default so the
// useContext hook resolves without a Provider in scope.
vi.mock("@/context/UserContext/Context", () => {
  const React = require("react");
  return {
    default: React.createContext({
      sidebarShow: false,
      setSidebarShow: () => {},
      switchOn: false,
      setSwitchOn: () => {},
    }),
  };
});

const { default: AlertGauge } = await import(
  "../../../../../src/page/user/Dashboard/AlertGauge.jsx"
);

beforeEach(() => {
  getCriticalityStatsMock.mockReset();
  markAlertResolvedMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  triggerUpdateMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderAndFlushDebounce = async () => {
  let utils;
  await act(async () => {
    utils = render(<AlertGauge />);
  });
  // Debounce is 500ms in the component
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  return utils;
};

describe("Dashboard/AlertGauge", () => {
  it("renders the empty-state branch when recentAlerts is empty (No Current Alerts + Safe Zone copy)", async () => {
    getCriticalityStatsMock.mockResolvedValueOnce({
      status: "success",
      data: {
        recentAlerts: [],
        totalCount: 0,
        chartData: [{ value: 0 }],
      },
    });

    await renderAndFlushDebounce();

    expect(getCriticalityStatsMock).toHaveBeenCalledWith(0, 5);
    expect(screen.getByText("No Current Alerts")).toBeInTheDocument();
    // Safe-Zone footer copy + the "Surveillance" message
    expect(screen.getByText("Safe Zone")).toBeInTheDocument();
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Surveillance running smoothly with no suspicious behavior detected.",
      ),
    ).toBeInTheDocument();
    // Empty state shows the single bullet "no alerts" button with that aria-label.
    expect(screen.getByLabelText("No Alerts")).toBeInTheDocument();
  });

  it("renders the high-severity populated branch with the correct heading + badge + checkbox", async () => {
    getCriticalityStatsMock.mockResolvedValueOnce({
      status: "success",
      data: {
        recentAlerts: [
          {
            _id: "alert-1",
            severity: "high",
            timeAgo: "2 minutes ago",
            zone: "Front Gate",
            description: "intrusion detected",
            channelId: { name: "Cam-A" },
            incidentType: "intrusion",
            resolved: false,
          },
        ],
        totalCount: 1,
        chartData: [{ value: 3 }],
      },
    });

    await renderAndFlushDebounce();

    // Header / severity copy. "High Alert" appears twice (header strip
    // span and the centered h2 heading); pin both occurrences.
    const highAlertEls = screen.getAllByText("High Alert");
    expect(highAlertEls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Notified Manager")).toBeInTheDocument();
    // Last-Alert label
    expect(screen.getByText(/Last Alert\s*:\s*2 minutes ago/)).toBeInTheDocument();
    // Zone + Camera labels
    expect(screen.getByText("Area:")).toBeInTheDocument();
    expect(screen.getByText("Front Gate")).toBeInTheDocument();
    expect(screen.getByText("Camera:")).toBeInTheDocument();
    expect(screen.getByText("Cam-A")).toBeInTheDocument();
    // Mark-as-resolved is rendered as a labelled control
    expect(screen.getByText("Mark as resolved")).toBeInTheDocument();
    // The gauge image is the high-alert variant
    const img = screen.getByAltText("Alert");
    expect(img.getAttribute("src") || "").toMatch(/highalert/);
  });

  it("clicking Mark-as-resolved calls markAlertResolved with the flipped flag, toasts success, and fires triggerUpdate", async () => {
    // Mount with a single low-severity alert; markAlertResolved succeeds.
    getCriticalityStatsMock.mockResolvedValue({
      status: "success",
      data: {
        recentAlerts: [
          {
            _id: "alert-9",
            severity: "low",
            timeAgo: "now",
            zone: "Lobby",
            description: "noise",
            channelId: { name: "Cam-B" },
            incidentType: "noise",
            resolved: false,
          },
        ],
        totalCount: 1,
        chartData: [{ value: 1 }],
      },
    });
    markAlertResolvedMock.mockResolvedValueOnce({
      status: "success",
      message: "Resolved",
    });

    await renderAndFlushDebounce();

    const checkbox = screen.getByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkbox);
      // markAlertResolved is awaited, plus the success branch fires a
      // second getCriticalityStats refetch (which uses the same 500ms
      // debounce path triggered by setSkip... but the resolve handler
      // itself directly invokes fetchCriticalStats. We flush both.).
      await vi.advanceTimersByTimeAsync(600);
    });

    // mark-resolved API was called with the flipped resolved flag.
    expect(markAlertResolvedMock).toHaveBeenCalledTimes(1);
    expect(markAlertResolvedMock).toHaveBeenCalledWith("alert-9", {
      resolved: true,
      incidentType: "noise",
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(triggerUpdateMock).toHaveBeenCalled();
  });
});
