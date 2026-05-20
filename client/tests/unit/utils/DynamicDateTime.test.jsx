/**
 * DynamicDateTime renders the current Date.now() every second using the
 * en-US locale. Verify the initial render, that the timer ticks update the
 * displayed string, that the optional `incidentDate` flag drops the time
 * portion, and that the interval is cleaned up on unmount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import DynamicDateTime from "../../../src/utils/DynamicDateTime.jsx";

describe("utils/DynamicDateTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T12:34:56Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders without crashing and shows a non-empty string", () => {
    const { container } = render(<DynamicDateTime />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span.textContent.trim().length).toBeGreaterThan(0);
  });

  it("renders the date portion ('March 15, 2024')", () => {
    const { container } = render(<DynamicDateTime />);
    const span = container.querySelector("span");
    expect(span.textContent).toContain("March");
    expect(span.textContent).toContain("2024");
  });

  it("includes the time portion by default", () => {
    const { container } = render(<DynamicDateTime />);
    const span = container.querySelector("span");
    // Default locale formatting yields something like "12:34:56 PM" or
    // similar — the exact characters vary by ICU build but it should
    // contain at least one digit-colon-digit pair from the time.
    expect(span.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("omits the time portion when incidentDate is truthy", () => {
    const { container } = render(<DynamicDateTime incidentDate="2024-03-15" />);
    const span = container.querySelector("span");
    expect(span.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(span.textContent).toContain("March");
  });

  it("merges a custom className onto the inner span", () => {
    const { container } = render(<DynamicDateTime className="extra-class" />);
    const span = container.querySelector("span");
    expect(span.className).toContain("extra-class");
  });

  it("updates the rendered string when the clock ticks forward by 1s", () => {
    const { container } = render(<DynamicDateTime />);
    const initial = container.querySelector("span").textContent;
    act(() => {
      // Advance both the fake timer (so setInterval fires) and the system
      // clock (so `new Date()` returns a new value).
      vi.setSystemTime(new Date("2024-03-15T12:34:57Z"));
      vi.advanceTimersByTime(1000);
    });
    const next = container.querySelector("span").textContent;
    expect(next).not.toBe(initial);
  });

  it("clears its interval on unmount (no further updates)", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = render(<DynamicDateTime />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
