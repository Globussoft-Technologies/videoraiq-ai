/**
 * src/page/user/Streams/CameraPlay/CameraStream.jsx — the JSMpeg-based
 * stream tile rendered by the various Streams pages. It polls
 * window.JSMpeg every 100ms until available, then constructs a
 * Player against `${VITE_SOCKET_URL}/${RtspChannel}`. Maximize
 * button hands the config to setSelectedVideo and opens the modal
 * via UserContext.setStreamModalShow. On unmount it destroys the
 * player and opens a control WebSocket to send 'stop'.
 *
 * Branches we exercise:
 *   - canvas + maximize button render
 *   - maximize click -> setSelectedVideo(config) + setStreamModalShow(true)
 *   - JSMpeg polling initialises the Player once window.JSMpeg appears
 *   - StreamModal mounts only when config.RtspChannel === selectedVideo.RtspChannel
 *   - unmount destroys the player and dispatches a 'stop' over the control
 *     WebSocket
 *
 * Mocks: 4 (StreamModal child, window.JSMpeg, WebSocket, react-icons
 * pass through). Well within the 8 budget.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockSetSelectedVideo = vi.fn();
const mockSetStreamModalShow = vi.fn();

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/StreamModal.jsx",
  () => ({
    default: ({ isOpen, onClose, config }) => (
      <div data-testid="stream-modal" data-open={isOpen ? "1" : "0"}>
        modal:{config?.RtspChannel}
        <button data-testid="modal-close" onClick={onClose}>
          x
        </button>
      </div>
    ),
  })
);

import UserContext from "../../../../../../src/context/UserContext/Context.jsx";
import CameraStream from "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx";

// Track JSMpeg Player instances so we can assert constructor args + destroy.
const playerInstances = [];
class FakeJSMpegPlayer {
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.destroyed = false;
    playerInstances.push(this);
  }
  destroy() {
    this.destroyed = true;
  }
}

// Track control WebSocket sends.
const wsInstances = [];
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    wsInstances.push(this);
  }
  send(payload) {
    this.sent.push(payload);
  }
  close() {
    this.closed = true;
    if (this.onclose) this.onclose({});
  }
  _open() {
    if (this.onopen) this.onopen({});
  }
}

const renderWithCtx = (ui, ctxOverride = {}) => {
  const value = {
    streamModalShow: false,
    setStreamModalShow: mockSetStreamModalShow,
    ...ctxOverride,
  };
  return render(
    <UserContext.Provider value={value}>{ui}</UserContext.Provider>
  );
};

let origWebSocket;
beforeEach(() => {
  mockSetSelectedVideo.mockReset();
  mockSetStreamModalShow.mockReset();
  playerInstances.length = 0;
  wsInstances.length = 0;
  origWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  // isValidSocketUrl in the component requires the resolved URL to start
  // with "ws://"; default test env leaves VITE_SOCKET_URL undefined so we
  // stub a ws:// host explicitly.
  vi.stubEnv("VITE_SOCKET_URL", "ws://stream.test");
  // Pretend JSMpeg has already been injected on window — the component's
  // 100ms polling interval calls initializePlayer which checks window.JSMpeg.
  window.JSMpeg = { Player: FakeJSMpegPlayer };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  globalThis.WebSocket = origWebSocket;
  delete window.JSMpeg;
});

const baseConfig = { RtspChannel: "ch-7" };

describe("Streams/CameraPlay/CameraStream", () => {
  it("renders the canvas + maximize button and clicking maximize sets selectedVideo and opens the modal", () => {
    const { container } = renderWithCtx(
      <CameraStream
        config={baseConfig}
        maxminBtnclass="m-btn"
        maxsize="m-icon"
        minsize="m-icon"
        label="Lobby"
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );

    expect(container.querySelector("canvas")).toBeInTheDocument();
    const btn = container.querySelector("button.m-btn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mockSetSelectedVideo).toHaveBeenCalledWith(baseConfig);
    expect(mockSetStreamModalShow).toHaveBeenCalledWith(true);

    // StreamModal must NOT mount when selectedVideo.RtspChannel != config.RtspChannel.
    expect(screen.queryByTestId("stream-modal")).not.toBeInTheDocument();
  });

  it("mounts StreamModal when the selectedVideo.RtspChannel matches and propagates streamModalShow", () => {
    renderWithCtx(
      <CameraStream
        config={baseConfig}
        maxminBtnclass="m-btn"
        maxsize="m-icon"
        minsize="m-icon"
        label="Lobby"
        selectedVideo={{ RtspChannel: "ch-7" }}
        setSelectedVideo={mockSetSelectedVideo}
      />,
      { streamModalShow: true }
    );

    const modal = screen.getByTestId("stream-modal");
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute("data-open")).toBe("1");
    expect(modal.textContent).toContain("modal:ch-7");

    // Modal onClose hits setStreamModalShow(false).
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(mockSetStreamModalShow).toHaveBeenCalledWith(false);
  });

  it("polls until window.JSMpeg.Player is available, then instantiates one Player against the configured socket URL", () => {
    renderWithCtx(
      <CameraStream
        config={baseConfig}
        maxminBtnclass="m-btn"
        maxsize="m-icon"
        minsize="m-icon"
        label="Lobby"
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );

    // No player yet (interval has not fired).
    expect(playerInstances).toHaveLength(0);

    // First tick of the 100ms polling interval -> initializePlayer runs and
    // since window.JSMpeg.Player is set in beforeEach, the constructor fires.
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(playerInstances).toHaveLength(1);
    // socket URL is `${VITE_SOCKET_URL}/${RtspChannel}`.
    expect(playerInstances[0].url).toBe("ws://stream.test/ch-7");
    expect(playerInstances[0].opts.autoplay).toBe(true);

    // Advance more time and confirm clearInterval inside initializePlayer
    // prevents a second Player from being created.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(playerInstances).toHaveLength(1);
  });

  it("destroys the player and dispatches a 'stop' over the control socket on unmount", () => {
    const { unmount } = renderWithCtx(
      <CameraStream
        config={baseConfig}
        maxminBtnclass="m-btn"
        maxsize="m-icon"
        minsize="m-icon"
        label="Lobby"
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
      />
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(playerInstances).toHaveLength(1);

    unmount();

    // The unmount effect destroys the player and opens a control WebSocket
    // that sends 'stop' once the onopen handler is fired by us.
    expect(playerInstances[0].destroyed).toBe(true);
    expect(wsInstances.length).toBeGreaterThanOrEqual(1);
    const controlWs = wsInstances[wsInstances.length - 1];
    expect(controlWs.url.endsWith("/ch-7")).toBe(true);

    // Simulate the server accepting the connection.
    controlWs._open();
    expect(controlWs.sent).toContain("stop");

    // The component also schedules a 200ms close — advance the timers and
    // confirm the socket is closed without throwing.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(controlWs.closed).toBe(true);
  });
});
