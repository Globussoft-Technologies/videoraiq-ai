/**
 * AlertPreferences — a collapsible card with six alert-type checkboxes
 * (fire / emotion / theft / traffic / phone / all). Each checkbox toggles
 * a single key on local state. No external API, no router, no toasts.
 *
 * Mocks: 6 svg asset imports (mocked to return stub URL strings so the
 *        Vite import doesn't crash under jsdom).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/assets/Emotionicon.svg", () => ({ default: "emotion.svg" }));
vi.mock("@/assets/Fireicon.svg", () => ({ default: "fire.svg" }));
vi.mock("@/assets/Phoneicon.svg", () => ({ default: "phone.svg" }));
vi.mock("@/assets/Thefticon.svg", () => ({ default: "theft.svg" }));
vi.mock("@/assets/Trafficcone.svg", () => ({ default: "traffic.svg" }));
vi.mock("@/assets/alert.svg", () => ({ default: "alert.svg" }));

import AlertPreferences from "@/page/user/Settings/components/AlertPreferences.jsx";

describe("AlertPreferences", () => {
  it("renders the heading and all six option labels by default", () => {
    render(<AlertPreferences />);
    expect(screen.getByText("Alert Preferences")).toBeInTheDocument();
    expect(screen.getByText("Fire Alert")).toBeInTheDocument();
    expect(screen.getByText("Emotion Detection")).toBeInTheDocument();
    expect(screen.getByText("Theft Alert")).toBeInTheDocument();
    expect(screen.getByText("Traffic Alert")).toBeInTheDocument();
    expect(screen.getByText("Phone Use Detected")).toBeInTheDocument();
    expect(screen.getByText("All Alerts")).toBeInTheDocument();
  });

  it("starts with every checkbox unchecked", () => {
    const { container } = render(<AlertPreferences />);
    const boxes = container.querySelectorAll('[role="checkbox"]');
    expect(boxes.length).toBe(6);
    boxes.forEach((b) => {
      expect(b.getAttribute("data-state")).toBe("unchecked");
    });
  });

  it("toggles a single checkbox without affecting siblings", () => {
    const { container } = render(<AlertPreferences />);
    const boxes = container.querySelectorAll('[role="checkbox"]');
    fireEvent.click(boxes[0]);
    expect(boxes[0].getAttribute("data-state")).toBe("checked");
    // Others remain unchecked
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].getAttribute("data-state")).toBe("unchecked");
    }
    // Click again to toggle off
    fireEvent.click(boxes[0]);
    expect(boxes[0].getAttribute("data-state")).toBe("unchecked");
  });

  it("collapses and re-expands when the header bar is clicked", () => {
    render(<AlertPreferences />);
    expect(screen.getByText("Fire Alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Alert Preferences"));
    expect(screen.queryByText("Fire Alert")).toBeNull();
    fireEvent.click(screen.getByText("Alert Preferences"));
    expect(screen.getByText("Fire Alert")).toBeInTheDocument();
  });

  it("renders each option's image with the resolved mocked asset url", () => {
    const { container } = render(<AlertPreferences />);
    const imgs = container.querySelectorAll("img");
    const srcs = Array.from(imgs).map((i) => i.getAttribute("src"));
    expect(srcs).toContain("fire.svg");
    expect(srcs).toContain("emotion.svg");
    expect(srcs).toContain("theft.svg");
    expect(srcs).toContain("traffic.svg");
    expect(srcs).toContain("phone.svg");
    expect(srcs).toContain("alert.svg");
  });
});
