// Round 36: cover Incidents/components/IncidentCard — the small incident
// tile rendered by the Incidents grid. It composes a CameraCanvas video
// preview with several overlays: optional zone chip, optional "Mark as
// resolved" checkbox (only when canEdit), the incident title uppercased,
// a Report button (with "Reported" label when item.report.status is truthy),
// an optional Alert chip, and a footer with formatFromToTimestamps(alertText).
// The card itself is click-to-open; the inner Report button and the
// "Mark as resolved" wrapper both stopPropagation so the parent onClick is
// not triggered when those controls are interacted with. These tests pin
// each branch + the click delegation contract.
//
// Mocks: CameraCanvas (pulls UserContext + asset SVGs) and UtcConverter
// (formatFromToTimestamps; we make it return a sentinel so we can prove
// it received the raw alertText).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../../../../src/page/user/Streams/CameraCanvas.jsx", () => ({
  default: ({ src, thumbnailSrc }) => (
    <div data-testid="camera-canvas" data-src={src} data-thumb={thumbnailSrc} />
  ),
}));

vi.mock("../../../../../../src/utils/UtcConverter", () => ({
  formatFromToTimestamps: (text) => `FMT(${text})`,
}));

import IncidentCard from "../../../../../../src/page/user/Incidents/components/IncidentCard.jsx";

const baseItem = {
  id: "i-1",
  title: "intruder detected",
  videoSrc: "rtsp://demo/stream",
  thumbnailSrc: "thumb.png",
  alertText: "person from 2025-01-01T10:00:00 to 2025-01-01T10:00:05+05:30",
  alert: false,
  zone: "Zone A",
  timeOfIncident: "2025-01-01T10:00:00Z",
  report: { status: false },
};

describe("Incidents/components/IncidentCard", () => {
  it("renders title (uppercased), zone chip, formatted alertText, CameraCanvas, and the Report button", () => {
    render(
      <IncidentCard
        item={baseItem}
        onClick={vi.fn()}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
        onReport={vi.fn()}
      />
    );

    // Title is upper-cased.
    expect(screen.getByText("INTRUDER DETECTED")).toBeInTheDocument();
    // Zone chip rendered verbatim.
    expect(screen.getByText("Zone A")).toBeInTheDocument();
    // CameraCanvas mock receives src + thumbnailSrc.
    const canvas = screen.getByTestId("camera-canvas");
    expect(canvas).toHaveAttribute("data-src", "rtsp://demo/stream");
    expect(canvas).toHaveAttribute("data-thumb", "thumb.png");
    // alertText goes through formatFromToTimestamps (mocked sentinel).
    expect(
      screen.getByText(`FMT(${baseItem.alertText})`)
    ).toBeInTheDocument();
    // Report button starts with "Report" label (report.status falsy).
    expect(
      screen.getByRole("button", { name: /report/i })
    ).toBeInTheDocument();
    // canEdit=false hides the "Mark as resolved" affordance entirely.
    expect(screen.queryByText(/mark as resolved/i)).toBeNull();
    // alert=false hides the Alert chip.
    expect(screen.queryByText(/^alert$/i)).toBeNull();
  });

  it("omits the zone chip when item.zone is falsy", () => {
    render(
      <IncidentCard
        item={{ ...baseItem, zone: undefined }}
        onClick={vi.fn()}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
        onReport={vi.fn()}
      />
    );
    expect(screen.queryByText("Zone A")).toBeNull();
  });

  it("shows the Alert chip when item.alert is truthy", () => {
    render(
      <IncidentCard
        item={{ ...baseItem, alert: true }}
        onClick={vi.fn()}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
        onReport={vi.fn()}
      />
    );
    expect(screen.getByText("Alert")).toBeInTheDocument();
  });

  it("renders the Mark as resolved row only when canEdit is true and stops click propagation on it", () => {
    const onClick = vi.fn();
    render(
      <IncidentCard
        item={baseItem}
        onClick={onClick}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={true}
        onReport={vi.fn()}
      />
    );
    // The label text + role=group wrapper should both be present.
    expect(screen.getByText("Mark as resolved")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: /incident actions/i });
    expect(group).toBeInTheDocument();

    // Clicking the group wrapper should NOT bubble to the card's onClick.
    fireEvent.click(group);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows the 'Reported' label when item.report.status is truthy", () => {
    render(
      <IncidentCard
        item={{ ...baseItem, report: { status: true } }}
        onClick={vi.fn()}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
        onReport={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /reported/i })
    ).toBeInTheDocument();
  });

  it("clicking the card fires onClick, but clicking the Report button only fires onReport (stopPropagation)", () => {
    const onClick = vi.fn();
    const onReport = vi.fn();
    render(
      <IncidentCard
        item={baseItem}
        onClick={onClick}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
        onReport={onReport}
      />
    );

    // Card-level click bubbles to onClick.
    fireEvent.click(screen.getByText("INTRUDER DETECTED"));
    expect(onClick).toHaveBeenCalledTimes(1);

    // Report button stops propagation, so onClick must not be called again.
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onReport is omitted (optional callback)", () => {
    render(
      <IncidentCard
        item={baseItem}
        onClick={vi.fn()}
        resolved={false}
        onMarkResolved={vi.fn()}
        canEdit={false}
      />
    );
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /report/i }));
    }).not.toThrow();
  });
});
