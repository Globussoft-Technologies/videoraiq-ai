/**
 * Gap-fills for src/page/user/Streams/CameraPlay/CameraStream.jsx
 *
 * Uncovered lines were 142-148 (requestFullscreen branches) and 151-152
 * (document.exitFullscreen call). The `isFullscreen` state has no setter
 * wired to any UI, so the `if (isFullscreen)` true-branch (142-148) is
 * UNREACHABLE in the current product. We can however hit lines 150-152
 * by seeding `document.fullscreenElement` before the component renders —
 * the initial-render effect with isFullscreen=false enters the else
 * branch and calls document.exitFullscreen().
 *
 * Also covers:
 *   - line 84-87: invalid socket URL warning branch (config without ws://)
 *   - lines 100-104: JSMpeg Player constructor throws -> caught + logged
 *   - lines 47-52: control socket onclose log path
 *   - line 43-45: control socket onerror log path
 *   - line 124-134: beforeunload listener fires closeStream
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockSetSelectedVideo = vi.fn();
const mockSetStreamModalShow = vi.fn();

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/StreamModal.jsx",
  () => ({
    default: () => <div data-testid="stream-modal" />,
  })
);

import UserContext from "../../../../../../src/context/UserContext/Context.jsx";
import CameraStream from "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx";

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    FakeWebSocket.instances.push(this);
  }
  send(p) {
    this.sent.push(p);
  }
  close() {
    this.closed = true;
    if (this.onclose) this.onclose({});
  }
}
FakeWebSocket.instances = [];

let origWebSocket;
let exitFullscreenSpy;

beforeEach(() => {
  mockSetSelectedVideo.mockReset();
  mockSetStreamModalShow.mockReset();
  FakeWebSocket.instances = [];
  origWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  vi.stubEnv("VITE_SOCKET_URL", "ws://stream.test");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  globalThis.WebSocket = origWebSocket;
  delete window.JSMpeg;
  if (exitFullscreenSpy) {
    exitFullscreenSpy.mockRestore();
    exitFullscreenSpy = undefined;
  }
  // Restore document.fullscreenElement.
  if (
    Object.getOwnPropertyDescriptor(document, "fullscreenElement")?.configurable
  ) {
    delete document.fullscreenElement;
  }
});

const renderWithCtx = (ui, ctxOverride = {}) =>
  render(
    <UserContext.Provider
      value={{
        streamModalShow: false,
        setStreamModalShow: mockSetStreamModalShow,
        ...ctxOverride,
      }}
    >
      {ui}
    </UserContext.Provider>
  );

describe("CameraStream gap-fills", () => {
  it("calls document.exitFullscreen on initial render when document.fullscreenElement is truthy (lines 150-152)", () => {
    // Seed an active fullscreen element so the else-branch triggers.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    // jsdom doesn't ship exitFullscreen — define it before spying.
    document.exitFullscreen = () => Promise.resolve();
    exitFullscreenSpy = vi
      .spyOn(document, "exitFullscreen")
      .mockImplementation(() => Promise.resolve());

    renderWithCtx(
      <CameraStream
        config={{ RtspChannel: "ch-1" }}
        maxminBtnclass="m-btn"
        maxsize=""
        minsize=""
        label="L"
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );

    expect(exitFullscreenSpy).toHaveBeenCalled();
  });

  it("warns and bails out of the JSMpeg poll when the socket URL is not ws:// (lines 84-87)", () => {
    // Stub a non-ws URL so isValidSocketUrl returns false.
    vi.stubEnv("VITE_SOCKET_URL", "http://nope.test");
    window.JSMpeg = {
      Player: function () {
        throw new Error("should not construct");
      },
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderWithCtx(
      <CameraStream
        config={{ RtspChannel: "ch-bad" }}
        maxminBtnclass=""
        maxsize=""
        minsize=""
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(warnSpy).toHaveBeenCalledWith("Invalid stream URL");
    warnSpy.mockRestore();
  });

  it("logs and recovers when window.JSMpeg.Player constructor throws (lines 100-104)", () => {
    window.JSMpeg = {
      Player: function () {
        throw new Error("boom");
      },
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithCtx(
      <CameraStream
        config={{ RtspChannel: "ch-err" }}
        maxminBtnclass=""
        maxsize=""
        minsize=""
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(errSpy).toHaveBeenCalledWith(
      "Failed to initialize JSMpeg Player:",
      expect.any(Error)
    );
    errSpy.mockRestore();
  });

  it("beforeunload listener triggers closeStream (lines 124-134)", () => {
    const { unmount } = renderWithCtx(
      <CameraStream
        config={{ RtspChannel: "ch-bu" }}
        maxminBtnclass=""
        maxsize=""
        minsize=""
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );

    // Fire beforeunload — closeStream constructs a control WebSocket.
    window.dispatchEvent(new Event("beforeunload"));
    expect(FakeWebSocket.instances.length).toBeGreaterThan(0);
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    expect(ws.url).toBe("ws://stream.test/ch-bu");

    // onerror handler is wired — call it to exercise lines 43-45.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(typeof ws.onerror).toBe("function");
    ws.onerror({ type: "error" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();

    // onclose handler is wired — call it to exercise lines 47-52.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(typeof ws.onclose).toBe("function");
    ws.onclose({ type: "close" });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    unmount();
  });
});
