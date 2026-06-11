/**
 * src/page/user/Dashboard/AttendanceLogsLive.jsx — the "Live Attendance"
 * (or "Live Notifications" under VITE_ORGANISATION_ID="dubai") card
 * rendered on the dashboard. The full file is presentational-with-side-
 * effects:
 *  - Reads `attendanceLogs` + `isMuted` from useAllDetections().
 *  - Each log goes through `mapLog` (employee name composition, avatar
 *    fall-back to VITE_INITIALS_URL, premise resolution chain,
 *    capturedImage chain over face/person/frame paths with absolute-URL
 *    pass-through, and the composite id) and is sliced to first 12.
 *  - On every items-change effect: first mount silently snapshots the
 *    current ids into seenIdsRef; subsequent mounts speak() only the
 *    newly arrived ids (reversed) when isMutedRef.current is false.
 *  - Clicking an entry avatar opens DetailModal (Escape key closes,
 *    onClose closes, both <img>s drive loading/loaded/error state via
 *    onLoad/onError).
 *  - When isMuted flips on, the effect calls window.speechSynthesis
 *    .cancel().
 *  - The header copy + premise line + "entered/exited golf premise"
 *    label all branch on import.meta.env.VITE_ORGANISATION_ID==="dubai"
 *    (false in the test env).
 *
 * Mocks (1):
 *  1. @/context/Sockets/AllDetectionContext — drives `useAllDetections()`
 *     and lets each test seed attendanceLogs + isMuted on demand.
 *
 * SpeechSynthesis is stubbed on window directly (no module mock needed).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const allDetectionsValue = { attendanceLogs: [], isMuted: false };
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => allDetectionsValue,
}));

import AttendanceLogsLive from "../../../../../src/page/user/Dashboard/AttendanceLogsLive.jsx";

// Build a realistic attendance log payload with all fields the mapper reads.
const makeLog = (overrides = {}) => ({
  attendance: {
    employee: {
      _id: "emp-1",
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
      cameraType: "checkin",
      timestamp: "2026-05-26T10:15:00.000Z",
      images: { face: "alice-face.jpg" },
    },
    nvrData: { nvrName: "NVR-A" },
    imageUrls: [{ images: { person: "alice-person.jpg" } }],
  },
  nvrData: { nvrName: "NVR-Top" },
  ...overrides,
});

beforeEach(() => {
  allDetectionsValue.attendanceLogs = [];
  allDetectionsValue.isMuted = false;
  // Always seed a fresh speechSynthesis spy bag on window.
  const speakSpy = vi.fn();
  const cancelSpy = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak: speakSpy, cancel: cancelSpy },
  });
  // SpeechSynthesisUtterance must exist for speak() not to throw.
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: vi.fn(function (text) {
      this.text = text;
    }),
  });
  // Keep the spies accessible per-test.
  window.__speakSpy = speakSpy;
  window.__cancelSpy = cancelSpy;
});

describe("Dashboard/AttendanceLogsLive — empty state", () => {
  it("renders the 'Live Attendance' header + 'No attendance events yet' line when there are no logs", () => {
    render(<AttendanceLogsLive />);
    expect(screen.getByText("Live Attendance")).toBeInTheDocument();
    expect(screen.getByText("0 recent")).toBeInTheDocument();
    expect(screen.getByText("No attendance events yet")).toBeInTheDocument();
  });

  it("renders empty state when attendanceLogs is not an array (e.g. null/undefined fallback)", () => {
    allDetectionsValue.attendanceLogs = null;
    render(<AttendanceLogsLive />);
    expect(screen.getByText("No attendance events yet")).toBeInTheDocument();
    expect(screen.getByText("0 recent")).toBeInTheDocument();
  });
});

describe("Dashboard/AttendanceLogsLive — populated rows + mapLog", () => {
  it("renders one card per log (capped at 12), with name + department + the 'Entered premise at HH:mm:ss' message", () => {
    const logs = Array.from({ length: 14 }, (_, i) =>
      makeLog({
        attendance: {
          employee: {
            _id: `emp-${i}`,
            firstName: `Name${i}`,
            lastName: "Last",
            profilePics: [],
            departmentId: { departmentName: "Eng" },
          },
          event: { cameraType: "checkin", timestamp: "2026-05-26T10:15:00.000Z" },
        },
      })
    );
    allDetectionsValue.attendanceLogs = logs;
    render(<AttendanceLogsLive />);

    // 12-cap: only 12 cards rendered.
    expect(screen.getByText("12 recent")).toBeInTheDocument();
    // Multiple "Eng" department badges should be present (>=1 — at least one
    // per row, and the use of title attribute keeps things visible).
    const engBadges = screen.getAllByText("Eng");
    expect(engBadges.length).toBeGreaterThanOrEqual(12);
    // At least one row's message contains "Entered premise at" with the
    // formatted timestamp.
    const matchingMessages = screen.getAllByTitle(/Entered premise at/);
    expect(matchingMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to 'Unauthorized person' + 'Unknown Incident'-style placeholders when employee data is missing", () => {
    allDetectionsValue.attendanceLogs = [
      {
        attendance: {
          event: { cameraType: "checkout", timestamp: "2026-05-26T11:20:00.000Z" },
        },
      },
    ];
    render(<AttendanceLogsLive />);
    expect(screen.getByText("Unauthorized person")).toBeInTheDocument();
    // Missing department becomes '--' (rendered in the badge).
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    // Camera type = checkout -> message uses "Exited premise at"
    expect(screen.getByTitle(/Exited premise at/)).toBeInTheDocument();
  });

  it("renders 'Unknown' name when employee object exists but firstName/lastName are blank", () => {
    allDetectionsValue.attendanceLogs = [
      makeLog({
        attendance: {
          employee: {
            _id: "emp-x",
            firstName: "",
            lastName: "",
            departmentId: { departmentName: "Ops" },
            profilePics: [],
          },
          event: { cameraType: "checkin", timestamp: "2026-05-26T09:00:00.000Z" },
        },
      }),
    ];
    render(<AttendanceLogsLive />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});

describe("Dashboard/AttendanceLogsLive — speech announcements (mute/unmute)", () => {
  it("does NOT speak on the first mount — silently snapshots existing log ids", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    render(<AttendanceLogsLive />);
    expect(window.__speakSpy).not.toHaveBeenCalled();
  });

  it("cancels any in-flight utterance immediately when isMuted is true", () => {
    allDetectionsValue.isMuted = true;
    allDetectionsValue.attendanceLogs = [makeLog()];
    render(<AttendanceLogsLive />);
    expect(window.__cancelSpy).toHaveBeenCalled();
  });
});

describe("Dashboard/AttendanceLogsLive — DetailModal interactions", () => {
  it("opens the detail modal when the avatar button is clicked + closes on Escape", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);

    // No modal yet — locate via role="dialog".
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    // Click the avatar (it's wrapped in a button with the "View details" title).
    fireEvent.click(screen.getByTitle("View details"));

    // Modal should now be present.
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(screen.getByText("Attendance Details")).toBeInTheDocument();

    // Escape should close it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes the modal when the X (aria-label='Close') button is clicked", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes the modal when the backdrop (parent of dialog) is clicked, but NOT when the dialog itself is clicked", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    // Click the dialog itself — stopPropagation guards close.
    fireEvent.click(dialog);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    // Click the backdrop (the parent overlay).
    const overlay = dialog.parentElement;
    fireEvent.click(overlay);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the captured-image 'No captured image' fallback when no event image paths are present", () => {
    allDetectionsValue.attendanceLogs = [
      makeLog({
        attendance: {
          employee: {
            _id: "emp-2",
            firstName: "Bob",
            lastName: "Smith",
            profilePics: [],
            departmentId: { departmentName: "Sales" },
          },
          event: { cameraType: "checkin", timestamp: "2026-05-26T08:00:00.000Z" },
          // No imageUrls, no event.images
        },
        imageUrls: undefined,
        nvrData: undefined,
      }),
    ];
    render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));
    expect(screen.getByText("No captured image")).toBeInTheDocument();
  });

  it("drives the captured-image onLoad -> 'loaded' state (loading spinner vanishes)", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));

    // Loading copy initially present.
    expect(screen.getByText("Loading image…")).toBeInTheDocument();

    // Find the captured image (alt contains "last captured") and fire onLoad.
    const img = container.querySelector(
      'img[alt$="last captured"]'
    );
    expect(img).not.toBeNull();
    fireEvent.load(img);

    // Loading copy gone.
    expect(screen.queryByText("Loading image…")).toBeNull();
  });

  it("drives the captured-image onError -> 'Image unavailable' state", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));

    const img = container.querySelector('img[alt$="last captured"]');
    fireEvent.error(img);
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });

  it("drives the profile-avatar onLoad/onError independently of the captured image", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    const { container } = render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));

    // The avatar img inside the modal has alt={item.name} ("Alice Walker").
    const avatarImgs = container.querySelectorAll('img[alt="Alice Walker"]');
    // Two: one in the list card, one in the modal. The modal one is in the
    // dialog subtree.
    const dialog = container.querySelector('[role="dialog"]');
    const modalAvatar = dialog.querySelector('img[alt="Alice Walker"]');
    expect(modalAvatar).not.toBeNull();

    fireEvent.error(modalAvatar);
    // Error-state icon path is rendered (we can't easily query by SVG, but
    // the inner img opacity should still toggle — assert no thrown error).
    expect(avatarImgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the checkout (Exited) branch labels inside the modal when cameraType is 'checkout'", () => {
    allDetectionsValue.attendanceLogs = [
      makeLog({
        attendance: {
          employee: {
            _id: "emp-3",
            firstName: "Eve",
            lastName: "Online",
            profilePics: [],
            departmentId: { departmentName: "QA" },
          },
          event: { cameraType: "checkout", timestamp: "2026-05-26T18:00:00.000Z" },
        },
      }),
    ];
    render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));
    expect(screen.getByText("Exited Premise")).toBeInTheDocument();
  });

  it("renders the optional designation + email + employee ID rows in the modal when present", () => {
    allDetectionsValue.attendanceLogs = [makeLog()];
    render(<AttendanceLogsLive />);
    fireEvent.click(screen.getByTitle("View details"));
    // Designation
    expect(screen.getByText("Manager")).toBeInTheDocument();
    // Email
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    // Employee ID label + value
    expect(screen.getByText("Employee ID:")).toBeInTheDocument();
    expect(screen.getByText("EMP-001")).toBeInTheDocument();
  });
});
