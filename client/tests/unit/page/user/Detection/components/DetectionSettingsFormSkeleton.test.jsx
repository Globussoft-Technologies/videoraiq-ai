/**
 * src/page/user/Detection/components/DetectionSettingsFormSkeleton.jsx — pure
 * presentational shell using react-loading-skeleton. No props, no state, no
 * external API.
 *
 * Mocks: 0
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import DetectionSettingsFormSkeleton from "@/page/user/Detection/components/DetectionSettingsFormSkeleton.jsx";

describe("DetectionSettingsFormSkeleton", () => {
  it("mounts without throwing", () => {
    expect(() => render(<DetectionSettingsFormSkeleton />)).not.toThrow();
  });

  it("renders a non-trivial DOM tree", () => {
    const { container } = render(<DetectionSettingsFormSkeleton />);
    expect(container.firstChild).not.toBeNull();
    // The outer wrapper has the bg/padding tokens used in the source.
    expect(container.firstChild.className).toContain("bg-[#FAFAFA]");
  });

  it("renders three skeleton rows for the recipients section", () => {
    const { container } = render(<DetectionSettingsFormSkeleton />);
    // Recipient rows use "border-b border-gray-200 last:border-0".
    const rows = container.querySelectorAll(".border-b.border-gray-200");
    expect(rows.length).toBe(3);
  });

  it("renders the outer settings panel and the recipients sub-panel", () => {
    const { container } = render(<DetectionSettingsFormSkeleton />);
    // Settings panel — bg-[#F5F5F5] with rounded-[10px] is reused twice.
    const panels = container.querySelectorAll(".bg-\\[\\#F5F5F5\\]");
    // First is the big settings panel; recipients panel is a second one.
    expect(panels.length).toBeGreaterThanOrEqual(2);
  });

  it("emits skeleton placeholder elements (react-loading-skeleton spans)", () => {
    const { container } = render(<DetectionSettingsFormSkeleton />);
    // react-loading-skeleton renders <span class="react-loading-skeleton" />.
    const skeletons = container.querySelectorAll(".react-loading-skeleton");
    expect(skeletons.length).toBeGreaterThan(10);
  });
});
