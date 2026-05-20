/**
 * src/page/user/Detection/components/Header.jsx — pulls onBack/onReset/rowData
 * from InnerSettingsContext and renders two buttons. We wrap with the real
 * provider to avoid any mocking.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import Header from "../../../../../src/page/user/Detection/components/Header.jsx";
import { InnerSettingsProvider } from "../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";

const renderWith = (value) =>
  render(
    <InnerSettingsProvider value={value}>
      <Header />
    </InnerSettingsProvider>
  );

describe("page/Detection Header", () => {
  it("renders the rowData name when provided", () => {
    const { getByText } = renderWith({ rowData: { name: "Camera-1" } });
    expect(getByText("Camera-1")).toBeInTheDocument();
  });

  it("renders an empty heading when rowData is missing", () => {
    const { container } = renderWith({});
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1.textContent).toBe("");
  });

  it("invokes onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    const { container } = renderWith({ onBack });
    const buttons = container.querySelectorAll("button");
    // first button is the back (ChevronLeft) icon button
    fireEvent.click(buttons[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("invokes onReset when the Reset Setting button is clicked", () => {
    const onReset = vi.fn();
    const { getByText } = renderWith({ onReset });
    fireEvent.click(getByText("Reset Setting"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("survives when both handlers are omitted (no throw on click)", () => {
    const { container, getByText } = renderWith({});
    expect(() => {
      fireEvent.click(container.querySelectorAll("button")[0]);
      fireEvent.click(getByText("Reset Setting"));
    }).not.toThrow();
  });
});
