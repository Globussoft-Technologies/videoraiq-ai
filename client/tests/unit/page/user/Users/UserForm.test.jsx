/**
 * Round 85: cover Users/UserForm.jsx (default export `LoginForm`) — the
 * user-side login screen mounted at /user-login.
 *
 * The component is a Formik + Yup form with three interesting behaviour
 * surfaces:
 *   1. Initial render shows the marketing hero pane + the Welcome Back
 *      heading + a Username/Email field, a Password field, the password
 *      eye-toggle, the Remember-me checkbox + Forgot-password button, and
 *      the Sign In submit button.
 *   2. The Forgot-password button navigates to `/forgot-password` via
 *      react-router-dom's `useNavigate`.
 *   3. The eye-toggle flips the password input's `type` between
 *      `password` and `text`.
 *   4. Submitting an empty form runs the Yup schema and surfaces both
 *      "Username or Email is required" + "Password is required"
 *      ErrorMessage nodes; `userLogin` MUST NOT be called.
 *   5. A successful userLogin response (status === 'success') sets the
 *      access-token cookie, toasts the server message, and navigates to
 *      `/dashboard`. When `rememberMe` is checked the credentials get
 *      saved under the `remember-me` cookie.
 *   6. A non-success response payload surfaces toast.error with the
 *      server message and does NOT navigate.
 *
 * Mocks (5):
 *   1. react-router-dom useNavigate — capture navigation target.
 *   2. sonner toast — capture success / error toasts.
 *   3. ./api/post/Index userLogin — both via the @ alias path and the
 *      relative path the source resolves from src/page/user/Users/.
 *   4. js-cookie — record set/get/remove calls.
 *   (Formik + Yup + Input + Button stay real so the schema actually runs
 *   against the inputs in the form.)
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// jsdom does not implement ResizeObserver — Radix Checkbox uses it.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const userLogin = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Users/api/post/Index", () => ({ userLogin }));
// Source uses the relative `./api/post/Index` specifier.
vi.mock("../../../../../src/page/user/Users/api/post/Index", () => ({
  userLogin,
}));

const cookies = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("js-cookie", () => ({ default: cookies }));

const { default: LoginForm } = await import(
  "../../../../../src/page/user/Users/UserForm.jsx"
);

beforeEach(() => {
  navigate.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  userLogin.mockReset();
  cookies.set.mockReset();
  cookies.get.mockReset();
  cookies.remove.mockReset();
  // Default: no saved credentials — the useEffect Cookies.get("remember-me")
  // call returns undefined so initial values stay blank.
  cookies.get.mockReturnValue(undefined);
});

describe("LoginForm (Users/UserForm.jsx) — Round 85", () => {
  it("renders the welcome heading + the two form fields + the submit + forgot-password controls", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("heading", { name: /Welcome Back/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/you@company\.com/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Enter your password/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign In/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Forgot password\?/i })
    ).toBeInTheDocument();
  });

  it("Forgot-password button navigates to /forgot-password", () => {
    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /Forgot password\?/i })
    );
    expect(navigate).toHaveBeenCalledWith("/forgot-password");
  });

  it("the eye-toggle flips the password input type between password and text", () => {
    render(<LoginForm />);
    const password = screen.getByPlaceholderText(/Enter your password/i);
    expect(password).toHaveAttribute("type", "password");

    // The eye-toggle is the unlabelled <button type="button"> sitting next
    // to the password input. It has no accessible name so we locate it via
    // the closest button to the password field.
    const toggle = password.parentElement.querySelector(
      'button[type="button"]'
    );
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(toggle);
    expect(password).toHaveAttribute("type", "password");
  });

  it("submitting an empty form shows both validation errors and does NOT call userLogin", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Username or Email is required/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Password is required/i)
      ).toBeInTheDocument();
    });
    expect(userLogin).not.toHaveBeenCalled();
  });

  it("a successful login response toasts the server message, sets the access-token cookie, and navigates to /dashboard", async () => {
    userLogin.mockResolvedValue({
      data: {
        body: {
          status: "success",
          message: "Login successful",
          data: { token: "tok-123" },
        },
      },
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), {
      target: { value: "Secret!23" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() =>
      expect(userLogin).toHaveBeenCalledWith({
        usernameOrEmail: "user@example.com",
        password: "Secret!23",
      })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Login successful");
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });

    // The cookie name is computed from import.meta.env.VITE_ENV which is
    // "dev" inside vitest.config.js — so the dev branch fires.
    expect(cookies.set).toHaveBeenCalledWith(
      "dev-access-token",
      "tok-123",
      expect.objectContaining({ secure: true, path: "/" })
    );
    // rememberMe defaults to false -> Cookies.remove("remember-me").
    expect(cookies.remove).toHaveBeenCalledWith("remember-me");
  });

  it("a non-success response surfaces toast.error with the server message and does NOT navigate", async () => {
    userLogin.mockResolvedValue({
      data: {
        body: {
          status: "fail",
          message: "Invalid credentials",
        },
      },
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials")
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a thrown userLogin error surfaces toast.error with the server-or-fallback message", async () => {
    userLogin.mockRejectedValue({
      response: { data: { body: { message: "Server is down" } } },
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), {
      target: { value: "Secret!23" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Server is down")
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
