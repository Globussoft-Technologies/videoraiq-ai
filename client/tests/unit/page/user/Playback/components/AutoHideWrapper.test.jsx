/**
 * src/page/user/Playback/components/AutoHideWrapper.jsx — wraps children in
 * a div that fades to opacity 0 after `hideDelay` ms of no pointer activity.
 *
 * Two operating modes:
 *  - LOCAL (default, no targetRef): wraps in a div that listens for
 *    mousemove/enter/leave on the wrapper itself; controls hide after delay.
 *  - TARGET (targetRef provided): attaches the listeners to the supplied
 *    element via addEventListener; wrapper only listens for enter/leave to
 *    keep showing while the user is hovering the controls themselves.
 *
 * Mocks: 0. Uses vi.useFakeTimers() to step through the hideDelay.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";

import AutoHideWrapper from "../../../../../../src/page/user/Playback/components/AutoHideWrapper.jsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoHideWrapper", () => {
  it("renders children inside the wrapper", () => {
    render(
      <AutoHideWrapper>
        <span data-testid="child">controls</span>
      </AutoHideWrapper>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("starts visible (opacity 1, pointer-events auto)", () => {
    const { container } = render(
      <AutoHideWrapper>
        <span>child</span>
      </AutoHideWrapper>
    );
    // Outer div -> inner transition div is the second-level element.
    const inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("1");
    expect(inner.style.pointerEvents).toBe("auto");
  });

  it("hides after hideDelay ms of inactivity (local mode)", () => {
    const { container } = render(
      <AutoHideWrapper hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("0");
    expect(inner.style.pointerEvents).toBe("none");
  });

  it("mousemove on the wrapper resets the hide timer (local mode)", () => {
    const { container } = render(
      <AutoHideWrapper hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );
    const wrapper = container.firstChild;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.mouseMove(wrapper);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Still visible: total 800ms elapsed but the timer was reset at 400ms,
    // and only 400ms have passed since the reset.
    const inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("1");
  });

  it("mouseenter then mouseleave keeps controls shown and re-arms timer", () => {
    const { container } = render(
      <AutoHideWrapper hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );
    const wrapper = container.firstChild;
    fireEvent.mouseEnter(wrapper);
    let inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("1");

    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("0");
  });

  it("applies the className and style props on the outer wrapper", () => {
    const { container } = render(
      <AutoHideWrapper
        className="my-wrap"
        style={{ position: "absolute" }}
      >
        <span>child</span>
      </AutoHideWrapper>
    );
    const wrapper = container.firstChild;
    expect(wrapper.className).toBe("my-wrap");
    expect(wrapper.style.position).toBe("absolute");
  });

  it("attaches listeners to targetRef.current in target mode and detaches on unmount", () => {
    const ref = createRef();
    // Pre-mount a real DOM element and assign it to the ref.
    const target = document.createElement("div");
    document.body.appendChild(target);
    ref.current = target;

    const addSpy = vi.spyOn(target, "addEventListener");
    const removeSpy = vi.spyOn(target, "removeEventListener");

    const { unmount } = render(
      <AutoHideWrapper targetRef={ref} hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );

    // Three event types should be wired up.
    const eventsAdded = addSpy.mock.calls.map((c) => c[0]);
    expect(eventsAdded).toEqual(
      expect.arrayContaining(["mousemove", "mouseenter", "mouseleave"])
    );

    unmount();
    const eventsRemoved = removeSpy.mock.calls.map((c) => c[0]);
    expect(eventsRemoved).toEqual(
      expect.arrayContaining(["mousemove", "mouseenter", "mouseleave"])
    );

    document.body.removeChild(target);
  });

  it("target mode: hovering the wrapper itself shows + cancels timer (local handlers)", () => {
    const ref = createRef();
    const target = document.createElement("div");
    document.body.appendChild(target);
    ref.current = target;

    const { container } = render(
      <AutoHideWrapper targetRef={ref} hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );
    const wrapper = container.firstChild;

    // Run timer to hide first.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    let inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("0");

    // Enter the wrapper -> showControls is forced true.
    fireEvent.mouseEnter(wrapper);
    inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("1");

    // Leaving re-arms the timer.
    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("0");

    document.body.removeChild(target);
  });

  it("target mode: handlers fired on target element show/hide the controls", () => {
    const ref = createRef();
    const target = document.createElement("div");
    document.body.appendChild(target);
    ref.current = target;

    const { container } = render(
      <AutoHideWrapper targetRef={ref} hideDelay={500}>
        <span>child</span>
      </AutoHideWrapper>
    );

    // Hide first.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    let inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("0");

    // Fire a mousemove on the target element -> controls shown again.
    act(() => {
      target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    inner = container.querySelector(".transition-opacity");
    expect(inner.style.opacity).toBe("1");

    document.body.removeChild(target);
  });

  it("cleanup clears the pending hide timeout on unmount", () => {
    const { container, unmount } = render(
      <AutoHideWrapper hideDelay={1000}>
        <span>child</span>
      </AutoHideWrapper>
    );
    // Don't advance to fire the hide timer; just unmount and ensure no
    // throw + the inner div is gone.
    unmount();
    expect(container.firstChild).toBeNull();
    // Advance any orphaned timers — should not throw / write to DOM.
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(2000);
      })
    ).not.toThrow();
  });
});
