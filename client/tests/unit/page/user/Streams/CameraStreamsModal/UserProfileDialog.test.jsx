/**
 * Round 56 — cover src/page/user/Streams/CameraStreamsModal/UserProfileDialog.jsx.
 *
 * UserProfileDialog is the modal that pops up when the user clicks an
 * attendance / access entry in the stream modal log panel. It is gated on
 * `isOpen` + `userData` (either falsy -> returns null), distinguishes
 * known vs unknown via `userData.variant === 'known'`, and switches a
 * handful of fields between the two `isAccessLog` modes:
 *   - !isAccessLog: shows Department + "Last Activity" (moment-formatted)
 *     + Employee ID (only when known + employeeId truthy).
 *   - isAccessLog:  shows Department only when isKnown (the original
 *     condition is `(isKnown && userData.role) || !isAccessLog`),
 *     "Access Time" rendered verbatim (no moment formatting), and the
 *     third row is the Access Status badge (Granted / Denied).
 *
 * It also renders an avatar carousel that pulls `userData.avatars`
 * (falls back to `[userData.avatar]` then `[]`); when more than one
 * avatar is supplied the prev/next chevrons are wired and the
 * "1 / N" counter is shown. When `avatars.length === 0` the rendered
 * image src points at the initials fallback
 * (`${VITE_INITIALS_URL}?name=...`).
 *
 * No product code touched — this file lives entirely under tests/.
 * Mocks: 0.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

import UserProfileDialog from "../../../../../../src/page/user/Streams/CameraStreamsModal/UserProfileDialog.jsx";

describe("Streams/CameraStreamsModal/UserProfileDialog", () => {
  it("returns null when isOpen is false or userData is missing", () => {
    const { container: c1 } = render(
      <UserProfileDialog isOpen={false} userData={{ name: "x" }} onClose={vi.fn()} />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <UserProfileDialog isOpen={true} userData={null} onClose={vi.fn()} />
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renders known-user / non-access-log view: department + moment time + employee id, and close button fires onClose", () => {
    const onClose = vi.fn();
    render(
      <UserProfileDialog
        isOpen={true}
        onClose={onClose}
        userData={{
          variant: "known",
          name: "Alice Smith",
          role: "Engineering",
          time: "2026-05-25T10:00:00Z",
          employeeId: "E-1",
          firstName: "Alice",
          lastName: "Smith",
          avatars: ["a.png", "b.png"],
        }}
      />
    );

    // Header bits.
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    // Authorized badge text.
    expect(screen.getByText(/AUTHORIZED/i)).toBeInTheDocument();

    // InfoCard labels.
    expect(screen.getByText(/Department/i)).toBeInTheDocument();
    // role appears twice (header subtitle + Department card value).
    expect(screen.getAllByText("Engineering")).toHaveLength(2);
    expect(screen.getByText(/Last Activity/i)).toBeInTheDocument();
    // moment formats the ISO timestamp to YYYY-MM-DD HH:mm — the date
    // part is stable across local timezones, so assert the prefix.
    expect(
      screen.getByText((c) => c.startsWith("2026-05-2"))
    ).toBeInTheDocument();

    // Employee ID card.
    expect(screen.getByText(/Employee ID/i)).toBeInTheDocument();
    expect(screen.getByText("E-1")).toBeInTheDocument();

    // Access Status card is NOT rendered in non-access-log mode.
    expect(screen.queryByText(/Access Status/i)).not.toBeInTheDocument();

    // Avatar count badge ("1 / 2") shows because avatars.length > 1.
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    // Close button.
    fireEvent.click(screen.getByLabelText(/Close dialog/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("avatar carousel cycles next/prev and the rendered image src follows currentIndex", () => {
    render(
      <UserProfileDialog
        isOpen={true}
        onClose={vi.fn()}
        userData={{
          variant: "known",
          name: "Alice Smith",
          role: "Engineering",
          time: "2026-05-25T10:00:00Z",
          firstName: "Alice",
          lastName: "Smith",
          avatars: ["a.png", "b.png", "c.png"],
        }}
      />
    );

    const img = screen.getByAltText("Profile");
    expect(img.getAttribute("src")).toMatch(/a\.png$/);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Next image/i));
    expect(img.getAttribute("src")).toMatch(/b\.png$/);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Next image/i));
    expect(img.getAttribute("src")).toMatch(/c\.png$/);

    // Wrap forward.
    fireEvent.click(screen.getByLabelText(/Next image/i));
    expect(img.getAttribute("src")).toMatch(/a\.png$/);

    // Prev from index 0 -> wraps to last.
    fireEvent.click(screen.getByLabelText(/Previous image/i));
    expect(img.getAttribute("src")).toMatch(/c\.png$/);
  });

  it("falls back to single-avatar list when avatars[] is absent (carousel arrows hidden)", () => {
    render(
      <UserProfileDialog
        isOpen={true}
        onClose={vi.fn()}
        userData={{
          variant: "known",
          name: "Alice",
          role: "Eng",
          time: "2026-05-25T10:00:00Z",
          avatar: "solo.png",
        }}
      />
    );

    const img = screen.getByAltText("Profile");
    expect(img.getAttribute("src")).toMatch(/solo\.png$/);
    // Single-image -> arrows and counter are not in the DOM.
    expect(screen.queryByLabelText(/Next image/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Previous image/i)).not.toBeInTheDocument();
  });

  it("renders unknown-user / access-log view: initials fallback src + 'Access Time' verbatim + 'Denied' status", () => {
    render(
      <UserProfileDialog
        isOpen={true}
        onClose={vi.fn()}
        isAccessLog={true}
        userData={{
          variant: "unknown",
          // No name -> falls back to "Unknown User" in the header.
          // No role -> the Department card is skipped under the
          //   `(isKnown && userData.role) || !isAccessLog` condition.
          // No avatars at all -> the initials-fallback src is used.
          time: "13:45:12", // rendered verbatim in access-log mode
        }}
      />
    );

    // Header fallbacks.
    expect(screen.getByText("Unknown User")).toBeInTheDocument();
    expect(screen.getByText(/UNAUTHORIZED/i)).toBeInTheDocument();

    // Department card is gone in access-log + unknown-user case.
    // Note: the header role subtitle still renders "No Department"
    // because role is undefined; that single occurrence is *not*
    // an InfoCard. The Department InfoCard would itself add a
    // literal "Department" label, so /Department/ should appear
    // exactly once (the subtitle), and there should be no card
    // with role 'No Department' as its value.
    expect(screen.getAllByText(/Department/i)).toHaveLength(1);

    // Access Time card with verbatim string.
    expect(screen.getByText(/Access Time/i)).toBeInTheDocument();
    expect(screen.getByText("13:45:12")).toBeInTheDocument();

    // Access Status card -> Denied (since variant !== "known").
    expect(screen.getByText(/Access Status/i)).toBeInTheDocument();
    expect(screen.getByText("Denied")).toBeInTheDocument();

    // Avatar should be the initials fallback (?name=Unauthorized Access).
    const img = screen.getByAltText("Profile");
    expect(img.getAttribute("src")).toMatch(/\?name=Unauthorized%20Access$/);
  });

  it("known + access-log path shows 'Granted' status and skips Employee ID card", () => {
    render(
      <UserProfileDialog
        isOpen={true}
        onClose={vi.fn()}
        isAccessLog={true}
        userData={{
          variant: "known",
          name: "Bob",
          role: "Sales",
          time: "09:00:00",
          employeeId: "E-2", // ignored in access-log mode
          avatars: ["bob.png"],
        }}
      />
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();
    // Department card present because (isKnown && role) is true.
    expect(screen.getByText(/Department/i)).toBeInTheDocument();
    expect(screen.getAllByText("Sales")).toHaveLength(2);
    // Access-log time is verbatim, not moment-formatted.
    expect(screen.getByText("09:00:00")).toBeInTheDocument();
    // Access Status -> Granted.
    expect(screen.getByText("Granted")).toBeInTheDocument();
    // Employee ID card path is access-log-skipped.
    expect(screen.queryByText(/Employee ID/i)).not.toBeInTheDocument();
  });
});
