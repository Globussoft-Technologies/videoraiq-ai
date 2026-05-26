/**
 * GoogledriveForm — a tiny presentational sub-form used by AddStorageModal
 * to capture Google Drive OAuth credentials (clientId / clientSecret /
 * redirectUri). It is a controlled component: parent (Formik) owns state
 * and passes values/errors/touched + handleChange/handleBlur. There are
 * no effects, no fetch calls, only static labels + three inputs.
 *
 * Mocks:
 *   - @/components/ui/Tooltip — passthrough so tooltip content (and the
 *     hint text) renders inline without a Radix Portal.
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

const { default: GoogledriveForm } = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/components/GoogledriveForm.jsx"
);

const renderForm = (overrides = {}) => {
  const handleChange = vi.fn();
  const handleBlur = vi.fn();
  const props = {
    values: { clientId: "", clientSecret: "", redirectUri: "" },
    errors: {},
    touched: {},
    handleChange,
    handleBlur,
    isEditMode: false,
    ...overrides,
  };
  return { ...render(<GoogledriveForm {...props} />), handleChange, handleBlur };
};

describe("GoogledriveForm", () => {
  it("renders the three labelled inputs with the supplied values", () => {
    renderForm({
      values: {
        clientId: "the-client-id",
        clientSecret: "the-secret",
        redirectUri: "https://example.com/cb",
      },
    });
    expect(screen.getByText("Client ID")).toBeInTheDocument();
    expect(screen.getByText("Client Secret")).toBeInTheDocument();
    expect(screen.getByText("Redirect URI")).toBeInTheDocument();

    const clientIdInput = screen.getByPlaceholderText("Client ID");
    const redirectInput = screen.getByPlaceholderText("Redirect URI");
    // In create mode the secret input is placeholdered "Client Secret".
    const secretInput = screen.getByPlaceholderText("Client Secret");

    expect(clientIdInput).toHaveValue("the-client-id");
    expect(secretInput).toHaveValue("the-secret");
    expect(redirectInput).toHaveValue("https://example.com/cb");

    // The client-secret input must be a password field.
    expect(secretInput).toHaveAttribute("type", "password");
    // Sanity: tooltip hint text is rendered inline thanks to the mock.
    expect(
      screen.getByText(/Google OAuth Client ID from google cloud/i),
    ).toBeInTheDocument();
  });

  it("forwards keystrokes and blur events to the parent handlers", () => {
    const { handleChange, handleBlur } = renderForm();
    const clientIdInput = screen.getByPlaceholderText("Client ID");

    fireEvent.change(clientIdInput, { target: { value: "abc123" } });
    fireEvent.blur(clientIdInput);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleBlur).toHaveBeenCalledTimes(1);
    // First call's synthetic event target should reflect the input name.
    expect(handleChange.mock.calls[0][0].target.name).toBe("clientId");
  });

  it("only shows a per-field error when both errors and touched are set", () => {
    const { rerender } = render(
      <GoogledriveForm
        values={{ clientId: "", clientSecret: "", redirectUri: "" }}
        errors={{ clientId: "Required" }}
        touched={{}}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    // touched.clientId is falsy -> error hidden
    expect(screen.queryByText("Required")).toBeNull();

    rerender(
      <GoogledriveForm
        values={{ clientId: "", clientSecret: "", redirectUri: "" }}
        errors={{ clientId: "Required", redirectUri: "Bad URI" }}
        touched={{ clientId: true, redirectUri: true }}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Bad URI")).toBeInTheDocument();
  });

  it("swaps the client-secret placeholder when isEditMode is true", () => {
    renderForm({ isEditMode: true });
    // In edit mode the placeholder hints that leaving the field blank
    // keeps the saved secret intact.
    expect(
      screen.getByPlaceholderText("Leave blank to keep current"),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Client Secret")).toBeNull();
  });
});
