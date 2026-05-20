/**
 * Extra coverage for useAreaMarking branches the primary spec doesn't hit:
 *  - handleDeleteArea with no `clearPoints` (falls through to setPoints branch).
 *  - handleToggleDrawing when there are existing points (skips clearPoints).
 *  - handleEnableEdit when getPoints throws (caught by inner try/catch).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAreaMarking from "../../../src/hooks/useAreaMarking.js";

describe("useAreaMarking extra branches", () => {
  it("handleDeleteArea uses setPoints when clearPoints is absent", () => {
    const ref = {
      current: {
        setDrawingMode: vi.fn(),
        setMoveMode: vi.fn(),
        setPoints: vi.fn(),
        getPoints: vi.fn().mockReturnValue([]),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleDeleteArea());
    expect(ref.current.setPoints).toHaveBeenCalledWith([]);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(false);
    expect(result.current.drawingMode).toBe(false);
    expect(result.current.moveMode).toBe(false);
  });

  it("handleDeleteArea bails when cameraStreamRef.current is null", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useAreaMarking(ref));
    // Should not throw.
    act(() => result.current.handleDeleteArea());
    expect(result.current.drawingMode).toBe(false);
  });

  it("handleToggleDrawing skips clearPoints when existing points are present", () => {
    const ref = {
      current: {
        setDrawingMode: vi.fn(),
        setMoveMode: vi.fn(),
        setPoints: vi.fn(),
        clearPoints: vi.fn(),
        getPoints: vi.fn().mockReturnValue([{ x: 1, y: 1 }]),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleToggleDrawing("countPersons"));
    expect(result.current.drawingMode).toBe(true);
    expect(ref.current.clearPoints).not.toHaveBeenCalled();
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(true);
  });

  it("handleToggleDrawing falls back to setPoints when clearPoints is absent and no points exist", () => {
    const ref = {
      current: {
        setDrawingMode: vi.fn(),
        setMoveMode: vi.fn(),
        setPoints: vi.fn(),
        getPoints: vi.fn().mockReturnValue([]),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleToggleDrawing("countPersons"));
    expect(ref.current.setPoints).toHaveBeenCalledWith([]);
  });

  it("handleToggleDrawing swallows errors thrown by getPoints", () => {
    const ref = {
      current: {
        setDrawingMode: vi.fn(),
        setMoveMode: vi.fn(),
        setPoints: vi.fn(),
        clearPoints: vi.fn(),
        getPoints: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    expect(() =>
      act(() => result.current.handleToggleDrawing("countPersons"))
    ).not.toThrow();
    expect(result.current.drawingMode).toBe(true);
  });

  it("handleEnableEdit swallows errors thrown by getPoints", () => {
    const ref = {
      current: {
        setDrawingMode: vi.fn(),
        setMoveMode: vi.fn(),
        getPoints: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    expect(() => act(() => result.current.handleEnableEdit())).not.toThrow();
    // No state change because the catch swallows the call.
    expect(result.current.moveMode).toBe(false);
  });

  it("handleMaxArea bails when width/height are zero", () => {
    const ref = {
      current: {
        setPoints: vi.fn(),
        setMoveMode: vi.fn(),
        setDrawingMode: vi.fn(),
        getResolution: vi.fn().mockReturnValue([0, 0]),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMaxArea());
    expect(ref.current.setPoints).not.toHaveBeenCalled();
  });

  it("handleMaxArea bails when getResolution returns the wrong shape", () => {
    const ref = {
      current: {
        setPoints: vi.fn(),
        setMoveMode: vi.fn(),
        getResolution: vi.fn().mockReturnValue([1920]),
      },
    };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMaxArea());
    expect(ref.current.setPoints).not.toHaveBeenCalled();
  });

  it("handleMinArea is a no-op when setPoints is absent on the ref", () => {
    const ref = { current: { setMoveMode: vi.fn() } };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.handleMinArea());
    expect(result.current.moveMode).toBe(false);
  });

  it("setMoveMode / setDrawingMode are exposed and updates state", () => {
    const ref = { current: {} };
    const { result } = renderHook(() => useAreaMarking(ref));
    act(() => result.current.setMoveMode(true));
    expect(result.current.moveMode).toBe(true);
    act(() => result.current.setDrawingMode(true));
    expect(result.current.drawingMode).toBe(true);
  });
});
