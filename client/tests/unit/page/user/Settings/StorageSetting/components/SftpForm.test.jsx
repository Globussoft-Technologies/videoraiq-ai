/**
 * SftpForm — sibling presentational sub-form (alongside GoogledriveForm /
 * S3Form) used by AddStorageModal to capture SFTP credentials:
 * username, password, host, port, path. Like its siblings, it is a
 * controlled Formik sub-form: parent owns state and passes values/
 * errors/touched + handleChange/handleBlur. There are no effects, no
 * fetch calls — just labels, tooltips, and five inputs.
 *
 * Mocks:
 *   - @/components/ui/Tooltip — passthrough so tooltip hint text renders
 *     inline without a Radix Portal (mirrors S3Form.test.jsx /
 *     GoogledriveForm.test.jsx).
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

const { default: SftpForm } = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/components/SftpForm.jsx"
);

const renderForm = (overrides = {}) => {
  const handleChange = vi.fn();
  const handleBlur = vi.fn();
  const props = {
    values: {
      username: "",
      password: "",
      host: "",
      port: "",
      path: "",
    },
    errors: {},
    touched: {},
    handleChange,
    handleBlur,
    isEditMode: false,
    ...overrides,
  };
  return { ...render(<SftpForm {...props} />), handleChange, handleBlur };
};

describe("SftpForm", () => {
  it("renders the five labelled inputs with the supplied values and correct types", () => {
    renderForm({
      values: {
        username: "sftp-user",
        password: "hunter2",
        host: "10.0.0.5",
        port: "2222",
        path: "/var/uploads",
      },
    });

    // Labels are present.
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("Port")).toBeInTheDocument();
    expect(screen.getByText("Path")).toBeInTheDocument();

    const usernameInput = screen.getByPlaceholderText("Username");
    const passwordInput = screen.getByPlaceholderText("Password");
    const hostInput = screen.getByPlaceholderText("Host");
    const portInput = screen.getByPlaceholderText("Port");
    const pathInput = screen.getByPlaceholderText("Path");

    // Values are wired through from the controlled props.
    expect(usernameInput).toHaveValue("sftp-user");
    expect(passwordInput).toHaveValue("hunter2");
    expect(hostInput).toHaveValue("10.0.0.5");
    // Port input is type=number, so RTL coerces to a number.
    expect(portInput).toHaveValue(2222);
    expect(pathInput).toHaveValue("/var/uploads");

    // Input types: only the password field is masked; the port is numeric.
    expect(usernameInput).toHaveAttribute("type", "text");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(hostInput).toHaveAttribute("type", "text");
    expect(portInput).toHaveAttribute("type", "number");
    expect(pathInput).toHaveAttribute("type", "text");

    // Sanity: tooltip hint text renders inline thanks to the mock.
    expect(screen.getByText(/SFTP server name/i)).toBeInTheDocument();
    expect(
      screen.getByText(/SFTP authentication Password/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/IP Address/i)).toBeInTheDocument();
    expect(screen.getByText(/SFTP server port number/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Remote directory path on SFTP server/i),
    ).toBeInTheDocument();
  });

  it("forwards keystrokes and blur events to the parent handlers with the right field name", () => {
    const { handleChange, handleBlur } = renderForm();
    const hostInput = screen.getByPlaceholderText("Host");

    fireEvent.change(hostInput, { target: { value: "sftp.example.com" } });
    fireEvent.blur(hostInput);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleBlur).toHaveBeenCalledTimes(1);
    // The synthetic event must carry the input's `name` attribute so Formik
    // routes the change to the correct field.
    expect(handleChange.mock.calls[0][0].target.name).toBe("host");
  });

  it("only shows a per-field error when both errors and touched are set", () => {
    const baseValues = {
      username: "",
      password: "",
      host: "",
      port: "",
      path: "",
    };

    const { rerender } = render(
      <SftpForm
        values={baseValues}
        errors={{ username: "Required", port: "Bad port" }}
        touched={{}}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    // Errors present but touched is empty -> nothing should render.
    expect(screen.queryByText("Required")).toBeNull();
    expect(screen.queryByText("Bad port")).toBeNull();

    rerender(
      <SftpForm
        values={baseValues}
        errors={{
          username: "Required",
          password: "Too short",
          host: "Bad host",
          port: "Bad port",
          path: "Bad path",
        }}
        touched={{
          username: true,
          password: true,
          host: true,
          port: true,
          path: true,
        }}
        handleChange={() => {}}
        handleBlur={() => {}}
        isEditMode={false}
      />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Too short")).toBeInTheDocument();
    expect(screen.getByText("Bad host")).toBeInTheDocument();
    expect(screen.getByText("Bad port")).toBeInTheDocument();
    expect(screen.getByText("Bad path")).toBeInTheDocument();
  });
});
