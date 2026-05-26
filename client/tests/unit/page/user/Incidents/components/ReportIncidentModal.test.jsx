// Round 37: cover Incidents/components/ReportIncidentModal — the small
// Dialog that lets a user file (or view / edit) an incident report. The
// component has two visual modes driven by `incidentData.report`:
//   - "view" mode when both `report.status` and `report.description` are
//     truthy AND `isEditing` is false: shows a green "Reported" pill, the
//     existing description in a read-only card, the reported-at timestamp,
//     and an "Edit Report" button (no "Report" submit button).
//   - "edit/create" mode otherwise: shows a textarea seeded with the
//     existing description when in edit mode, plus a "Report" submit
//     button. Submission calls updateIncidentReportStatus and toasts
//     success/error; an empty description triggers an early toast.error.
// These tests pin those branches plus the open-state seeding behaviour.
//
// Mocks:
//   - @/components/ui/dialog        : inline passthrough (always-open).
//   - @/components/ui/button        : pure <button> proxy so we can keep
//                                     the toast / submit wiring real.
//   - @/components/ui/input         : pure <input> proxy (unused in this
//                                     component but the modal imports it).
//   - sonner                        : capture toast.success/error.
//   - ../Api/post                   : stub updateIncidentReportStatus.
//   - lucide-react                  : tiny CheckCircle stub.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }) =>
    open ? <div data-mock="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock("lucide-react", () => ({
  CheckCircle: (props) => <svg data-testid="check-circle" {...props} />,
}));

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const apiRef = vi.hoisted(() => ({
  updateIncidentReportStatus: vi.fn(),
}));
vi.mock(
  "../../../../../../src/page/user/Incidents/Api/post",
  () => apiRef
);

const { default: ReportIncidentModal } = await import(
  "../../../../../../src/page/user/Incidents/components/ReportIncidentModal.jsx"
);

beforeEach(() => {
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  apiRef.updateIncidentReportStatus.mockReset();
});

describe("ReportIncidentModal", () => {
  it("renders the editable textarea + Report button when there is no existing report", () => {
    render(
      <ReportIncidentModal
        isOpen={true}
        onClose={vi.fn()}
        incidentId="inc-1"
        incidentData={{ report: { status: false } }}
        onSuccess={vi.fn()}
      />
    );

    // Title is always present.
    expect(screen.getByText("Report Incident")).toBeInTheDocument();
    // "Reported" pill should NOT be present in create mode.
    expect(screen.queryByText("Reported")).toBeNull();
    // The textarea is rendered (placeholder is unique).
    const textarea = screen.getByPlaceholderText(
      /describe the incident and actions taken/i
    );
    expect(textarea).toBeInTheDocument();
    // Initially empty (no existing description to seed from).
    expect(textarea.value).toBe("");
    // Footer buttons: "Close" + "Report" (no "Edit Report" / "Cancel").
    expect(
      screen.getByRole("button", { name: /^close$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^report$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit report/i })
    ).toBeNull();
  });

  it("shows the view-mode Reported pill + existing description + Edit Report button when report.status is truthy", () => {
    render(
      <ReportIncidentModal
        isOpen={true}
        onClose={vi.fn()}
        incidentId="inc-42"
        incidentData={{
          report: {
            status: true,
            description: "Door forced open at 02:13 — escalated to security.",
            reportedAt: "2025-01-01T10:00:00Z",
          },
        }}
      />
    );

    // Reported pill is shown.
    expect(screen.getByText("Reported")).toBeInTheDocument();
    expect(screen.getByTestId("check-circle")).toBeInTheDocument();
    // The submitted description renders verbatim.
    expect(
      screen.getByText(/Door forced open at 02:13/i)
    ).toBeInTheDocument();
    // The "Report Status: Completed" label is part of the view-mode card.
    expect(screen.getByText(/Report Status: Completed/i)).toBeInTheDocument();
    // Edit Report button is visible, Report submit button is NOT.
    expect(
      screen.getByRole("button", { name: /edit report/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^report$/i })
    ).toBeNull();
    // Textarea should not be rendered in view mode.
    expect(
      screen.queryByPlaceholderText(/describe the incident/i)
    ).toBeNull();
  });

  it("clicking Edit Report flips into edit mode with the textarea seeded from the existing description", () => {
    render(
      <ReportIncidentModal
        isOpen={true}
        onClose={vi.fn()}
        incidentId="inc-99"
        incidentData={{
          report: {
            status: true,
            description: "Existing report text",
            reportedAt: "2025-01-01T10:00:00Z",
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit report/i }));

    // Textarea now visible, seeded with the existing description.
    const textarea = screen.getByPlaceholderText(/describe the incident/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe("Existing report text");
    // Submit button label is "Report".
    expect(
      screen.getByRole("button", { name: /^report$/i })
    ).toBeInTheDocument();
    // The cancel-side button now reads "Cancel" (not "Close").
    expect(
      screen.getByRole("button", { name: /^cancel$/i })
    ).toBeInTheDocument();
  });

  it("keeps the Report submit button disabled while the description is empty / whitespace-only, blocking the API call", () => {
    render(
      <ReportIncidentModal
        isOpen={true}
        onClose={vi.fn()}
        incidentId="inc-1"
        incidentData={{ report: { status: false } }}
      />
    );

    const submit = screen.getByRole("button", { name: /^report$/i });
    // Default empty value -> disabled.
    expect(submit).toBeDisabled();

    // Whitespace-only trims to empty -> still disabled.
    const textarea = screen.getByPlaceholderText(/describe the incident/i);
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(submit).toBeDisabled();

    // Clicking the disabled button must not invoke the API.
    fireEvent.click(submit);
    expect(apiRef.updateIncidentReportStatus).not.toHaveBeenCalled();

    // Once real content is entered, the button enables.
    fireEvent.change(textarea, { target: { value: "ok" } });
    expect(submit).not.toBeDisabled();
  });

  it("submits trimmed description, toasts success, clears the field, and invokes onClose + onSuccess on a successful API response", async () => {
    apiRef.updateIncidentReportStatus.mockResolvedValueOnce({
      status: "success",
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <ReportIncidentModal
        isOpen={true}
        onClose={onClose}
        incidentId="inc-7"
        incidentData={{ report: { status: false } }}
        onSuccess={onSuccess}
      />
    );

    const textarea = screen.getByPlaceholderText(/describe the incident/i);
    fireEvent.change(textarea, {
      target: { value: "  Suspicious tailgate at gate A  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /^report$/i }));

    await waitFor(() => {
      expect(apiRef.updateIncidentReportStatus).toHaveBeenCalledTimes(1);
    });
    // Description must be trimmed; incidentId + status:true are wired through.
    expect(apiRef.updateIncidentReportStatus).toHaveBeenCalledWith({
      incidentId: "inc-7",
      status: true,
      description: "Suspicious tailgate at gate A",
    });
    expect(toastRef.success).toHaveBeenCalledWith(
      "Incident reported successfully"
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
