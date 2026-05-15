import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/context/AuthContext.jsx";

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthContext", () => {
  it("starts with a null user", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it("exposes setUser / triggerUpdate / triggerFlag", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(typeof result.current.setUser).toBe("function");
    expect(typeof result.current.triggerUpdate).toBe("function");
    expect(result.current.triggerFlag).toBe(false);
  });

  it("setUser updates the user value", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.setUser({ name_f: "Jane", user_id: 1 }));
    expect(result.current.user).toEqual({ name_f: "Jane", user_id: 1 });
  });

  it("triggerUpdate toggles triggerFlag", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.triggerFlag).toBe(false);
    act(() => result.current.triggerUpdate());
    expect(result.current.triggerFlag).toBe(true);
    act(() => result.current.triggerUpdate());
    expect(result.current.triggerFlag).toBe(false);
  });

  it("clearing the user sets it back to null", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.setUser({ name_f: "X" }));
    expect(result.current.user).not.toBeNull();
    act(() => result.current.setUser(null));
    expect(result.current.user).toBeNull();
  });
});
