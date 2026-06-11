/**
 * VideoModal renders a fullscreen incident viewer over a CameraCanvas with
 * navigation arrows, an optional Mark-Resolved checkbox, a Report button,
 * and a stat-strip computed from videoData.objectsDetected.
 *
 * We mock the dialog primitives (so portals get out of the way) and the
 * CameraCanvas child (it's heavy). The tests cover:
 *   - early return when no videoData
 *   - null/no-render path when isOpen=false
 *   - default open render (title, alert text, navigation arrows, close button)
 *   - prev/next navigation invokes onNavigateByIndex with the right index
 *   - resolved + Mark As Resolved render path
 *   - Report button wiring
 *   - Escape / ArrowLeft / ArrowRight keyboard handlers
 *   - stats aggregation from objectsDetected when unknownCount present
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) =>
    open ? <div data-slot="dialog">{children}</div> : null;
  // VideoModal forwards a custom `closeBtn` prop the real DialogContent
  // understands but a plain <div> does not. Strip it out so React doesn't
  // complain about an unknown attribute.
  const DialogContent = ({ children, closeBtn: _closeBtn, ...rest }) => (
    <div data-slot="dialog-content" {...rest}>
      {children}
    </div>
  );
  return { Dialog, DialogContent };
});

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange, ...rest }) => (
    <input
      type="checkbox"
      id={id}
      data-testid={`cb-${id}`}
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...rest}
    />
  ),
}));

// CameraCanvas pulls UserContext + env at import time — stub it inline.
vi.mock("@/page/user/Streams/CameraCanvas", () => ({
  default: ({ src, thumbnailSrc, isInModal }) => (
    <div
      data-testid="camera-canvas"
      data-src={src ?? ""}
      data-thumb={thumbnailSrc ?? ""}
      data-in-modal={String(!!isInModal)}
    />
  ),
}));

const { default: VideoModal } = await import(
  "../../../src/components/VideoModal.jsx"
);

const baseVideoData = {
  id: 42,
  title: "Front Lobby Incident",
  alertText: "Unknown person detected",
  videoSrc: "https://stream.test/incident.m3u8",
  thumbnailSrc: "https://stream.test/incident.jpg",
  timeOfIncident: "2024-01-01T00:00:00Z",
};

describe("VideoModal", () => {
  it("returns null when videoData is missing", () => {
    const { container } = render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={null}
        allIncidents={[]}
        totalIncidents={0}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
    expect(screen.queryByTestId("camera-canvas")).toBeNull();
  });

  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <VideoModal
        isOpen={false}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
  });

  it("renders title, alert text, CameraCanvas, and the close button when open", () => {
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    expect(screen.getByText("Front Lobby Incident")).toBeInTheDocument();
    expect(screen.getByText("Unknown person detected")).toBeInTheDocument();
    expect(screen.getByText("Security Feed")).toBeInTheDocument();
    const canvas = screen.getByTestId("camera-canvas");
    expect(canvas.getAttribute("data-src")).toBe(
      "https://stream.test/incident.m3u8"
    );
    expect(canvas.getAttribute("data-in-modal")).toBe("true");
    // close-icon button is the first button in the modal
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("close button invokes onClose", () => {
    const onClose = vi.fn();
    render(
      <VideoModal
        isOpen={true}
        onClose={onClose}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    // first button is the Minimize2 close button
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides nav arrows when there's only a single incident", () => {
    const { container } = render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    // Round 4 re-pin: VideoModal now mounts a side-panel collapse button
    // in addition to close + report (3 buttons when single incident vs 5+
    // when nav arrows render). The presence of ChevronLeft/ChevronRight
    // icons via the prev/next arrows is the more direct invariant: when
    // there's only one incident the dedicated nav-arrow buttons should
    // not be rendered, but the panel-collapse chevron may still appear.
    // We assert button count stays at or below 3 (close + report +
    // collapse) — strictly fewer than the 5 we'd see with nav arrows.
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeLessThanOrEqual(3);
  });

  it("renders next arrow and invokes onNavigateByIndex with the next global index", async () => {
    const onNavigateByIndex = vi.fn().mockResolvedValue(undefined);
    const a = { ...baseVideoData, id: 1 };
    const b = { ...baseVideoData, id: 2, title: "Second Cam" };
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={a}
        allIncidents={[a, b]}
        totalIncidents={2}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={onNavigateByIndex}
      />
    );
    // First incident -> globalIndex = 0; only Next is visible.
    const buttons = screen.getAllByRole("button");
    // close (0), next arrow, report — find the next arrow specifically by
    // matching ChevronRight via SVG lookup.
    const nextBtn = buttons.find((b) =>
      b.querySelector("svg.lucide-chevron-right")
    );
    expect(nextBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(onNavigateByIndex).toHaveBeenCalledWith(1);
  });

  it("renders prev arrow on the second incident and invokes onNavigateByIndex with previous index", async () => {
    const onNavigateByIndex = vi.fn().mockResolvedValue(undefined);
    const a = { ...baseVideoData, id: 1 };
    const b = { ...baseVideoData, id: 2, title: "Second Cam" };
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={b}
        allIncidents={[a, b]}
        totalIncidents={2}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={onNavigateByIndex}
      />
    );
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find((b) =>
      b.querySelector("svg.lucide-chevron-left")
    );
    expect(prevBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(prevBtn);
    });
    expect(onNavigateByIndex).toHaveBeenCalledWith(0);
  });

  it("renders the Mark As Resolved checkbox when canEdit is true and toggles onMarkResolved", () => {
    const onMarkResolved = vi.fn();
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
        canEdit={true}
        resolved={false}
        onMarkResolved={onMarkResolved}
      />
    );
    expect(screen.getByText("Mark As Resolved")).toBeInTheDocument();
    const cb = screen.getByTestId(`cb-resolved-${baseVideoData.id}`);
    fireEvent.click(cb);
    expect(onMarkResolved).toHaveBeenCalledTimes(1);
  });

  it("shows 'Resolved' label when resolved=true and canEdit=true", () => {
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
        canEdit={true}
        resolved={true}
      />
    );
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("hides the resolve checkbox when canEdit is false", () => {
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
        canEdit={false}
      />
    );
    expect(screen.queryByText("Mark As Resolved")).toBeNull();
    expect(screen.queryByText("Resolved")).toBeNull();
  });

  it("Report Incident button wires to onReport", () => {
    const onReport = vi.fn();
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
        onReport={onReport}
      />
    );
    const reportBtn = screen.getByRole("button", { name: /Report Incident/i });
    fireEvent.click(reportBtn);
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("renders the Unknown People stat when unknownCount is supplied", () => {
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={{ ...baseVideoData, unknownCount: 7 }}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    expect(screen.getByText("Unknown People")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("Escape key invokes onClose", () => {
    const onClose = vi.fn();
    render(
      <VideoModal
        isOpen={true}
        onClose={onClose}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowRight key advances when not at the last incident", async () => {
    const onNavigateByIndex = vi.fn().mockResolvedValue(undefined);
    const a = { ...baseVideoData, id: 1 };
    const b = { ...baseVideoData, id: 2 };
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={a}
        allIncidents={[a, b]}
        totalIncidents={2}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={onNavigateByIndex}
      />
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(onNavigateByIndex).toHaveBeenCalledWith(1);
  });

  it("ArrowLeft key goes back when not at the first incident", async () => {
    const onNavigateByIndex = vi.fn().mockResolvedValue(undefined);
    const a = { ...baseVideoData, id: 1 };
    const b = { ...baseVideoData, id: 2 };
    render(
      <VideoModal
        isOpen={true}
        onClose={() => {}}
        videoData={b}
        allIncidents={[a, b]}
        totalIncidents={2}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={onNavigateByIndex}
      />
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });
    expect(onNavigateByIndex).toHaveBeenCalledWith(0);
  });

  it("does NOT register the keydown listener when isOpen=false (no nav fires)", () => {
    const onNavigateByIndex = vi.fn();
    const onClose = vi.fn();
    render(
      <VideoModal
        isOpen={false}
        onClose={onClose}
        videoData={baseVideoData}
        allIncidents={[baseVideoData]}
        totalIncidents={1}
        currentPage={1}
        pageSize={10}
        onNavigateByIndex={onNavigateByIndex}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onClose).not.toHaveBeenCalled();
    expect(onNavigateByIndex).not.toHaveBeenCalled();
  });
});
