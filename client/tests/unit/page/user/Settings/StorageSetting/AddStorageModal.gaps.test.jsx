/**
 * Gap-fills for src/page/user/Settings/StorageSetting/AddStorageModal.jsx
 *
 * Uncovered lines:
 *   - 305-308: Select onValueChange in create mode (sets storageType,
 *     selectedStorage, showForm)
 *   - 343-345: Name field error display when errors.name && touched.name
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const postRef = vi.hoisted(() => ({ addStorage: vi.fn() }));
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/Api/post/index",
  () => postRef
);

const putRef = vi.hoisted(() => ({ updateStorage: vi.fn() }));
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/Api/put/index",
  () => putRef
);

vi.mock("@/components/ui/dialog", () => {
  const Pass = (slot) => ({ children, asChild: _a, open, onOpenChange, ...rest }) => {
    if (slot === "dialog") {
      return open
        ? React.createElement(
            "div",
            { "data-slot": slot, ...rest },
            children
          )
        : null;
    }
    return React.createElement("div", { "data-slot": slot, ...rest }, children);
  };
  return {
    Dialog: Pass("dialog"),
    DialogTrigger: ({ children, asChild: _a, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-trigger", ...rest }, children),
    DialogContent: ({ children, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-content", ...rest }, children),
    DialogHeader: ({ children, ...rest }) =>
      React.createElement("div", { "data-slot": "dialog-header", ...rest }, children),
    DialogTitle: ({ children, ...rest }) =>
      React.createElement("h2", { "data-slot": "dialog-title", ...rest }, children),
  };
});

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, disabled, children }) => {
    const options = [];
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (
        node?.type?.displayName === "SelectItem" ||
        node?.props?.["data-slot"] === "select-item"
      ) {
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
          React.createElement("option", { key: opt.value, value: opt.value }, opt.label)
        ),
      ]
    );
  };
  const passSlot = (slot) => {
    const C = ({ children, ...rest }) =>
      React.createElement("span", { "data-slot": slot, ...rest }, children);
    return C;
  };
  const SelectItem = ({ children, value, ...rest }) =>
    React.createElement(
      "span",
      { "data-slot": "select-item", value, ...rest },
      children
    );
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
    TooltipContent: ({ children, ...rest }) =>
      React.createElement("div", { "data-slot": "tooltip-content", ...rest }, children),
  };
});

vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/SftpForm",
  () => ({
    default: () => React.createElement("div", { "data-testid": "sftp-form" }, "SFTPForm"),
  })
);
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/GoogledriveForm",
  () => ({
    default: () =>
      React.createElement("div", { "data-testid": "googledrive-form" }, "GoogledriveForm"),
  })
);
vi.mock(
  "../../../../../../src/page/user/Settings/StorageSetting/components/S3Form",
  () => ({
    default: () => React.createElement("div", { "data-testid": "s3-form" }, "S3Form"),
  })
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

describe("AddStorageModal gap-fills", () => {
  it("selecting a storage type in create mode triggers setFieldValue/setSelectedStorage/setShowForm (lines 305-308)", async () => {
    const { container } = render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        onStorageSelect={vi.fn()}
      />
    );

    // Initially the form is not visible (no Name input).
    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    // Select the SFTP option from the pre-form Select shim.
    const select = container.querySelector("select[data-slot='select']");
    expect(select).toBeTruthy();
    await act(async () => {
      fireEvent.change(select, { target: { value: "sftp" } });
    });

    // After onValueChange fires, showForm becomes true: the Name input
    // and the SFTPForm sub-form mount.
    expect(await screen.findByPlaceholderText("Name")).toBeInTheDocument();
    expect(await screen.findByTestId("sftp-form")).toBeInTheDocument();
  });

  it("selecting Amazon S3 in create mode mounts the S3Form sub-form", async () => {
    const { container } = render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        onStorageSelect={vi.fn()}
      />
    );
    const select = container.querySelector("select[data-slot='select']");
    await act(async () => {
      fireEvent.change(select, { target: { value: "s3" } });
    });
    expect(await screen.findByTestId("s3-form")).toBeInTheDocument();
  });

  it("submitting in edit mode with an empty Name shows the validation error (lines 343-345)", async () => {
    render(
      <AddStorageModal
        trigger={null}
        isOpen={true}
        onOpenChange={vi.fn()}
        editData={{ _id: "stg1", name: "", type: "sftp" }}
        onStorageSelect={vi.fn()}
      />
    );

    const nameInput = await screen.findByPlaceholderText("Name");
    // Blur to mark the field touched, then submit.
    await act(async () => {
      fireEvent.blur(nameInput);
    });

    const saveBtn = screen.getByRole("button", { name: /Save Storage/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Wait for the error display to render.
    await waitFor(() => {
      // The yup schema marks `name` required — the error message shows.
      const errorEls = document.querySelectorAll(".text-red-500");
      expect(errorEls.length).toBeGreaterThan(0);
    });
  });
});
