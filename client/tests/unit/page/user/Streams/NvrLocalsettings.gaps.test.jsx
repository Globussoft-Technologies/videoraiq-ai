/**
 * Gap-fills for src/page/user/Streams/NvrLocalsettings.jsx.
 *
 * Reachable gaps from the rendered DOM:
 *   - lines 127-130: passwordChanged badge with TriangleAlert
 *   - default empty-state when nvrDetails is not an array (line 116 condition)
 *
 * UNREACHABLE in current product:
 *   handleEditClick, handleDeleteClick, handleCancelDelete,
 *   handleConfirmDelete, and the DeleteConfirmation message ternary
 *   (lines 307/309) are wired to a tooltip menu block that is fully
 *   commented out in the JSX, so no UI invokes them. We exercise what we
 *   can — the rest will require product changes to be testable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  Link: ({ children }) => <>{children}</>,
}));

const usePermissionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: usePermissionsMock,
}));

vi.mock("@/helpers/decriptNvr", () => ({
  decrypt: (v) => `decrypted:${v}`,
  encrypt: (v) => `encrypted:${v}`,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <>{children}</>,
  TooltipProvider: ({ children }) => <>{children}</>,
}));

vi.mock("../../../../../src/components/StreamHeader", () => ({
  default: ({ title, onConfigClick }) => (
    <div data-testid="stream-header">
      <span>{title}</span>
      <button data-testid="stream-config-btn" onClick={onConfigClick}>
        Add NVR
      </button>
    </div>
  ),
}));

vi.mock("../../../../../src/page/user/Streams/Nvrform", () => ({
  default: ({ isEdit }) => (
    <div data-testid="add-nvr-form" data-is-edit={String(!!isEdit)} />
  ),
}));

vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open }) =>
      open ? <div data-testid="delete-confirm" /> : null,
  })
);

const { default: NvrLocalsettings } = await import(
  "../../../../../src/page/user/Streams/NvrLocalsettings.jsx"
);

beforeEach(() => {
  navigate.mockReset();
  usePermissionsMock.mockReset();
  usePermissionsMock.mockReturnValue({
    permissions: { NVR: { edit: true, delete: true } },
  });
});

describe("NvrLocalsettings gap-fills", () => {
  it("renders the passwordChanged badge when nvr.passwordChanged is true", () => {
    const nvrDetails = [
      {
        _id: "n1",
        nvrName: "PWChanged",
        location: "L",
        cameraCount: 1,
        passwordChanged: true,
      },
    ];
    render(
      <NvrLocalsettings
        nvrDetails={nvrDetails}
        fetchNvrData={vi.fn()}
        onDeleteNvr={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Password change detected/i)
    ).toBeInTheDocument();
  });

  it("renders the empty-state CCTV placeholder when nvrDetails is not an array", () => {
    render(
      <NvrLocalsettings
        nvrDetails={null}
        fetchNvrData={vi.fn()}
        onDeleteNvr={vi.fn()}
      />
    );
    expect(
      screen.getByText(/CCTV stream access is not configured/i)
    ).toBeInTheDocument();
  });

  it("DeleteConfirmation is not rendered when no delete is pending", () => {
    const nvrDetails = [
      { _id: "x", nvrName: "X", location: "L", cameraCount: 0 },
    ];
    render(
      <NvrLocalsettings
        nvrDetails={nvrDetails}
        fetchNvrData={vi.fn()}
        onDeleteNvr={vi.fn()}
      />
    );
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
  });

  it("uses _id as fallback key when an item is missing _id", () => {
    // Triggers the `nvr._id || index` key branch.
    const nvrDetails = [
      { nvrName: "NoId", location: "L", cameraCount: 0 },
    ];
    render(
      <NvrLocalsettings
        nvrDetails={nvrDetails}
        fetchNvrData={vi.fn()}
        onDeleteNvr={vi.fn()}
      />
    );
    expect(screen.getByText("NoId")).toBeInTheDocument();
  });

  it("falls back to 'NVR' name when nvrName is missing", () => {
    const nvrDetails = [
      { _id: "noName", location: "L", cameraCount: 0 },
    ];
    render(
      <NvrLocalsettings
        nvrDetails={nvrDetails}
        fetchNvrData={vi.fn()}
        onDeleteNvr={vi.fn()}
      />
    );
    expect(screen.getByText("NVR")).toBeInTheDocument();
  });
});

// UNREACHABLE: handleEditClick / handleDeleteClick / handleCancelDelete /
// handleConfirmDelete and the DeleteConfirmation message ternary are wired
// exclusively to a commented-out tooltip block in NvrLocalsettings.jsx
// (lines 135-196). No element in the rendered DOM invokes them, so they
// cannot be exercised without changing product code.
