/**
 * src/page/user/Detection/components/InnerSettingsContext.jsx — thin React
 * context with a provider plus a `useInnerSettings` hook that returns `{}`
 * when there is no provider. Pure, no mocks.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, renderHook } from "@testing-library/react";
import {
  InnerSettingsProvider,
  useInnerSettings,
} from "../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";
import InnerSettingsContext from "../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";

describe("page/Detection InnerSettingsContext", () => {
  it("default export is the React context object", () => {
    expect(InnerSettingsContext).toBeTruthy();
    // React contexts always expose Provider and Consumer.
    expect(InnerSettingsContext.Provider).toBeDefined();
    expect(InnerSettingsContext.Consumer).toBeDefined();
  });

  it("returns an empty object when there is no provider", () => {
    const { result } = renderHook(() => useInnerSettings());
    expect(result.current).toEqual({});
  });

  it("returns the provider value when wrapped", () => {
    const value = { onBack: () => {}, rowData: { name: "Cam-1" } };
    const wrapper = ({ children }) => (
      <InnerSettingsProvider value={value}>{children}</InnerSettingsProvider>
    );
    const { result } = renderHook(() => useInnerSettings(), { wrapper });
    expect(result.current).toBe(value);
  });

  it("InnerSettingsProvider renders children", () => {
    const { getByText } = render(
      <InnerSettingsProvider value={{}}>
        <span>child-content</span>
      </InnerSettingsProvider>
    );
    expect(getByText("child-content")).toBeInTheDocument();
  });

  it("supports nested providers — inner value wins", () => {
    const wrapper = ({ children }) => (
      <InnerSettingsProvider value={{ tag: "outer" }}>
        <InnerSettingsProvider value={{ tag: "inner" }}>
          {children}
        </InnerSettingsProvider>
      </InnerSettingsProvider>
    );
    const { result } = renderHook(() => useInnerSettings(), { wrapper });
    expect(result.current.tag).toBe("inner");
  });
});
