/**
 * S3Form — sibling presentational sub-form (alongside GoogledriveForm /
 * SftpForm) used by AddStorageModal to capture AWS S3 credentials:
 * accessKeyId, secretAccessKey, bucketName, region. Like its sibling,
 * it is a controlled Formik sub-form: parent owns state and passes
 * values/errors/touched + handleChange/handleBlur. There are no effects,
 * no fetch calls — just labels, tooltips, and four inputs.
 *
 * Mocks:
 *   - @/components/ui/Tooltip — passthrough so tooltip content renders
 *     inline without a Radix Portal (mirrors GoogledriveForm.test.jsx).
 *
 * Total: 1 module mock (well under the 8-mock cap).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/Tooltip", () => {
  const make = (slot) => ({ children, ...rest }) =>
    React.createElement(
      "div",
      { "data-slot": slot, ...rest },
      children,
    );
  return {
    Tooltip: make("tooltip"),
    TooltipTrigger: ({ children, asChild: _asChild, ...rest }) =>
      React.createElement(
        "div",
        { "data-slot": "tooltip-trigger", ...rest },
        children,
      ),
    TooltipContent: ({ children, className: _c, arrowClassName: _a, ...rest }) =>
      React.createElement(
        "div",
        { "data-slot": "tooltip-content", ...rest },
        children,
      ),
  };
});

const { default: S3Form } = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/components/S3Form.jsx"
);

const renderForm = (overrides = {}) => {
  const handleChange = vi.fn();
  const handleBlur = vi.fn();
  const props = {
    values: {
      accessKeyId: "",
      secretAccessKey: "",
      bucketName: "",
      region: "",
    },
    errors: {},
    touched: {},
    handleChange,
    handleBlur,
    isEditMode: false,
    ...overrides,
  };
  return { ...render(<S3Form {...props} />), handleChange, handleBlur };
};

describe("S3Form", () => {
  it("renders the four labelled inputs with the supplied values", () => {
    renderForm({
      values: {
        accessKeyId: "AKIA-FAKE",
        secretAccessKey: "supersecret",
        bucketName: "my-bucket",
        region: "us-east-1",
      },
    });
    expect(screen.getByText("Access Key ID")).toBeInTheDocument();
    expect(screen.getByText("Secret Access Key")).toBeInTheDocument();
    expect(screen.getByText("Bucket Name")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();

    const accessKeyInput = screen.getByPlaceholderText("Access Key ID");
    const secretInput = screen.getByPlaceholderText("Secret Access Key");
    const bucketInput = screen.getByPlaceholderText("Bucket Name");
    const regionInput = screen.getByPlaceholderText("Region (e.g., us-east-1)");

    expect(accessKeyInput).toHaveValue("AKIA-FAKE");
    expect(secretInput).toHaveValue("supersecret");
    expect(bucketInput).toHaveValue("my-bucket");
    expect(regionInput).toHaveValue("us-east-1");

    // Credentials must be password fields; bucket/region are plain text.
    expect(accessKeyInput).toHaveAttribute("type", "password");
    expect(secretInput).toHaveAttribute("type", "password");
    expect(bucketInput).toHaveAttribute("type", "text");
    expect(regionInput).toHaveAttribute("type", "text");

    // Sanity: tooltip hint text is rendered inline thanks to the mock.
    expect(
      screen.getByText(/AWS Access Key ID from AWS Console/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AWS Region of your S3 bucket/i),
    ).toBeInTheDocument();
  });

  it("forwards keystrokes and blur events to the parent handlers", () => {
    const { handleChange, handleBlur } = renderForm();
    const bucketInput = screen.getByPlaceholderText("Bucket Name");

    fireEvent.change(bucketInput, { target: { value: "new-bucket" } });
    fireEvent.blur(bucketInput);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleBlur).toHaveBeenCalledTimes(1);
    // First call's synthetic event target should reflect the input name.
    expect(handleChange.mock.calls[0][0].target.name).toBe("bucketName");
  });

  it("only shows a per-field error when both errors and touched are set", () => {
    const { rerender } = render(
      <S3Form
        values={{
          accessKeyId: "",
          secretAccessKey: "",
          bucketName: "",
          region: "",
        }}
        errors={{ accessKeyId: "Required" }}
        touched={{}}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    // touched.accessKeyId is falsy -> error hidden
    expect(screen.queryByText("Required")).toBeNull();

    rerender(
      <S3Form
        values={{
          accessKeyId: "",
          secretAccessKey: "",
          bucketName: "",
          region: "",
        }}
        errors={{
          accessKeyId: "Required",
          bucketName: "Bad bucket",
          region: "Bad region",
        }}
        touched={{ accessKeyId: true, bucketName: true, region: true }}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Bad bucket")).toBeInTheDocument();
    expect(screen.getByText("Bad region")).toBeInTheDocument();
  });

  it("swaps the credential placeholders when isEditMode is true", () => {
    renderForm({ isEditMode: true });
    // In edit mode both credential inputs use the "leave blank" placeholder;
    // bucket and region are not credentials and keep their normal placeholders.
    const editPlaceholders = screen.getAllByPlaceholderText(
      "Leave blank to keep current",
    );
    expect(editPlaceholders).toHaveLength(2);
    expect(screen.queryByPlaceholderText("Access Key ID")).toBeNull();
    expect(screen.queryByPlaceholderText("Secret Access Key")).toBeNull();
    // Non-secret fields keep their create-mode placeholders.
    expect(screen.getByPlaceholderText("Bucket Name")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Region (e.g., us-east-1)"),
    ).toBeInTheDocument();
  });
});
