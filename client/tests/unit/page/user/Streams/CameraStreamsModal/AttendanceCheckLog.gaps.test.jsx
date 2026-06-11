/**
 * Gap-fills for src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx
 *
 * Covers:
 *   - line 43 area: AttendanceEntry's avatar-null + action!=null branch
 *     (renders the access-fallback image_url+action rather than the
 *     USER_AVTAR_INITIALS encoded URL).
 *   - lines 117/129: clicking the *unknown* attendance entry to invoke
 *     handleProfileClick with the unauthorized-person payload (the
 *     existing tests only click the known attendance entry).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import AttendanceCheckLog from "../../../../../../src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx";

describe("AttendanceCheckLog gap-fills", () => {
  it("clicking the unauthorized attendance entry sends 'Unauthorized person' payload", () => {
    const onProfileClick = vi.fn();
    const unknownAttendance = {
      attendance: {
        // employee deliberately missing
        event: { timestamp: "2026-05-25T11:00:00Z" },
      },
    };

    render(
      <AttendanceCheckLog
        attendanceForCamera={[unknownAttendance]}
        accessDetectionsForCamera={[]}
        onProfileClick={onProfileClick}
      />
    );

    // Click the unknown attendance entry.
    fireEvent.click(screen.getByText("Unauthorized person"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
    const [payload, isAccess] = onProfileClick.mock.calls[0];
    expect(isAccess).toBe(false);
    expect(payload.name).toBe("Unauthorized person");
    expect(payload.variant).toBe("unknown");
    expect(payload.avatar).toBe("");
    expect(payload.role).toBe("");
  });

  it("access entry with images.person uses the action avatar fallback", () => {
    const onProfileClick = vi.fn();
    // No images.face but has images.person — exercises the
    // `item?.images?.face || item?.images?.person || item?.images?.frame` chain.
    const accessWithPerson = {
      personName: "Charlie",
      department: "Ops",
      timestamp: "2026-05-25T14:00:00Z",
      images: { person: "person.png" },
      firstName: "Charlie",
      lastName: "Brown",
    };

    render(
      <AttendanceCheckLog
        attendanceForCamera={[]}
        accessDetectionsForCamera={[accessWithPerson]}
        onProfileClick={onProfileClick}
      />
    );

    // Entry rendered.
    expect(screen.getByText("Charlie")).toBeInTheDocument();

    // The avatar block hits the `action != null` branch (line 43-ish):
    // because the AttendanceEntry's `avatar` prop is the resolved action
    // string ('person.png'), we render the <img src={image_url}{avatar}/>
    // path (the first branch). Click to ensure handleProfileClick fires
    // with the access payload containing the action.
    fireEvent.click(screen.getByText("Charlie"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
    const [payload, isAccess] = onProfileClick.mock.calls[0];
    expect(isAccess).toBe(true);
    expect(payload.avatar).toBe("person.png");
    expect(payload.action).toBe("person.png");
  });

  it("access entry with images.frame (no face, no person) still routes click", () => {
    const onProfileClick = vi.fn();
    const accessWithFrame = {
      personName: "Diana",
      department: "Security",
      timestamp: "2026-05-25T15:00:00Z",
      images: { frame: "frame.png" },
    };

    render(
      <AttendanceCheckLog
        attendanceForCamera={[]}
        accessDetectionsForCamera={[accessWithFrame]}
        onProfileClick={onProfileClick}
      />
    );

    fireEvent.click(screen.getByText("Diana"));
    const [payload] = onProfileClick.mock.calls[0];
    expect(payload.action).toBe("frame.png");
  });

  it("access entry without images falls through to the initials avatar branch", () => {
    // Triggers the `action != null` else-branch in AttendanceEntry where
    // avatar is empty AND action is null/undefined, so it builds the
    // USER_AVTAR_INITIALS-encoded URL.
    const onProfileClick = vi.fn();
    const accessNoImages = {
      personName: "Eve",
      department: "Legal",
      timestamp: "2026-05-25T16:00:00Z",
      // no images at all
      firstName: "Eve",
      lastName: "Anders",
    };

    const { container } = render(
      <AttendanceCheckLog
        attendanceForCamera={[]}
        accessDetectionsForCamera={[accessNoImages]}
        onProfileClick={onProfileClick}
      />
    );

    // The fallback initials <img> is present (avatar is "" so first
    // branch in AttendanceEntry is the initials block).
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Eve"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
  });
});
