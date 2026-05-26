/**
 * src/page/user/Detection/components/EvidenceSeverity.jsx — read-only
 * "Evidence & Severity" block of the applied detection profile. Pure
 * presentation:
 *   - Reads `appliedProfileData` off the InnerSettings context.
 *   - Pulls `profile?.evidenceSeverity?.evidenceType` and renders it
 *     under the "Evidence" sub-heading (along with the static
 *     "Evidence & Severity" header).
 *   - Missing or partial nested data renders empty (optional-chaining
 *     short-circuit) without throwing.
 *
 * Mocks (1):
 *   1. ./InnerSettingsContext - useInnerSettings (return appliedProfileData)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const innerRef = vi.hoisted(() => ({ appliedProfileData: null }));
vi.mock(
  "@/page/user/Detection/components/InnerSettingsContext",
  () => ({
    useInnerSettings: () => innerRef,
    InnerSettingsProvider: ({ children }) => children,
  })
);

const { default: EvidenceSeverity } = await import(
  "../../../../../../src/page/user/Detection/components/EvidenceSeverity.jsx"
);

function setApplied(data) {
  innerRef.appliedProfileData = data;
}

describe("Detection/components/EvidenceSeverity", () => {
  it("renders the static section headers (heading + Evidence label)", () => {
    setApplied(null);
    render(<EvidenceSeverity />);
    expect(screen.getByText("Evidence & Severity")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("renders empty evidenceType value when appliedProfileData is null", () => {
    setApplied(null);
    const { container } = render(<EvidenceSeverity />);
    // The value span should be empty (optional-chaining yields undefined ->
    // React renders nothing).
    const valueSpans = container.querySelectorAll(
      "span.text-\\[\\#333333\\].font-medium"
    );
    expect(valueSpans.length).toBeGreaterThan(0);
    expect(valueSpans[0].textContent).toBe("");
  });

  it("renders the evidenceType value when appliedProfileData has it", () => {
    setApplied({
      profile: {
        evidenceSeverity: { evidenceType: "Image" },
      },
    });
    render(<EvidenceSeverity />);
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("renders a different evidenceType value when changed", () => {
    setApplied({
      profile: {
        evidenceSeverity: { evidenceType: "Video Clip" },
      },
    });
    render(<EvidenceSeverity />);
    expect(screen.getByText("Video Clip")).toBeInTheDocument();
  });

  it("does NOT throw on partially-shaped profile (no evidenceSeverity sub-object)", () => {
    setApplied({ profile: {} });
    expect(() => render(<EvidenceSeverity />)).not.toThrow();
    // Headers still render.
    expect(screen.getByText("Evidence & Severity")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("does NOT throw when profile is absent entirely (only top-level prop)", () => {
    setApplied({});
    expect(() => render(<EvidenceSeverity />)).not.toThrow();
    expect(screen.getByText("Evidence & Severity")).toBeInTheDocument();
  });

  it("renders the heading inside an <h3> tag (semantic guard)", () => {
    setApplied(null);
    const { container } = render(<EvidenceSeverity />);
    const h3 = container.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3.textContent).toBe("Evidence & Severity");
  });
});
