/**
 * Verify — a route component that pulls `token` and `value` query params,
 * decides email/phone by checking for "@", and calls `verifyOtp` once on
 * mount. The result flips `isSuccess` / `statusMessage` which feed into a
 * `VerificationModal`.
 *
 * Mocks:
 *  - sonner: capture toast.success / toast.error calls
 *  - ../Api/post: stub verifyOtp
 *  - react-router-dom: provide useNavigate and a programmable useSearchParams
 *  - VerificationModal: render the relevant props so we can assert state
 *
 * Total: 4 module mocks (under the 8-mock cap).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const verifyOtpMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const searchParamsState = vi.hoisted(() => ({
  current: new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/page/user/Settings/Api/post", () => ({
  verifyOtp: verifyOtpMock,
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [searchParamsState.current, vi.fn()],
}));
vi.mock("@/page/user/NotificationRecipients/VerificationModal", () => ({
  VerificationModal: ({ isSuccess, isLoading, statusMessage }) => (
    <div
      data-testid="modal"
      data-success={String(isSuccess)}
      data-loading={String(isLoading)}
    >
      {statusMessage}
    </div>
  ),
}));

import Verify from "@/page/user/Settings/components/Verify.jsx";

describe("Verify", () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    verifyOtpMock.mockReset();
    navigateMock.mockReset();
    searchParamsState.current = new URLSearchParams();
  });

  it("flips to success state when verifyOtp returns statusCode 200 (email)", async () => {
    searchParamsState.current = new URLSearchParams("token=abc&value=u@example.com");
    verifyOtpMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { message: "Verified!" },
    });

    render(<Verify />);

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        tokenData: "abc",
        value: "u@example.com",
        type: "email",
      });
    });
    const modal = await screen.findByTestId("modal");
    await waitFor(() => {
      expect(modal.getAttribute("data-success")).toBe("true");
      expect(modal.getAttribute("data-loading")).toBe("false");
    });
    expect(toastMock.success).toHaveBeenCalledWith("Verified!");
    expect(modal.textContent).toMatch(/email has been successfully verified/i);
  });

  it("flips to failure when verifyOtp returns non-200 (phone)", async () => {
    searchParamsState.current = new URLSearchParams("token=t1&value=5551234567");
    verifyOtpMock.mockResolvedValueOnce({
      statusCode: 400,
      body: { message: "Bad OTP" },
    });

    render(<Verify />);

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        tokenData: "t1",
        value: "5551234567",
        type: "phone",
      });
    });
    const modal = await screen.findByTestId("modal");
    await waitFor(() => {
      expect(modal.getAttribute("data-success")).toBe("false");
      expect(modal.getAttribute("data-loading")).toBe("false");
    });
    expect(toastMock.error).toHaveBeenCalledWith("Bad OTP");
    expect(modal.textContent).toMatch(/Verification failed/i);
  });

  it("handles thrown errors from verifyOtp", async () => {
    searchParamsState.current = new URLSearchParams("token=x&value=foo@bar.com");
    verifyOtpMock.mockRejectedValueOnce(new Error("boom"));

    render(<Verify />);

    const modal = await screen.findByTestId("modal");
    await waitFor(() => {
      expect(modal.getAttribute("data-success")).toBe("false");
      expect(modal.getAttribute("data-loading")).toBe("false");
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "A server error occurred during verification.",
    );
    expect(modal.textContent).toMatch(/server error/i);
  });

  it("shows the invalid-link path when token or value is missing", async () => {
    searchParamsState.current = new URLSearchParams();

    render(<Verify />);

    const modal = await screen.findByTestId("modal");
    await waitFor(() => {
      expect(modal.getAttribute("data-success")).toBe("false");
      expect(modal.getAttribute("data-loading")).toBe("false");
    });
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Invalid verification link.");
    expect(modal.textContent).toMatch(/Invalid verification link/i);
  });
});
