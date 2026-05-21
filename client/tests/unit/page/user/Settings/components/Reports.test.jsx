/**
 * Reports — collapsible card with a RadioGroup (Download Report / Video
 * Link URL). Manages two local `useState` flags: expanded (default true)
 * and selectedReport (default "download"). No external API.
 *
 * Mocks: 0 (the real shadcn RadioGroup is used)
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Reports from "@/page/user/Settings/components/Reports.jsx";

describe("Reports", () => {
  it("renders the Reports header and both options expanded by default", () => {
    render(<Reports />);
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Download Report")).toBeInTheDocument();
    expect(screen.getByText("Video Link URL")).toBeInTheDocument();
  });

  it("collapses and re-expands when the header is clicked", () => {
    render(<Reports />);
    // Expanded — options visible
    expect(screen.getByText("Download Report")).toBeInTheDocument();
    // Click header to collapse
    fireEvent.click(screen.getByText("Reports"));
    expect(screen.queryByText("Download Report")).toBeNull();
    expect(screen.queryByText("Video Link URL")).toBeNull();
    // Click again to expand
    fireEvent.click(screen.getByText("Reports"));
    expect(screen.getByText("Download Report")).toBeInTheDocument();
  });

  it("renders two radio inputs with the download option selected initially", () => {
    const { container } = render(<Reports />);
    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(2);
    // First radio (download) should be checked initially
    expect(radios[0].getAttribute("data-state")).toBe("checked");
    expect(radios[1].getAttribute("data-state")).toBe("unchecked");
  });

  it("switches the selected radio when the video option is clicked", () => {
    const { container } = render(<Reports />);
    const radios = container.querySelectorAll('[role="radio"]');
    fireEvent.click(radios[1]);
    expect(radios[0].getAttribute("data-state")).toBe("unchecked");
    expect(radios[1].getAttribute("data-state")).toBe("checked");
  });
});
