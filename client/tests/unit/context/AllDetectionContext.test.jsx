/**
 * AllDetectionContext fans out three socket channels (camera detection,
 * access logs, attendance logs) into separate state, hydrates the mute
 * preference from the API and persists toggleMute back through it.
 * We mock the SocketContext, the audio assets (via vi.mock), the Audio
 * constructor, and the get/put API modules. AuthProvider supplies the user.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/context/AuthContext.jsx";

const socketState = vi.hoisted(() => ({
  handlers: {},
  on: vi.fn((event, cb) => {
    socketState.handlers[event] = cb;
  }),
  off: vi.fn((event) => {
    delete socketState.handlers[event];
  }),
}));

const useSocketMock = vi.hoisted(() =>
  vi.fn(() => ({
    socket: { on: socketState.on, off: socketState.off },
  }))
);

const fetchLogsSoundMock = vi.hoisted(() => vi.fn());
const updateLogsSoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/context/Sockets/SocketContext", () => ({ useSocket: useSocketMock }));
vi.mock("../../../src/context/Sockets/SocketContext", () => ({
  useSocket: useSocketMock,
}));
vi.mock("@/context/Api/get", () => ({ fetchLogsSound: fetchLogsSoundMock }));
vi.mock("../../../src/context/Api/get", () => ({
  fetchLogsSound: fetchLogsSoundMock,
}));
vi.mock("@/context/Api/put", () => ({ updateLogsSound: updateLogsSoundMock }));
vi.mock("../../../src/context/Api/put", () => ({
  updateLogsSound: updateLogsSoundMock,
}));

// Audio asset imports — Vite returns string URLs in test env, but be explicit.
vi.mock("@/assets/audio/checkin.mp3", () => ({ default: "checkin.mp3" }));
vi.mock("@/assets/audio/checkout.mp3", () => ({ default: "checkout.mp3" }));

const { AllDetectionProvider, useAllDetections } = await import(
  "../../../src/context/Sockets/AllDetectionContext.jsx"
);

const wrapper = ({ children }) => (
  <AuthProvider>
    <AllDetectionProvider>{children}</AllDetectionProvider>
  </AuthProvider>
);

const useCombined = () => ({ auth: useAuth(), det: useAllDetections() });

const audioPlay = vi.fn();
class FakeAudio {
  constructor(src) {
    this.src = src;
  }
  play() {
    audioPlay(this.src);
    return Promise.resolve();
  }
}

beforeEach(() => {
  socketState.handlers = {};
  socketState.on.mockClear();
  socketState.off.mockClear();
  fetchLogsSoundMock.mockReset();
  updateLogsSoundMock.mockReset();
  audioPlay.mockReset();
  globalThis.Audio = FakeAudio;
});

describe("AllDetectionContext", () => {
  it("initial state is empty and muted", () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    const { result } = renderHook(useCombined, { wrapper });
    expect(result.current.det.allDetections).toEqual([]);
    expect(result.current.det.accessAllDetections).toEqual([]);
    expect(result.current.det.attendanceLogs).toEqual([]);
    expect(result.current.det.isMuted).toBe(true);
    expect(typeof result.current.det.toggleMute).toBe("function");
  });

  it("does not subscribe to detection channels before a user is set", () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    renderHook(useCombined, { wrapper });
    // Only subscribed once user.adminId is available
    expect(socketState.on).not.toHaveBeenCalled();
  });

  it("subscribes to the three detection channels once a user lands", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: false } } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => {
      expect(socketState.handlers["cameradetection_admin-1"]).toBeDefined();
      expect(socketState.handlers["accessLogs_admin-1"]).toBeDefined();
      expect(socketState.handlers["attendanceLog_admin-1"]).toBeDefined();
    });
  });

  it("hydrates isMuted from fetchLogsSound (logsSound=true -> unmuted)", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: true } } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(result.current.det.isMuted).toBe(false));
  });

  it("swallows fetchLogsSound errors and leaves the default mute state intact", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchLogsSoundMock.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(fetchLogsSoundMock).toHaveBeenCalled());
    expect(result.current.det.isMuted).toBe(true);
    spy.mockRestore();
  });

  it("prepends new detections, deduping by nvr+camera+incidentType", async () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_admin-1"]).toBeDefined()
    );
    const fire = socketState.handlers["cameradetection_admin-1"];
    act(() => {
      fire({ nvrId: "n1", cameraId: "c1", incidentType: "motion", v: 1 });
      fire({ nvrId: "n1", cameraId: "c2", incidentType: "motion", v: 2 });
      fire({ nvrId: "n1", cameraId: "c1", incidentType: "motion", v: 3 });
    });
    expect(result.current.det.allDetections.length).toBe(2);
    // newest entry for n1/c1/motion is v:3 at index 0
    expect(result.current.det.allDetections[0].v).toBe(3);
    expect(result.current.det.allDetections[1].v).toBe(2);
  });

  it("prepends access logs as-is", async () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() =>
      expect(socketState.handlers["accessLogs_admin-1"]).toBeDefined()
    );
    const fire = socketState.handlers["accessLogs_admin-1"];
    act(() => fire({ id: "log1" }));
    act(() => fire({ id: "log2" }));
    expect(result.current.det.accessAllDetections.map((l) => l.id)).toEqual([
      "log2",
      "log1",
    ]);
  });

  it("does not play audio while muted", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: false } } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() =>
      expect(socketState.handlers["attendanceLog_admin-1"]).toBeDefined()
    );
    act(() =>
      socketState.handlers["attendanceLog_admin-1"]({
        attendance: {
          employee: { _id: "e1" },
          event: { cameraType: "checkin" },
        },
      })
    );
    expect(audioPlay).not.toHaveBeenCalled();
  });

  it("plays the checkin sound on a checkin event when unmuted", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: true } } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(result.current.det.isMuted).toBe(false));
    await waitFor(() =>
      expect(socketState.handlers["attendanceLog_admin-1"]).toBeDefined()
    );
    act(() =>
      socketState.handlers["attendanceLog_admin-1"]({
        attendance: {
          employee: { _id: "e1" },
          event: { cameraType: "checkin" },
        },
      })
    );
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(audioPlay.mock.calls[0][0]).toMatch(/checkin/);
  });

  it("plays the checkout sound on a checkout event when unmuted", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: true } } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(result.current.det.isMuted).toBe(false));
    await waitFor(() =>
      expect(socketState.handlers["attendanceLog_admin-1"]).toBeDefined()
    );
    act(() =>
      socketState.handlers["attendanceLog_admin-1"]({
        attendance: {
          employee: { _id: "e1" },
          event: { cameraType: "checkout" },
        },
      })
    );
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(audioPlay.mock.calls[0][0]).toMatch(/checkout/);
  });

  it("attendance logs dedupe by employee + cameraType, latest wins", async () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() =>
      expect(socketState.handlers["attendanceLog_admin-1"]).toBeDefined()
    );
    const fire = socketState.handlers["attendanceLog_admin-1"];
    act(() => {
      fire({
        attendance: {
          employee: { _id: "e1" },
          event: { cameraType: "checkin" },
        },
        t: 1,
      });
      fire({
        attendance: {
          employee: { _id: "e2" },
          event: { cameraType: "checkin" },
        },
        t: 2,
      });
      fire({
        attendance: {
          employee: { _id: "e1" },
          event: { cameraType: "checkin" },
        },
        t: 3,
      });
    });
    expect(result.current.det.attendanceLogs.length).toBe(2);
    // The newer e1 entry should be at index 0
    expect(result.current.det.attendanceLogs[0].t).toBe(3);
  });

  it("toggleMute persists via updateLogsSound (note: payload inverts isMuted)", async () => {
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: false } } },
    });
    updateLogsSoundMock.mockResolvedValue({});
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(fetchLogsSoundMock).toHaveBeenCalled());
    expect(result.current.det.isMuted).toBe(true);
    await act(async () => {
      await result.current.det.toggleMute();
    });
    expect(result.current.det.isMuted).toBe(false);
    // nextMuted = false -> persisted logsSound = true
    expect(updateLogsSoundMock).toHaveBeenCalledWith(true);
  });

  it("toggleMute keeps the optimistic flip if updateLogsSound rejects", async () => {
    // Product behaviour (AllDetectionContext.jsx): on persistence failure the
    // local mute state is NOT reverted — the user's click is treated as the
    // source of truth for what should be audible right now. The error is
    // logged and swallowed.
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchLogsSoundMock.mockResolvedValue({
      data: { body: { data: { logsSound: false } } },
    });
    updateLogsSoundMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() => expect(fetchLogsSoundMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.det.toggleMute();
    });
    // Optimistic flip stays — initial isMuted was true (logsSound=false),
    // toggleMute flips to false and the failed persistence does not revert.
    expect(result.current.det.isMuted).toBe(false);
    spy.mockRestore();
  });

  it("resetAllDetections clears the camera detection list", async () => {
    fetchLogsSoundMock.mockResolvedValue({ data: { body: { data: {} } } });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ adminId: "admin-1" });
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_admin-1"]).toBeDefined()
    );
    act(() =>
      socketState.handlers["cameradetection_admin-1"]({
        nvrId: "n1",
        cameraId: "c1",
        incidentType: "motion",
      })
    );
    expect(result.current.det.allDetections.length).toBe(1);
    act(() => result.current.det.resetAllDetections());
    expect(result.current.det.allDetections).toEqual([]);
  });
});
