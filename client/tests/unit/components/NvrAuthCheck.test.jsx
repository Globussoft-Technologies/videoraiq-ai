/**
 * NvrAuthCheck — useEffect-driven guard that calls checkNVRsPresent() and
 * navigates to /nvr-settings when there are no NVRs and the user has NVR.view
 * permission. We mock react-router's useNavigate, jwt-decode, getAccessToken,
 * the API, and the PermissionContext.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

const jwtDecodeMock = vi.hoisted(() => vi.fn());
vi.mock("jwt-decode", () => ({ jwtDecode: jwtDecodeMock }));

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/getAccessToken", () => ({ default: tokenMock }));

const checkNVRsPresentMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/components/Auth/Api/get", () => ({
  checkNVRsPresent: checkNVRsPresentMock,
}));

const usePermissionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: usePermissionsMock,
}));

const { NvrAuthCheck } = await import(
  "../../../src/components/Auth/NvrAuthCheck.jsx"
);

beforeEach(() => {
  navigateMock.mockReset();
  jwtDecodeMock.mockReset();
  tokenMock.mockReset();
  checkNVRsPresentMock.mockReset();
  usePermissionsMock.mockReset();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("NvrAuthCheck", () => {
  it("renders its children inside a div", () => {
    tokenMock.mockReturnValue(null);
    usePermissionsMock.mockReturnValue({ permissions: {} });
    const { getByText } = render(
      <NvrAuthCheck>
        <span>child-content</span>
      </NvrAuthCheck>
    );
    expect(getByText("child-content")).toBeInTheDocument();
  });

  it("no token => no API call and no navigation", async () => {
    tokenMock.mockReturnValue(null);
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await flush();
    expect(checkNVRsPresentMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("invalid token (jwt-decode throws) => bails out silently", async () => {
    tokenMock.mockReturnValue("garbage");
    jwtDecodeMock.mockImplementation(() => {
      throw new Error("bad jwt");
    });
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await flush();
    expect(checkNVRsPresentMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("decoded token without user_id => no API call", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({});
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await flush();
    expect(checkNVRsPresentMock).not.toHaveBeenCalled();
  });

  it("user has NVR perm and zero NVRs => navigates to /nvr-settings", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({ user_id: 1 });
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    checkNVRsPresentMock.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/nvr-settings")
    );
  });

  it("user has NVR perm and >0 NVRs => no navigation", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({ user_id: 1 });
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    checkNVRsPresentMock.mockResolvedValue({
      data: { body: { data: { nvrs: [{ id: "x" }] } } },
    });
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await waitFor(() => expect(checkNVRsPresentMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("zero NVRs but no NVR.view permission => no navigation", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({ user_id: 1 });
    usePermissionsMock.mockReturnValue({ permissions: {} });
    checkNVRsPresentMock.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await waitFor(() => expect(checkNVRsPresentMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("API rejects + NVR.view perm => navigates to /nvr-settings", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({ user_id: 1 });
    usePermissionsMock.mockReturnValue({ permissions: { NVR: { view: true } } });
    checkNVRsPresentMock.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/nvr-settings")
    );
    errSpy.mockRestore();
  });

  it("API rejects without NVR.view perm => no navigation", async () => {
    tokenMock.mockReturnValue("tok");
    jwtDecodeMock.mockReturnValue({ user_id: 1 });
    usePermissionsMock.mockReturnValue({ permissions: {} });
    checkNVRsPresentMock.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NvrAuthCheck>
        <span>x</span>
      </NvrAuthCheck>
    );
    await waitFor(() => expect(checkNVRsPresentMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
