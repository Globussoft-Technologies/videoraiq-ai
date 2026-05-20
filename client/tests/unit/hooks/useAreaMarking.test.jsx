/**
 * useAreaMarking exposes draw/move/delete handlers that operate on a
 * cameraStreamRef. The ref is replaced with a fake object whose method
 * calls we assert against.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAreaMarking from "../../../src/hooks/useAreaMarking.js";

function makeRef(over = {}) {
  return {
    current: {
      setDrawingMode: vi.fn(),
      setMoveMode: vi.fn(),
      setPoints: vi.fn(),
      clearPoints: vi.fn(),
      getPoints: vi.fn().mockReturnValue([]),
      getResolution: vi.fn().mockReturnValue([1920, 1080]),
      ...over,
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("useAreaMarking.handleToggleDrawing", () => {
  it("enables drawing mode on first toggle", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleToggleDrawing("countPersons"));
    expect(result.current.drawingMode).toBe(true);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(true);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(false);
  });

  it("disables drawing mode on second toggle", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleToggleDrawing("countPersons"));
    act(() => result.current.handleToggleDrawing("countPersons"));
    expect(result.current.drawingMode).toBe(false);
    expect(ref.current.setDrawingMode).toHaveBeenLastCalledWith(false);
  });

  it("is a no-op for lineCrossing detection types", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleToggleDrawing("lineCrossing"));
    expect(result.current.drawingMode).toBe(false);
    expect(ref.current.setDrawingMode).not.toHaveBeenCalled();
  });
});

describe("useAreaMarking.handleMinArea", () => {
  it("seeds a 100×100→300×300 rectangle and enables move mode", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMinArea());
    expect(ref.current.setPoints).toHaveBeenCalledTimes(1);
    const pts = ref.current.setPoints.mock.calls[0][0];
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 100, y: 100 });
    expect(pts[2]).toEqual({ x: 300, y: 300 });
    expect(result.current.moveMode).toBe(true);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(true);
  });
});

describe("useAreaMarking.handleMaxArea", () => {
  it("uses the stream resolution to draw a full-frame rectangle", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMaxArea());
    const pts = ref.current.setPoints.mock.calls[0][0];
    expect(pts[2]).toEqual({ x: 1920, y: 1080 });
    expect(result.current.moveMode).toBe(true);
  });

  it("bails when the resolution is missing", () => {
    const ref = makeRef({ getResolution: vi.fn().mockReturnValue(null) });
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMaxArea());
    expect(ref.current.setPoints).not.toHaveBeenCalled();
  });
});

describe("useAreaMarking.handleSingleLinePlacement", () => {
  it("seeds a two-point line and enables move mode", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleSingleLinePlacement());
    const pts = ref.current.setPoints.mock.calls[0][0];
    expect(pts).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ]);
    expect(result.current.moveMode).toBe(true);
  });
});

describe("useAreaMarking.handleEnableEdit", () => {
  it("enables move + disables draw when points already exist", () => {
    const ref = makeRef({
      getPoints: vi.fn().mockReturnValue([{ x: 1, y: 1 }]),
    });
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleEnableEdit());
    expect(result.current.moveMode).toBe(true);
    expect(result.current.drawingMode).toBe(false);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(true);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
  });

  it("does nothing when there are no points yet", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleEnableEdit());
    expect(ref.current.setMoveMode).not.toHaveBeenCalled();
  });
});

describe("useAreaMarking.handleDeleteArea", () => {
  it("clears points and resets modes when drawing mode is off", () => {
    const ref = makeRef();
    const { result } = renderHook(() => useAreaMarking(ref));
    // handleDeleteArea takes the drawing branch when clearPoints exists,
    // which schedules a 0ms setTimeout — exercise it with fake timers.
    vi.useFakeTimers();
    act(() => result.current.handleDeleteArea());
    expect(ref.current.clearPoints).toHaveBeenCalled();
    expect(result.current.drawingMode).toBe(false);
    act(() => vi.runAllTimers());
    vi.useRealTimers();
    expect(result.current.drawingMode).toBe(true);
  });
});
