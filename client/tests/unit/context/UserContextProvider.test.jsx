/**
 * src/context/UserContext/Provider.jsx is a state provider that fetches the
 * sidebar detection config + recent incidents at mount and exposes a
 * `handleDetectionToggle` action. We mock both API modules, sonner, and the
 * SVG asset imports, then drive the surface through a consumer component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

// ---- API + side-effect mocks ----
const getSideBarConfig = vi.hoisted(() => vi.fn());
const updateSidebarConfig = vi.hoisted(() => vi.fn());
const getRecentIncidents = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/layout/Api/get/index.jsx", () => ({ getSideBarConfig }));
vi.mock("@/layout/Api/put/index.jsx", () => ({ updateSidebarConfig }));
vi.mock("@/page/user/Dashboard/Api/get", () => ({ getRecentIncidents }));
vi.mock("sonner", () => ({ toast }));

// SVG assets - vite normally turns them into URL strings; mock for safety.
vi.mock("@/assets/countPersons.svg", () => ({ default: "countPersons.svg" }));
vi.mock("@/assets/countVehicles.svg", () => ({ default: "countVehicles.svg" }));
vi.mock("@/assets/motionDetection.svg", () => ({
  default: "motionDetection.svg",
}));
vi.mock("@/assets/genericObjectDetection.svg", () => ({
  default: "genericObjectDetection.svg",
}));
vi.mock("@/assets/loiteringWithoutAuth.svg", () => ({
  default: "loiteringWithoutAuth.svg",
}));
vi.mock("@/assets/loiteringWithAuth.svg", () => ({
  default: "loiteringWithAuth.svg",
}));
vi.mock("@/assets/lineCrossing.svg", () => ({
  default: "lineCrossing.svg",
}));
vi.mock("@/assets/unauthorizedAccess.svg", () => ({
  default: "unauthorizedAccess.svg",
}));
vi.mock("@/assets/Geartool.svg", () => ({ default: "Geartool.svg" }));

const ProviderMod = await import("@/context/UserContext/Provider.jsx");
const ChartProvider = ProviderMod.default;
const UserContextMod = await import("@/context/UserContext/Context.jsx");
const UserContext = UserContextMod.default;

function Consumer({ onCtx }) {
  const ctx = React.useContext(UserContext);
  onCtx(ctx);
  return (
    <div>
      <div data-testid="loading">{String(ctx.isLoading)}</div>
      <div data-testid="items-count">{ctx.detectionItems.length}</div>
      <div data-testid="states">{JSON.stringify(ctx.detectionStates)}</div>
      <div data-testid="switchOn">{JSON.stringify(ctx.switchOn)}</div>
      <button
        data-testid="toggle-known"
        onClick={() => ctx.handleDetectionToggle("countPersons", true)}
      >
        toggle
      </button>
      <button
        data-testid="toggle-unknown"
        onClick={() => ctx.handleDetectionToggle("someUnknownKey", true)}
      >
        toggle-unknown
      </button>
      <button
        data-testid="refresh"
        onClick={() => ctx.GetIncidentsDashboard()}
      >
        refresh
      </button>
      <button
        data-testid="set-show"
        onClick={() => ctx.setSidebarShow(true)}
      >
        show
      </button>
      <button
        data-testid="set-stream"
        onClick={() => ctx.setStreamModalShow(true)}
      >
        stream
      </button>
    </div>
  );
}

beforeEach(() => {
  getSideBarConfig.mockReset();
  updateSidebarConfig.mockReset();
  getRecentIncidents.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("UserContext ChartProvider", () => {
  it("loads sidebar config on mount and exposes detectionItems + states", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "Persons", isEnabled: true },
            { detectionType: "motionDetection", displayName: "Motion", isEnabled: false },
            { detectionType: "someUnknownDetection", displayName: "Mystery", isEnabled: true },
          ],
        },
      },
    });
    getRecentIncidents.mockResolvedValue({ status: 500, data: {} });

    const capture = vi.fn();
    render(
      <ChartProvider>
        <Consumer onCtx={capture} />
      </ChartProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("items-count").textContent).toBe("3");

    // detectionStates should reflect each detectionType's isEnabled
    const states = JSON.parse(screen.getByTestId("states").textContent);
    expect(states.countPersons).toBe(true);
    expect(states.motionDetection).toBe(false);
    expect(states.someUnknownDetection).toBe(true);
  });

  it("formats known detection labels and falls back to the raw key for unknown ones", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "PCount", isEnabled: true },
            { detectionType: "lineCrossing", displayName: "LC", isEnabled: true },
            { detectionType: "weirdNew", displayName: "X", isEnabled: true },
          ],
        },
      },
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    const captured = [];
    render(
      <ChartProvider>
        <Consumer onCtx={(c) => captured.push(c)} />
      </ChartProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    const last = captured[captured.length - 1];
    const labels = last.detectionItems.map((i) => i.label);
    expect(labels).toContain("Persons Count");
    expect(labels).toContain("Line Crossing");
    // unknown key falls back to itself
    expect(labels).toContain("weirdNew");
    // each item has a `src` (the mocked SVG path or Geartool fallback)
    last.detectionItems.forEach((i) => {
      expect(typeof i.src).toBe("string");
    });
  });

  it("treats non-200 sidebar config as 'no data' but still stops loading", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 500,
      body: { data: null, message: "boom" },
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );
    expect(screen.getByTestId("items-count").textContent).toBe("0");
  });

  it("swallows sidebar-config rejections and still settles loading=false", async () => {
    const err = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    getSideBarConfig.mockRejectedValue(new Error("network down"));
    getRecentIncidents.mockResolvedValue({ status: 500 });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("handleDetectionToggle updates state and shows success toast on 200", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "P", isEnabled: false },
          ],
        },
      },
    });
    updateSidebarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        message: "updated",
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "P", isEnabled: true },
            { detectionType: "lineCrossing", displayName: "LC", isEnabled: false },
          ],
        },
      },
    });
    // GetIncidentsDashboard re-fires after a successful toggle; it must resolve
    getRecentIncidents.mockResolvedValue({
      status: 200,
      data: { body: { data: { foo: { displayName: "F" } } } },
    });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle-known"));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("updated"));
    expect(updateSidebarConfig).toHaveBeenCalledWith({
      detectionConfigs: [{ detectionType: "countPersons", isEnabled: true }],
    });
    expect(screen.getByTestId("items-count").textContent).toBe("2");
  });

  it("handleDetectionToggle reverts and toasts on non-200 update", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "P", isEnabled: false },
          ],
        },
      },
    });
    updateSidebarConfig.mockResolvedValue({
      statusCode: 400,
      body: { message: "denied" },
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle-known"));
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("denied"));
    // states reverted -> countPersons false again
    const states = JSON.parse(screen.getByTestId("states").textContent);
    expect(states.countPersons).toBe(false);
  });

  it("handleDetectionToggle reverts and toasts on a rejected update", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          detectionConfigs: [
            { detectionType: "countPersons", displayName: "P", isEnabled: false },
          ],
        },
      },
    });
    updateSidebarConfig.mockRejectedValue(new Error("offline"));
    getRecentIncidents.mockResolvedValue({ status: 500 });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle-known"));
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to update detection settings. Please try again."
      )
    );
    errSpy.mockRestore();
  });

  it("handleDetectionToggle uses a default error message when body.message is absent", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: {
        data: { detectionConfigs: [] },
      },
    });
    updateSidebarConfig.mockResolvedValue({
      statusCode: 500,
      body: {},
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    render(
      <ChartProvider>
        <Consumer onCtx={() => {}} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle-known"));
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to update detection settings"
      )
    );
  });

  it("GetIncidentsDashboard maps a populated incident object into rich metadata", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: { data: { detectionConfigs: [] } },
    });
    getRecentIncidents.mockResolvedValue({
      status: 200,
      data: {
        body: {
          data: {
            empty: {},
            rich: {
              displayName: "Rich Incident",
              videoLink: "v.mp4",
              Image: "/img.jpg",
              alertThreshold: 5,
              cameraId: "cam-1",
              channelId: "chan-1",
              createdAt: "2024-01-01T00:00:00Z",
              description: "desc",
              incidentType: "fire",
              nvrId: "nvr-1",
              zone: "Z1",
              severity: "high",
              resolved: true,
              type: "alert",
              personDetected: [{ name: "p1" }, { name: "p2" }],
              channelData: { name: "Front Door" },
            },
          },
        },
      },
    });

    let captured;
    render(
      <ChartProvider>
        <Consumer onCtx={(c) => (captured = c)} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    // The most recent context value has switchOn populated as the incident list
    await waitFor(() => {
      expect(Array.isArray(captured.switchOn)).toBe(true);
      expect(captured.switchOn.length).toBe(2);
    });

    const rich = captured.switchOn.find((i) => i.label === "Rich Incident");
    expect(rich).toBeDefined();
    expect(rich.state).toBe(true);
    expect(rich.resolved).toBe(true);
    expect(rich.personDetected.length).toBe(2);
    // metaData filters out falsy entries: should have entries for zone, camera,
    // severity, resolved, type, person-detected (6 truthy entries)
    expect(rich.metaData.length).toBe(6);
    expect(rich.metaData.find((m) => m.label === "Zone").value).toBe("Z1");

    const empty = captured.switchOn.find((i) => i.label === "empty");
    expect(empty).toBeDefined();
    expect(empty.state).toBe(false);
    expect(empty.metaData).toEqual([]);
    expect(empty.resolved).toBe(false);
  });

  it("setters (sidebarShow, streamModalShow) update state", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: { data: { detectionConfigs: [] } },
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    let last;
    render(
      <ChartProvider>
        <Consumer onCtx={(c) => (last = c)} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-show"));
    });
    expect(last.sidebarShow).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-stream"));
    });
    expect(last.streamModalShow).toBe(true);
  });

  it("GetIncidentsDashboard returns silently on non-200", async () => {
    getSideBarConfig.mockResolvedValue({
      statusCode: 200,
      body: { data: { detectionConfigs: [] } },
    });
    getRecentIncidents.mockResolvedValue({ status: 500 });

    let captured;
    render(
      <ChartProvider>
        <Consumer onCtx={(c) => (captured = c)} />
      </ChartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    // switchOn remained as the default array (empty)
    expect(captured.switchOn).toEqual([]);

    // The manual refresh path also returns undefined for non-200
    await act(async () => {
      fireEvent.click(screen.getByTestId("refresh"));
    });
    expect(captured.switchOn).toEqual([]);
  });
});
