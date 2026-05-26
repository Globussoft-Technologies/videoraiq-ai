/**
 * Round 55 — cover src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx.
 *
 * AttendanceCheckLog is the floating top-left log panel rendered over the
 * camera stream modal. It accepts two prop arrays:
 *   - attendanceForCamera: [{ attendance: { employee, event } }]
 *   - accessDetectionsForCamera: [{ personName, department, timestamp,
 *       images, firstName, lastName }]
 * and slices each to the first 5 entries. When BOTH arrays are
 * empty / non-array the whole component returns null. Each section
 * (Attendance Log / Access Log) is a collapsible card — clicking the
 * header toggles the open state (entries hide). Clicking an entry calls
 * `onProfileClick(payload, isAccess)` where the second arg is `true` for
 * access items and `false` for attendance items. Attendance items render
 * "Unauthorized person" + 'unknown' variant when `employee` is missing.
 *
 * No product code touched — this file lives entirely under tests/.
 * Mocks: 0 (pure-render component; moment + lucide-react render inline,
 * the assertions don't depend on their visuals).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

import AttendanceCheckLog from "../../../../../../src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx";

const knownAttendance = {
  attendance: {
    employee: {
      firstName: "Alice",
      lastName: "Smith",
      departmentId: { departmentName: "Engineering" },
      profilePics: ["alice.png"],
      employeeId: "E-1",
      joinDate: "2024-01-01",
    },
    event: { timestamp: "2026-05-25T10:00:00Z" },
  },
};

const unknownAttendance = {
  attendance: {
    // employee missing on purpose -> "Unauthorized person" + 'unknown'
    event: { timestamp: "2026-05-25T11:00:00Z" },
  },
};

const accessKnown = {
  personName: "Bob Jones",
  department: "Sales",
  timestamp: "2026-05-25T12:00:00Z",
  images: { face: "face.png" },
  firstName: "Bob",
  lastName: "Jones",
};

const accessUnknown = {
  personName: "Unauthorized person",
  department: "",
  timestamp: "2026-05-25T13:00:00Z",
  // no images -> action stays null and we fall through to the
  // USER_AVTAR_INITIALS fallback in <AttendanceEntry/>
  firstName: "",
  lastName: "",
};

describe("Streams/CameraStreamsModal/AttendanceCheckLog", () => {
  it("returns null when both attendance + access arrays are empty", () => {
    const { container } = render(
      <AttendanceCheckLog
        accessDetectionsForCamera={[]}
        attendanceForCamera={[]}
        onProfileClick={vi.fn()}
      />
    );
    // null render -> empty container.
    expect(container.firstChild).toBeNull();
  });

  it("returns null when arrays are not arrays at all", () => {
    const { container } = render(
      <AttendanceCheckLog
        accessDetectionsForCamera={undefined}
        attendanceForCamera={null}
        onProfileClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders both sections, toggles them, and routes profile clicks per source", () => {
    const onProfileClick = vi.fn();

    render(
      <AttendanceCheckLog
        attendanceForCamera={[knownAttendance, unknownAttendance]}
        accessDetectionsForCamera={[accessKnown, accessUnknown]}
        onProfileClick={onProfileClick}
      />
    );

    // Both section headers visible.
    const attendanceBtn = screen.getByRole("button", { name: /Attendance Log/i });
    const accessBtn = screen.getByRole("button", { name: /Access Log/i });
    expect(attendanceBtn).toBeInTheDocument();
    expect(accessBtn).toBeInTheDocument();

    // Attendance entries: known + unauthorized; access entries: Bob + the
    // access "Unauthorized person" overlaps name with the unknown
    // attendance entry — assert each unique text by count.
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getAllByText("Unauthorized person")).toHaveLength(2);

    // Click an attendance entry -> onProfileClick(payload, false).
    fireEvent.click(screen.getByText("Alice Smith"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
    const [attendancePayload, isAccess1] = onProfileClick.mock.calls[0];
    expect(isAccess1).toBe(false);
    expect(attendancePayload.name).toBe("Alice Smith");
    expect(attendancePayload.variant).toBe("known");
    expect(attendancePayload.employeeId).toBe("E-1");

    // Click an access entry -> onProfileClick(payload, true).
    fireEvent.click(screen.getByText("Bob Jones"));
    expect(onProfileClick).toHaveBeenCalledTimes(2);
    const [accessPayload, isAccess2] = onProfileClick.mock.calls[1];
    expect(isAccess2).toBe(true);
    expect(accessPayload.name).toBe("Bob Jones");
    expect(accessPayload.variant).toBe("known");

    // Collapse Attendance Log -> entries hide.
    fireEvent.click(attendanceBtn);
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    // Access section still open with Bob.
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();

    // Collapse Access Log -> Bob hides too.
    fireEvent.click(accessBtn);
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();

    // Re-open Attendance -> Alice comes back.
    fireEvent.click(attendanceBtn);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("slices each source list to the first 5 entries", () => {
    // 7 attendance entries — only 5 should render.
    const many = Array.from({ length: 7 }, (_, i) => ({
      attendance: {
        employee: {
          firstName: `User${i}`,
          lastName: "X",
          departmentId: { departmentName: "Dept" },
          profilePics: [],
        },
        event: { timestamp: "2026-05-25T10:00:00Z" },
      },
    }));

    render(
      <AttendanceCheckLog
        attendanceForCamera={many}
        accessDetectionsForCamera={[]}
        onProfileClick={vi.fn()}
      />
    );

    // First 5 names present, last 2 sliced off.
    for (let i = 0; i < 5; i += 1) {
      expect(screen.getByText(`User${i} X`)).toBeInTheDocument();
    }
    expect(screen.queryByText("User5 X")).not.toBeInTheDocument();
    expect(screen.queryByText("User6 X")).not.toBeInTheDocument();

    // Access Log header should not render (its array was empty).
    expect(
      screen.queryByRole("button", { name: /Access Log/i })
    ).not.toBeInTheDocument();
  });

  it("does not throw when onProfileClick is omitted (no-op handler path)", () => {
    render(
      <AttendanceCheckLog
        attendanceForCamera={[knownAttendance]}
        accessDetectionsForCamera={[accessKnown]}
        // onProfileClick intentionally undefined — clicking should be a no-op.
      />
    );

    // Click both entries — neither should throw.
    expect(() => fireEvent.click(screen.getByText("Alice Smith"))).not.toThrow();
    expect(() => fireEvent.click(screen.getByText("Bob Jones"))).not.toThrow();
  });
});
