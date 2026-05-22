/**
 * src/page/user/Playback/components/VideoSection.jsx — thin wrapper that
 * renders a single PlaybackVideo, forwarding every relevant prop and wiring
 * the zoom in/out buttons to handleSmartZoom('in' | 'out').
 *
 * Mocks (1):
 *   1. ../PlaybackVideo — the real component pulls in HLS / contexts. Stub
 *      with a passthrough that captures the props it received.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock(
  "../../../../../../src/page/user/Playback/PlaybackVideo",
  () => ({
    default: (props) => (
      <div
        data-testid="playback-video"
        data-src={props.src ?? ""}
        data-thumb={props.thumbnailSrc ?? ""}
        data-in-modal={String(!!props.isInModal)}
        data-nvr={props.nvrId ?? ""}
        data-camera={props.cameraId ?? ""}
        data-channel={props.channel ?? ""}
        data-zoom={String(props.zoomLevel ?? "")}
        data-loading={String(!!props.isLoading)}
        data-start={
          props.selectedDate ? String(props.selectedDate) : ""
        }
        data-end={
          props.selectedEndDate ? String(props.selectedEndDate) : ""
        }
      >
        <button
          data-testid="zoom-in"
          onClick={() => props.onZoomIn?.()}
        >
          in
        </button>
        <button
          data-testid="zoom-out"
          onClick={() => props.onZoomOut?.()}
        >
          out
        </button>
        <button
          data-testid="retry"
          onClick={() => props.onPlaybackUrlRetry?.()}
        >
          retry
        </button>
        <button
          data-testid="range"
          onClick={() =>
            props.onTimeRangeSelect?.("2024-01-01", "2024-01-02")
          }
        >
          range
        </button>
      </div>
    ),
  })
);

const { default: VideoSection } = await import(
  "../../../../../../src/page/user/Playback/components/VideoSection.jsx"
);

const baseProps = {
  isLoading: false,
  videoRef: { current: null },
  playbackUrl: "https://stream.test/playback.m3u8",
  handleSmartZoom: vi.fn(),
  timelineZoomLevel: 2,
  dateRange: { start: "2024-01-01T00:00:00Z", end: "2024-01-02T00:00:00Z" },
  handleTimeRangeSelect: vi.fn(),
  selectedNVRId: "nvr-1",
  selectedCameraId: "cam-1",
  selectedCamera: { streamId: "stream-1" },
  zoomLevel: 1.5,
  onPlaybackUrlRetry: vi.fn(),
};

describe("VideoSection", () => {
  it("renders a single PlaybackVideo child", () => {
    render(<VideoSection {...baseProps} />);
    expect(screen.getByTestId("playback-video")).toBeInTheDocument();
  });

  it("forwards src, thumbnail, isInModal, nvrId, cameraId, channel", () => {
    render(<VideoSection {...baseProps} />);
    const el = screen.getByTestId("playback-video");
    expect(el.getAttribute("data-src")).toBe(baseProps.playbackUrl);
    expect(el.getAttribute("data-thumb")).toBe("");
    expect(el.getAttribute("data-in-modal")).toBe("true");
    expect(el.getAttribute("data-nvr")).toBe("nvr-1");
    expect(el.getAttribute("data-camera")).toBe("cam-1");
    expect(el.getAttribute("data-channel")).toBe("stream-1");
  });

  it("forwards zoomLevel and isLoading", () => {
    render(<VideoSection {...baseProps} isLoading={true} zoomLevel={3} />);
    const el = screen.getByTestId("playback-video");
    expect(el.getAttribute("data-zoom")).toBe("3");
    expect(el.getAttribute("data-loading")).toBe("true");
  });

  it("forwards dateRange.start and dateRange.end as selectedDate / selectedEndDate", () => {
    render(<VideoSection {...baseProps} />);
    const el = screen.getByTestId("playback-video");
    expect(el.getAttribute("data-start")).toMatch(/2024-01-01/);
    expect(el.getAttribute("data-end")).toMatch(/2024-01-02/);
  });

  it("does not crash when selectedCamera is null (optional chaining)", () => {
    render(<VideoSection {...baseProps} selectedCamera={null} />);
    const el = screen.getByTestId("playback-video");
    expect(el.getAttribute("data-channel")).toBe("");
  });

  it("onZoomIn → handleSmartZoom('in')", () => {
    const handleSmartZoom = vi.fn();
    render(
      <VideoSection {...baseProps} handleSmartZoom={handleSmartZoom} />
    );
    fireEvent.click(screen.getByTestId("zoom-in"));
    expect(handleSmartZoom).toHaveBeenCalledWith("in");
  });

  it("onZoomOut → handleSmartZoom('out')", () => {
    const handleSmartZoom = vi.fn();
    render(
      <VideoSection {...baseProps} handleSmartZoom={handleSmartZoom} />
    );
    fireEvent.click(screen.getByTestId("zoom-out"));
    expect(handleSmartZoom).toHaveBeenCalledWith("out");
  });

  it("onTimeRangeSelect forwards through to handleTimeRangeSelect", () => {
    const handleTimeRangeSelect = vi.fn();
    render(
      <VideoSection
        {...baseProps}
        handleTimeRangeSelect={handleTimeRangeSelect}
      />
    );
    fireEvent.click(screen.getByTestId("range"));
    expect(handleTimeRangeSelect).toHaveBeenCalledWith(
      "2024-01-01",
      "2024-01-02"
    );
  });

  it("onPlaybackUrlRetry forwards through to the parent retry callback", () => {
    const onPlaybackUrlRetry = vi.fn();
    render(
      <VideoSection
        {...baseProps}
        onPlaybackUrlRetry={onPlaybackUrlRetry}
      />
    );
    fireEvent.click(screen.getByTestId("retry"));
    expect(onPlaybackUrlRetry).toHaveBeenCalledTimes(1);
  });
});
