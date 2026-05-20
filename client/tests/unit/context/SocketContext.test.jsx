/**
 * SocketContext wires a socket.io-client to the auth user lifecycle. We mock
 * the `io` factory and `getAccessToken`; the real AuthProvider drives the
 * user state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/context/AuthContext.jsx";

const sockets = vi.hoisted(() => ({
  instances: [],
  /** Build a fresh fake socket and remember it on `instances`. */
  create() {
    const handlers = {};
    const sock = {
      on: vi.fn((event, cb) => {
        handlers[event] = cb;
      }),
      disconnect: vi.fn(),
      _fire(event, ...args) {
        handlers[event]?.(...args);
      },
    };
    this.instances.push(sock);
    return sock;
  },
}));

const ioMock = vi.hoisted(() => vi.fn());
vi.mock("socket.io-client", () => ({ io: ioMock }));

const getAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock("@/utils/getAccessToken", () => ({ default: getAccessTokenMock }));

const { SocketProvider, useSocket } = await import(
  "../../../src/context/Sockets/SocketContext.jsx"
);

const wrapper = ({ children }) => (
  <AuthProvider>
    <SocketProvider>{children}</SocketProvider>
  </AuthProvider>
);

const useCombined = () => ({ auth: useAuth(), socket: useSocket() });

beforeEach(() => {
  sockets.instances.length = 0;
  ioMock.mockReset();
  ioMock.mockImplementation(() => sockets.create());
  getAccessTokenMock.mockReset();
});

describe("SocketContext", () => {
  it("does not create a socket when there is no user", async () => {
    getAccessTokenMock.mockReturnValue("tok");
    const { result } = renderHook(useCombined, { wrapper });
    expect(ioMock).not.toHaveBeenCalled();
    expect(result.current.socket.connected).toBe(false);
  });

  it("does not create a socket when there is no token, even with a user", async () => {
    getAccessTokenMock.mockReturnValue(null);
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });
    expect(ioMock).not.toHaveBeenCalled();
    expect(result.current.socket.connected).toBe(false);
  });

  it("creates a socket once user + token are present and flips connected on connect", async () => {
    getAccessTokenMock.mockReturnValue("tok");
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));
    const sock = sockets.instances[0];
    act(() => sock._fire("connect"));
    await waitFor(() => expect(result.current.socket.connected).toBe(true));
  });

  it("disconnects the socket when the user is cleared", async () => {
    getAccessTokenMock.mockReturnValue("tok");
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));
    const sock = sockets.instances[0];

    await act(async () => {
      result.current.auth.setUser(null);
    });
    expect(sock.disconnect).toHaveBeenCalled();
    expect(result.current.socket.connected).toBe(false);
  });

  it("changeCurrentVideoRef / resetCurrentVideoRef update the ref", async () => {
    getAccessTokenMock.mockReturnValue("tok");
    const { result } = renderHook(useCombined, { wrapper });
    const ref = { id: "v1" };
    act(() => result.current.socket.changeCurrentVideoRef(ref));
    expect(result.current.socket.currentVideoRef.current).toBe(ref);
    act(() => result.current.socket.resetCurrentVideoRef());
    expect(result.current.socket.currentVideoRef.current).toBeNull();
  });
});
