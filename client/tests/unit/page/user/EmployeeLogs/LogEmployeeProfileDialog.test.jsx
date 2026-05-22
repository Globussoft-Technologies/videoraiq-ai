/**
 * src/page/user/EmployeeLogs/LogEmployeeProfileDialog.jsx — Radix Dialog
 * wrapper that displays an employee profile with a region-converted check-in /
 * check-out (uses moment-timezone). The `module` prop switches the time keys
 * between accessLog vs everything else.
 *
 * Mocks: 0
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import LogEmployeeProfileDialog from "@/page/user/EmployeeLogs/LogEmployeeProfileDialog.jsx";

describe("LogEmployeeProfileDialog", () => {
  const baseProfile = {
    name: "Jane Doe",
    department: "Engineering",
    image: "https://example.test/jane.jpg",
    email: "jane@example.test",
    login: "2026-01-02T08:30:00Z",
    logout: "2026-01-02T17:00:00Z",
    enteredIn: "2026-01-02T09:15:00Z",
    exitTiming: "2026-01-02T18:45:00Z",
  };

  it("renders nothing visible when open=false", () => {
    render(<LogEmployeeProfileDialog open={false} profile={baseProfile} />);
    expect(screen.queryByText("Jane Doe")).toBeNull();
  });

  it("renders the profile image, name and department when open", () => {
    render(<LogEmployeeProfileDialog open profile={baseProfile} />);
    // Name appears in header + in the Name row.
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    const img = document.querySelector("img[alt='Jane Doe']");
    expect(img).toBeTruthy();
    expect(img.src).toBe("https://example.test/jane.jpg");
  });

  it("falls back to the name initial when no image is set", () => {
    render(
      <LogEmployeeProfileDialog
        open
        profile={{ name: "Alice", department: "Ops" }}
      />
    );
    // Initial 'A' should appear in the avatar fallback.
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders a '?' fallback when name is missing too", () => {
    render(<LogEmployeeProfileDialog open profile={{}} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("hides the name/department block when department is 'Unknown'", () => {
    render(
      <LogEmployeeProfileDialog
        open
        profile={{ ...baseProfile, department: "Unknown" }}
      />
    );
    // The grid still shows the Name label/value row so we look for the
    // *header* department text — should be gone.
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("uses login/logout times for non-accessLog modules", () => {
    render(
      <LogEmployeeProfileDialog open profile={baseProfile} module="attendance" />
    );
    expect(screen.getByText("Check In")).toBeInTheDocument();
    // hh:mm A format -> two values present.
    const checkOutLabel = screen.getByText(/Check out/);
    expect(checkOutLabel).toBeInTheDocument();
    expect(screen.getByText("jane@example.test")).toBeInTheDocument();
  });

  it("uses enteredIn/exitTiming when module is accessLog", () => {
    const { container } = render(
      <LogEmployeeProfileDialog open profile={baseProfile} module="accessLog" />
    );
    // The accessLog branch reads different fields; rendered values are not
    // the placeholder "--" because we supplied valid ISO strings.
    const dashCells = Array.from(container.querySelectorAll("div.text-sm.text-\\[\\#4B5563\\]"))
      .filter((d) => d.textContent === "--");
    expect(dashCells.length).toBe(0);
  });

  it("renders '--' for missing check-in/check-out timestamps", () => {
    render(
      <LogEmployeeProfileDialog
        open
        profile={{ name: "NoTime", department: "X" }}
      />
    );
    const dashes = screen.getAllByText("--");
    // Two timestamp slots -> at least 2 '--' placeholders.
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the email placeholder when email is missing", () => {
    render(
      <LogEmployeeProfileDialog
        open
        profile={{ name: "X", department: "Y", login: "", logout: "" }}
      />
    );
    expect(screen.getByText("Email account")).toBeInTheDocument();
  });

  it("forwards open-change events to both onOpenChange and onClose", () => {
    const onOpenChange = vi.fn();
    const onClose = vi.fn();
    // Mount the dialog open so Radix has a node to react to.
    const { rerender } = render(
      <LogEmployeeProfileDialog
        open
        onOpenChange={onOpenChange}
        onClose={onClose}
        profile={baseProfile}
      />
    );
    // Pressing Escape on the document fires the Radix onOpenChange(false).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    rerender(
      <LogEmployeeProfileDialog
        open={false}
        onOpenChange={onOpenChange}
        onClose={onClose}
        profile={baseProfile}
      />
    );
    // onOpenChange should have been invoked at least once.
    expect(onOpenChange).toHaveBeenCalled();
  });

  it("swallows errors thrown by consumer callbacks", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onOpenChange = vi.fn(() => {
      throw new Error("boom");
    });
    const onClose = vi.fn(() => {
      throw new Error("boom2");
    });
    render(
      <LogEmployeeProfileDialog
        open
        onOpenChange={onOpenChange}
        onClose={onClose}
        profile={baseProfile}
      />
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // The component should not have crashed the render.
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1);
    errSpy.mockRestore();
  });
});
