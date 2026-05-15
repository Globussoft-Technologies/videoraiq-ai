import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDebounce from "../../../src/hooks/useDebounce.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// Advancing fake timers must happen inside act() so React flushes the
// setState the debounce hook schedules.
function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 500));
    expect(result.current).toBe("hello");
  });

  it("does not update before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    advance(499);
    expect(result.current).toBe("a");
  });

  it("updates after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    advance(500);
    expect(result.current).toBe("b");
  });

  it("resets the timer on rapid changes — only the last value lands", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    advance(300);
    rerender({ value: "c" });
    advance(300);
    // 600ms total elapsed, but the timer reset at 300ms — still pending.
    expect(result.current).toBe("a");

    advance(200);
    expect(result.current).toBe("c");
  });

  it("honors a custom delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 1000),
      { initialProps: { value: "x" } }
    );

    rerender({ value: "y" });
    advance(500);
    expect(result.current).toBe("x");
    advance(500);
    expect(result.current).toBe("y");
  });

  it("defaults the delay to 500ms when omitted", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    advance(500);
    expect(result.current).toBe(2);
  });
});
