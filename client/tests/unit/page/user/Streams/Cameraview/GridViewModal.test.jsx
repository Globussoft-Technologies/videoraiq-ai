/**
 * Round 65: cover Streams/Cameraview/GridViewModal.jsx — the
 * fullscreen "Live Monitoring" multi-camera grid modal. Pure
 * presentational with three pieces of behavior we exercise:
 *
 *   1. isOpen=false short-circuits the Dialog and renders nothing.
 *   2. isOpen=true with a list of cameraChannels formats each channel
 *      into a tile (label + nested rtspChannels[1].id pulled into the
 *      camera config), paginates by selectedGrid.perPage, renders the
 *      header "Live Monitoring - <N> Channels" string, the bottom-HUD
 *      page indicator, and the per-page dot navigation.
 *   3. ArrowRight / ArrowLeft window key events drive pagination; the
 *      Close button calls onOpenChange(false).
 *
 * The Dialog from @/components/ui/dialog is stubbed so we can render
 * the modal inline without portals, and CameraStreamDisplay is stubbed
 * because its real implementation pulls in VideoCanvasStream + four
 * contexts. document.fullscreenElement / requestFullscreen are also
 * stubbed (they're a side-effect of opening; we just need them to be
 * no-ops here).
 *
 * Mock budget: 2 (Dialog, CameraStreamDisplay). The mynaui_grid svg
 * import is handled by Vite's default asset loader so no mock needed.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, onOpenChange, children }) =>
    open ? (
      <div data-testid="dialog" data-open="true">
        {children}
      </div>
    ) : null;
  const DialogContent = ({ children, closeBtn: _closeBtn, ...rest }) => (
    <div data-testid="dialog-content" {...rest}>
      {children}
    </div>
  );
  const DialogHeader = ({ children }) => <div>{children}</div>;
  const DialogTitle = ({ children }) => <div>{children}</div>;
  return { Dialog, DialogContent, DialogHeader, DialogTitle };
});

vi.mock(
  "../../../../../../src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx",
  () => ({
    default: ({ camera, isMini, streamIndex }) => (
      <div data-testid="stream-tile">
        {`${streamIndex}:${camera.label}:${camera.config.RtspChannel}:${
          isMini ? "mini" : "full"
        }`}
      </div>
    ),
  })
);

import GridViewModal from "../../../../../../src/page/user/Streams/Cameraview/GridViewModal.jsx";

// Build a list of N channels with the nested shape GridViewModal expects.
const buildChannels = (n) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `cam-${i + 1}`,
    name: `Cam ${i + 1}`,
    customName: i === 0 ? "Lobby" : null,
    channelId: i + 1,
    streamingUrl: `http://x/${i}.m3u8`,
    rtspChannels: [{ id: "main" }, { id: `sub-${i}` }],
    nvrId: {
      _id: "nvr-1",
      ip: "10.0.0.1",
      rtspPort: 554,
      username: "u",
      password: "p",
    },
  }));

const gridOptions = [
  { id: "g2", perPage: 2, cols: 2 },
  { id: "g16", perPage: 16, cols: 4 },
];

beforeEach(() => {
  // Stub the fullscreen API the modal pokes on open/close so jsdom
  // doesn't blow up. They're side-effectful only.
  document.documentElement.requestFullscreen = vi
    .fn()
    .mockResolvedValue(undefined);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
});

describe("Streams/Cameraview/GridViewModal", () => {
  it("returns nothing when isOpen=false", () => {
    const { container } = render(
      <GridViewModal
        isOpen={false}
        onOpenChange={() => {}}
        cameraChannels={buildChannels(2)}
        selectedGrid="g2"
        gridOptions={gridOptions}
        selectedVideo={null}
        setSelectedVideo={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("formats channels, slices to perPage, and shows header + page indicator", () => {
    render(
      <GridViewModal
        isOpen={true}
        onOpenChange={() => {}}
        cameraChannels={buildChannels(5)}
        selectedGrid="g2"
        gridOptions={gridOptions}
        selectedVideo={null}
        setSelectedVideo={() => {}}
      />
    );

    // header "Live Monitoring - 5 Channels"
    expect(
      screen.getByText(/Live Monitoring - 5 Channels/i)
    ).toBeInTheDocument();

    // perPage = 2 -> first page should render exactly 2 tiles
    const tiles = screen.getAllByTestId("stream-tile");
    expect(tiles).toHaveLength(2);
    // customName falls back to name for entries without one
    expect(tiles[0].textContent).toMatch(/0:Lobby:sub-0:mini/);
    expect(tiles[1].textContent).toMatch(/1:Cam 2:sub-1:mini/);

    // bottom HUD: pagination indicator "[01/03]" (ceil(5/2)=3)
    expect(screen.getByText(/01\/03/)).toBeInTheDocument();
  });

  it("advances to the next page on ArrowRight and closes on Close click", () => {
    const onOpenChange = vi.fn();
    render(
      <GridViewModal
        isOpen={true}
        onOpenChange={onOpenChange}
        cameraChannels={buildChannels(5)}
        selectedGrid="g2"
        gridOptions={gridOptions}
        selectedVideo={null}
        setSelectedVideo={() => {}}
      />
    );

    // Page 1 currently shows Lobby + Cam 2
    expect(screen.getAllByTestId("stream-tile")).toHaveLength(2);

    // Press ArrowRight at the window level -> page 2 should show Cam 3, Cam 4
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const afterRight = screen.getAllByTestId("stream-tile");
    expect(afterRight).toHaveLength(2);
    expect(afterRight[0].textContent).toMatch(/Cam 3/);
    expect(afterRight[1].textContent).toMatch(/Cam 4/);
    expect(screen.getByText(/02\/03/)).toBeInTheDocument();

    // ArrowLeft brings us back
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText(/01\/03/)).toBeInTheDocument();

    // Close button (aria-label="Close") fires onOpenChange(false)
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to default 16/4 grid when selectedGrid does not match any option", () => {
    render(
      <GridViewModal
        isOpen={true}
        onOpenChange={() => {}}
        cameraChannels={buildChannels(3)}
        selectedGrid="missing-id"
        gridOptions={gridOptions}
        selectedVideo={null}
        setSelectedVideo={() => {}}
      />
    );
    // ceil(3/16)=1 -> only one page, all 3 tiles render on this page
    expect(screen.getAllByTestId("stream-tile")).toHaveLength(3);
    // totalPages=1 -> the HUD pagination strip is suppressed
    expect(screen.queryByText(/01\/01/)).not.toBeInTheDocument();
  });
});
