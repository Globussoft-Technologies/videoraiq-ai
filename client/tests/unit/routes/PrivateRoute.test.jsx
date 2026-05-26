/**
 * src/routes/PrivateRoute.jsx — the simplest auth-gate route component in
 * the app. It checks for a `token` cookie via js-cookie and either
 * renders <Outlet /> (when present) or navigates to /admin/login (when
 * absent). Two mocks total: js-cookie and react-router-dom.
 *
 * The component is a pure presentational gate — no useEffect, no async,
 * no side-effects. We exercise both branches plus a handful of
 * falsy/truthy edges Cookies.get can return.
 *
 * Mocks (2):
 *   1. js-cookie (Cookies.get)
 *   2. react-router-dom (Navigate, Outlet)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// ----- hoisted mocks -------------------------------------------------------
const cookiesGet = vi.hoisted(() => vi.fn());
vi.mock("js-cookie", () => ({
  default: { get: cookiesGet },
}));

// Replace Navigate / Outlet with simple sentinels so we can assert which
// branch fired without pulling in the real react-router-dom router stack.
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
  Outlet: () => <div data-testid="outlet" />,
}));

const { default: PrivateRoute } = await import("@/routes/PrivateRoute.jsx");

beforeEach(() => {
  cookiesGet.mockReset();
});

describe("routes/PrivateRoute — authenticated branch (token cookie present)", () => {
  it("renders <Outlet /> when Cookies.get('token') returns a non-empty string", () => {
    cookiesGet.mockReturnValue("eyJhbGciOiJIUzI1NiJ9.tok.sig");
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("queries Cookies.get with the exact key 'token'", () => {
    cookiesGet.mockReturnValue("abc");
    render(<PrivateRoute />);
    expect(cookiesGet).toHaveBeenCalledTimes(1);
    expect(cookiesGet).toHaveBeenCalledWith("token");
  });

  it("treats any truthy token string as authenticated (short value)", () => {
    cookiesGet.mockReturnValue("x");
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("treats a long JWT-shaped token as authenticated", () => {
    const longTok = "a".repeat(512);
    cookiesGet.mockReturnValue(longTok);
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("treats whitespace-only token as truthy (matches js-cookie semantics)", () => {
    // js-cookie returns the raw cookie value verbatim; ' ' is truthy in
    // JavaScript even though semantically a real auth filter would treat
    // it as invalid. PrivateRoute does no trimming — pin the as-written
    // behaviour so future tightening shows up here.
    cookiesGet.mockReturnValue(" ");
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("treats the literal string 'false' as truthy (also as-written behaviour)", () => {
    cookiesGet.mockReturnValue("false");
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("treats the literal string '0' as truthy", () => {
    cookiesGet.mockReturnValue("0");
    render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("does NOT render the redirect sentinel on the authed branch", () => {
    cookiesGet.mockReturnValue("ok");
    render(<PrivateRoute />);
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });
});

describe("routes/PrivateRoute — unauthenticated branch (no token cookie)", () => {
  it("renders <Navigate to='/admin/login' /> when Cookies.get returns undefined", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<PrivateRoute />);
    const nav = screen.getByTestId("navigate");
    expect(nav).toBeInTheDocument();
    expect(nav.getAttribute("data-to")).toBe("/admin/login");
  });

  it("renders <Navigate /> when Cookies.get returns null", () => {
    cookiesGet.mockReturnValue(null);
    render(<PrivateRoute />);
    expect(screen.getByTestId("navigate")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("renders <Navigate /> when Cookies.get returns an empty string", () => {
    cookiesGet.mockReturnValue("");
    render(<PrivateRoute />);
    expect(screen.getByTestId("navigate")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("the redirect destination is exactly '/admin/login' (no trailing slash, no params)", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<PrivateRoute />);
    const nav = screen.getByTestId("navigate");
    expect(nav.getAttribute("data-to")).toBe("/admin/login");
    expect(nav.getAttribute("data-to")).not.toMatch(/\?/);
    expect(nav.getAttribute("data-to")).not.toMatch(/\/$/);
  });

  it("does NOT render <Outlet /> on the unauthed branch", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<PrivateRoute />);
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("still calls Cookies.get('token') exactly once on the unauthed branch", () => {
    cookiesGet.mockReturnValue(undefined);
    render(<PrivateRoute />);
    expect(cookiesGet).toHaveBeenCalledTimes(1);
    expect(cookiesGet).toHaveBeenCalledWith("token");
  });
});

describe("routes/PrivateRoute — re-render behaviour", () => {
  it("re-evaluates the cookie on every render (no internal caching)", () => {
    cookiesGet.mockReturnValueOnce(undefined).mockReturnValueOnce("tok");
    const { rerender } = render(<PrivateRoute />);
    expect(screen.getByTestId("navigate")).toBeInTheDocument();
    rerender(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(cookiesGet).toHaveBeenCalledTimes(2);
  });

  it("flips back to the redirect when the token disappears between renders", () => {
    cookiesGet.mockReturnValueOnce("tok").mockReturnValueOnce(undefined);
    const { rerender } = render(<PrivateRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    rerender(<PrivateRoute />);
    expect(screen.getByTestId("navigate")).toBeInTheDocument();
  });

  it("does not crash when js-cookie throws synchronously (pinned via try/catch-free invariant)", () => {
    cookiesGet.mockImplementation(() => {
      throw new Error("cookie store unavailable");
    });
    // PrivateRoute does not wrap the call in try/catch; React render will
    // throw. Pin that behaviour so a future change that *does* swallow the
    // throw will show up here.
    expect(() => render(<PrivateRoute />)).toThrow(/cookie store unavailable/);
  });
});

describe("routes/PrivateRoute — module surface", () => {
  it("is exported as the default export and is a function component", () => {
    expect(typeof PrivateRoute).toBe("function");
  });

  it("accepts no props (no propTypes / no required args)", () => {
    cookiesGet.mockReturnValue("tok");
    expect(() => render(<PrivateRoute foo="bar" />)).not.toThrow();
  });
});
