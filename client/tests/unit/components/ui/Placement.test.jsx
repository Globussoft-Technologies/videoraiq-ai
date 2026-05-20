/**
 * useResponsivePlacement returns 'bottom' / 'left' / 'bottom' depending on
 * window.innerWidth (2xl >=1536 → 'bottom', md >=768 → 'left', else 'bottom').
 * Use a small harness to surface the hook's value to the DOM, then simulate
 * resize events with fake timers to flush the internal 100ms debounce.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useResponsivePlacement } from "../../../../src/components/ui/Placement.jsx";

function Harness() {
  const placement = useResponsivePlacement();
  return <span data-testid="p">{placement}</span>;
}

function resizeTo(width) {
  // jsdom lets us assign innerWidth directly.
  window.innerWidth = width;
  window.dispatchEvent(new Event("resize"));
}

describe("ui/useResponsivePlacement", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.innerWidth = originalWidth;
  });

  it("returns 'bottom' on small viewports (<768px)", () => {
    window.innerWidth = 500;
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("p").textContent).toBe("bottom");
  });

  it("returns 'left' on medium viewports (768-1535px)", () => {
    window.innerWidth = 1024;
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("p").textContent).toBe("left");
  });

  it("returns 'bottom' on 2xl viewports (>=1536px)", () => {
    window.innerWidth = 1600;
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("p").textContent).toBe("bottom");
  });

  it("debounces and updates after a 100ms window when crossing breakpoints", () => {
    window.innerWidth = 500;
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("p").textContent).toBe("bottom");

    act(() => {
      resizeTo(1024);
      vi.advanceTimersByTime(150);
    });

    expect(getByTestId("p").textContent).toBe("left");
  });

  it("removes its resize listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Harness />);
    unmount();
    expect(
      removeSpy.mock.calls.some(([evt]) => evt === "resize")
    ).toBe(true);
    removeSpy.mockRestore();
  });
});
