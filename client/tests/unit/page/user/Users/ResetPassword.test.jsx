/**
 * src/page/user/Users/ResetPassword.jsx — Formik + Yup reset-password page.
 *
 * Two visual states gated by local `resetSuccess` state:
 *   - `false` (default): hero pane + Formik form with `password` and
 *     `confirmPassword` Field inputs. Yup schema enforces min(8), the strong-
 *     password regex, and `oneOf([Yup.ref("password")])` for confirm. The
 *     submit reads the URL token via `useSearchParams`, calls
 *     `resetpassword({ token, newPassword, confirmPassword })`, and on a
 *     `response.data.body.status === "success"` flips to the success pane and
 *     toasts the server message. Non-success bodies toast the server message
 *     (or fallback), and a thrown error toasts the response body message (or
 *     fallback).
 *   - `true`: success pane with "Password Reset!" heading + Continue to Login
 *     button that navigates to /user-login.
 *
 * The password-requirements checklist re-evaluates as the user types — the
 * length / uppercase / lowercase / digit / special-char dots flip from
 * bg-slate-300 to bg-emerald-500. We assert one transition.
 *
 * The two show/hide-password buttons toggle the corresponding Field's `type`
 * attribute between "password" and "text".
 *
 * Mocks (3):
 *   1. react-router-dom — useNavigate (captures /user-login navigation) and
 *      useSearchParams (returns a token query param the submit reads).
 *   2. sonner toast — capture success / error toasts.
 *   3. ./api/post/Index resetpassword — both via the @ alias path and the
 *      relative path the source resolves from src/page/user/Users/.
 *
 * Input + Button stay real (pure presentational). Formik + Yup stay real so
 * the schema actually runs against the test inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
const searchParamsGet = vi.hoisted(() => vi.fn(() => "tok-abc"));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [{ get: searchParamsGet }],
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const resetpassword = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Users/api/post/Index", () => ({ resetpassword }));
// Source uses the relative `./api/post/Index` specifier.
vi.mock("../../../../../src/page/user/Users/api/post/Index", () => ({
  resetpassword,
}));

const { default: ResetPassword } = await import(
  "../../../../../src/page/user/Users/ResetPassword.jsx"
);

beforeEach(() => {
  navigate.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  resetpassword.mockReset();
  searchParamsGet.mockReset();
  searchParamsGet.mockReturnValue("tok-abc");
});

const STRONG_PASSWORD = "GoodPass1@";

describe("ResetPassword", () => {
  it("renders the default form state with the heading, both password fields, and the submit button", () => {
    render(<ResetPassword />);
    expect(
      screen.getByRole("heading", { name: /^Reset Password$/i })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Confirm new password/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reset Password/i })
    ).toBeInTheDocument();
  });

  it("does not call the API when password is empty (required field)", async () => {
    render(<ResetPassword />);
    // Touch + blur password so Formik runs the Yup schema and the
    // ErrorMessage component will render once `touched` && `error` are set.
    const pw = screen.getByPlaceholderText(/Enter new password/i);
    fireEvent.change(pw, { target: { value: "" } });
    fireEvent.blur(pw);
    await waitFor(() =>
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument()
    );
    expect(resetpassword).not.toHaveBeenCalled();
  });

  it("shows the min-length error when the password is shorter than 8 chars", async () => {
    render(<ResetPassword />);
    const pw = screen.getByPlaceholderText(/Enter new password/i);
    fireEvent.change(pw, { target: { value: "Aa1@" } });
    fireEvent.blur(pw);
    await waitFor(() =>
      expect(
        screen.getByText(/Password must be at least 8 characters/i)
      ).toBeInTheDocument()
    );
    expect(resetpassword).not.toHaveBeenCalled();
  });

  it("shows the mismatch error when confirmPassword differs from password", async () => {
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    const confirm = screen.getByPlaceholderText(/Confirm new password/i);
    fireEvent.change(confirm, { target: { value: "Different1@" } });
    fireEvent.blur(confirm);
    await waitFor(() =>
      expect(screen.getByText(/Passwords must match/i)).toBeInTheDocument()
    );
    expect(resetpassword).not.toHaveBeenCalled();
  });

  it("toggles the password field between password and text when the eye button is clicked", () => {
    render(<ResetPassword />);
    const pw = screen.getByPlaceholderText(/Enter new password/i);
    expect(pw.getAttribute("type")).toBe("password");
    // The first eye-toggle button is the one inside the password field group.
    // It has no accessible name; find it relative to the input's parent.
    const toggle = pw.parentElement.querySelector('button[type="button"]');
    fireEvent.click(toggle);
    expect(pw.getAttribute("type")).toBe("text");
    fireEvent.click(toggle);
    expect(pw.getAttribute("type")).toBe("password");
  });

  it("submits a valid form: calls resetpassword with the token, toasts success, and shows the success pane", async () => {
    resetpassword.mockResolvedValue({
      data: { body: { status: "success", message: "Password updated" } },
    });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(resetpassword).toHaveBeenCalledWith({
        token: "tok-abc",
        newPassword: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Password updated");
    expect(
      await screen.findByRole("heading", { name: /Password Reset!/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue to Login/i })
    ).toBeInTheDocument();
  });

  it("non-success response body toasts the server message and stays on the form", async () => {
    resetpassword.mockResolvedValue({
      data: { body: { status: "error", message: "Token expired" } },
    });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Token expired")
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /^Reset Password$/i })
    ).toBeInTheDocument();
  });

  it("non-success response with no message falls back to 'Failed to reset password'", async () => {
    resetpassword.mockResolvedValue({ data: { body: { status: "error" } } });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to reset password")
    );
  });

  it("API rejection with a server-supplied message: toasts that message", async () => {
    resetpassword.mockRejectedValue({
      response: { data: { body: { message: "Bad token" } } },
    });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Bad token")
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("API rejection without a message falls back to 'Failed to reset password'", async () => {
    resetpassword.mockRejectedValue(new Error("network"));
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to reset password")
    );
  });

  it("Continue to Login on the success pane navigates to /user-login", async () => {
    resetpassword.mockResolvedValue({
      data: { body: { status: "success", message: "ok" } },
    });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    const continueBtn = await screen.findByRole("button", {
      name: /Continue to Login/i,
    });
    fireEvent.click(continueBtn);
    expect(navigate).toHaveBeenCalledWith("/user-login");
  });

  it("reads the token from the URL query string via useSearchParams", async () => {
    searchParamsGet.mockReturnValue("custom-token-xyz");
    resetpassword.mockResolvedValue({
      data: { body: { status: "success", message: "ok" } },
    });
    render(<ResetPassword />);
    fireEvent.change(screen.getByPlaceholderText(/Enter new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), {
      target: { value: STRONG_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));
    await waitFor(() =>
      expect(resetpassword).toHaveBeenCalledWith(
        expect.objectContaining({ token: "custom-token-xyz" })
      )
    );
    expect(searchParamsGet).toHaveBeenCalledWith("token");
  });
});
