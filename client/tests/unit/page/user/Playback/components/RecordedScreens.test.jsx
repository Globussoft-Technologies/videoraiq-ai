/**
 * src/page/user/Playback/components/RecordedScreens.jsx — pure list of segment
 * thumbnails. Tracks a local index initialized from `selectedIndex` and syncs
 * via useEffect when the prop changes; invokes handleTimeSelect on click.
 *
 * Mocks: 4 — asset .png imports stubbed to empty strings.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/assets/CounterImg1.png", () => ({ default: "" }));
vi.mock("@/assets/CounterImg2.png", () => ({ default: "" }));
vi.mock("@/assets/CounterImg3.png", () => ({ default: "" }));
vi.mock("@/assets/CounterImg4.png", () => ({ default: "" }));

import RecordedScreens from "@/page/user/Playback/components/RecordedScreens.jsx";

const segments = [
  { start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z" },
  { start: "2026-01-01T11:00:00Z", end: "2026-01-01T12:00:00Z" },
  { start: "2026-01-01T12:00:00Z", end: "2026-01-01T13:00:00Z" },
];

const formatTimeUTC = (iso) => iso.slice(11, 16);

describe("RecordedScreens", () => {
  it("renders one button per available segment", () => {
    render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("formats the start label of each segment", () => {
    render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
  });

  it("calls handleTimeSelect with the segment and index when a button is clicked", () => {
    const handle = vi.fn();
    render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={handle}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(segments[1], 1);
  });

  it("marks the selected button image with the active brightness class", () => {
    const { container } = render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={2}
      />
    );
    const imgs = container.querySelectorAll("img");
    // Selected: brightness-100 + shadow; unselected: brightness-75 + border-transparent.
    expect(imgs[2].className).toContain("brightness-100");
    expect(imgs[2].className).not.toContain("border-transparent");
    expect(imgs[0].className).toContain("brightness-75");
    expect(imgs[0].className).toContain("border-transparent");
  });

  it("updates the active thumbnail when selectedIndex prop changes", () => {
    const { rerender, container } = render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    let imgs = container.querySelectorAll("img");
    expect(imgs[0].className).toContain("brightness-100");

    rerender(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={1}
      />
    );
    imgs = container.querySelectorAll("img");
    expect(imgs[1].className).toContain("brightness-100");
    expect(imgs[0].className).toContain("brightness-75");
  });

  it("locally tracks click even before parent updates selectedIndex", () => {
    const { container } = render(
      <RecordedScreens
        availableSegments={segments}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[2]);
    const imgs = container.querySelectorAll("img");
    expect(imgs[2].className).toContain("brightness-100");
    expect(imgs[0].className).toContain("brightness-75");
  });

  it("renders nothing inside the row when availableSegments is empty", () => {
    const { container } = render(
      <RecordedScreens
        availableSegments={[]}
        handleTimeSelect={() => {}}
        formatTimeUTC={formatTimeUTC}
        selectedIndex={0}
      />
    );
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
