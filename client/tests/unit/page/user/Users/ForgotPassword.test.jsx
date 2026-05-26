/**
 * src/page/user/Users/ForgotPassword.jsx — Formik + Yup forgot-password page.
 *
 * Two visual states gated by local `emailSent` state:
 *   - `false` (default): hero pane + Formik email form. Submitting an empty
 *     or invalid email shows ErrorMessage; a valid email calls
 *     `forgotPassword({email})`, on success flips `emailSent` to true and
 *     toasts the server message (or a default fallback).
 *   - `true`: success-state pane with "Check Your Email" + Resend Email
 *     (flips emailSent back to false) and Back to Login (navigates to
 *     /user-login).
 *   - The header back-button also navigates to /user-login.
 *   - Failed forgotPassword surfaces toast.error with the server msg or a
 *     generic fallback.
 *
 * Mocks (3):
 *   1. react-router-dom useNavigate — capture navigation target.
 *   2. sonner toast — capture success / error toasts.
 *   3. ./api/post/Index forgotPassword — both via the @ alias path and the
 *      relative path the source resolves from src/page/user/Users/.
 *
 * Input + Button stay real (pure presentational). Formik + Yup stay real so
 * the schema actually runs against the test inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const forgotPassword = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Users/api/post/Index", () => ({ forgotPassword }));
// Source uses the relative `./api/post/Index` specifier.
vi.mock("../../../../../src/page/user/Users/api/post/Index", () => ({
  forgotPassword,
}));

const { default: ForgotPassword } = await import(
  "../../../../../src/page/user/Users/ForgotPassword.jsx"
);

beforeEach(() => {
  navigate.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  forgotPassword.mockReset();
});

describe("ForgotPassword", () => {
  it("renders the default form state with the heading and submit button", () => {
    render(<ForgotPassword />);
    expect(
      screen.getByRole("heading", { name: /Forgot Password\?/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@company\.com/i)).toBeInTheDocument();
  });

  it("Back to login button navigates to /user-login", () => {
    render(<ForgotPassword />);
    fireEvent.click(screen.getByRole("button", { name: /Back to login/i }));
    expect(navigate).toHaveBeenCalledWith("/user-login");
  });

  it("shows a validation error when email is empty on submit and does not call the API", async () => {
    render(<ForgotPassword />);
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    await waitFor(() =>
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument()
    );
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it("shows the invalid-email error when email format is wrong", async () => {
    render(<ForgotPassword />);
    const input = screen.getByPlaceholderText(/you@company\.com/i);
    // type="email" + HTML5 form validation will block a real submit in
    // jsdom when the value is non-empty + invalid; trigger a blur instead
    // so Formik marks the field touched and runs the Yup schema.
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        screen.getByText(/Enter a valid email address/i)
      ).toBeInTheDocument()
    );
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it("submits a valid email: calls forgotPassword, toasts the server message, then shows the success pane", async () => {
    forgotPassword.mockResolvedValue({
      data: { body: { message: "Reset link generated" } },
    });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    await waitFor(() =>
      expect(forgotPassword).toHaveBeenCalledWith({ email: "user@example.com" })
    );
    expect(toast.success).toHaveBeenCalledWith("Reset link generated");
    expect(
      await screen.findByRole("heading", { name: /Check Your Email/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resend Email/i })
    ).toBeInTheDocument();
  });

  it("falls back to the default success toast when the API omits a message", async () => {
    forgotPassword.mockResolvedValue({ data: { body: {} } });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Password reset link generated successfully"
      )
    );
  });

  it("on API rejection: toasts the server-supplied error message and stays on the form", async () => {
    forgotPassword.mockRejectedValue({
      response: { data: { body: { message: "Unknown email" } } },
    });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Unknown email")
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /Forgot Password\?/i })
    ).toBeInTheDocument();
  });

  it("on API rejection without a message: falls back to 'Failed to send reset email'", async () => {
    forgotPassword.mockRejectedValue(new Error("network"));
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to send reset email")
    );
  });

  it("Resend Email on the success pane flips back to the form", async () => {
    forgotPassword.mockResolvedValue({
      data: { body: { message: "ok" } },
    });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    const resend = await screen.findByRole("button", { name: /Resend Email/i });
    fireEvent.click(resend);
    expect(
      await screen.findByRole("heading", { name: /Forgot Password\?/i })
    ).toBeInTheDocument();
  });

  it("Back to Login on the success pane navigates to /user-login", async () => {
    forgotPassword.mockResolvedValue({ data: { body: { message: "ok" } } });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send Reset Instructions/i })
    );
    const backBtn = await screen.findByRole("button", { name: /Back to Login/i });
    fireEvent.click(backBtn);
    expect(navigate).toHaveBeenCalledWith("/user-login");
  });
});
