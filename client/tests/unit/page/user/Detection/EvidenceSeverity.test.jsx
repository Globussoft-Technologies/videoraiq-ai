/**
 * src/page/user/Detection/components/EvidenceSeverity.jsx — renders a small
 * 'Evidence & Severity' block whose value comes from the InnerSettings
 * context. We wrap the component in the real provider to avoid mocks.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import EvidenceSeverity from "../../../../../src/page/user/Detection/components/EvidenceSeverity.jsx";
import { InnerSettingsProvider } from "../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";

const renderWith = (value) =>
  render(
    <InnerSettingsProvider value={value}>
      <EvidenceSeverity />
    </InnerSettingsProvider>
  );

describe("page/Detection EvidenceSeverity", () => {
  it("renders the section heading", () => {
    const { getByText } = renderWith({ appliedProfileData: null });
    expect(getByText("Evidence & Severity")).toBeInTheDocument();
  });

  it("renders the Evidence label", () => {
    const { getByText } = renderWith({ appliedProfileData: null });
    expect(getByText("Evidence")).toBeInTheDocument();
  });

  it("renders the evidence type from the applied profile", () => {
    const { getByText } = renderWith({
      appliedProfileData: {
        profile: { evidenceSeverity: { evidenceType: "Video Clip" } },
      },
    });
    expect(getByText("Video Clip")).toBeInTheDocument();
  });

  it("gracefully handles a missing applied profile (no value shown)", () => {
    const { container } = renderWith({ appliedProfileData: null });
    // The value span is rendered but empty; the heading should still be there.
    expect(container.querySelector("h3")).not.toBeNull();
    expect(container.querySelector("h3").textContent).toBe(
      "Evidence & Severity"
    );
  });

  it("gracefully handles a partial profile object", () => {
    const { container } = renderWith({
      appliedProfileData: { profile: {} },
    });
    // No throw, heading present. The value span exists but with empty text.
    const spans = container.querySelectorAll("span");
    // last span holds the evidenceType
    expect(spans[spans.length - 1].textContent).toBe("");
  });
});
