/**
 * src/page/user/EmployeeLogs/ActionCameraPreview.jsx — Radix Dialog
 * carousel-style preview popped up from the various log tables when a
 * row is clicked. Renders an image carousel with prev/next + keyboard
 * arrow keys + escape; switches header copy + several detail rows on
 * `module === 'attendancelogs'` vs `'accesslogs'`. Image URLs come from
 * `selectedLog.imageUrls`, which may be a list of strings OR objects
 * with `{ url, timestamp, cameraType }`. The component is wrapped in
 * `React.memo`, so each render produces a new mount only when props
 * shallow-change.
 *
 * Mocks (1):
 *   1. @/components/ui/dialog — Radix portals make Dialog content
 *      invisible in jsdom; shim Dialog so DialogContent renders inline
 *      when `open` is true and returns null otherwise.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children, onOpenChange }) =>
    open ? (
      <div data-slot="dialog" data-onopenchange={onOpenChange ? "1" : "0"}>
        {children}
      </div>
    ) : null;
  const DialogContent = ({ children, closeBtn: _c, ...rest }) => (
    <div data-slot="dialog-content" {...rest}>
      {children}
    </div>
  );
  return { Dialog, DialogContent };
});

// Mock environment variable before importing the component
vi.stubEnv('VITE_BACKEND', 'https://api.test');

const { default: ActionCameraPreview } = await import(
  "../../../../../src/page/user/EmployeeLogs/ActionCameraPreview.jsx"
);

const BASE = "https://api.test/api/v1/uploads";

describe("ActionCameraPreview", () => {
  it("renders nothing when isOpen=false (Dialog stub returns null)", () => {
    const { container } = render(
      <ActionCameraPreview isOpen={false} selectedLog={{ name: "Hidden" }} />
    );
    expect(container.textContent).toBe("");
  });

  it("renders 'No images available' when imageUrls is empty", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "John", imageUrls: [] }}
      />
    );
    expect(screen.getByText("No images available")).toBeInTheDocument();
    // Counter is hidden when there are 0 or 1 images.
    expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull();
    // Nav chevrons should also be hidden.
    expect(screen.queryByLabelText("Previous image")).toBeNull();
    expect(screen.queryByLabelText("Next image")).toBeNull();
  });

  it("uses ACCESSLOG header copy by default and renders one image without nav controls", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "Solo", imageUrls: ["/only.jpg"] }}
      />
    );
    expect(screen.getByText("ACCESSLOG PREVIEW")).toBeInTheDocument();
    expect(screen.getByText("Solo")).toBeInTheDocument();
    // Single-image -> counter and chevrons are suppressed.
    expect(screen.queryByLabelText("Previous image")).toBeNull();
    expect(screen.queryByLabelText("Next image")).toBeNull();
    const img = screen.getByAltText("Preview 1");
    expect(img.getAttribute("src")).toBe(`${BASE}/only.jpg`);
  });

  it("uses ATTENDANCE header copy + checkin/checkout rows when module='attendancelogs'", () => {
    render(
      <ActionCameraPreview
        isOpen
        module="attendancelogs"
        selectedLog={{
          name: "Jane",
          checkinCam: "CamA",
          checkoutCam: "CamB",
          imageUrls: [
            { url: "/p1.jpg", timestamp: "2026-01-02T08:30:00Z", cameraType: "checkin" },
            { url: "/p2.jpg", timestamp: "2026-01-02T17:00:00Z", cameraType: "checkout" },
          ],
        }}
      />
    );
    expect(screen.getByText("ATTENDANCE PREVIEW")).toBeInTheDocument();
    expect(screen.getByText("checkin Cam")).toBeInTheDocument();
    expect(screen.getByText("CamA")).toBeInTheDocument();
    expect(screen.getByText("checkout Cam")).toBeInTheDocument();
    expect(screen.getByText("CamB")).toBeInTheDocument();
    // First image is the "checkin" cameraType.
    expect(screen.getByText("checkin")).toBeInTheDocument();
  });

  it("renders the Camera name row + channelInfo.name camera type when module='accesslogs'", () => {
    render(
      <ActionCameraPreview
        isOpen
        module="accesslogs"
        selectedLog={{
          name: "Bob",
          cameraName: "Lobby-East",
          channelInfo: { name: "MainEntry" },
          imageUrls: ["/a.jpg", "/b.jpg"],
        }}
      />
    );
    expect(screen.getByText("Camera name")).toBeInTheDocument();
    expect(screen.getByText("Lobby-East")).toBeInTheDocument();
    // channelInfo.name is the camera type label in accesslogs mode.
    expect(screen.getByText("MainEntry")).toBeInTheDocument();
    // Two images -> counter + nav controls become visible.
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous image")).toBeInTheDocument();
    expect(screen.getByLabelText("Next image")).toBeInTheDocument();
  });

  it("Next/Previous chevrons cycle through the carousel with wrap-around", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "Wrap", imageUrls: ["/x.jpg", "/y.jpg", "/z.jpg"] }}
      />
    );
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    // Wraps back to 1 of 3.
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // Previous wraps to last.
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("ArrowRight / ArrowLeft keys also advance the carousel; Escape calls onClose", () => {
    const onClose = vi.fn();
    render(
      <ActionCameraPreview
        isOpen
        onClose={onClose}
        selectedLog={{ name: "Keys", imageUrls: ["/k1.jpg", "/k2.jpg"] }}
      />
    );
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Unknown keys are ignored (no extra onClose calls, no index change).
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("keyboard handler is disabled while isOpen=false", () => {
    const onClose = vi.fn();
    render(
      <ActionCameraPreview
        isOpen={false}
        onClose={onClose}
        selectedLog={{ name: "Closed", imageUrls: ["/x.jpg"] }}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("close button (top-right X) fires onClose", () => {
    const onClose = vi.fn();
    render(
      <ActionCameraPreview
        isOpen
        onClose={onClose}
        selectedLog={{ name: "ClickX", imageUrls: ["/o.jpg"] }}
      />
    );
    fireEvent.click(screen.getByLabelText("Close preview"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("maps string and object entries in imageUrls to BASE_URL-prefixed src values", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{
          name: "Mixed",
          imageUrls: [
            "/raw.jpg",
            { url: "/obj.jpg", timestamp: "2026-01-02T10:00:00Z" },
          ],
        }}
      />
    );
    // Starts at index 0 -> raw string entry.
    let img = screen.getByAltText("Preview 1");
    expect(img.getAttribute("src")).toBe(`${BASE}/raw.jpg`);
    fireEvent.click(screen.getByLabelText("Next image"));
    img = screen.getByAltText("Preview 2");
    expect(img.getAttribute("src")).toBe(`${BASE}/obj.jpg`);
  });

  it("the image's onLoad and onError handlers fire without crashing the dialog", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "Events", imageUrls: ["/e.jpg"] }}
      />
    );
    const img = screen.getByAltText("Preview 1");
    fireEvent.load(img);
    fireEvent.error(img);
    // Dialog still rendered after both events.
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("resize listener updates the viewport-driven max-height class without throwing", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "Resize", imageUrls: ["/r.jpg"] }}
      />
    );
    // Trigger a resize that flips the viewportHeight <= 700 branch.
    act(() => {
      window.innerHeight = 600;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("Resize")).toBeInTheDocument();
  });

  it("renders the placeholder '--/--/----' date when no date fields are present", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ name: "NoDate", imageUrls: ["/n.jpg"] }}
      />
    );
    expect(screen.getByText("--/--/----")).toBeInTheDocument();
  });

  it("falls back to 'Employee Name' header label when selectedLog.name is missing", () => {
    render(
      <ActionCameraPreview
        isOpen
        selectedLog={{ imageUrls: ["/anon.jpg"] }}
      />
    );
    expect(screen.getByText("Employee Name")).toBeInTheDocument();
  });
});
