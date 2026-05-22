/**
 * src/page/user/Detection/components/EditDetectionSettingModal.jsx — wraps
 * ManageSettings inside a Dialog with a fixed "Edit Configurations" header,
 * forwarding `data`/`fetchData`/`onClose` to the inner form.
 *
 * Mocks (2):
 *   1. @/components/ui/dialog — Radix portal makes content invisible in
 *      jsdom; inline shim so DialogContent renders inline.
 *   2. ./ManageSettings (the real form pulls in many heavy deps) — stub
 *      with a passthrough that surfaces the props it receives.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) =>
    open ? <div data-slot="dialog">{children}</div> : null;
  const DialogContent = ({ children, closeBtn: _c, ...rest }) => (
    <div data-slot="dialog-content" {...rest}>
      {children}
    </div>
  );
  return { Dialog, DialogContent };
});

vi.mock(
  "../../../../../../src/page/user/Detection/components/ManageSettings",
  () => ({
    default: ({
      heading,
      hideAreaSettings,
      editData,
      onClose,
      fetchData,
      isModal,
      selectedType,
    }) => (
      <div
        data-testid="manage-settings"
        data-heading={heading ?? ""}
        data-hide-area={String(!!hideAreaSettings)}
        data-is-modal={String(!!isModal)}
        data-selected-type={selectedType ?? ""}
        data-has-data={editData ? "yes" : "no"}
      >
        <button data-testid="ms-close" onClick={onClose}>
          ms-close
        </button>
        <button data-testid="ms-fetch" onClick={fetchData}>
          ms-fetch
        </button>
      </div>
    ),
  })
);

const { default: EditDetectionSettingModal } = await import(
  "../../../../../../src/page/user/Detection/components/EditDetectionSettingModal.jsx"
);

const sampleData = {
  detectionSetting: {
    detectionName: "Lobby Camera",
    settingType: "fire",
  },
};

describe("EditDetectionSettingModal", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <EditDetectionSettingModal
        isOpen={false}
        onClose={() => {}}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
    expect(screen.queryByTestId("manage-settings")).toBeNull();
  });

  it("renders the dialog with heading and inner form when open", () => {
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={() => {}}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    expect(screen.getByText("Edit Configurations")).toBeInTheDocument();
    expect(screen.getByText("Edit Configuration Settings")).toBeInTheDocument();
    expect(screen.getByTestId("manage-settings")).toBeInTheDocument();
  });

  it("forwards data.detectionSetting.detectionName as ManageSettings heading", () => {
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={() => {}}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    expect(
      screen.getByTestId("manage-settings").getAttribute("data-heading")
    ).toBe("Lobby Camera");
  });

  it("forwards data.detectionSetting.settingType as selectedType and sets hideAreaSettings + isModal", () => {
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={() => {}}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    const inner = screen.getByTestId("manage-settings");
    expect(inner.getAttribute("data-selected-type")).toBe("fire");
    expect(inner.getAttribute("data-hide-area")).toBe("true");
    expect(inner.getAttribute("data-is-modal")).toBe("true");
    expect(inner.getAttribute("data-has-data")).toBe("yes");
  });

  it("renders gracefully when data is undefined (heading + selectedType empty)", () => {
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={() => {}}
        fetchData={() => {}}
      />
    );
    const inner = screen.getByTestId("manage-settings");
    expect(inner.getAttribute("data-heading")).toBe("");
    expect(inner.getAttribute("data-selected-type")).toBe("");
  });

  it("the X close button invokes onClose", () => {
    const onClose = vi.fn();
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={onClose}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    // The only top-level button in this wrapper is the X icon button.
    const buttons = screen.getAllByRole("button");
    // First button is the X close (the ManageSettings stub renders its own
    // ms-close/ms-fetch which are also buttons — but the wrapper's X is
    // first in DOM order).
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards onClose to ManageSettings", () => {
    const onClose = vi.fn();
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={onClose}
        data={sampleData}
        fetchData={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("ms-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards fetchData to ManageSettings", () => {
    const fetchData = vi.fn();
    render(
      <EditDetectionSettingModal
        isOpen={true}
        onClose={() => {}}
        data={sampleData}
        fetchData={fetchData}
      />
    );
    fireEvent.click(screen.getByTestId("ms-fetch"));
    expect(fetchData).toHaveBeenCalledTimes(1);
  });
});
