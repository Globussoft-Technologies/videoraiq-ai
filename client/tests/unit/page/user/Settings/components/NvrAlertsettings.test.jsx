/**
 * NVRSettings — a collapsible card listing the current NVR config (via
 * NVRSettingsForm) plus three previous-config cards (NVRSettingsCard).
 * Has its own Edit button that mounts the real AddNVRForm.
 *
 * Mocks:
 *  - ../../Streams/Nvrform → stub AddNVRForm (giant)
 *  - ./Nvralertsettingsform → stub NVRSettingsForm so this file's tests
 *    don't transitively depend on AddNVRForm import-time.
 *  - ./NvrSettingscard → stub NVRSettingsCard so we can count card
 *    instances and assert the previousSettings array is consumed.
 *
 * Total: 3 module mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const addNvrFormProps = vi.hoisted(() => ({ current: null }));
const formProps = vi.hoisted(() => ({ current: [] }));
const cardProps = vi.hoisted(() => ({ current: [] }));

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

vi.mock("@/page/user/Settings/components/Nvralertsettingsform", () => ({
  default: (props) => {
    formProps.current.push(props);
    return <div data-testid="nvr-form-summary">summary</div>;
  },
}));

vi.mock("@/page/user/Settings/components/NvrSettingscard", () => ({
  default: (props) => {
    cardProps.current.push(props);
    return <div data-testid="nvr-card">card</div>;
  },
}));

import NVRSettings from "@/page/user/Settings/components/NvrAlertsettings.jsx";

describe("NVRSettings", () => {
  beforeEach(() => {
    addNvrFormProps.current = null;
    formProps.current = [];
    cardProps.current = [];
  });

  it("renders the heading and is expanded by default (form summary + 3 cards visible)", () => {
    render(<NVRSettings />);
    expect(screen.getByText("NVR Settings")).toBeInTheDocument();
    expect(screen.getByTestId("nvr-form-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("nvr-card")).toHaveLength(3);
  });

  it("passes the currentSettings prop to NVRSettingsForm and previousSettings to NVRSettingsCard[]", () => {
    render(<NVRSettings />);
    expect(formProps.current[0]?.settings).toMatchObject({
      _id: "1",
      name: "Office_NVR_01",
      ipAddress: "192.168.1.25",
      username: "admin",
      rtspPort: "554",
      totalChannels: "16",
    });
    // Each card receives an identical settings shape (no _id on those).
    expect(cardProps.current).toHaveLength(3);
    cardProps.current.forEach((p) => {
      expect(p.settings).toMatchObject({
        name: "Office_NVR_01",
        ipAddress: "192.168.1.25",
        rtspPort: "554",
      });
    });
  });

  it("clicking the header collapses the body (hides form summary and cards)", () => {
    render(<NVRSettings />);
    fireEvent.click(screen.getByText("NVR Settings"));
    expect(screen.queryByTestId("nvr-form-summary")).toBeNull();
    expect(screen.queryAllByTestId("nvr-card")).toHaveLength(0);
  });

  it("clicking the second Edit button (the previous-settings one) mounts AddNVRForm with the current settings", () => {
    render(<NVRSettings />);
    const edits = screen.getAllByRole("button", { name: /Edit/i });
    expect(edits.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(edits[edits.length - 1]);
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    expect(addNvrFormProps.current).toMatchObject({
      isEdit: true,
      initialData: {
        _id: "1",
        name: "Office_NVR_01",
      },
    });
  });

  it("AddNVRForm onClose closes the modal", () => {
    render(<NVRSettings />);
    const edits = screen.getAllByRole("button", { name: /Edit/i });
    fireEvent.click(edits[edits.length - 1]);
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-nvr"));
    expect(screen.queryByTestId("add-nvr-form")).toBeNull();
  });

  it("provided AddNVRForm fetchNvrData is a no-op function (sanity)", () => {
    render(<NVRSettings />);
    const edits = screen.getAllByRole("button", { name: /Edit/i });
    fireEvent.click(edits[edits.length - 1]);
    expect(typeof addNvrFormProps.current.fetchNvrData).toBe("function");
    expect(() => addNvrFormProps.current.fetchNvrData()).not.toThrow();
  });
});
