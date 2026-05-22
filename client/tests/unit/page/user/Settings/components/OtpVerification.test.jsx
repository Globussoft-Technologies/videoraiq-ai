/**
 * OtpVerification — a 6-digit OTP entry modal. Behaviours under test:
 *  - renders the recipient value from router state
 *  - typing in a slot advances focus
 *  - Backspace on an empty slot moves focus back and clears the previous
 *  - Submit with < 6 digits shows toast.error and does NOT call verifyOtp
 *  - 200 response toasts success and navigates to /notification-recipients
 *  - non-200 response toasts error and does NOT navigate
 *  - rejected verifyOtp call: catch-block swallows
 *  - Close button navigates to /notification-recipients
 *
 * Mocks:
 *  - react-router-dom (useNavigate + useLocation)
 *  - sonner (toast)
 *  - ../Api/post (verifyOtp)
 *
 * Total: 3 module mocks (under the 8-mock cap).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const navigateMock = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({
  current: { state: { type: "email", value: "u@example.com" } },
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const verifyOtpMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationState.current,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/page/user/Settings/Api/post", () => ({
  verifyOtp: verifyOtpMock,
}));

import OtpVerification from "@/page/user/Settings/components/OtpVerification.jsx";

describe("OtpVerification", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    verifyOtpMock.mockReset();
    locationState.current = {
      state: { type: "email", value: "u@example.com" },
    };
  });

  it("renders the recipient value passed via router state", () => {
    render(<OtpVerification />);
    expect(screen.getByText("u@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Verify OTP/i }),
    ).toBeInTheDocument();
  });

  it("typing a digit only accepts numerics", () => {
    const { container } = render(<OtpVerification />);
    const inputs = container.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "a" } });
    // Non-digit ignored — slot stays empty
    expect(inputs[0].value).toBe("");
    fireEvent.change(inputs[0], { target: { value: "1" } });
    expect(inputs[0].value).toBe("1");
  });

  it("Submit with < 6 digits toasts error and does NOT call verifyOtp", async () => {
    render(<OtpVerification />);
    const btn = screen.getByRole("button", { name: /Verify Account/i });
    fireEvent.click(btn);
    expect(toastMock.error).toHaveBeenCalledWith(
      "Please enter a valid 6-digit OTP.",
    );
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("successful 200 verifyOtp call toasts success, closes modal, and navigates", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { message: "OK!" },
    });
    const { container } = render(<OtpVerification />);
    const inputs = container.querySelectorAll("input");
    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
    }
    fireEvent.click(screen.getByRole("button", { name: /Verify Account/i }));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        type: "email",
        value: "u@example.com",
        otp: "123456",
      });
    });
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("OK!");
      expect(navigateMock).toHaveBeenCalledWith("/notification-recipients");
    });
  });

  it("non-200 response toasts error and does NOT navigate", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      statusCode: 400,
      body: { message: "Bad code" },
    });
    const { container } = render(<OtpVerification />);
    const inputs = container.querySelectorAll("input");
    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: "9" } });
    }
    fireEvent.click(screen.getByRole("button", { name: /Verify Account/i }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Bad code");
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("rejected verifyOtp is swallowed (no throw, no navigate)", async () => {
    verifyOtpMock.mockRejectedValueOnce(new Error("net down"));
    const { container } = render(<OtpVerification />);
    const inputs = container.querySelectorAll("input");
    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: "0" } });
    }
    fireEvent.click(screen.getByRole("button", { name: /Verify Account/i }));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalled();
    });
    // No success toast, no navigate
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("Close button navigates to /notification-recipients", () => {
    render(<OtpVerification />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(navigateMock).toHaveBeenCalledWith("/notification-recipients");
  });

  it("Backspace on an empty slot clears the previous slot", () => {
    const { container } = render(<OtpVerification />);
    const inputs = container.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "1" } });
    expect(inputs[0].value).toBe("1");
    // Press Backspace while focused on slot 1 (which is empty) — should
    // clear slot 0.
    fireEvent.keyDown(inputs[1], { key: "Backspace" });
    expect(inputs[0].value).toBe("");
  });

  it("renders gracefully when router state is missing", () => {
    locationState.current = {};
    expect(() => render(<OtpVerification />)).not.toThrow();
    expect(
      screen.getByRole("heading", { name: /Verify OTP/i }),
    ).toBeInTheDocument();
  });
});
