/**
 * VideoModelStream is a dialog wrapper around CameraStream that overlays
 * stats (people / suspicious / phone / emotion) and an optional AlertBadge
 * for smoke/fire incidents.
 *
 * We mock the dialog primitives (so Radix portals don't get in the way),
 * the CameraStream child (since it isn't the unit under test), and verify
 * the three render branches:
 *   - null when no videoData
 *   - default render with stats
 *   - smoke (id=0) and fire (id=1) AlertBadge variants
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock @/components/ui/dialog so content renders inline (no portals).
vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) =>
    open ? <div data-slot="dialog">{children}</div> : null;
  const DialogContent = ({ children, ...rest }) => (
    <div data-slot="dialog-content" {...rest}>
      {children}
    </div>
  );
  return { Dialog, DialogContent };
});

// CameraStream is heavy (HLS + token handling). The unit under test only
// cares that it renders some marker we can assert on.
vi.mock("@/page/user/Streams/CameraPlay/CameraStream", () => ({
  default: ({ config, label }) => (
    <div data-testid="camera-stream" data-label={label}>
      {String(config?.url ?? "")}
    </div>
  ),
}));

const { default: VideoModelStream } = await import(
  "../../../src/components/VideoModelStream.jsx"
);

describe("VideoModelStream", () => {
  it("returns null when videoData is missing", () => {
    const { container } = render(
      <VideoModelStream isOpen={true} onClose={() => {}} videoData={null} />
    );
    // No dialog wrapper because the early return fires before Dialog renders.
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
  });

  it("renders nothing when isOpen is false (Dialog passthrough)", () => {
    const { container } = render(
      <VideoModelStream
        isOpen={false}
        onClose={() => {}}
        videoData={{ id: 2, title: "Front Door", timestamp: "10:00" }}
      />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
  });

  it("renders title, timestamp, live badge, and the four default StatCard labels", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{
          id: 5,
          title: "Lobby Cam",
          timestamp: "12:34:56",
          config: { url: "https://example.test/feed.m3u8" },
          label: "Lobby",
        }}
      />
    );
    // Title + timestamp + Live banner
    expect(screen.getByText("Lobby Cam")).toBeInTheDocument();
    expect(screen.getByText("12:34:56")).toBeInTheDocument();
    expect(screen.getByText(/Live/)).toBeInTheDocument();

    // All four StatCard labels render.
    expect(screen.getByText("People Detected")).toBeInTheDocument();
    expect(screen.getByText("Suspicious Activity")).toBeInTheDocument();
    expect(screen.getByText("Phone Usage")).toBeInTheDocument();
    expect(screen.getByText("Emotion Detected")).toBeInTheDocument();

    // CameraStream wired with the config + label props.
    const stream = screen.getByTestId("camera-stream");
    expect(stream.getAttribute("data-label")).toBe("Lobby");
    expect(stream.textContent).toContain("https://example.test/feed.m3u8");
  });

  it("falls back to default StatCard values when fields are missing", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{ id: 5, title: "X", timestamp: "00:00" }}
      />
    );
    // Defaults: peopleDetected=20, suspicious='None', phone=3, emotion='Concerned'
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Concerned")).toBeInTheDocument();
  });

  it("uses provided StatCard values over defaults", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{
          id: 7,
          title: "Y",
          timestamp: "01:00",
          peopleDetected: 42,
          suspiciousActivity: "Loitering",
          phoneUsage: 9,
          emotion: "Calm",
        }}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Loitering")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
  });

  it("renders the smoke AlertBadge variant for videoData.id === 0", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{ id: 0, title: "Cam 0", timestamp: "01:00" }}
      />
    );
    expect(screen.getByText("Smoke Detected")).toBeInTheDocument();
    expect(screen.getByText("Mild")).toBeInTheDocument();
    expect(screen.getByText(/Mark as resolved/i)).toBeInTheDocument();
  });

  it("renders the fire AlertBadge variant for videoData.id === 1", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{ id: 1, title: "Cam 1", timestamp: "02:00" }}
      />
    );
    expect(screen.getByText("Fire Detected")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("hides the AlertBadge for non-smoke/non-fire incidents (id > 1)", () => {
    render(
      <VideoModelStream
        isOpen={true}
        onClose={() => {}}
        videoData={{ id: 4, title: "Cam 4", timestamp: "03:00" }}
      />
    );
    expect(screen.queryByText("Smoke Detected")).toBeNull();
    expect(screen.queryByText("Fire Detected")).toBeNull();
    expect(screen.queryByText(/Mark as resolved/i)).toBeNull();
  });
});
