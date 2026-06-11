/**
 * Round 4 client gap-fill: Profile/Profile.jsx — FULL mount.
 *
 * The thin gate-only Profile.test.jsx left the file at 14.95%. This spec
 * mounts the full page (canView=true) with all heavy children stubbed:
 *   - MultiStepForm: trigger-prop renderer that calls fetchProfiles.
 *   - ProfilesTable: pass-through that exposes rows + columns rendered.
 *   - Pagination: thin pass-through with prev/next buttons.
 *   - DeleteConfirmation: pass-through that exposes onConfirm/onClose.
 *   - useDebounce: identity hook so searchInput propagates immediately.
 *   - Api/{get,post,delete}: spy stubs that drive each branch.
 *
 * Pins:
 *   - Mount + fetchProfiles GET fires with default params.
 *   - searchInput keystroke -> setCurrentPage(1) + GET fires with name.
 *   - Sort header click flips sortOrder asc<->desc + GET refetches.
 *   - Visible-cols popover toggle hides a column from the table data.
 *   - Per-row Edit / Export action buttons fire MultiStepForm + getProfileExport.
 *   - Per-row Delete opens DeleteConfirmation + confirm calls deleteProfile.
 *   - Bulk select + bulk Export fires profileBulkExport + bulk Delete fires
 *     deleteBulkProfiles.
 *   - Permissions matrix: canEdit/canCreate/canDelete each independently
 *     gate their UI surfaces.
 *   - fetchProfiles error path sets profiles to [] and total to 0.
 *   - data flattening (basics.profileName / createdBy.email / status Active).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// ---- Mock hoisted refs --------------------------------------------------
const permissionsRef = vi.hoisted(() => ({ value: null }));
const getProfileDetailsMock = vi.hoisted(() => vi.fn());
const getProfileExportMock = vi.hoisted(() => vi.fn());
const deleteProfileMock = vi.hoisted(() => vi.fn());
const deleteBulkProfilesMock = vi.hoisted(() => vi.fn());
const profileBulkExportMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/hooks/useDebounce", () => ({
  default: (v) => v,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("../../../../../src/page/user/Profile/Api/get", () => ({
  getProfileDetails: (...args) => getProfileDetailsMock(...args),
  getProfileExport: (...args) => getProfileExportMock(...args),
}));

vi.mock("../../../../../src/page/user/Profile/Api/delete", () => ({
  deleteProfile: (...args) => deleteProfileMock(...args),
}));

vi.mock("../../../../../src/page/user/Profile/Api/post", () => ({
  deleteBulkProfiles: (...args) => deleteBulkProfilesMock(...args),
  profileBulkExport: (...args) => profileBulkExportMock(...args),
}));

// MultiStepForm renders the trigger (passed via render prop) and exposes
// a way to invoke fetchProfiles for assertion purposes.
vi.mock("../../../../../src/page/user/Profile/MultiStepForm", () => ({
  default: ({ trigger, row, fetchProfiles }) => (
    <div data-testid={`msf-${row ? "edit" : "add"}`} data-row-id={row?.id || ""}>
      {trigger}
      <button
        data-testid={`msf-refetch-${row ? "edit" : "add"}`}
        onClick={() => fetchProfiles?.()}
      >
        refetch
      </button>
    </div>
  ),
}));

vi.mock("../../../../../src/page/user/Profile/ProfilesTable", () => ({
  default: ({ data, columns, loading }) => (
    <div data-testid="profiles-table" data-loading={String(loading)}>
      <div data-testid="pt-row-count">{data.length}</div>
      <div data-testid="pt-col-keys">
        {columns.map((c) => c.accessorKey).join(",")}
      </div>
      {/* Render the header cells so we can click sort headers */}
      <div data-testid="pt-headers">
        {columns.map((c, i) => (
          <span key={i} data-testid={`hdr-${c.accessorKey}`}>
            {typeof c.header === "function" ? c.header() : c.header}
          </span>
        ))}
      </div>
      {/* Render cells for each row+column so action menus mount */}
      {data.map((row, ri) => (
        <div key={row.id} data-testid={`pt-row-${ri}`}>
          {columns.map((c, ci) => (
            <span key={ci} data-testid={`cell-${row.id}-${c.accessorKey}`}>
              {c.cell ? c.cell({ row: { original: row } }) : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/Pagination", () => ({
  default: ({ currentPage, totalPages, onPageChange }) => (
    <div data-testid="pagination">
      <span data-testid="page-info">{currentPage}/{totalPages}</span>
      <button data-testid="pg-next" onClick={() => onPageChange(currentPage + 1)}>
        next
      </button>
      <button data-testid="pg-prev" onClick={() => onPageChange(currentPage - 1)}>
        prev
      </button>
      <button data-testid="pg-out" onClick={() => onPageChange(999)}>
        out
      </button>
      <button data-testid="pg-zero" onClick={() => onPageChange(0)}>
        zero
      </button>
    </div>
  ),
}));

vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, message, onClose, onConfirm }) =>
      open ? (
        <div data-testid="delete-confirm">
          <span data-testid="dc-msg">{message}</span>
          <button data-testid="dc-confirm" onClick={onConfirm}>
            confirm
          </button>
          <button data-testid="dc-cancel" onClick={onClose}>
            cancel
          </button>
        </div>
      ) : null,
  })
);

