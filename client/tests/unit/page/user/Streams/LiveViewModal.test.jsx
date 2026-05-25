/**
 * Round 60 — cover src/page/user/Streams/LiveViewModal.jsx.
 *
 * LiveViewModal is the side-panel-style overlay popped open when a user
 * clicks a camera tile and asks for the live HLS feed (distinct from the
 * fullscreen StreamModal covered in R59). It owns:
 *   - a memoised stream URL derived from VITE_STREAM_URL + camera streaming
 *     path (or the raw path when VITE_LOCAL_SETUP === 'true');
 *   - HLS playback via useHlsPlayer (mocked here);
 *   - an Edit overlay (gated on permissions.channels.edit) that fetches the
 *     department list once on open, prefills alias + dept selections, and
 *     persists via createCameraAliasName, surfacing toasts;
 *   - prev/next navigation with wrap-around through `cameraList`;
 *   - close-on-backdrop-click via the outer onClick + inner stopPropagation;
 *   - isOpen=false -> null-render path.
 *
 * Two tests:
 *   1. isOpen=false renders nothing (null guard).
 *   2. isOpen=true renders the player + name + alias chip, fetches and
 *      shows the EditCameraInfo overlay on settings-button click (with
 *      preselected departments), saves successfully (toast.success +
 *      onUpdate + alias chip updates), navigates next/prev with wrap-around
 *      through cameraList, and the close (X) button calls onClose.
 *
 * Mock budget: 6 — useHlsPlayer, EditCameraInfo (stubbed), sonner toast,
 * Dashboard/Api/put (createCameraAliasName), Streams/Api/post
 * (getDepartmentList), PermissionContext. Under the 8 cap.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// useHlsPlayer is a side-effecting hook (Hls.js + token fetch) — stub it.
vi.mock("@/hooks/useHlsPlayer", () => ({
  default: vi.fn(),
}));

// EditCameraInfo is exercised by its own R21 test; here we stub it to
// expose the wiring (alias input, save click, current dept count).
vi.mock(
  "../../../../../src/page/user/Streams/components/EditCameraInfo.jsx",
  () => ({
    default: ({
      aliasInput,
      setAliasInput,
      selectedDepartments,
      departmentOptions,
      isSaving,
      onSave,
      onCancel,
    }) => (
      <div data-testid="edit-camera-info" data-saving={String(!!isSaving)}>
        <input
          data-testid="alias-input"
          value={aliasInput || ""}
          onChange={(e) => setAliasInput(e.target.value)}
        />
        <span data-testid="selected-dept-count">
          {(selectedDepartments || []).length}
        </span>
        <span data-testid="dept-options-count">
          {(departmentOptions || []).length}
        </span>
        <button data-testid="edit-save" onClick={onSave}>
          Save
        </button>
        <button data-testid="edit-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ),
  })
);

// Sonner toast — captured spies for success/error assertions.
const toastSpies = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({
  toast: {
    success: (...args) => toastSpies.success(...args),
    error: (...args) => toastSpies.error(...args),
  },
}));

// createCameraAliasName — controllable per-test via mockImplementation.
const createCameraAliasNameMock = vi.fn();
vi.mock(
  "../../../../../src/page/user/Dashboard/Api/put/index.jsx",
  () => ({
    createCameraAliasName: (...args) => createCameraAliasNameMock(...args),
  })
);

// getDepartmentList — returns axios-style nested envelope.
const getDepartmentListMock = vi.fn();
vi.mock(
  "../../../../../src/page/user/Streams/Api/post/index.jsx",
  () => ({
    getDepartmentList: (...args) => getDepartmentListMock(...args),
  })
);

// PermissionContext — toggle canEditChannels per test via mutable value.
const permissionsBox = { value: { channels: { edit: true } } };
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => ({ permissions: permissionsBox.value }),
}));

import LiveViewModal from "../../../../../src/page/user/Streams/LiveViewModal.jsx";

beforeEach(() => {
  toastSpies.success.mockClear();
  toastSpies.error.mockClear();
  createCameraAliasNameMock.mockReset();
  getDepartmentListMock.mockReset();
  permissionsBox.value = { channels: { edit: true } };
});

describe("Streams/LiveViewModal", () => {
  it("returns null when isOpen=false (nothing rendered)", () => {
    const { container } = render(
      <LiveViewModal
        isOpen={false}
        onClose={vi.fn()}
        camera={{ id: "c1", cameraName: "Front Door", streamingUrl: "/s.m3u8" }}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("edit-camera-info")).not.toBeInTheDocument();
  });

  it(
    "opens with player + alias chip, exposes EditCameraInfo overlay on settings click " +
      "with preselected departments, persists via createCameraAliasName + onUpdate + alias " +
      "chip refresh, navigates prev/next with wrap-around, and X-button calls onClose",
    async () => {
      const onClose = vi.fn();
      const onUpdate = vi.fn();

      // Two departments — camera.departments references only d1, so the
      // preselected count should be 1 (the SUT intersects camera dept ids
      // with the freshly-fetched options).
      getDepartmentListMock.mockResolvedValue({
        data: {
          body: {
            data: {
              data: [
                { _id: "d1", departmentName: "Security" },
                { _id: "d2", departmentName: "Reception" },
              ],
            },
          },
        },
      });

      // Successful save envelope per the SUT contract:
      // response?.body?.status === 'success' triggers the success branch.
      createCameraAliasNameMock.mockResolvedValue({
        body: { status: "success", message: "Saved!" },
      });

      const cameraA = {
        id: "cam-a",
        cameraName: "Front Lobby",
        aliasName: "Lobby",
        streamingUrl: "/streams/a.m3u8",
        departments: ["d1"],
      };
      const cameraB = {
        id: "cam-b",
        cameraName: "Back Door",
        aliasName: "Back",
        streamingUrl: "/streams/b.m3u8",
        departments: [],
      };
      const cameraList = [cameraA, cameraB];

      const { container } = render(
        <LiveViewModal
          isOpen={true}
          onClose={onClose}
          onUpdate={onUpdate}
          camera={cameraA}
          cameraList={cameraList}
        />
      );

      // Header copy: camera name + alias chip render initially.
      expect(screen.getByText("Front Lobby")).toBeInTheDocument();
      expect(screen.getByText("Lobby")).toBeInTheDocument();

      // The departments fetch fires on isOpen=true.
      await waitFor(() => {
        expect(getDepartmentListMock).toHaveBeenCalledTimes(1);
      });

      // Settings (edit) button — the first <button> in the header,
      // identified via its lucide Settings icon. There are several
      // buttons in the modal: settings, close (X), navigation prev/next.
      // The settings button has the title attr "Edit Camera Details".
      const settingsBtn = container.querySelector(
        'button[title="Edit Camera Details"]'
      );
      expect(settingsBtn).not.toBeNull();
      fireEvent.click(settingsBtn);

      // EditCameraInfo overlay is now mounted with preselected dept count=1.
      const overlay = await screen.findByTestId("edit-camera-info");
      expect(overlay).toBeInTheDocument();
      expect(screen.getByTestId("selected-dept-count").textContent).toBe("1");
      expect(screen.getByTestId("dept-options-count").textContent).toBe("2");
      // Alias input prefilled with camera.aliasName.
      expect(screen.getByTestId("alias-input").value).toBe("Lobby");

      // Type a new alias and click Save.
      fireEvent.change(screen.getByTestId("alias-input"), {
        target: { value: "Main Lobby" },
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("edit-save"));
      });

      // createCameraAliasName called with the activeCamera id + payload.
      await waitFor(() => {
        expect(createCameraAliasNameMock).toHaveBeenCalledTimes(1);
      });
      expect(createCameraAliasNameMock).toHaveBeenCalledWith(
        "cam-a",
        expect.objectContaining({
          customName: "Main Lobby",
          department: expect.any(Array),
        })
      );

      // Success toast + onUpdate are wired.
      expect(toastSpies.success).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledTimes(1);

      // After save the edit overlay closes and the alias chip reflects the
      // updated value ("Main Lobby"); the original "Lobby" chip is gone.
      await waitFor(() => {
        expect(screen.queryByTestId("edit-camera-info")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Main Lobby")).toBeInTheDocument();
      expect(screen.queryByText("Lobby")).not.toBeInTheDocument();

      // Navigation arrows — multi-channel list, so prev + next render.
      // They have no accessible name, but each has a title attr.
      const nextBtn = container.querySelector('button[title="Next Camera"]');
      const prevBtn = container.querySelector('button[title="Previous Camera"]');
      expect(nextBtn).not.toBeNull();
      expect(prevBtn).not.toBeNull();

      // Click Next -> activeCamera becomes cameraB ("Back Door").
      fireEvent.click(nextBtn);
      expect(screen.getByText("Back Door")).toBeInTheDocument();
      expect(screen.queryByText("Front Lobby")).not.toBeInTheDocument();

      // Click Next again at the end of the list -> wrap-around to cameraA.
      fireEvent.click(nextBtn);
      expect(screen.getByText("Front Lobby")).toBeInTheDocument();

      // Click Prev at the start -> wrap-around to cameraB (cameraList[len-1]).
      fireEvent.click(prevBtn);
      expect(screen.getByText("Back Door")).toBeInTheDocument();

      // Close (X) button — there are two non-nav buttons in the header
      // when canEdit is true: settings + close. After save the edit
      // button no longer matches (camera is still editable), so we pick
      // the close button by its non-title attribute (it has no title) by
      // selecting the only header button without a title.
      const headerButtons = Array.from(
        container.querySelectorAll("button")
      ).filter((b) => !b.getAttribute("title"));
      expect(headerButtons.length).toBeGreaterThan(0);
      fireEvent.click(headerButtons[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );
});
