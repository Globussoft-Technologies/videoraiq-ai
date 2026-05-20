/**
 * UserContext/Context.jsx is a one-liner that exports a default React context.
 * Verifies the default value and that it composes with a Provider.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import UserContext from "../../../src/context/UserContext/Context.jsx";

describe("UserContext (default context)", () => {
  it("exports a React context object with Provider + Consumer", () => {
    expect(UserContext).toBeDefined();
    expect(typeof UserContext.Provider).toBe("object");
    expect(typeof UserContext.Consumer).toBe("object");
  });

  it("exposes the provider value through useContext", () => {
    const seen = { current: null };
    const Inner = () => {
      seen.current = React.useContext(UserContext);
      return null;
    };
    render(
      <UserContext.Provider value={{ tag: "hello" }}>
        <Inner />
      </UserContext.Provider>
    );
    expect(seen.current).toEqual({ tag: "hello" });
  });

  it("defaults to undefined when read without a provider", () => {
    const seen = { current: "untouched" };
    const Inner = () => {
      seen.current = React.useContext(UserContext);
      return null;
    };
    render(<Inner />);
    expect(seen.current).toBeUndefined();
  });
});
