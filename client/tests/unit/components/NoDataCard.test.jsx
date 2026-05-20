/**
 * NoDataCard renders an "empty state" badge with a title that depends on
 * the `incidentName` prop. Verify each switch arm and the default fallback,
 * and that the static "No Data Available" / "Inactive" labels are present.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NoDataCard from "../../../src/page/user/Dashboard/Alertwidgets/NoDataCard.jsx";

describe("Dashboard/NoDataCard", () => {
  it("renders the empty-state body", () => {
    render(<NoDataCard incidentName="lineCrossing" />);
    expect(screen.getByText("No Data Available")).toBeInTheDocument();
    expect(
      screen.getByText("There are no alerts to display for this category.")
    ).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("uses the lineCrossing title", () => {
    render(<NoDataCard incidentName="lineCrossing" />);
    expect(screen.getByText("No Person Crossing Alerts")).toBeInTheDocument();
  });

  it("uses the unauthorizedAccess title", () => {
    render(<NoDataCard incidentName="unauthorizedAccess" />);
    expect(screen.getByText("No Unauthorized Access Alerts")).toBeInTheDocument();
  });

  it("uses the motionDetection title", () => {
    render(<NoDataCard incidentName="motionDetection" />);
    expect(screen.getByText("No Motion Detection Alerts")).toBeInTheDocument();
  });

  it("uses the genericObjectDetection title", () => {
    render(<NoDataCard incidentName="genericObjectDetection" />);
    expect(screen.getByText("No Object Detection Alerts")).toBeInTheDocument();
  });

  it("uses the loiteringWithoutAuth title", () => {
    render(<NoDataCard incidentName="loiteringWithoutAuth" />);
    expect(screen.getByText("No Unauthorized Loitering Alerts")).toBeInTheDocument();
  });

  it("uses the loiteringWithAuth title", () => {
    render(<NoDataCard incidentName="loiteringWithAuth" />);
    expect(screen.getByText("No Authorized Loitering Alerts")).toBeInTheDocument();
  });

  it("uses the countPersons title", () => {
    render(<NoDataCard incidentName="countPersons" />);
    expect(screen.getByText("No Person Count Alerts")).toBeInTheDocument();
  });

  it("falls back to a generic title for unknown incident names", () => {
    render(<NoDataCard incidentName="something-else" />);
    expect(screen.getByText("No New Alerts")).toBeInTheDocument();
  });

  it("falls back to a generic title when no incident name is supplied", () => {
    render(<NoDataCard />);
    expect(screen.getByText("No New Alerts")).toBeInTheDocument();
  });

  it("renders a bell icon with the matching alt text", () => {
    render(<NoDataCard incidentName="lineCrossing" />);
    const img = screen.getByAltText("No Person Crossing Alerts");
    expect(img.tagName).toBe("IMG");
  });
});
