/**
 * StreamHeader renders a page header with an optional config button. The
 * button visibility is driven by the `showConfigButton` prop AND the
 * VITE_LOCAL_SETUP env flag (hidden when "true"). The previously commented
 * date-range UI is not rendered, so we focus on the title + config button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StreamHeader from "../../../src/components/StreamHeader.jsx";

describe("StreamHeader", () => {
  it("renders the title as a heading", () => {
    render(<StreamHeader title="Live Streams" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Live Streams");
  });

  it("shows the default config button text when showConfigButton is true", () => {
    render(<StreamHeader title="Streams" showConfigButton />);
    expect(screen.getByRole("button", { name: /CCTV Configurations/i })).toBeInTheDocument();
  });

  it("uses a custom buttonText override", () => {
    render(
      <StreamHeader
        title="Streams"
        showConfigButton
        buttonText="Manage Cameras"
      />
    );
    expect(
      screen.getByRole("button", { name: /Manage Cameras/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /CCTV Configurations/i })
    ).not.toBeInTheDocument();
  });

  it("hides the config button when showConfigButton is false", () => {
    render(<StreamHeader title="Streams" showConfigButton={false} />);
    expect(
      screen.queryByRole("button", { name: /CCTV Configurations/i })
    ).not.toBeInTheDocument();
  });

  it("calls onConfigClick when the config button is clicked", () => {
    const onConfigClick = vi.fn();
    render(
      <StreamHeader
        title="Streams"
        showConfigButton
        onConfigClick={onConfigClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /CCTV Configurations/i }));
    expect(onConfigClick).toHaveBeenCalledTimes(1);
  });

  it("hides the config button when VITE_LOCAL_SETUP env is 'true'", () => {
    vi.stubEnv('VITE_LOCAL_SETUP', 'true');
    try {
      render(<StreamHeader title="Streams" showConfigButton />);
      expect(
        screen.queryByRole("button", { name: /CCTV Configurations/i })
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
