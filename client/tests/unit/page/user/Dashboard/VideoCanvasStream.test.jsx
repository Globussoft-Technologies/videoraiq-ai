/**
 * Round 82: cover Dashboard/VideoCanvasStream.jsx — the HLS-video tile the
 * dashboard renders inside the Camera View section. The component:
 *   - resolves the playable URL via useMemo: when `VITE_LOCAL_SETUP === 'true'`
 *     the raw hlsUrl[0] is passed through; otherwise it is prefixed with
 *     `VITE_STREAM_URL`. The hook fires useHlsPlayer with the resolved URL.
 *   - shows a black loading overlay while isWaiting (initial when
 *     streamIndex > 0) or isLoading is true; once <video onCanPlay> fires
 *     the loader is removed.
 *   - surfaces an "Unable to load stream" pane when the hook's onError
 *     callback is invoked (the spinner disappears, the custom message is
 *     surfaced).
 *   - the in-tile "maximize" button (and the wrapper onDoubleClick path)
 *     call setSelectedVideo({ cameraId, config }) + setStreamModalShow(true).
 *     Both are disabled while the stream is still waiting/loading/erroring.
 *   - the label overlay renders as `Camera Name :<label>` when label prop
 *     is truthy; the StreamModal child is only mounted when
 *     streamModalShow && selectedVideo?.cameraId === cameraId.
 *   - the parent-supplied onInteractionDisabledChange is fired with the
 *     current (isWaiting || isLoading || hasError) bool whenever those
 *     change.
 *
 * Mocks (5):
 *   1. @/hooks/useHlsPlayer — capture the last opts so a test can drive
 *      the onError callback synchronously, no Hls.js import.
 *   2. ../Streams/CameraStreamsModal/CameraStreamWithDetection — replaced
 *      by a tiny marker so we don't pull canvas-2d drawing into the graph.
 *   3. ../Streams/CameraStreamsModal/StreamModal — marker that captures
 *      streamUrl / cameraId / isOpen so we can assert mount conditions.
 *   4. @/context/UserContext/Context — minimal default export (UserContext)
 *      so React.useContext does not blow up under jsdom. The component
 *      only imports the symbol; it does not actually consume any values.
 *   5. @/context/Sockets/DetectionContext — useDetection no-op stub. Same
 *      "imported-but-not-used" situation.
 *
 * Well under the 8-mock cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// --- Mocks ---------------------------------------------------------------

// Capture the hook's last opts so tests can drive onStarted / onError. The
// hook is otherwise a no-op (it would attempt to wire Hls.js to a jsdom
// <video> element).
let lastHlsOpts = null;
let lastHlsSrc = null;
vi.mock("@/hooks/useHlsPlayer", () => ({
  default: (_videoRef, src, opts = {}) => {
    lastHlsSrc = src;
    lastHlsOpts = opts;
    return { current: null };
  },
}));

// Replace the canvas-2d detection overlay child with a marker.
vi.mock(
  "../../../../../src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx",
  () => ({
    default: ({ detections = [] }) =>
      React.createElement("div", {
        "data-testid": "detection-overlay",
        "data-count": Array.isArray(detections) ? detections.length : 0,
      }),
  })
);

// Replace the StreamModal heavy child with a marker that captures the
// mount-time props.
const streamModalProps = vi.hoisted(() => ({ value: null }));
vi.mock(
  "../../../../../src/page/user/Streams/CameraStreamsModal/StreamModal.jsx",
  () => ({
    default: (props) => {
      streamModalProps.value = props;
      return React.createElement("div", {
        "data-testid": "stream-modal",
        "data-camera-id": props.cameraId,
        "data-is-open": String(!!props.isOpen),
      });
    },
  })
);

// UserContext is only imported (for useContext); the component never
// destructures it. Provide a tiny default-export object so the import
// resolves.
vi.mock("@/context/UserContext/Context", () => ({
  default: React.createContext({}),
}));

// useDetection is imported but never read by the component on the paths
// we exercise. Stub it.
vi.mock("@/context/Sockets/DetectionContext", () => ({
  useDetection: () => ({}),
}));

import VideoCanvasStream from "@/page/user/Dashboard/VideoCanvasStream.jsx";

beforeEach(() => {
  lastHlsOpts = null;
  lastHlsSrc = null;
  streamModalProps.value = null;
});

describe("Dashboard/VideoCanvasStream", () => {
  it("renders the initial loading overlay, prefixes hlsUrl with VITE_STREAM_URL, hides the loader on <video> onCanPlay, and surfaces the hook onError pane", () => {
    const setSelectedVideo = vi.fn();
    const setStreamModalShow = vi.fn();
    const onInteractionDisabledChange = vi.fn();

    const { container } = render(
      <VideoCanvasStream
        config={{ id: "cfg-1" }}
        hlsUrl={["/streams/cam-1.m3u8"]}
        cameraId="cam-1"
        label="Lobby Cam"
        selectedVideo={null}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={[]}
        streamModalShow={false}
        setStreamModalShow={setStreamModalShow}
        polygonPoints={[]}
        streamIndex={0}
        onInteractionDisabledChange={onInteractionDisabledChange}
      />
    );

    // VITE_STREAM_URL / VITE_LOCAL_SETUP default to undefined in jsdom env,
    // so memoizedUrl falls into the "else" branch (baseUrl + raw). With
    // baseUrl=undefined the prefix is "undefined" — still proves the
    // non-local-setup branch was taken (raw URL not passed through).
    expect(lastHlsSrc).toBe("undefined/streams/cam-1.m3u8");
    expect(typeof lastHlsOpts.onError).toBe("function");
    expect(lastHlsOpts.autoPlay).toBe(true);
    // streamIndex=0 -> startDelayMs=0; enabled because streamModalShow=false.
    expect(lastHlsOpts.startDelayMs).toBe(0);
    expect(lastHlsOpts.enabled).toBe(true);

    // Initial render: loader present (isLoading=true), no error pane.
    expect(container.querySelector(".loader")).not.toBeNull();
    expect(
      screen.queryByText(/Unable to load stream/i)
    ).not.toBeInTheDocument();

    // Detection overlay child mounted with detections=polygonPoints (empty).
    const overlay = screen.getByTestId("detection-overlay");
    expect(overlay.getAttribute("data-count")).toBe("0");

    // Label overlay renders the documented "Camera Name :" prefix.
    expect(screen.getByText(/Camera Name :Lobby Cam/)).toBeInTheDocument();

    // StreamModal is NOT mounted yet (streamModalShow=false).
    expect(screen.queryByTestId("stream-modal")).not.toBeInTheDocument();

    // Fire <video> onCanPlay -> isLoading=false -> loader removed.
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.canPlay(video);
    expect(container.querySelector(".loader")).toBeNull();
    expect(
      screen.queryByText(/Unable to load stream/i)
    ).not.toBeInTheDocument();

    // Drive the hook's onError -> error pane surfaces with the custom msg,
    // loader stays hidden.
    act(() => {
      lastHlsOpts.onError("Stream not found (404)");
    });
    expect(container.querySelector(".loader")).toBeNull();
    expect(screen.getByText(/Unable to load stream/i)).toBeInTheDocument();
    expect(screen.getByText("Stream not found (404)")).toBeInTheDocument();

    // onInteractionDisabledChange was fired with the latest bool state
    // (errored stream -> disabled = true).
    expect(onInteractionDisabledChange).toHaveBeenCalled();
    const lastDisabledArg =
      onInteractionDisabledChange.mock.calls[
        onInteractionDisabledChange.mock.calls.length - 1
      ][0];
    expect(lastDisabledArg).toBe(true);
  });

  it("maximize button + double-click open the modal (setSelectedVideo + setStreamModalShow); StreamModal mounts when streamModalShow + selectedVideo.cameraId matches", () => {
    const setSelectedVideo = vi.fn();
    const setStreamModalShow = vi.fn();

    // Phase 1: closed modal — clicking the maximize button calls both setters
    // with the documented payload.
    const { container, rerender } = render(
      <VideoCanvasStream
        config={{ id: "cfg-1" }}
        hlsUrl={["/streams/cam-1.m3u8"]}
        cameraId="cam-1"
        label=""
        selectedVideo={null}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={[{ id: "ch-1" }]}
        hideconnection={true}
        streamModalShow={false}
        setStreamModalShow={setStreamModalShow}
        polygonPoints={[]}
        streamIndex={0}
        maxminBtnclass="maxmin-btn"
        maxsize="size-7"
      />
    );

    // Clear isLoading by firing canPlay so the maximize button is enabled
    // (it's disabled while isWaiting || isLoading || hasError).
    const video = container.querySelector("video");
    fireEvent.canPlay(video);

    // The maximize button is the only <button> inside the tile in the
    // non-mini render path.
    const maximizeBtn = container.querySelector("button");
    expect(maximizeBtn).not.toBeNull();
    expect(maximizeBtn.disabled).toBe(false);

    fireEvent.click(maximizeBtn);
    expect(setSelectedVideo).toHaveBeenCalledTimes(1);
    expect(setSelectedVideo).toHaveBeenCalledWith({
      cameraId: "cam-1",
      config: { id: "cfg-1" },
    });
    expect(setStreamModalShow).toHaveBeenCalledTimes(1);
    expect(setStreamModalShow).toHaveBeenCalledWith(true);

    // Double-clicking the wrapper drives the same handler.
    setSelectedVideo.mockClear();
    setStreamModalShow.mockClear();
    const wrapper = container.firstChild; // the ref=containerRef div
    fireEvent.doubleClick(wrapper);
    expect(setSelectedVideo).toHaveBeenCalledWith({
      cameraId: "cam-1",
      config: { id: "cfg-1" },
    });
    expect(setStreamModalShow).toHaveBeenCalledWith(true);

    // Phase 2: modal-open AND selectedVideo.cameraId matches -> StreamModal
    // mounts. (memoizedUrl is recomputed; cameraChannels + hideconnection
    // are forwarded.)
    rerender(
      <VideoCanvasStream
        config={{ id: "cfg-1" }}
        hlsUrl={["/streams/cam-1.m3u8"]}
        cameraId="cam-1"
        label=""
        selectedVideo={{ cameraId: "cam-1" }}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={[{ id: "ch-1" }]}
        hideconnection={true}
        streamModalShow={true}
        setStreamModalShow={setStreamModalShow}
        polygonPoints={[]}
        streamIndex={0}
        maxminBtnclass="maxmin-btn"
        maxsize="size-7"
      />
    );
    const modal = screen.getByTestId("stream-modal");
    expect(modal.getAttribute("data-camera-id")).toBe("cam-1");
    expect(modal.getAttribute("data-is-open")).toBe("true");
    expect(streamModalProps.value.cameraChannels).toEqual([{ id: "ch-1" }]);
    expect(streamModalProps.value.hideconnection).toBe(true);

    // Phase 3: switching to a different selectedVideo.cameraId hides the
    // StreamModal (the inline guard `selectedVideo?.cameraId === cameraId`
    // is false).
    rerender(
      <VideoCanvasStream
        config={{ id: "cfg-1" }}
        hlsUrl={["/streams/cam-1.m3u8"]}
        cameraId="cam-1"
        label=""
        selectedVideo={{ cameraId: "other-cam" }}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={[{ id: "ch-1" }]}
        streamModalShow={true}
        setStreamModalShow={setStreamModalShow}
        polygonPoints={[]}
        streamIndex={0}
        maxminBtnclass="maxmin-btn"
        maxsize="size-7"
      />
    );
    expect(screen.queryByTestId("stream-modal")).not.toBeInTheDocument();

    // Also: when streamModalShow is true and we're NOT the matching camera,
    // the hook's `enabled` is `selectedVideo.cameraId === cameraId` => false.
    // Re-mount through rerender so the latest opts capture the gate.
    expect(lastHlsOpts.enabled).toBe(false);
  });

  it("isMini=true suppresses the maximize button; the label overlay uses the small text class", () => {
    const { container } = render(
      <VideoCanvasStream
        config={{ id: "cfg-1" }}
        hlsUrl={["/streams/cam-1.m3u8"]}
        cameraId="cam-1"
        label="Mini Cam"
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
        streamModalShow={false}
        setStreamModalShow={vi.fn()}
        polygonPoints={[]}
        streamIndex={0}
        isMini={true}
      />
    );

    // No maximize button rendered in the mini-tile path.
    expect(container.querySelector("button")).toBeNull();

    // Label still renders, but the surrounding wrapper uses the mini text
    // class (`text-[10px]` per the documented branch).
    const label = screen.getByText(/Camera Name :Mini Cam/);
    expect(label.className).toMatch(/text-\[10px\]/);
  });
});
