/**
 * AddRecipientModal — a dialog that lets the user add either an email or
 * a phone recipient with selected detection types. Uses Formik internally
 * (which we run for real), but its surrounding dependencies are heavy.
 *
 * Mocks:
 *  - @/components/ui/dialog: render passthrough so children mount
 *  - @/components/ui/popover: render passthrough so detection types list
 *    appears inline (avoids portals)
 *  - react-select: trivial inline replacement
 *  - @/page/user/Settings/Api/get: stub getDetectionTypes
 *  - country-calling-code: stub the codes table
 *
 * Total: 5 module mocks (under the 8-mock cap).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) =>
    open ? <div data-slot="dialog">{children}</div> : null;
  const DialogContent = ({ children }) => (
    <div data-slot="dialog-content">{children}</div>
  );
  const DialogHeader = ({ children }) => (
    <div data-slot="dialog-header">{children}</div>
  );
  const DialogTitle = ({ children }) => (
    <h2 data-slot="dialog-title">{children}</h2>
  );
  return { Dialog, DialogContent, DialogHeader, DialogTitle };
});

vi.mock("@/components/ui/popover", () => {
  const Popover = ({ open, children }) => (
    <div data-popover-open={String(!!open)}>{children}</div>
  );
  const PopoverTrigger = ({ children, asChild: _asChild, ...rest }) => (
    <div data-slot="popover-trigger" {...rest}>
      {children}
    </div>
  );
  const PopoverContent = ({ children, align: _align, ...rest }) => (
    <div data-slot="popover-content" {...rest}>
      {children}
    </div>
  );
  return { Popover, PopoverTrigger, PopoverContent };
});

vi.mock("react-select", () => ({
  default: ({ value, onChange, options, name }) => (
    <select
      data-testid={`rs-${name}`}
      value={value?.value ?? ""}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const getDetectionTypesMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    suspiciousActivitySettings: "Suspicious Activity",
    fireSettings: "Fire",
    personalProtectiveEquipmentSettings: "PPE",
  })
);
vi.mock("@/page/user/Settings/Api/get", () => ({
  getDetectionTypes: getDetectionTypesMock,
}));

vi.mock("country-calling-code", () => ({
  default: [
    { country: "India", isoCode2: "IN", countryCodes: ["91"] },
    { country: "USA", isoCode2: "US", countryCodes: ["1"] },
  ],
}));

const { default: AddRecipientModal } = await import(
  "../../../../src/components/NotificationRecipientModal/AddRecipientModal.jsx"
);

describe("AddRecipientModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <AddRecipientModal
        open={false}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={true}
      />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
  });

  it("renders the title and the Email tab when open", async () => {
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={true}
      />
    );
    expect(screen.getByText("Add Notification Recipient")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    // Email form is shown initially (Full Name + Email Address labels)
    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getByText("Email Address")).toBeInTheDocument();
  });

  it("fetches detection types on mount via getDetectionTypes", async () => {
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={true}
      />
    );
    await waitFor(() => {
      expect(getDetectionTypesMock).toHaveBeenCalled();
    });
    // The fetched labels show up in the popover (it's inline because we
    // mocked Popover/PopoverContent to be passthroughs).
    await waitFor(() => {
      expect(screen.getByText("Suspicious Activity")).toBeInTheDocument();
    });
    expect(screen.getByText("Fire")).toBeInTheDocument();
    expect(screen.getByText("PPE")).toBeInTheDocument();
  });

  it("hides the Phone tab when enablePhoneRecipients is false", () => {
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={false}
      />
    );
    expect(screen.queryByLabelText("Phone")).toBeNull();
  });

  it("switching to the Phone tab swaps the form to the phone view", () => {
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={true}
      />
    );
    // Click on the Phone option to switch
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(screen.getByText("Phone Number")).toBeInTheDocument();
    // Email Address label should be gone in the phone view
    expect(screen.queryByText("Email Address")).toBeNull();
  });

  it("Select All / Clear All buttons populate and reset the detection-type chips", async () => {
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={() => {}}
        enablePhoneRecipients={true}
      />
    );
    // Wait for detection types to load
    await waitFor(() => {
      expect(screen.getByText("Suspicious Activity")).toBeInTheDocument();
    });
    // Click "Select All"
    fireEvent.click(screen.getByText("Select All"));
    // We expect the trigger label to update to "3 Types Selected" since we
    // returned 3 detection types from the mock.
    await waitFor(() => {
      expect(screen.getByText(/3 Types Selected/)).toBeInTheDocument();
    });
    // Click "Clear All"
    fireEvent.click(screen.getByText("Clear All"));
    await waitFor(() => {
      expect(screen.getByText(/Select Detection Types/)).toBeInTheDocument();
    });
  });

  it("submitting a valid email payload calls onAddRecipient with the email type and value", async () => {
    const onAddRecipient = vi.fn();
    render(
      <AddRecipientModal
        open={true}
        onOpenChange={() => {}}
        onAddRecipient={onAddRecipient}
        enablePhoneRecipients={true}
      />
    );
    // Fill fullName + email
    fireEvent.change(screen.getByPlaceholderText("e.g. John Doe"), {
      target: { value: "Alice Smith" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("e.g. michael@globussoft.in"),
      { target: { value: "alice@example.com" } }
    );
    // Click Verify (which routes to formik.handleSubmit)
    fireEvent.click(screen.getByRole("button", { name: /Verify/i }));
    await waitFor(() => {
      expect(onAddRecipient).toHaveBeenCalled();
    });
    const [type, value, fullName] = onAddRecipient.mock.calls[0];
    expect(type).toBe("email");
    expect(value).toBe("alice@example.com");
    expect(fullName).toBe("Alice Smith");
  });
});
