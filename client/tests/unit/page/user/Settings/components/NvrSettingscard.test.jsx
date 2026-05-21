/**
 * NVRSettingsCard — a presentational card that renders nine NVR fields
 * from a `settings` prop (name, username, password, ipAddress, rtspPort,
 * totalChannels and labels). No state, no effects, no external deps.
 *
 * Mocks: 0
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import NVRSettingsCard from "@/page/user/Settings/components/NvrSettingscard.jsx";

describe("NVRSettingsCard", () => {
  const settings = {
    name: "Lobby NVR",
    username: "admin",
    password: "secret-pw",
    ipAddress: "10.0.0.5",
    rtspPort: "554",
    totalChannels: "16",
  };

  it("renders every value from the settings prop", () => {
    render(<NVRSettingsCard settings={settings} />);
    expect(screen.getByText("Lobby NVR")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("secret-pw")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.getByText("554")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("renders every static label", () => {
    render(<NVRSettingsCard settings={settings} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("IP Address")).toBeInTheDocument();
    expect(screen.getByText("RTSP Port")).toBeInTheDocument();
    expect(screen.getByText("Total Channels")).toBeInTheDocument();
  });

  it("renders empty values without crashing when fields are missing", () => {
    const { container } = render(<NVRSettingsCard settings={{}} />);
    // Six value spans should still be present (just empty)
    expect(container.querySelectorAll(".text-\\[\\#333333\\]").length).toBeGreaterThanOrEqual(6);
    // Labels remain
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Total Channels")).toBeInTheDocument();
  });
});
