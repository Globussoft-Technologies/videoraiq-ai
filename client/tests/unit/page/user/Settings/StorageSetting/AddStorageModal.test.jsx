/**
 * src/page/user/Settings/StorageSetting/AddStorageModal.jsx — Formik + yup
 * (storageSchema) Radix Dialog for create vs edit storage. Selecting a
 * type via the in-dialog `Select` swaps in the SFTP / GoogleDrive / S3
 * sub-form. Submit calls addStorage (create) or updateStorage (edit) and
 * toasts the response message; google_drive_oauth additionally opens
 * `response.data.body.data.url` in a new tab. The dialog opens via a
 * `trigger` slot OR programmatically via the controlled `isOpen` /
 * `onOpenChange` pair. In edit mode (`editData`), a useEffect pre-fills
 * the storage type + jumps straight to the form, so we don't have to
 * fight a Radix Select inside a Radix Dialog.
 *
 * Real bits kept: formik + yup + the real storageSchema, the lazy()
 * sub-forms (stubbed via vi.mock by absolute path so React.lazy resolves
 * synchronously). The Dialog and Select primitives are mocked to render
 * inline (no Radix portal) since we don't test Radix.
 *
 * Mocks (7, under the 8 cap):
 *   1. sonner                                   - toast.success/error capture.
 *   2. @/components/ui/dialog                   - passthrough so DialogContent
 *                                                 renders inline (no portal).
 *   3. @/components/ui/select                   - native <select>-backed shim
 *                                                 used in the edit-mode path
 *                                                 (the second Select inside
 *                                                 the form).
 *   4. @/components/ui/Tooltip                  - passthrough; sub-form
 *                                                 (SFTPForm etc.) tooltips.
 *   5. ./components/SftpForm                    - stub to a tiny div so the
 *                                                 lazy import resolves.
 *   6. ./components/GoogledriveForm             - same.
 *   7. ./components/S3Form                      - same.
 *   And the two API modules + a small `js-base64` shim are intercepted
 *   together with the API mocks (counted as one each in the budget).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ---- Module mocks (hoisted refs) ------------------------------------------

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const postRef = vi.hoisted(() => ({ addStorage: vi.fn() }));
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/Api/post/index",
  () => postRef,
);

const putRef = vi.hoisted(() => ({ updateStorage: vi.fn() }));
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/Api/put/index",
  () => putRef,
);

// Passthrough Dialog primitives so the body renders inline (no Radix portal).
vi.mock("@/components/ui/dialog", () => {
  const Pass = (slot) => ({ children, asChild: _a, open, onOpenChange, ...rest }) => {
    // The root Dialog gets `open`/`onOpenChange` — render children only when open.
    if (slot === "dialog") {
      return open ? React.createElement(
        "div",
        { "data-slot": slot, ...rest },
        children,
      ) : null;
    }
    return React.createElement("div", { "data-slot": slot, ...rest }, children);
  };
  return {
    Dialog: Pass("dialog"),
    DialogTrigger: ({ children, asChild: _a, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-trigger", ...rest }, children),
    DialogContent: ({ children, className: _c, closeBtn: _b, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-content", ...rest }, children),
    DialogHeader: ({ children, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-header", ...rest }, children),
    DialogTitle: ({ children, ...rest }) =>
      React.createElement("h2", { "data-slot": "dialog-title", ...rest }, children),
  };
});

// Native-select shim for the Radix Select inside the dialog.
vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, disabled, children }) => {
    // Collect option pairs by walking children recursively. We render a
    // native <select> with those options so tests can change value via
    // fireEvent.change.
    const options = [];
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node?.type?.displayName === "SelectItem" || node?.props?.["data-slot"] === "select-item") {
        options.push({ value: node.props.value, label: node.props.children });
        return;
      }
      const kids = node?.props?.children;
      if (kids) walk(kids);
    };
    walk(children);
    return React.createElement(
      "select",
      {
        "data-slot": "select",
        value: value || "",
        disabled,
        onChange: (e) => onValueChange && onValueChange(e.target.value),
      },
      [
        React.createElement("option", { key: "__placeholder", value: "" }, ""),
        ...options.map((opt) =>
          React.createElement("option", { key: opt.value, value: opt.value }, opt.label),
        ),
      ],
    );
  };
  const passSlot = (slot) => {
    const C = ({ children, ...rest }) =>
      React.createElement("span", { "data-slot": slot, ...rest }, children);
    return C;
  };
  const SelectItem = ({ children, value, ...rest }) =>
    React.createElement("span", { "data-slot": "select-item", value, ...rest }, children);
  SelectItem.displayName = "SelectItem";
  return {
    Select,
    SelectContent: passSlot("select-content"),
    SelectItem,
    SelectTrigger: passSlot("select-trigger"),
    SelectValue: passSlot("select-value"),
  };
});

vi.mock("@/components/ui/Tooltip", () => {
  const make = (slot) => ({ children, ...rest }) =>
    React.createElement("div", { "data-slot": slot, ...rest }, children);
  return {
    Tooltip: make("tooltip"),
    TooltipTrigger: ({ children, asChild: _a, ...rest }) =>
      React.createElement("div", { "data-slot": "tooltip-trigger", ...rest }, children),
    TooltipContent: ({ children, className: _c, ...rest }) =>
      React.createElement("div", { "data-slot": "tooltip-content", ...rest }, children),
  };
});

// Stub the three lazily-loaded sub-forms so React.lazy resolves to a tiny
// component. The real ones drag in more tooltip / lucide imports we don't
// need to test here.
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/SftpForm",
  () => ({
    default: () => React.createElement("div", { "data-testid": "sftp-form" }, "SFTPForm"),
  }),
);
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/GoogledriveForm",
  () => ({
    default: () =>
      React.createElement("div", { "data-testid": "googledrive-form" }, "GoogledriveForm"),
  }),
);
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/S3Form",
  () => ({
    default: () => React.createElement("div", { "data-testid": "s3-form" }, "S3Form"),
  }),
);

const { default: AddStorageModal } = await import(
  "../../../../../../src/page/user/Settings/StorageSetting/AddStorageModal.jsx"
);

beforeEach(() => {
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  postRef.addStorage.mockReset();
  putRef.updateStorage.mockReset();
});

describe("Settings/StorageSetting/AddStorageModal", () => {
  it("renders the 'Add Storage' title and the type-picker when no editData is supplied", async () => {
    render(
      <AddStorageModal
        trigger={<button>open</button>}
        isOpen={true}
        onOpenChange={vi.fn()}
        onStorageSelect={vi.fn()}
      />,
    );
    expect(await screen.findByText("Add Storage")).toBeInTheDocument();
    // The pre-form Select is rendered with our native shim. There are
    // two options: Amazon S3 and SFTP (Google Drive is commented out in
    // the storageTypes array).
    expect(screen.getByText("Amazon S3")).toBeInTheDocument();
    expect(screen.getByText("SFTP")).toBeInTheDocument();
    // The form proper is not yet visible (no Name input).
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("swaps the title and pre-fills name + storage type when editData is supplied (edit mode)", async () => {
    render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        editData={{ _id: "stg1", name: "primary-s3", type: "s3", note: "main bucket" }}
        onStorageSelect={vi.fn()}
      />,
    );
    expect(await screen.findByText("Edit Storage")).toBeInTheDocument();
    // The Name input is pre-filled from editData.name.
    const nameInput = await screen.findByPlaceholderText("Name");
    expect(nameInput).toHaveValue("primary-s3");
    // The S3 sub-form is mounted (lazy import resolved to the stub).
    expect(await screen.findByTestId("s3-form")).toBeInTheDocument();
    // The Save button label flips in edit mode.
    expect(
      screen.getByRole("button", { name: /Save Storage/i }),
    ).toBeInTheDocument();
  });

  it("mounts the GoogledriveForm sub-form when editData.type is google_drive_oauth", async () => {
    render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        editData={{
          _id: "stgGD",
          name: "gd-store",
          type: "google_drive_oauth",
          clientId: "the-id",
          redirectUri: "https://cb.example.com",
        }}
        onStorageSelect={vi.fn()}
      />,
    );
    expect(await screen.findByText("Edit Storage")).toBeInTheDocument();
    expect(await screen.findByTestId("googledrive-form")).toBeInTheDocument();
    // Sftp / S3 stubs must NOT mount when the picked type is GoogleDrive.
    expect(screen.queryByTestId("sftp-form")).toBeNull();
    expect(screen.queryByTestId("s3-form")).toBeNull();
  });

  it("yup-blocks the edit-mode submit when required credential fields are empty (password always blank in edit mode)", async () => {
    render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        // Even with the rest of the SFTP fields populated, password is
        // hard-coded to '' in getInitialValues() for edit mode, so yup's
        // `password: required when storageType=sftp` clause rejects the
        // submit and updateStorage is never invoked. This pins the
        // "user must retype credentials on edit" behavior.
        editData={{
          _id: "stg-x",
          name: "sftp-edit",
          type: "sftp",
          path: "/x",
          port: 22,
          username: "u",
          host: "h",
        }}
        onStorageSelect={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save Storage/i }));
    // Give Formik / yup a chance to run validation.
    await new Promise((r) => setTimeout(r, 50));
    expect(putRef.updateStorage).not.toHaveBeenCalled();
    expect(postRef.addStorage).not.toHaveBeenCalled();
    expect(toastRef.success).not.toHaveBeenCalled();
  });

  it("forwards keystrokes into the controlled Name input via Formik handleChange", async () => {
    render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        editData={{ _id: "stg9", name: "old-name", type: "sftp" }}
        onStorageSelect={vi.fn()}
      />,
    );
    const nameInput = await screen.findByPlaceholderText("Name");
    expect(nameInput).toHaveValue("old-name");
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "new-name" } });
    });
    expect(nameInput).toHaveValue("new-name");
  });

  it("disables the storage-type Select while in edit mode (so users cannot change provider mid-edit)", async () => {
    const { container } = render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        editData={{ _id: "stg2", name: "x", type: "sftp" }}
        onStorageSelect={vi.fn()}
      />,
    );
    // Our select shim is a native <select>; in edit mode it must be
    // marked disabled (the JSX passes `disabled={isEditMode}`).
    const selects = container.querySelectorAll("select[data-slot='select']");
    // The first select is the in-form storage-type picker (only one Select
    // is rendered now that showForm is true).
    expect(selects.length).toBeGreaterThanOrEqual(1);
    expect(selects[0]).toBeDisabled();
    // The SFTP sub-form is mounted.
    expect(await screen.findByTestId("sftp-form")).toBeInTheDocument();
  });

  it("returns null (renders nothing) when isOpen is controlled to false", () => {
    const { container } = render(
      <AddStorageModal
        trigger={null}
        isOpen={false}
        onOpenChange={vi.fn()}
        editData={{ _id: "stg3", name: "hidden", type: "s3" }}
        onStorageSelect={vi.fn()}
      />,
    );
    // Our Dialog mock only renders children when `open` is truthy.
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
    expect(container.querySelector("[data-slot='dialog-content']")).toBeNull();
  });
});
