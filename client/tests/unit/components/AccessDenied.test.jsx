/**
 * AccessDenied shows a brief loader (LoaderCircle) for 300ms, then a 403
 * "Access Denied" panel. Use fake timers to advance past the initial delay
 * and assert the panel contents and the optional Go Back button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import AccessDenied from "../../../src/components/AccessDenied/index.jsx";

describe("AccessDenied", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initially renders the loader spinner (lucide-loader-circle)", () => {
    const { container } = render(<AccessDenied />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("class")).toContain("lucide-loader-circle");
    expect(svg.getAttribute("class")).toContain("animate-spin");
  });

  it("shows the 403 panel after the 300ms delay", () => {
    render(<AccessDenied />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByText("403 FORBIDDEN")).toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.getByText(/Need assistance\?/i)).toBeInTheDocument();
    expect(screen.getByText("Security • Compliance • Privacy")).toBeInTheDocument();
  });

  it("uses the default message when no message prop is supplied", () => {
    render(<AccessDenied />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(
      screen.getByText("You don't have permission to access this page.")
    ).toBeInTheDocument();
  });

  it("renders the custom message prop", () => {
    render(<AccessDenied message="Custom denial reason" />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByText("Custom denial reason")).toBeInTheDocument();
  });

  it("hides the Go Back button when onBack is not provided", () => {
    render(<AccessDenied />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.queryByRole("button", { name: /Go Back/i })).toBeNull();
  });

  it("renders the Go Back button when onBack is provided and invokes it on click", () => {
    const onBack = vi.fn();
    render(<AccessDenied onBack={onBack} />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    const btn = screen.getByRole("button", { name: /Go Back/i });
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
