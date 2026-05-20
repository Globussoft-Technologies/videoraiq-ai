/**
 * src/page/user/Detection/components/DeviceDetail.jsx — renders the
 * Model / NVR / IP triplet read off InnerSettings.channelData. Wrap in the
 * real provider; no mocks.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import DeviceDetail from "../../../../../src/page/user/Detection/components/DeviceDetail.jsx";
import { InnerSettingsProvider } from "../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";

const renderWith = (value) =>
  render(
    <InnerSettingsProvider value={value}>
      <DeviceDetail />
    </InnerSettingsProvider>
  );

describe("page/Detection DeviceDetail", () => {
  it("renders the section heading", () => {
    const { getByText } = renderWith({});
    expect(getByText("Device Detail")).toBeInTheDocument();
  });

  it("renders Model / NVR / IP Address labels", () => {
    const { getByText } = renderWith({});
    expect(getByText("Model")).toBeInTheDocument();
    expect(getByText("NVR")).toBeInTheDocument();
    expect(getByText("IP Address")).toBeInTheDocument();
  });

  it("falls back to 'N/A' when no channelData is present", () => {
    const { getAllByText } = renderWith({});
    expect(getAllByText("N/A")).toHaveLength(3);
  });

  it("displays model/nvrName/ip from the first linked camera's nvrId", () => {
    const { getByText, queryAllByText } = renderWith({
      channelData: {
        linkedCameras: [
          {
            nvrId: {
              model: "Hik-7000",
              nvrName: "Lobby-NVR",
              ip: "10.0.0.10",
            },
          },
        ],
      },
    });
    expect(getByText("Hik-7000")).toBeInTheDocument();
    expect(getByText("Lobby-NVR")).toBeInTheDocument();
    expect(getByText("10.0.0.10")).toBeInTheDocument();
    expect(queryAllByText("N/A")).toHaveLength(0);
  });

  it("falls back per-field when only some keys are present", () => {
    const { getByText, getAllByText } = renderWith({
      channelData: { linkedCameras: [{ nvrId: { model: "X1" } }] },
    });
    expect(getByText("X1")).toBeInTheDocument();
    // NVR and IP still N/A
    expect(getAllByText("N/A")).toHaveLength(2);
  });

  it("handles a missing linkedCameras array without throwing", () => {
    expect(() =>
      renderWith({ channelData: { linkedCameras: undefined } })
    ).not.toThrow();
  });
});
