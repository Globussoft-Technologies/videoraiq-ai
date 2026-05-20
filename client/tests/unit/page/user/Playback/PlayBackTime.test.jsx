/**
 * src/page/user/Playback/components/PlayBackTime.jsx — pure date formatter
 * component that pads day/month/hh:mm:ss. No mocks required.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PlayBackTime from "../../../../../src/page/user/Playback/components/PlayBackTime.jsx";

describe("page/Playback PlayBackTime", () => {
  it("formats an explicit Date with zero-padded components", () => {
    // 2024-01-05 03:04:05 local time
    const d = new Date(2024, 0, 5, 3, 4, 5);
    const { getByText } = render(<PlayBackTime dateTime={d} />);
    expect(getByText("05-01-2024 03:04:05")).toBeInTheDocument();
  });

  it("accepts an ISO string and renders the formatted output", () => {
    // Use a Date built locally to avoid timezone surprises in the expected
    // string. We pass the iso form of that Date to the component.
    const d = new Date(2025, 5, 9, 12, 0, 30); // June 9th 2025 12:00:30 local
    const { getByText } = render(<PlayBackTime dateTime={d.toISOString()} />);
    expect(getByText("09-06-2025 12:00:30")).toBeInTheDocument();
  });

  it("falls back to epoch when dateTime is omitted", () => {
    const epoch = new Date(0);
    const pad = (n) => n.toString().padStart(2, "0");
    const expected = `${pad(epoch.getDate())}-${pad(
      epoch.getMonth() + 1
    )}-${epoch.getFullYear()} ${pad(epoch.getHours())}:${pad(
      epoch.getMinutes()
    )}:${pad(epoch.getSeconds())}`;
    const { getByText } = render(<PlayBackTime />);
    expect(getByText(expected)).toBeInTheDocument();
  });

  it("merges a custom className into the span", () => {
    const d = new Date(2024, 0, 5, 3, 4, 5);
    const { getByText } = render(
      <PlayBackTime dateTime={d} className="my-extra-class" />
    );
    expect(getByText("05-01-2024 03:04:05")).toHaveClass("my-extra-class");
  });

  it("wraps the output in the datetime-container div", () => {
    const d = new Date(2024, 0, 5, 3, 4, 5);
    const { container } = render(<PlayBackTime dateTime={d} />);
    expect(container.querySelector(".datetime-container")).not.toBeNull();
  });
});
