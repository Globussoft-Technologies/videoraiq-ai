/**
 * src/page/admin/Login/AdminLoginForm.jsx — Formik admin login form.
 *
 * The form:
 *   - Reads `admin-remember-me` cookie on mount and seeds initial values
 *   - Submits via `adminLoginLocal({login, pass})`
 *   - On non-ok / expired -> navigates back to /admin-login
 *   - On success -> sets the access-token cookie (env-aware name), clears
 *     amember_login / amember_pass via deleteCookie (from IsAuth), calls
 *     setUser(result.user), optionally persists admin-remember-me, toasts
 *     "Login successful!" and navigates to /dashboard
 *   - On thrown error -> toast.error with API msg or fallback
 *
 * We mock six things so the form renders + submits under jsdom:
 *   1. js-cookie (Cookies.get/set/remove)
 *   2. react-router-dom useNavigate (Module returns useNavigate)
 *   3. @/context/AuthContext useAuth (setUser)
 *   4. ../Api/post adminLoginLocal (API call)
 *   5. sonner toast (success/error)
 *   6. @/components/Auth/IsAuth deleteCookie (only that named export)
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

// --- mocks (hoisted) ---------------------------------------------------------
const cookiesGet = vi.hoisted(() => vi.fn());
const cookiesSet = vi.hoisted(() => vi.fn());
const cookiesRemove = vi.hoisted(() => vi.fn());
vi.mock("js-cookie", () => ({
  default: { get: cookiesGet, set: cookiesSet, remove: cookiesRemove },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const setUser = vi.hoisted(() => vi.fn());
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ setUser }),
}));

const adminLoginLocal = vi.hoisted(() => vi.fn());
vi.mock("@/page/admin/Api/post", () => ({ adminLoginLocal }));
// also map the relative path the source uses
vi.mock("../../Api/post", () => ({ adminLoginLocal }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const deleteCookie = vi.hoisted(() => vi.fn());
vi.mock("@/components/Auth/IsAuth", () => ({ deleteCookie }));

const { default: AdminLoginForm } = await import(
  "@/page/admin/Login/AdminLoginForm.jsx"
);

beforeEach(() => {
  cookiesGet.mockReset();
  cookiesSet.mockReset();
  cookiesRemove.mockReset();
  navigate.mockReset();
  setUser.mockReset();
  adminLoginLocal.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  deleteCookie.mockReset();
});

function type(input, value) {
  fireEvent.change(input, { target: { value } });
}

describe("AdminLoginForm", () => {
  it("renders the username and password fields plus a Sign In button", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<AdminLoginForm />);
    expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("toggles password visibility when the eye button is clicked", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<AdminLoginForm />);
    const passInput = screen.getByLabelText(/password/i);
    expect(passInput).toHaveAttribute("type", "password");
    // eye toggle button is the only icon-only button before submit
    const buttons = screen.getAllByRole("button");
    // the toggle is type=button; Submit has type=submit
    const toggle = buttons.find((b) => b.getAttribute("type") === "button");
    fireEvent.click(toggle);
    expect(passInput).toHaveAttribute("type", "text");
    fireEvent.click(toggle);
    expect(passInput).toHaveAttribute("type", "password");
  });

  it("seeds initial values from the admin-remember-me cookie when present", () => {
    cookiesGet.mockImplementation((k) =>
      k === "admin-remember-me"
        ? JSON.stringify({ login: "saved@x.com", pass: "secret" })
        : undefined
    );
    render(<AdminLoginForm />);
    expect(screen.getByLabelText(/username or email/i)).toHaveValue(
      "saved@x.com"
    );
    expect(screen.getByLabelText(/password/i)).toHaveValue("secret");
  });

  it("survives malformed remember-me cookie (logs console.error, leaves fields blank)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    cookiesGet.mockImplementation((k) =>
      k === "admin-remember-me" ? "{not-json" : undefined
    );
    render(<AdminLoginForm />);
    expect(screen.getByLabelText(/username or email/i)).toHaveValue("");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shows validation errors when submitting blank fields", async () => {
    cookiesGet.mockReturnValue(undefined);
    render(<AdminLoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByText(/username or email is required/i)
    ).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    expect(adminLoginLocal).not.toHaveBeenCalled();
  });

  it("on a successful login: sets access-token cookie, clears amember_*, sets user, toasts, navigates to /dashboard", async () => {
    cookiesGet.mockReturnValue(undefined);
    adminLoginLocal.mockResolvedValue({
      ok: true,
      token: "abc.def.ghi",
      user: { id: "u1", email: "admin@x.com" },
    });

    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "admin@x.com");
    type(screen.getByLabelText(/password/i), "hunter2");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });

    await waitFor(() => {
      expect(adminLoginLocal).toHaveBeenCalledWith({
        login: "admin@x.com",
        pass: "hunter2",
      });
    });

    // env is "dev" in vitest.config -> dev-access-token cookie
    await waitFor(() => {
      expect(cookiesSet).toHaveBeenCalledWith(
        "dev-access-token",
        "abc.def.ghi",
        expect.objectContaining({ expires: 1, secure: true, path: "/" })
      );
    });

    // amember_* cookies are wiped through the IsAuth helper
    expect(deleteCookie).toHaveBeenCalledWith("amember_login");
    expect(deleteCookie).toHaveBeenCalledWith("amember_pass");

    expect(setUser).toHaveBeenCalledWith({ id: "u1", email: "admin@x.com" });
    // rememberMe defaults false -> admin-remember-me cookie cleared
    expect(cookiesRemove).toHaveBeenCalledWith("admin-remember-me");
    expect(toastSuccess).toHaveBeenCalledWith("Login successful!");
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("persists the admin-remember-me cookie when the Remember-me box is checked", async () => {
    cookiesGet.mockReturnValue(undefined);
    adminLoginLocal.mockResolvedValue({
      ok: true,
      token: "tok",
      user: { id: "u2" },
    });
    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "x@y.com");
    type(screen.getByLabelText(/password/i), "p");

    const cb = screen.getByRole("checkbox");
    fireEvent.click(cb); // turn rememberMe on

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });

    await waitFor(() => {
      expect(cookiesSet).toHaveBeenCalledWith(
        "admin-remember-me",
        JSON.stringify({ login: "x@y.com", pass: "p" }),
        { expires: 7 }
      );
    });
    expect(cookiesRemove).not.toHaveBeenCalledWith("admin-remember-me");
  });

  it("navigates back to /admin-login when adminLoginLocal returns ok:false", async () => {
    cookiesGet.mockReturnValue(undefined);
    adminLoginLocal.mockResolvedValue({ ok: false });
    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "u");
    type(screen.getByLabelText(/password/i), "p");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/admin-login");
    });
    expect(cookiesSet).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("navigates back to /admin-login when the API returns expired:true", async () => {
    cookiesGet.mockReturnValue(undefined);
    adminLoginLocal.mockResolvedValue({ ok: true, expired: true });
    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "u");
    type(screen.getByLabelText(/password/i), "p");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/admin-login");
    });
    expect(setUser).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("on a thrown error: shows the API error msg via toast.error", async () => {
    cookiesGet.mockReturnValue(undefined);
    const err = new Error("boom");
    err.response = { data: { msg: "Invalid credentials" } };
    adminLoginLocal.mockRejectedValue(err);
    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "u");
    type(screen.getByLabelText(/password/i), "p");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Invalid credentials");
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("on a thrown error without response.data.msg: falls back to 'Failed to Login!'", async () => {
    cookiesGet.mockReturnValue(undefined);
    adminLoginLocal.mockRejectedValue(new Error("network"));
    render(<AdminLoginForm />);
    type(screen.getByLabelText(/username or email/i), "u");
    type(screen.getByLabelText(/password/i), "p");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to Login!");
    });
  });

  it("renders the 'Login as user' link pointing at /user-login", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<AdminLoginForm />);
    const link = screen.getByRole("link", { name: /login as user/i });
    expect(link).toHaveAttribute("href", "/user-login");
  });
});
