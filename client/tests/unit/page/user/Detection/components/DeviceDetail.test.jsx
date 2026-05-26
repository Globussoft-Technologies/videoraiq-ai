/**
 * src/page/user/Detection/components/DeviceDetail.jsx — read-only "Device
 * Detail" card on the Innersettings page. Pure presentational:
 *   - Reads `channelData` off the InnerSettings context.
 *   - First linked camera (channelData.linkedCameras[0]) provides nvrId.
 *   - Renders three labeled fields: Model / NVR / IP Address pulled from
 *     nvr.model / nvr.nvrName / nvr.ip respectively. Each falls back to
 *     'N/A' when the source value is missing/falsy.
 *
 * Mocks (1):
 *   1. ./InnerSettingsContext - useInnerSettings (return channelData)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const innerRef = vi.hoisted(() => ({ channelData: null }));
vi.mock(
  "@/page/user/Detection/components/InnerSettingsContext",
  () => ({
    useInnerSettings: () => innerRef,
    InnerSettingsProvider: ({ children }) => children,
  })
);

const { default: DeviceDetail } = await import(
  "../../../../../../src/page/user/Detection/components/DeviceDetail.jsx"
);

function setChannel(data) {
  innerRef.channelData = data;
}

describe("Detection/components/DeviceDetail", () => {
  it("renders the section heading + the three labeled fields", () => {
    setChannel(null);
    render(<DeviceDetail />);
    expect(screen.getByText("Device Detail")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("NVR")).toBeInTheDocument();
    expect(screen.getByText("IP Address")).toBeInTheDocument();
  });

  it("falls back to 'N/A' for all three fields when channelData is null", () => {
    setChannel(null);
    render(<DeviceDetail />);
    // Three N/A values rendered (one per field).
    const naCells = screen.getAllByText("N/A");
    expect(naCells.length).toBe(3);
  });

  it("falls back to 'N/A' when channelData has no linkedCameras", () => {
    setChannel({});
    render(<DeviceDetail />);
    expect(screen.getAllByText("N/A").length).toBe(3);
  });

  it("falls back to 'N/A' when linkedCameras is empty array", () => {
    setChannel({ linkedCameras: [] });
    render(<DeviceDetail />);
    expect(screen.getAllByText("N/A").length).toBe(3);
  });

  it("falls back to 'N/A' when first linkedCamera has no nvrId", () => {
    setChannel({ linkedCameras: [{ name: "cam-1" }] });
    render(<DeviceDetail />);
    expect(screen.getAllByText("N/A").length).toBe(3);
  });

  it("renders all three values when the first linkedCamera has a fully populated nvrId", () => {
    setChannel({
      linkedCameras: [
        {
          nvrId: {
            model: "Hikvision DS-7616",
            nvrName: "Main NVR",
            ip: "192.168.1.100",
          },
        },
      ],
    });
    render(<DeviceDetail />);
    expect(screen.getByText("Hikvision DS-7616")).toBeInTheDocument();
    expect(screen.getByText("Main NVR")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
    // No N/A fall-backs in this branch.
    expect(screen.queryByText("N/A")).toBeNull();
  });

  it("partial nvrId — only model present, NVR/IP fall back to 'N/A'", () => {
    setChannel({
      linkedCameras: [{ nvrId: { model: "Dahua XVR" } }],
    });
    render(<DeviceDetail />);
    expect(screen.getByText("Dahua XVR")).toBeInTheDocument();
    expect(screen.getAllByText("N/A").length).toBe(2);
  });

  it("only ever reads the FIRST linkedCamera — second is ignored", () => {
    setChannel({
      linkedCameras: [
        { nvrId: { model: "First", nvrName: "First NVR", ip: "10.0.0.1" } },
        { nvrId: { model: "Second", nvrName: "Second NVR", ip: "10.0.0.2" } },
      ],
    });
    render(<DeviceDetail />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("First NVR")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    // The second camera's values must NOT appear.
    expect(screen.queryByText("Second")).toBeNull();
    expect(screen.queryByText("Second NVR")).toBeNull();
    expect(screen.queryByText("10.0.0.2")).toBeNull();
  });

  it("renders the heading inside an <h3> tag (semantic guard)", () => {
    setChannel(null);
    const { container } = render(<DeviceDetail />);
    const h3 = container.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3.textContent).toBe("Device Detail");
  });
});
