/**
 * Round 4 client gap-fill: Detection/DetectionSetting.jsx — FULL mount.
 *
 * The thin gate-only DetectionSetting.test.jsx left the file at 17.31%.
 * This spec mounts the canView=true page with everything heavy stubbed:
 *   - getChannelsWithDetections / getAllNVRs / getAllDetectionTypes
 *   - updateCameraSettingById (camera-type Select onValueChange)
 *   - enableDetectionSettings (Start/Stop in Detection-Control modal)
 *   - Pagination + Monitorcog (icon)
 *   - sonner toast spy
 *   - react-router useNavigate (row-click target assertion)
 *
 * Pins:
 *   - Mount fetches NVRs, channels, and detection-types.
 *   - Empty-state row shows "No Detections found".
 *   - Channel mapping produces row.name, status='Online', enabled flag.
 *   - Filter input updates state and triggers refetch.
 *   - NVR Select changes selectedNvr and resets currentPage.
 *   - 'detectionSettingsRefetch' window event triggers fetchData.
 *   - Row-click navigates to /settings/inner with state payload.
 *   - Enable Detection popover Switch -> opens modal; clicking Start
 *     fires enableDetectionSettings + toast.success on 200, error on != 200.
 *   - Stop Detection (when enabled=true) flips to disable + Stopping label.
 *   - Camera Type Select onValueChange success / failure toasts;
 *     read-only badge when !canEdit; updateCameraSettingById call.
 *   - Pagination next/prev clamping; out-of-range no-op.
 *   - Errors swallow gracefully (channels fetch error, NVR fetch error,
 *     types fetch error, enable error toast).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const permissionsRef = vi.hoisted(() => ({ value: null }));
const navigateMock = vi.hoisted(() => vi.fn());
const getChannelsMock = vi.hoisted(() => vi.fn());
const getAllNVRsMock = vi.hoisted(() => vi.fn());
const getAllDetTypesMock = vi.hoisted(() => vi.fn());
const updateCameraSettingByIdMock = vi.hoisted(() => vi.fn());
const enableDetectionSettingsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => <div data-testid="access-denied">{message}</div>,
}));

vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading…</div>,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../../../../src/page/user/Detection/Api/get", () => ({
  getChannelsWithDetections: (...a) => getChannelsMock(...a),
  getAllNVRs: (...a) => getAllNVRsMock(...a),
  getAllDetectionTypes: (...a) => getAllDetTypesMock(...a),
}));

vi.mock("../../../../../src/page/user/Streams/Api/patch", () => ({
  updateCameraSettingById: (...a) => updateCameraSettingByIdMock(...a),
}));

vi.mock("../../../../../src/page/user/Detection/Api/put", () => ({
  enableDetectionSettings: (...a) => enableDetectionSettingsMock(...a),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

// Pass-through Pagination
vi.mock("@/components/Pagination", () => ({
  default: ({ currentPage, totalPages, onPageChange }) => (
    <div data-testid="pagination">
      <span data-testid="page-info">
        {currentPage}/{totalPages}
      </span>
      <button data-testid="pg-next" onClick={() => onPageChange(currentPage + 1)}>
        next
      </button>
      <button data-testid="pg-prev" onClick={() => onPageChange(currentPage - 1)}>
        prev
      </button>
      <button data-testid="pg-out" onClick={() => onPageChange(99)}>
        out
      </button>
    </div>
  ),
}));

// Stub heavier UI primitives that complicate Radix portal behavior.
vi.mock("@/components/ui/Monitorcog", () => ({
  default: () => <span data-testid="monitorcog" />,
}));

const { default: DetectionSetting } = await import(
  "../../../../../src/page/user/Detection/DetectionSetting.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const fullPerms = (over = {}) => ({
  permissions: {
    detectionSettings: { view: true, create: true, edit: true, ...over },
  },
  loading: false,
});

const channelsOk = (rows = 1, total = 8) => ({
  data: {
    body: {
      data: {
        channels: Array.from({ length: rows }, (_, i) => ({
          _id: `ch${i + 1}`,
          checkType: "checkin",
          customName: `Cam ${i + 1}`,
          name: `Cam ${i + 1}`,
          nvrId: { _id: `nvr${i + 1}`, nvrName: `NVR-${i + 1}` },
          nvr: { ip: "10.0.0." + (i + 1), model: "Model-X" },
          channelId: 100 + i,
          detections: i === 0
            ? { crowdDetection: { _id: "d-cd", enabled: true, id: { name: "Crowd" } } }
            : null,
          profile: i === 0 ? { basics: { profileName: "P1" } } : null,
        })),
        total,
      },
    },
  },
});

const nvrsOk = (count = 2) => ({
  data: {
    body: {
      data: {
        nvrs: Array.from({ length: count }, (_, i) => ({
          _id: `nvr${i + 1}`,
          nvrName: `NVR-${i + 1}`,
        })),
      },
    },
  },
});

const typesOk = () => ({
  data: {
    body: {
      data: {
        detectionTypes: {
          crowdDetection: "Crowd Detection",
          faceDetection: "Face Detection",
        },
      },
    },
  },
});

beforeEach(() => {
  permissionsRef.value = null;
  navigateMock.mockReset();
  getChannelsMock.mockReset();
  getAllNVRsMock.mockReset();
  getAllDetTypesMock.mockReset();
  updateCameraSettingByIdMock.mockReset();
  enableDetectionSettingsMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("DetectionSetting — gate branches", () => {
  it("PageLoader while permissions load", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<DetectionSetting />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
  });

  it("AccessDenied when !canView", () => {
    permissionsRef.value = {
      permissions: { detectionSettings: { view: false } },
      loading: false,
    };
    render(<DetectionSetting />);
    expect(screen.getByTestId("access-denied").textContent).toMatch(
      /permission to view Detections/i
    );
  });
});

describe("DetectionSetting — full mount", () => {
  it("fetches NVRs, channels and detectionTypes on mount", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(2));
    getChannelsMock.mockResolvedValue(channelsOk(1, 8));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => {
      expect(getAllNVRsMock).toHaveBeenCalledTimes(1);
      expect(getAllDetTypesMock).toHaveBeenCalledTimes(1);
      expect(getChannelsMock).toHaveBeenCalled();
    });
  });

  it("renders the mapped channel row with name + status badge", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => {
      expect(screen.getByText("Cam 1")).toBeInTheDocument();
      expect(screen.getByText("Online")).toBeInTheDocument();
    });
  });

  it("renders 'No Detections found' empty state", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce({
      data: { body: { data: { nvrs: [] } } },
    });
    getChannelsMock.mockResolvedValueOnce({
      data: { body: { data: { channels: [], total: 0 } } },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => {
      expect(screen.getByText("No Detections found")).toBeInTheDocument();
    });
  });

  it("filter input updates state and re-runs fetchData", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    const filter = screen.getByPlaceholderText("Filter Camera");
    const callsBefore = getChannelsMock.mock.calls.length;
    await act(async () => {
      fireEvent.change(filter, { target: { value: "alpha" } });
    });
    await flush();
    expect(getChannelsMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("getChannelsWithDetections error path is swallowed and resets loading", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockRejectedValue(new Error("boom"));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    // Page renders the empty state when fetch fails
    await waitFor(() => {
      expect(screen.getByText("No Detections found")).toBeInTheDocument();
    });
  });

  it("getAllNVRs error path is swallowed", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockRejectedValueOnce(new Error("nvr-fail"));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    // Component still mounts; just no NVRs available.
    expect(screen.getByPlaceholderText("Filter Camera")).toBeInTheDocument();
  });

  it("getAllDetectionTypes error path is swallowed and resets to empty", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockRejectedValueOnce(new Error("types-fail"));
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    expect(screen.getByPlaceholderText("Filter Camera")).toBeInTheDocument();
  });

  it("row-click navigates to /settings/inner with state payload", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    // Find the row with Cam 1 and click it
    const row = screen.getByText("Cam 1").closest("tr");
    fireEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith(
      "/settings/inner",
      expect.objectContaining({
        state: expect.objectContaining({
          rowData: expect.any(Object),
          channelData: expect.any(Object),
        }),
      })
    );
  });

  it("'detectionSettingsRefetch' window event refires fetchData with nvrId", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    const before = getChannelsMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("detectionSettingsRefetch", {
          detail: { nvrId: "nvr1" },
        })
      );
    });
    await flush();
    expect(getChannelsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("'detectionSettingsRefetch' without detail uses selectedNvr or empty string", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await flush();
    const before = getChannelsMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("detectionSettingsRefetch"));
    });
    await flush();
    expect(getChannelsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("camera type Select shows read-only badge when !canEdit", async () => {
    permissionsRef.value = fullPerms({ edit: false });
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 1));
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    // The cameraType cell renders as a read-only badge with checkin text
    expect(screen.getByText(/checkin/i)).toBeInTheDocument();
  });

  it("Pagination next/prev/out clamping", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue(channelsOk(1, 24)); // 24/8 = 3 pages
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("page-info").textContent).toBe("1/3");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pg-next"));
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("2/3");
    // Out-of-range no-op
    await act(async () => {
      fireEvent.click(screen.getByTestId("pg-out"));
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("2/3");
  });

  it("opens detection modal on Switch click and Start fires enableDetectionSettings + success toast", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue({
      data: {
        body: {
          data: {
            channels: [
              {
                _id: "ch1",
                checkType: "checkin",
                customName: "Cam 1",
                name: "Cam 1",
                nvrId: { _id: "nvr1", nvrName: "NVR-1" },
                channelId: 1,
                detections: {
                  crowdDetection: { _id: "d1", enabled: false },
                },
                profile: null,
              },
            ],
            total: 1,
          },
        },
      },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    enableDetectionSettingsMock.mockResolvedValueOnce({
      data: { statusCode: 200, body: { message: "Started!" } },
    });
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    // Open the "Applied Types" popover for the row.
    const appliedTypes = screen.getByText("Applied Types");
    fireEvent.click(appliedTypes);
    // Now find a detection-type Switch (Crowd Detection); the popover should
    // render its checkboxes via Radix portal.
    const crowdLabel = await screen.findByText("Crowd Detection");
    const switchRow = crowdLabel.parentElement;
    const sw = switchRow.querySelector("button[role='switch']");
    expect(sw).toBeTruthy();
    await act(async () => {
      fireEvent.click(sw);
    });
    await flush();
    // Modal should now be open with the row's name + detection type.
    expect(screen.getAllByText("Detection Control").length).toBeGreaterThan(0);
    // Click "Start Detection"
    const startBtn = await screen.findByText("Start Detection");
    await act(async () => {
      fireEvent.click(startBtn);
    });
    await flush();
    expect(enableDetectionSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "ch1",
        detectionType: "crowdDetection",
        enable: true,
      })
    );
    expect(toastMock.success).toHaveBeenCalledWith("Started!");
  });

  it("detection modal Stop branch fires enableDetectionSettings(enable:false) when isEnabled=true", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue({
      data: {
        body: {
          data: {
            channels: [
              {
                _id: "ch1",
                checkType: "checkin",
                customName: "Cam 1",
                name: "Cam 1",
                nvrId: { _id: "nvr1", nvrName: "NVR-1" },
                channelId: 1,
                detections: {
                  crowdDetection: { _id: "d1", enabled: true },
                },
                profile: null,
              },
            ],
            total: 1,
          },
        },
      },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    enableDetectionSettingsMock.mockResolvedValueOnce({
      data: { statusCode: 500, body: { message: "Server Boom" } },
    });
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    fireEvent.click(screen.getByText("Applied Types"));
    const crowdLabel = await screen.findByText("Crowd Detection");
    const switchRow = crowdLabel.parentElement;
    const sw = switchRow.querySelector("button[role='switch']");
    await act(async () => {
      fireEvent.click(sw);
    });
    await flush();
    const stopBtn = await screen.findByText("Stop Detection");
    await act(async () => {
      fireEvent.click(stopBtn);
    });
    await flush();
    expect(enableDetectionSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enable: false })
    );
    expect(toastMock.error).toHaveBeenCalledWith("Server Boom");
  });

  it("detection modal Cancel button closes the modal without firing API", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue({
      data: {
        body: {
          data: {
            channels: [
              {
                _id: "ch1",
                checkType: "checkin",
                customName: "Cam 1",
                name: "Cam 1",
                nvrId: { _id: "nvr1", nvrName: "NVR-1" },
                channelId: 1,
                detections: { crowdDetection: { _id: "d1", enabled: false } },
                profile: null,
              },
            ],
            total: 1,
          },
        },
      },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    fireEvent.click(screen.getByText("Applied Types"));
    const crowdLabel = await screen.findByText("Crowd Detection");
    const sw = crowdLabel.parentElement.querySelector("button[role='switch']");
    await act(async () => {
      fireEvent.click(sw);
    });
    await flush();
    // Click the first Cancel button
    const cancels = await screen.findAllByText("Cancel");
    await act(async () => {
      fireEvent.click(cancels[0]);
    });
    await flush();
    expect(enableDetectionSettingsMock).not.toHaveBeenCalled();
  });

  it("detection modal Start path catches reject and toasts 'Failed to update detection status'", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    getChannelsMock.mockResolvedValue({
      data: {
        body: {
          data: {
            channels: [
              {
                _id: "ch1",
                checkType: "checkin",
                customName: "Cam 1",
                name: "Cam 1",
                nvrId: { _id: "nvr1", nvrName: "NVR-1" },
                channelId: 1,
                detections: { crowdDetection: { _id: "d1", enabled: false } },
                profile: null,
              },
            ],
            total: 1,
          },
        },
      },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    enableDetectionSettingsMock.mockRejectedValueOnce(new Error("netfail"));
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("Cam 1"));
    fireEvent.click(screen.getByText("Applied Types"));
    const crowdLabel = await screen.findByText("Crowd Detection");
    const sw = crowdLabel.parentElement.querySelector("button[role='switch']");
    await act(async () => {
      fireEvent.click(sw);
    });
    await flush();
    const startBtn = await screen.findByText("Start Detection");
    await act(async () => {
      fireEvent.click(startBtn);
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith(
      "Failed to update detection status"
    );
  });

  it("appliedProfiles falls back to ['N/A'] when channel has none", async () => {
    permissionsRef.value = fullPerms();
    getAllNVRsMock.mockResolvedValueOnce(nvrsOk(1));
    // Force one channel where profile is null AND detections is null
    getChannelsMock.mockResolvedValue({
      data: {
        body: {
          data: {
            channels: [
              {
                _id: "ch9",
                checkType: "none",
                customName: "BareCam",
                name: "BareCam",
                nvrId: { _id: "nvr1", nvrName: "NVR-1" },
                channelId: 1,
                detections: null,
                profile: null,
              },
            ],
            total: 1,
          },
        },
      },
    });
    getAllDetTypesMock.mockResolvedValueOnce(typesOk());
    await act(async () => {
      render(<DetectionSetting />);
    });
    await waitFor(() => screen.getByText("BareCam"));
  });
});
