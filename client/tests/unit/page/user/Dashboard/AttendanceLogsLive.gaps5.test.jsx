/**
 * Round 5 final gap-fill: Dashboard/AttendanceLogsLive.jsx.
 *
 * After r4 sat at 92.43%. Remaining gaps cluster around IS_DUBAI=true
 * (env-driven) and the speak() body. We stub the env BEFORE importing
 * the module so IS_DUBAI evaluates true:
 *   - buildMessage IS_DUBAI arm (L97-98)
 *   - DetailModal IS_DUBAI arm: "entered/exited golf premise" label
 *     + premise location row (L243-261)
 *   - "Live Notifications" header text instead of "Live Attendance"
 *
 * The speak() body (L103-114) and the new-items announcement effect
 * (L318-324) are reached via the new-item path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const useAllDetectionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => useAllDetectionsMock(),
}));

// Force the env BEFORE the dynamic import so the module-level
// IS_DUBAI constant evaluates true.
vi.stubEnv("VITE_ORGANISATION_ID", "dubai");

const { default: AttendanceLogsLive } = await import(
  "../../../../../src/page/user/Dashboard/AttendanceLogsLive.jsx"
);

beforeEach(() => {
  useAllDetectionsMock.mockReset();
  // Fresh speechSynthesis spy bag
  const speakSpy = vi.fn();
  const cancelSpy = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak: speakSpy, cancel: cancelSpy },
  });
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
  };
  window.__speakSpy = speakSpy;
  window.__cancelSpy = cancelSpy;
});

afterEach(() => {
  delete window.SpeechSynthesisUtterance;
  delete window.__speakSpy;
  delete window.__cancelSpy;
});

const makeLog = (over = {}) => ({
  attendance: {
    employee: {
      _id: over.empUniqueId || "emp-1",
      firstName: "Alice",
      lastName: "Walker",
      email: "alice@example.com",
      employeeId: "EMP-001",
      designation: "Manager",
      profilePics: ["alice.jpg"],
      departmentId: { departmentName: "Engineering" },
      locationId: { locationName: "HQ" },
    },
    event: {
      cameraType: over.cameraType || "checkin",
      timestamp: over.timestamp || "2026-05-26T10:15:00.000Z",
      images: { face: "alice-face.jpg" },
    },
    nvrData: { nvrName: "NVR-A" },
    imageUrls: [{ images: { person: "alice-person.jpg" } }],
  },
  nvrData: { nvrName: over.premiseNvr || "Tower A" },
});

describe("AttendanceLogsLive — IS_DUBAI=true gaps5", () => {
  it("renders 'Live Notifications' header (Dubai org)", () => {
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [],
      isMuted: false,
    });
    render(<AttendanceLogsLive />);
    expect(screen.getByText("Live Notifications")).toBeInTheDocument();
  });

  it("DetailModal Dubai arm: shows 'entered golf premise' label + premise row", async () => {
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [makeLog()],
      isMuted: false,
    });
    render(<AttendanceLogsLive />);
    // Click the row's avatar button to open the modal
    await act(async () => {
      fireEvent.click(screen.getByTitle("View details"));
    });
    // The Dubai-arm label (may appear in multiple places — row + modal)
    expect(screen.queryAllByText(/entered golf premise/i).length).toBeGreaterThan(0);
    // The premise row inside the modal (Tower A from nvrData)
    expect(screen.queryAllByText("Tower A").length).toBeGreaterThan(0);
  });

  it("DetailModal Dubai checkout arm: 'exited golf premise'", async () => {
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [makeLog({ cameraType: "checkout" })],
      isMuted: false,
    });
    render(<AttendanceLogsLive />);
    const buttons = screen.getAllByRole("button");
    const open = buttons.find((b) => !b.getAttribute("aria-label"));
    if (open) {
      await act(async () => {
        fireEvent.click(open);
      });
    }
    expect(
      screen.queryAllByText(/exited golf premise/i).length
    ).toBeGreaterThan(0);
  });

  it("speak() with speechSynthesis bag fires on new items (Dubai 'entered' arm)", () => {
    // First render: snapshot existing ids without speaking.
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [makeLog({ empUniqueId: "old-1" })],
      isMuted: false,
    });
    const { rerender } = render(<AttendanceLogsLive />);
    expect(window.__speakSpy).not.toHaveBeenCalled();
    // Second render: add a NEW item with a different employee id -> the
    // effect should fire speak() L320-322.
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [
        makeLog({ empUniqueId: "new-1", cameraType: "checkin" }),
        makeLog({ empUniqueId: "old-1" }),
      ],
      isMuted: false,
    });
    rerender(<AttendanceLogsLive />);
    expect(window.__speakSpy).toHaveBeenCalled();
  });

  it("speak() returns early when window.speechSynthesis is absent (early-return arm)", () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [makeLog({ empUniqueId: "x" })],
      isMuted: false,
    });
    const { rerender } = render(<AttendanceLogsLive />);
    useAllDetectionsMock.mockReturnValue({
      attendanceLogs: [
        makeLog({ empUniqueId: "y" }),
        makeLog({ empUniqueId: "x" }),
      ],
      isMuted: false,
    });
    rerender(<AttendanceLogsLive />);
    // No crash; speak() returns early
  });
});
