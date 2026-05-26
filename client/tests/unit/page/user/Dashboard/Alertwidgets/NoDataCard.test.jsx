/**
 * src/page/user/Dashboard/Alertwidgets/NoDataCard.jsx — purely presentational
 * "empty state" card that the dashboard Alertcards render when an incident
 * category has nothing to show. The only logic is a tiny string-mapping
 * helper that picks a friendly title from the `incidentName` prop (with a
 * default fall-back); everything else is static markup (inline SVG, Bell
 * icon, "Inactive" badge, "No Data Available" headline, descriptive copy).
 *
 * These specs pin:
 *   - the seven explicit incidentName -> title mappings exactly as written
 *     in getNoDataTitle (lineCrossing, unauthorizedAccess, motionDetection,
 *     genericObjectDetection, loiteringWithoutAuth, loiteringWithAuth,
 *     countPersons)
 *   - the default branch (unknown / undefined -> "No New Alerts")
 *   - the static "Inactive" badge + "No Data Available" headline + the
 *     descriptive copy beneath it (they must remain so users see the same
 *     empty state regardless of category)
 *   - the Bell icon's `alt` text mirrors the resolved title (so screen
 *     readers stay in sync with the visible label)
 *
 * Mocks: 1 — @/assets/Bell.svg stubbed so the SVG asset import resolves
 * under jsdom without going through vite's asset pipeline. Well under the
 * 8-mock cap.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/assets/Bell.svg", () => ({ default: "bell.svg" }));

import NoDataCard from "@/page/user/Dashboard/Alertwidgets/NoDataCard.jsx";

describe("Dashboard/Alertwidgets/NoDataCard", () => {
  it("maps each known incidentName to its documented title (and the Bell alt mirrors it)", () => {
    const cases = [
      ["lineCrossing", "No Person Crossing Alerts"],
      ["unauthorizedAccess", "No Unauthorized Access Alerts"],
      ["motionDetection", "No Motion Detection Alerts"],
      ["genericObjectDetection", "No Object Detection Alerts"],
      ["loiteringWithoutAuth", "No Unauthorized Loitering Alerts"],
      ["loiteringWithAuth", "No Authorized Loitering Alerts"],
      ["countPersons", "No Person Count Alerts"],
    ];

    for (const [incidentName, expectedTitle] of cases) {
      render(<NoDataCard incidentName={incidentName} />);
      // Visible title text
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
      // Bell icon alt mirrors the visible title
      const bell = screen.getByAltText(expectedTitle);
      expect(bell.tagName).toBe("IMG");
      expect(bell.getAttribute("src")).toBe("bell.svg");
      cleanup();
    }
  });

  it("falls back to 'No New Alerts' for unknown / missing incidentName and renders the static empty-state copy", () => {
    // Unknown category — exercises the switch's default branch.
    const { rerender } = render(<NoDataCard incidentName="something-else" />);
    expect(screen.getByText("No New Alerts")).toBeInTheDocument();

    // Missing prop — undefined still hits the default branch.
    rerender(<NoDataCard />);
    expect(screen.getByText("No New Alerts")).toBeInTheDocument();

    // Static chrome that must always show up regardless of category.
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("No Data Available")).toBeInTheDocument();
    expect(
      screen.getByText("There are no alerts to display for this category.")
    ).toBeInTheDocument();
  });
});
