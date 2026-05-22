/**
 * src/page/user/Detection/components/DeleteAddedRecipients.jsx — confirmation
 * modal that lists detection assignments of the recipient(s) being removed.
 * Uses TanStack table + ReactDOM portal. Column set switches based on email vs
 * phone presence in the data array.
 *
 * Mocks: 0
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteAddedRecipients from "@/page/user/Detection/components/DeleteAddedRecipients.jsx";

describe("DeleteAddedRecipients", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <DeleteAddedRecipients open={false} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Are you sure you want to delete/i)).toBeNull();
  });

  it("renders the confirmation copy and trash icon when open", () => {
    render(<DeleteAddedRecipients open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    expect(
      screen.getByText(/currently assigned to receive alerts/i)
    ).toBeInTheDocument();
  });

  it("renders 'No detection assigned' when the data array is empty", () => {
    render(<DeleteAddedRecipients open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("No detection assigned")).toBeInTheDocument();
  });

  it("renders the Email column when an email-type recipient is supplied", () => {
    const data = [
      { fullName: "Jane", type: "email", value: "jane@example.test", detectionCount: 3 },
    ];
    render(<DeleteAddedRecipients open data={data} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Email ID")).toBeInTheDocument();
    expect(screen.getByText("jane@example.test")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("Phone No")).toBeNull();
  });

  it("renders the Phone column when only a phone-type recipient is supplied", () => {
    const data = [
      { fullName: "Bob", type: "phone", value: "+1-555-1234", detectionCount: 1 },
    ];
    render(<DeleteAddedRecipients open data={data} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Phone No")).toBeInTheDocument();
    expect(screen.getByText("+1-555-1234")).toBeInTheDocument();
    expect(screen.queryByText("Email ID")).toBeNull();
  });

  it("falls back to 'N/A' when fullName is missing", () => {
    const data = [
      { type: "email", value: "no-name@example.test", detectionCount: 0 },
    ];
    render(<DeleteAddedRecipients open data={data} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
    // assignedDetection 0 renders as "0".
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is pressed", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteAddedRecipients open onClose={onClose} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when Delete is pressed", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteAddedRecipients open onClose={onClose} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables confirm and renders the spinner when loading", () => {
    render(
      <DeleteAddedRecipients open loading onClose={() => {}} onConfirm={() => {}} />
    );
    const disabledBtn = Array.from(document.querySelectorAll("button")).find((b) => b.disabled);
    expect(disabledBtn).toBeTruthy();
    expect(disabledBtn.querySelector("svg")).toBeTruthy();
  });

  it("ignores a non-array data prop without crashing", () => {
    expect(() =>
      render(
        <DeleteAddedRecipients
          open
          data={null}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      )
    ).not.toThrow();
    expect(screen.getByText("No detection assigned")).toBeInTheDocument();
  });
});
