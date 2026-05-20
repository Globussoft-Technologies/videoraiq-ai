/**
 * DetectionContext multiplexes a per-camera socket subscription into a set of
 * incident-type-specific buckets (person count, motion, generic object,
 * line crossing, unauthorised access) plus a rolling "all detections" log.
 * We mock `useSocket` and drive the registered listener directly to exercise
 * each branch of the switch statement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

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
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))
);

vi.mock("@/context/Sockets/SocketContext", () => ({ useSocket: useSocketMock }));
// The DetectionContext module imports via a relative path, so also alias that.
vi.mock("../../../src/context/Sockets/SocketContext", () => ({
  useSocket: useSocketMock,
}));

const { DetectionProvider, useDetection } = await import(
  "../../../src/context/Sockets/DetectionContext.jsx"
);

const wrapper = ({ children }) => <DetectionProvider>{children}</DetectionProvider>;

beforeEach(() => {
  socketState.handlers = {};
  socketState.on.mockClear();
  socketState.off.mockClear();
});

describe("DetectionContext", () => {
  it("exposes the expected initial value shape", () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    expect(result.current.personCounts).toEqual([]);
    expect(result.current.motionDetections).toEqual([]);
    expect(result.current.objectDetections).toEqual([]);
    expect(result.current.allDetections).toEqual([]);
    expect(result.current.lineCrossing).toEqual([]);
    expect(result.current.unauthorizedAccess).toEqual([]);
    expect(result.current.currentConnection).toEqual({ nvrId: null, cameraId: null });
    expect(typeof result.current.updateConnection).toBe("function");
    expect(typeof result.current.reSetDetectionValue).toBe("function");
  });

  it("does not subscribe to any socket event before updateConnection", () => {
    renderHook(() => useDetection(), { wrapper });
    expect(socketState.on).not.toHaveBeenCalled();
  });

  it("updateConnection stores nvrId/cameraId and subscribes to the camera channel", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    expect(result.current.currentConnection).toEqual({ nvrId: "nvr-1", cameraId: "cam-2" });
    await waitFor(() => {
      expect(socketState.on).toHaveBeenCalledWith(
        "cameradetection_nvr-1_cam-2",
        expect.any(Function)
      );
    });
  });

  it("routes a countPersons detection into personCounts and allDetections", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const payload = { incidentType: "countPersons", count: 5 };
    act(() => socketState.handlers["cameradetection_nvr-1_cam-2"](payload));
    expect(result.current.personCounts).toEqual(payload);
    expect(result.current.allDetections[0]).toEqual(payload);
  });

  it("routes motionDetection into motionDetections", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const payload = { incidentType: "motionDetection", area: "lobby" };
    act(() => socketState.handlers["cameradetection_nvr-1_cam-2"](payload));
    expect(result.current.motionDetections).toEqual(payload);
  });

  it("routes genericObjectDetection into objectDetections", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const payload = { incidentType: "genericObjectDetection", objects: ["bag"] };
    act(() => socketState.handlers["cameradetection_nvr-1_cam-2"](payload));
    expect(result.current.objectDetections).toEqual(payload);
  });

  it("routes lineCrossing into lineCrossing", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const payload = { incidentType: "lineCrossing", direction: "in" };
    act(() => socketState.handlers["cameradetection_nvr-1_cam-2"](payload));
    expect(result.current.lineCrossing).toEqual(payload);
  });

  it("routes unauthorizedAccess into unauthorizedAccess", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const payload = { incidentType: "unauthorizedAccess", user: "x" };
    act(() => socketState.handlers["cameradetection_nvr-1_cam-2"](payload));
    expect(result.current.unauthorizedAccess).toEqual(payload);
  });

  it("caps allDetections at 100 entries (latest first)", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    const fire = socketState.handlers["cameradetection_nvr-1_cam-2"];
    act(() => {
      for (let i = 0; i < 105; i++) {
        fire({ incidentType: "countPersons", i });
      }
    });
    expect(result.current.allDetections.length).toBe(100);
    // newest first: i=104 is at index 0
    expect(result.current.allDetections[0].i).toBe(104);
  });

  it("reSetDetectionValue clears all buckets", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.handlers["cameradetection_nvr-1_cam-2"]).toBeDefined()
    );
    act(() => {
      socketState.handlers["cameradetection_nvr-1_cam-2"]({
        incidentType: "countPersons",
        count: 3,
      });
    });
    expect(result.current.personCounts).toEqual({ incidentType: "countPersons", count: 3 });
    act(() => result.current.reSetDetectionValue());
    expect(result.current.personCounts).toEqual([]);
    expect(result.current.motionDetections).toEqual([]);
    expect(result.current.objectDetections).toEqual([]);
    expect(result.current.allDetections).toEqual([]);
    expect(result.current.lineCrossing).toEqual([]);
    expect(result.current.unauthorizedAccess).toEqual([]);
  });

  it("unsubscribes the previous handler when the connection changes", async () => {
    const { result } = renderHook(() => useDetection(), { wrapper });
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-2");
    });
    await waitFor(() =>
      expect(socketState.on).toHaveBeenCalledWith(
        "cameradetection_nvr-1_cam-2",
        expect.any(Function)
      )
    );
    socketState.off.mockClear();
    await act(async () => {
      result.current.updateConnection("nvr-1", "cam-3");
    });
    await waitFor(() => {
      expect(socketState.off).toHaveBeenCalledWith(
        "cameradetection_nvr-1_cam-2",
        expect.any(Function)
      );
    });
  });
});
