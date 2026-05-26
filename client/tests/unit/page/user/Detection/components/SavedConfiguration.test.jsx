/**
 * src/page/user/Detection/components/SavedConfiguration.jsx — the
 * "Saved Configurations" expandable panel rendered by the legacy
 * DetectionSetting page. Orchestrates:
 *
 *  - fetchData on mount (and on addedDetection / filters dep change):
 *    calls getAllDetectionDetails(searchTerm, nvrName, cameraId),
 *    writes res.data.body.data.detectionSettings into local state,
 *    flips loading off in the finally arm. When Action is falsy the
 *    success path calls setAddedDetection(false); when Action is
 *    truthy that branch is skipped.
 *  - The render has four branches: loading (skeleton placeholders),
 *    error (red "Failed to fetch…" line), empty ("No saved
 *    configurations found."), and populated (per-item card with
 *    Setting Name / Importance / NVR / Camera / Alert Threshold /
 *    Resolution + Alert Receivers strip).
 *  - The header bar toggles isExpanded (ChevronUp/Down swap +
 *    body conditionally rendered).
 *  - Edit button on a card: setSelectedSetting(item) +
 *    setEditModalOpen(true) → EditDetectionSettingModal isOpen prop.
 *  - Delete button on a card: setSelectedID(_id) + setDeleteModalOpen(true)
 *    → DeleteConfirmation open prop. The onConfirm path calls
 *    deleteDetectionSettings(id); on 200 toasts success + closes modal +
 *    refetches; non-200 toasts the error message. handelcancel resets
 *    deleting + selectedId + closes the modal.
 *
 * Mocks (7 — under the 8-cap):
 *   1. ../Api/get → getAllDetectionDetails (hoisted spy).
 *   2. ../Api/delete → deleteDetectionSettings (hoisted spy).
 *   3. sonner → toast.{success,error} (hoisted spies).
 *   4. ./EditDetectionSettingModal — passthrough stub exposing isOpen.
 *   5. ./DeleteConfirmation — stub exposing open + onConfirm + onClose
 *      so we can drive the delete flow.
 *   6. ./ConfigSearchControl — stub; the heavy filter strip is its own
 *      tested file (R77) and not the SUT here.
 *   7. react-loading-skeleton — passthrough <span data-testid="sk" />
 *      so the loading branch renders deterministically.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// ---- hoisted spies -------------------------------------------------------

const getAllDetectionDetailsSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Detection/Api/get", () => ({
  getAllDetectionDetails: getAllDetectionDetailsSpy,
}));

const deleteDetectionSettingsSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Detection/Api/delete", () => ({
  deleteDetectionSettings: deleteDetectionSettingsSpy,
}));

const toastSpies = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: toastSpies,
}));

vi.mock(
  "@/page/user/Detection/components/EditDetectionSettingModal",
  () => ({
    default: ({ isOpen, onClose, data, fetchData }) =>
      isOpen ? (
        <div data-testid="edit-modal" data-name={data?.detectionSetting?.name}>
          <button onClick={onClose}>edit-close</button>
          <button onClick={() => fetchData?.()}>edit-refetch</button>
        </div>
      ) : null,
  })
);

vi.mock(
  "@/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, onClose, onConfirm, loading }) =>
      open ? (
        <div data-testid="delete-modal" data-loading={String(!!loading)}>
          <button onClick={onConfirm}>confirm-delete</button>
          <button onClick={onClose}>cancel-delete</button>
        </div>
      ) : null,
  })
);

vi.mock(
  "@/page/user/Detection/components/ConfigSearchControl",
  () => ({
    default: () => <div data-testid="config-search" />,
  })
);

vi.mock("react-loading-skeleton", () => ({
  default: (props) => <span data-testid="sk" {...props} />,
}));

// ---- SUT -----------------------------------------------------------------

const { default: SavedConfiguration } = await import(
  "@/page/user/Detection/components/SavedConfiguration.jsx"
);

const mkItem = (overrides = {}) => ({
  detectionSetting: {
    _id: "ds-1",
    name: "Front Door",
    detectionName: "person",
    enabled: true,
    settings: {
      videoDuration: 10,
      levelOfImportance: "High",
      alertThreshold: 3,
      videoResolution: [1920, 1080],
    },
    alerts: [
      { _id: "a1", value: "alice@example.com" },
      { _id: "a2", value: "+15551234567" },
    ],
  },
  linkedCameras: [
    {
      _id: "ch-1",
      name: "Lobby",
      channelId: "ch-1",
      nvrId: { _id: "nvr-1", nvrName: "Front-NVR" },
    },
  ],
  ...overrides,
});

const mkRes = (items) => ({
  status: 200,
  data: { body: { data: { detectionSettings: items } } },
});

beforeEach(() => {
  getAllDetectionDetailsSpy.mockReset();
  deleteDetectionSettingsSpy.mockReset();
  toastSpies.success.mockReset();
  toastSpies.error.mockReset();
});

describe("Detection/components/SavedConfiguration", () => {
  it("on mount calls getAllDetectionDetails and renders the empty state when the list is empty; Action falsy calls setAddedDetection(false)", async () => {
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([]));
    const setAddedDetection = vi.fn();
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={setAddedDetection}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(1)
    );
    // Default args at mount — empty filter state.
    expect(getAllDetectionDetailsSpy).toHaveBeenCalledWith("", "", "");
    // Empty branch
    expect(screen.getByText(/No saved configurations found/i)).toBeInTheDocument();
    // Action falsy → setAddedDetection(false) called from success arm.
    expect(setAddedDetection).toHaveBeenCalledWith(false);
    // Header label + search control + no edit/delete modals open
    expect(
      screen.getByRole("heading", { name: /Saved Configurations/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("config-search")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    expect(screen.queryByTestId("delete-modal")).toBeNull();
  });

  it("renders the error pane when getAllDetectionDetails rejects", async () => {
    getAllDetectionDetailsSpy.mockRejectedValue(new Error("boom"));
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={vi.fn()}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Failed to fetch detection settings/i)
      ).toBeInTheDocument()
    );
    // Error pane wins → empty pane absent.
    expect(screen.queryByText(/No saved configurations found/i)).toBeNull();
  });

  it("renders a populated card with name (detectionName), NVR name, camera name, resolution width/height and alert receivers", async () => {
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([mkItem()]));
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={vi.fn()}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalled()
    );
    // Header strip "Front Door (person)"
    expect(
      screen.getByText(/Front Door\s*\(\s*person\s*\)/i)
    ).toBeInTheDocument();
    // NVR + Camera labels render their values
    expect(screen.getByText("Front-NVR")).toBeInTheDocument();
    expect(screen.getByText(/Lobby/)).toBeInTheDocument();
    // Resolution split into 1920 / 1080
    expect(screen.getByText("1920")).toBeInTheDocument();
    expect(screen.getByText("1080")).toBeInTheDocument();
    // Importance + duration values
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // Alert receivers
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("+15551234567")).toBeInTheDocument();
    // No "No receivers" string in the alerts strip.
    expect(screen.queryByText(/No receivers/i)).toBeNull();
  });

  it("Edit click opens EditDetectionSettingModal with the chosen item; Delete click + confirm calls deleteDetectionSettings and toasts success + refetches", async () => {
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([mkItem()]));
    deleteDetectionSettingsSpy.mockResolvedValue({
      status: 200,
      data: { body: { message: "Detection settings deleted successfully" } },
    });
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={vi.fn()}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(1)
    );
    // --- Edit ---
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Edit"));
    });
    expect(screen.getByTestId("edit-modal")).toHaveAttribute(
      "data-name",
      "Front Door"
    );
    // close it to keep further clicks clean
    await act(async () => {
      fireEvent.click(screen.getByText("edit-close"));
    });
    expect(screen.queryByTestId("edit-modal")).toBeNull();

    // --- Delete ---
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Delete"));
    });
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("confirm-delete"));
    });
    await waitFor(() =>
      expect(deleteDetectionSettingsSpy).toHaveBeenCalledWith("ds-1")
    );
    expect(toastSpies.success).toHaveBeenCalledWith(
      "Detection settings deleted successfully"
    );
    // refetch fired (second call to get) and modal closed
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByTestId("delete-modal")).toBeNull();
  });

  it("delete with non-200 status toasts the error message and leaves the modal open", async () => {
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([mkItem()]));
    deleteDetectionSettingsSpy.mockResolvedValue({
      status: 500,
      data: { body: { message: "Server exploded" } },
    });
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={vi.fn()}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(1)
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Delete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("confirm-delete"));
    });
    await waitFor(() =>
      expect(deleteDetectionSettingsSpy).toHaveBeenCalled()
    );
    expect(toastSpies.error).toHaveBeenCalledWith("Server exploded");
    expect(toastSpies.success).not.toHaveBeenCalled();
    // refetch NOT fired on the non-200 branch.
    expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(1);
    // Modal stays open because setDeleteModalOpen(false) is only on 200.
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
  });

  it("clicking the header chevron collapses the body (search control + cards disappear)", async () => {
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([mkItem()]));
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={vi.fn()}
          addedDetection={false}
        />
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("config-search")).toBeInTheDocument()
    );
    // The clickable strip is the parent div of the title — click the title.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("heading", { name: /Saved Configurations/i })
      );
    });
    // After collapse the body (ConfigSearchControl + cards) is gone.
    expect(screen.queryByTestId("config-search")).toBeNull();
    expect(screen.queryByText(/Front Door/)).toBeNull();
  });

  it("populated branch with no alerts renders the 'No receivers' fallback and Action='action' skips setAddedDetection(false)", async () => {
    const itemNoAlerts = mkItem({
      detectionSetting: {
        _id: "ds-2",
        name: "Side Gate",
        detectionName: "vehicle",
        enabled: false,
        settings: { videoResolution: [] }, // no resolution split, no alertThreshold
        alerts: [],
      },
      linkedCameras: [
        // Cameras with no nvrId._id are filtered out → nvr falls back to "N/A".
        { _id: "ch-2", name: "Back Lot", channelId: "ch-2" },
      ],
    });
    getAllDetectionDetailsSpy.mockResolvedValue(mkRes([itemNoAlerts]));
    const setAddedDetection = vi.fn();
    await act(async () => {
      render(
        <SavedConfiguration
          setAddedDetection={setAddedDetection}
          addedDetection={false}
          Action="action"
        />
      );
    });
    await waitFor(() =>
      expect(getAllDetectionDetailsSpy).toHaveBeenCalledTimes(1)
    );
    expect(screen.getByText(/No receivers/i)).toBeInTheDocument();
    // Action truthy → setAddedDetection NOT called from the success arm.
    expect(setAddedDetection).not.toHaveBeenCalled();
    // No alertThreshold field appears.
    expect(screen.queryByText(/Alert Threshold/i)).toBeNull();
    // No resolution split (videoResolution.length === 0).
    expect(screen.queryByText(/Resolution Width/i)).toBeNull();
    // Linked camera with no nvrId → nvrName falls back to "N/A".
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});
