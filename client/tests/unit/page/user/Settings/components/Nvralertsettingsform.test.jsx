/**
 * NVRSettingsForm — a read-only summary card for current NVR settings
 * with an Edit button that mounts the AddNVRForm modal.
 *
 * Mocks:
 *  - ../../Streams/Nvrform: stub AddNVRForm so we don't pull the giant
 *    real form (it has many of its own deps).
 *
 * Total: 1 module mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const addNvrFormProps = vi.hoisted(() => ({ current: null }));

vi.mock("@/page/user/Streams/Nvrform", () => ({
  default: (props) => {
    addNvrFormProps.current = props;
    return (
      <div data-testid="add-nvr-form">
        <button onClick={props.onClose}>close-nvr</button>
      </div>
    );
  },
}));

import NVRSettingsForm from "@/page/user/Settings/components/Nvralertsettingsform.jsx";

const settings = {
  name: "NVR-Front",
  ipAddress: "10.1.2.3",
  username: "alice",
  password: "p4ss",
  rtspPort: "554",
  totalChannels: "8",
};

describe("NVRSettingsForm", () => {
  beforeEach(() => {
    addNvrFormProps.current = null;
  });

  it("renders all FormField inputs populated from the settings prop", () => {
    render(<NVRSettingsForm settings={settings} />);
    // Each FormField renders an <input> with the value
    expect(screen.getByLabelText(/^Name$/i).value).toBe("NVR-Front");
    expect(screen.getByLabelText(/^Ip Address$/i).value).toBe("10.1.2.3");
    expect(screen.getByLabelText(/^Username$/i).value).toBe("alice");
    expect(screen.getByLabelText(/^Password$/i).value).toBe("p4ss");
    expect(screen.getByLabelText(/^RTSP Port$/i).value).toBe("554");
    expect(screen.getByLabelText(/^Total Channels$/i).value).toBe("8");
  });

  it("password field is type=password (matches the FormField type prop)", () => {
    render(<NVRSettingsForm settings={settings} />);
    expect(screen.getByLabelText(/^Password$/i)).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("shows the 'Current NVR Settings' heading and the password-change warning", () => {
    render(<NVRSettingsForm settings={settings} />);
    expect(screen.getByText("Current NVR Settings")).toBeInTheDocument();
    expect(
      screen.getByText(/Password change detected/i),
    ).toBeInTheDocument();
  });

  it("Edit button is not active initially; AddNVRForm is not mounted", () => {
    render(<NVRSettingsForm settings={settings} />);
    expect(screen.queryByTestId("add-nvr-form")).toBeNull();
  });

  it("clicking Edit mounts AddNVRForm with isEdit=true and id-merged initialData", () => {
    render(<NVRSettingsForm settings={settings} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    expect(addNvrFormProps.current).toMatchObject({
      isEdit: true,
      initialData: { _id: "1", ...settings },
    });
    expect(typeof addNvrFormProps.current.onClose).toBe("function");
    expect(typeof addNvrFormProps.current.fetchNvrData).toBe("function");
  });

  it("the AddNVRForm onClose callback closes the form (unmounts it)", () => {
    render(<NVRSettingsForm settings={settings} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-nvr"));
    expect(screen.queryByTestId("add-nvr-form")).toBeNull();
  });

  it("provided fetchNvrData stub does not throw when invoked (sanity)", () => {
    render(<NVRSettingsForm settings={settings} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(() => addNvrFormProps.current.fetchNvrData()).not.toThrow();
  });
});
