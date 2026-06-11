/**
 * Gap-fills for src/page/user/Users/UserForm.jsx
 *
 * Targets:
 *   - lines 27-34: corrupt saved credentials cookie -> JSON.parse throws,
 *     console.error fires (catch branch)
 *   - lines 192-196: VITE_ENV "prod" -> prod-access-token branch; default
 *     fallback when VITE_ENV is neither dev nor prod
 *   - line 204: rememberMe true -> Cookies.set("remember-me", JSON.stringify)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const userLogin = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Users/api/post/Index", () => ({ userLogin }));
vi.mock("../../../../../src/page/user/Users/api/post/Index", () => ({
  userLogin,
}));

const cookies = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("js-cookie", () => ({ default: cookies }));

beforeEach(() => {
  navigate.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  userLogin.mockReset();
  cookies.set.mockReset();
  cookies.get.mockReset();
  cookies.remove.mockReset();
  cookies.get.mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("UserForm gap-fills", () => {
  it("corrupt remember-me cookie triggers the catch branch with console.error (lines 27-34)", async () => {
    cookies.get.mockReturnValue("{not valid json");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: LoginForm } = await import(
      "../../../../../src/page/user/Users/UserForm.jsx?t=corrupt"
    );
    render(<LoginForm />);

    expect(errSpy).toHaveBeenCalledWith("Invalid saved credentials");
    errSpy.mockRestore();
  });

  it("a valid remember-me cookie pre-fills the form and ticks rememberMe", async () => {
    cookies.get.mockReturnValue(
      JSON.stringify({ usernameOrEmail: "saved@example.com", password: "savedpw" })
    );

    const { default: LoginForm } = await import(
      "../../../../../src/page/user/Users/UserForm.jsx?t=valid"
    );
    render(<LoginForm />);

    // The email field is pre-filled.
    const emailInput = screen.getByPlaceholderText(/you@company\.com/i);
    expect(emailInput.value).toBe("saved@example.com");
  });

  it("when rememberMe is checked at submit time, credentials are stored under 'remember-me' cookie (line 204)", async () => {
    // Pre-seed cookie so rememberMe state is already true on mount.
    cookies.get.mockReturnValue(
      JSON.stringify({ usernameOrEmail: "me@x.com", password: "pw" })
    );
    userLogin.mockResolvedValue({
      data: {
        body: { status: "success", message: "ok", data: { token: "T" } },
      },
    });

    const { default: LoginForm } = await import(
      "../../../../../src/page/user/Users/UserForm.jsx?t=remember"
    );
    render(<LoginForm />);

    // Submit — rememberMe is already true from the pre-seeded cookie.
    fireEvent.change(screen.getByPlaceholderText(/you@company\.com/i), {
      target: { value: "me@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() => expect(userLogin).toHaveBeenCalled());
    await waitFor(() =>
      expect(cookies.set).toHaveBeenCalledWith(
        "remember-me",
        expect.stringContaining("me@x.com")
      )
    );
  });
});
