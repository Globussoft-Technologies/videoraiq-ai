import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import useOnClickOutside from "../../../src/hooks/useOnClickOutside.js";

function Harness({ onOutside }) {
  const ref = useRef(null);
  useOnClickOutside(ref, onOutside);
  return (
    <div>
      <div ref={ref} data-testid="inside">
        <button data-testid="child">child</button>
      </div>
      <div data-testid="outside">outside</div>
    </div>
  );
}

describe("useOnClickOutside", () => {
  it("calls the handler when clicking outside the ref element", () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.mouseDown(getByTestId("outside"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT call the handler when clicking the ref element itself", () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.mouseDown(getByTestId("inside"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT call the handler when clicking a descendant of the ref", () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.mouseDown(getByTestId("child"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("also reacts to touchstart events", () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.touchStart(getByTestId("outside"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes its listeners on unmount", () => {
    const handler = vi.fn();
    const { getByTestId, unmount } = render(<Harness onOutside={handler} />);
    unmount();
    // After unmount the listener should be gone — clicking does nothing.
    fireEvent.mouseDown(document.body);
    expect(handler).not.toHaveBeenCalled();
  });
});
