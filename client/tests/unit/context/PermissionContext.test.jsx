/**
 * PermissionContext is wired to the real AuthContext (no mocking) so we can
 * drive the user value via `setUser` and observe `fetchPermissions` reacting
 * to that change. The API call is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/context/AuthContext.jsx";

const getMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/context/Api/get", () => ({
  getAllUsesrPermissions: getMock,
}));

const {
  PermissionProvider,
  usePermissions,
} = await import("../../../src/context/Permission/PermissionContext.jsx");

const wrapper = ({ children }) => (
  <AuthProvider>
    <PermissionProvider>{children}</PermissionProvider>
  </AuthProvider>
);

const useCombined = () => ({ auth: useAuth(), perms: usePermissions() });

beforeEach(() => {
  getMock.mockReset();
});

describe("PermissionContext", () => {
  it("does not fetch when there is no user", async () => {
    getMock.mockResolvedValue({ data: { body: { status: "success", data: [] } } });
    const { result } = renderHook(useCombined, { wrapper });
    await waitFor(() => expect(result.current.perms).toBeDefined());
    expect(getMock).not.toHaveBeenCalled();
    expect(result.current.perms.permissions).toEqual({});
  });

  it("fetches permissions once a user is set and exposes them on success", async () => {
    const permissionConfig = {
      dashboard: { view: true },
      NVR: { view: true, create: true },
    };
    getMock.mockResolvedValue({
      data: { body: { status: "success", data: [{ permissionConfig }] } },
    });

    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.perms.permissions).toEqual(permissionConfig)
    );
    expect(result.current.perms.loading).toBe(false);
  });

  it("falls back to empty permissions when the API rejects", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });
    await waitFor(() => expect(result.current.perms.loading).toBe(false));
    expect(result.current.perms.permissions).toEqual({});
  });

  it("ignores a non-success API response", async () => {
    getMock.mockResolvedValue({
      data: { body: { status: "failed", data: [] } },
    });
    const { result } = renderHook(useCombined, { wrapper });
    await act(async () => {
      result.current.auth.setUser({ user_id: 1 });
    });
    await waitFor(() => expect(result.current.perms.loading).toBe(false));
    expect(result.current.perms.permissions).toEqual({});
  });
});