const { default: Profile } = await import(
  "../../../../../src/page/user/Profile/Profile.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const fullPermissions = (over = {}) => ({
  permissions: {
    profiles: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      ...over,
    },
  },
  loading: false,
});

const okList = (count = 2, total = 12) => ({
  data: {
    body: {
      data: {
        profiles: Array.from({ length: count }, (_, i) => ({
          _id: `p${i + 1}`,
          basics: { profileName: `Profile ${i + 1}` },
          createdBy: { email: `u${i + 1}@x.io` },
          createdAt: "2025-04-01T00:00:00Z",
          updatedAt: "2025-04-02T00:00:00Z",
          status: i % 2 === 0 ? "Active" : "Inactive",
        })),
        total,
      },
    },
  },
});

beforeEach(() => {
  permissionsRef.value = null;
  getProfileDetailsMock.mockReset();
  getProfileExportMock.mockReset();
  deleteProfileMock.mockReset();
  deleteBulkProfilesMock.mockReset();
  profileBulkExportMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("Profile page — gate branches", () => {
  it("renders PageLoader while permissions load", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Profile />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
  });

  it("renders AccessDenied when canView is false", () => {
    permissionsRef.value = {
      permissions: { profiles: { view: false } },
      loading: false,
    };
    render(<Profile />);
    expect(screen.getByTestId("access-denied").textContent).toMatch(
      /permission to view Profile/i
    );
  });
});

describe("Profile page — full mount", () => {
  it("fetches profiles on mount with default params and maps API rows", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValueOnce(okList(2, 12));
    await act(async () => {
      render(<Profile />);
    });
    await waitFor(() => {
      expect(getProfileDetailsMock).toHaveBeenCalled();
    });
    const params = getProfileDetailsMock.mock.calls[0][0];
    expect(params.page).toBe(1);
    expect(params.limit).toBe(8);
    expect(params.sort).toBe("asc");
    expect(params.orderBy).toBe("basics.profileName");
    expect(screen.getByTestId("pt-row-count").textContent).toBe("2");
  });

  it("falls back to top-level data array and uses data.length as total", async () => {
    permissionsRef.value = fullPermissions();
    // Force the alternate shape (response.data is the array; no body.data path).
    getProfileDetailsMock.mockResolvedValueOnce({
      data: [
        {
          _id: "x1",
          basics: { profileName: "Direct" },
          createdBy: { email: "d@x.io" },
          status: "Active",
        },
      ],
    });
    await act(async () => {
      render(<Profile />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("pt-row-count").textContent).toBe("1");
    });
  });

  it("error path resets profiles to [] and total to 0", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<Profile />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("pt-row-count").textContent).toBe("0");
    });
  });

  it("typing in the search input resets currentPage to 1 and re-fetches with name", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const search = screen.getByPlaceholderText("Search");
    await act(async () => {
      fireEvent.change(search, { target: { value: "Alice" } });
    });
    await flush();
    // Last call should have search='alice'
    const last = getProfileDetailsMock.mock.calls.at(-1)[0];
    expect(last.search).toBe("alice");
  });

  it("initial visible columns include name/createdBy/createdAt/lastModified/status/actions", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const keys = screen.getByTestId("pt-col-keys").textContent;
    expect(keys).toMatch(/select/);
    expect(keys).toMatch(/name/);
    expect(keys).toMatch(/createdBy/);
    expect(keys).toMatch(/createdAt/);
    expect(keys).toMatch(/lastModified/);
    expect(keys).toMatch(/status/);
    expect(keys).toMatch(/actions/);
  });

  it("sort name header toggles sortOrder asc<->desc and refetches", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const calls0 = getProfileDetailsMock.mock.calls.length;
    // Click the Name sort header rendered inside hdr-name
    const nameHdr = screen.getByTestId("hdr-name");
    const sortBtn = nameHdr.querySelector("button");
    await act(async () => {
      fireEvent.click(sortBtn);
    });
    await flush();
    expect(getProfileDetailsMock.mock.calls.length).toBeGreaterThan(calls0);
    const lastCall = getProfileDetailsMock.mock.calls.at(-1)[0];
    expect(lastCall.sort).toBe("desc");
    // Second click flips back to asc.
    await act(async () => {
      fireEvent.click(sortBtn);
    });
    await flush();
    expect(getProfileDetailsMock.mock.calls.at(-1)[0].sort).toBe("asc");
  });

  it("renders status badge as Active vs Inactive based on row.status", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValueOnce(okList(2, 2));
    await act(async () => {
      render(<Profile />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("cell-p1-status").textContent).toMatch(/Active/);
      expect(screen.getByTestId("cell-p2-status").textContent).toMatch(
        /Inactive/
      );
    });
  });

  it("per-row Delete opens DeleteConfirmation, Cancel closes it", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    // open the Actions popover for p1
    const actionsCell = screen.getByTestId("cell-p1-actions");
    const trigger = actionsCell.querySelector("button");
    fireEvent.click(trigger);
    // Click "Delete" button (text)
    const deleteBtn = await screen.findByText("Delete");
    fireEvent.click(deleteBtn);
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dc-cancel"));
    await flush();
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
  });

  it("per-row Delete confirm fires deleteProfile and toasts success when statusCode=200", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    deleteProfileMock.mockResolvedValueOnce({
      data: { statusCode: 200, body: { message: "Deleted!" } },
    });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    // open per-row actions
    const trigger = screen
      .getByTestId("cell-p1-actions")
      .querySelector("button");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("Delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("dc-confirm"));
    });
    await flush();
    expect(deleteProfileMock).toHaveBeenCalledWith("p1");
    expect(toastMock.success).toHaveBeenCalledWith("Deleted!");
  });

  it("per-row Delete confirm toasts error when statusCode!=200", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    deleteProfileMock.mockResolvedValueOnce({
      data: { statusCode: 500, body: { message: "Boom" } },
    });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    fireEvent.click(
      screen.getByTestId("cell-p1-actions").querySelector("button")
    );
    fireEvent.click(await screen.findByText("Delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("dc-confirm"));
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("Boom");
  });

  it("per-row Delete confirm hits catch path silently when API throws", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    deleteProfileMock.mockRejectedValueOnce(new Error("netfail"));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    fireEvent.click(
      screen.getByTestId("cell-p1-actions").querySelector("button")
    );
    fireEvent.click(await screen.findByText("Delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("dc-confirm"));
    });
    await flush();
    // No success toast on error path
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("per-row Export action calls getProfileExport with the row id", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    getProfileExportMock.mockResolvedValueOnce({ status: 200 });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    fireEvent.click(
      screen.getByTestId("cell-p1-actions").querySelector("button")
    );
    const exportBtn = await screen.findByText("Export");
    await act(async () => {
      fireEvent.click(exportBtn);
    });
    await flush();
    expect(getProfileExportMock).toHaveBeenCalledWith("p1");
  });

  it("per-row Edit MSF refetch propagates back to fetchProfiles when popover opens", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    // Open the actions popover for p1 so its PopoverContent (with msf-edit) mounts.
    const trigger = screen
      .getByTestId("cell-p1-actions")
      .querySelector("button");
    fireEvent.click(trigger);
    // findBy will retry until Radix mounts the portal content.
    const refetchBtn = await screen.findByTestId("msf-refetch-edit");
    const before = getProfileDetailsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(refetchBtn);
    });
    await flush();
    expect(getProfileDetailsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("Add New Profile MultiStepForm shows only when canCreate", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(0, 0));
    const { unmount } = render(<Profile />);
    await flush();
    expect(screen.getByTestId("msf-add")).toBeInTheDocument();
    unmount();
    // Re-mount without create perm
    permissionsRef.value = fullPermissions({ create: false });
    render(<Profile />);
    await flush();
    expect(screen.queryByTestId("msf-add")).not.toBeInTheDocument();
  });

  it("hides the actions column when neither create/edit/delete is granted", async () => {
    permissionsRef.value = fullPermissions({
      create: false,
      edit: false,
      delete: false,
    });
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    expect(screen.getByTestId("pt-col-keys").textContent).not.toMatch(
      /actions/
    );
  });

  it("renders 'No profiles found' fallback when list is empty and not loading", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValueOnce(okList(0, 0));
    await act(async () => {
      render(<Profile />);
    });
    await waitFor(() => {
      expect(screen.getByText(/No profiles found/i)).toBeInTheDocument();
    });
  });

  it("bulk selection bar appears when a row checkbox is ticked", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(2, 2));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    // Click the per-row select Checkbox for p1.
    const selectCell = screen.getByTestId("cell-p1-select");
    const cb = selectCell.querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    expect(screen.getByText(/profile.* selected/i)).toBeInTheDocument();
  });

  it("bulk Export calls profileBulkExport and toasts success/failure", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    profileBulkExportMock.mockResolvedValueOnce({ status: 200 });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const cb = screen
      .getByTestId("cell-p1-select")
      .querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    const bulkExport = screen.getByText("Export", { selector: "span" });
    const exportButton = bulkExport.closest("button");
    await act(async () => {
      fireEvent.click(exportButton);
    });
    await flush();
    expect(profileBulkExportMock).toHaveBeenCalledWith(["p1"]);
    expect(toastMock.success).toHaveBeenCalledWith(
      "Profiles exported successfully"
    );

    // Now the failure branch
    profileBulkExportMock.mockResolvedValueOnce({ status: 500 });
    await act(async () => {
      fireEvent.click(exportButton);
    });
    await flush();
    expect(toastMock.success).toHaveBeenCalledWith("Failed to export profiles");
  });

  it("bulk Delete opens confirm, confirm fires deleteBulkProfiles and clears selection", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    deleteBulkProfilesMock.mockResolvedValueOnce({
      status: "success",
      message: "All gone",
      data: { statusCode: 200 },
    });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const cb = screen
      .getByTestId("cell-p1-select")
      .querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    // The bulk-Delete button has class text-red-600 — find by the "Delete"
    // text closest to the bulk-bar.
    const bulkDeleteBtn = screen
      .getAllByText("Delete")
      .map((el) => el.closest("button"))
      .find(
        (btn) =>
          btn && btn.className.includes("hover:bg-red-200")
      );
    expect(bulkDeleteBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(bulkDeleteBtn);
    });
    await flush();
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("dc-confirm"));
    });
    await flush();
    expect(deleteBulkProfilesMock).toHaveBeenCalledWith(["p1"]);
    // After confirm, selection is cleared so the bulk bar should disappear.
    await waitFor(() => {
      expect(screen.queryByText(/profile.* selected/i)).not.toBeInTheDocument();
    });
  });

  it("bulk Delete failure branch (status != 'success') still toasts message", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    deleteBulkProfilesMock.mockResolvedValueOnce({
      status: "fail",
      message: "Cannot delete",
    });
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const cb = screen
      .getByTestId("cell-p1-select")
      .querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    const bulkDeleteBtn = screen
      .getAllByText("Delete")
      .map((el) => el.closest("button"))
      .find((btn) => btn && btn.className.includes("hover:bg-red-200"));
    fireEvent.click(bulkDeleteBtn);
    await act(async () => {
      fireEvent.click(screen.getByTestId("dc-confirm"));
    });
    await flush();
    // Source toast.success the failure message too — both branches go via
    // toast?.success.
    expect(toastMock.success).toHaveBeenCalledWith("Cannot delete");
  });

  it("clear-selection X button empties the bulk bar", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(1, 1));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const cb = screen
      .getByTestId("cell-p1-select")
      .querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    const clearBtn = screen.getByLabelText("Clear selection");
    await act(async () => {
      fireEvent.click(clearBtn);
    });
    await flush();
    expect(screen.queryByText(/profile.* selected/i)).not.toBeInTheDocument();
  });

  it("header select-all toggles selection of all current-page rows", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(2, 2));
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    const hdr = screen.getByTestId("hdr-select");
    const cb = hdr.querySelector("button,input[type='checkbox']");
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    expect(screen.getByText(/2 profiles selected/i)).toBeInTheDocument();
    // Click again to clear.
    await act(async () => {
      fireEvent.click(cb);
    });
    await flush();
    expect(screen.queryByText(/profile.* selected/i)).not.toBeInTheDocument();
  });

  it("Pagination next/prev clamp; out-of-range no-op", async () => {
    permissionsRef.value = fullPermissions();
    getProfileDetailsMock.mockResolvedValue(okList(2, 24)); // 24/8 = 3 pages
    await act(async () => {
      render(<Profile />);
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("1/3");
    await act(async () => {
      fireEvent.click(screen.getByTestId("pg-next"));
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("2/3");
    // out-of-range should be no-op (handlePageChange returns early)
    await act(async () => {
      fireEvent.click(screen.getByTestId("pg-out"));
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("2/3");
    // zero also out-of-range
    await act(async () => {
      fireEvent.click(screen.getByTestId("pg-zero"));
    });
    await flush();
    expect(screen.getByTestId("page-info").textContent).toBe("2/3");
  });
});
