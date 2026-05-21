/**
 * src/page/user/NotificationRecipients/VerificationModal.jsx — a portal-mounted
 * status dialog with three render modes:
 *   - isLoading=true        → spinner + statusMessage text
 *   - !isLoading && isSuccess → green "Verified Successfully" panel
 *   - !isLoading && !isSuccess → red "Verification Failed" panel
 *
 * Implementation uses ReactDOM.createPortal targeting document.body, so we
 * assert against the body subtree, not the wrapping render container.
 *
 * Mocks: 0 — the component is pure JSX + a brand SVG; Vite's default asset
 * handling resolves the import without intervention. lucide-react and
 * react-icons are real ESM and render as SVGs.
 */
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";

import { VerificationModal } from "../../../../../src/page/user/NotificationRecipients/VerificationModal.jsx";

describe("VerificationModal", () => {
  it("loading mode: shows the spinner and the supplied status message", () => {
    render(
      <VerificationModal
        isLoading={true}
        isSuccess={false}
        statusMessage="Sending OTP..."
      />
    );
    const body = within(document.body);
    expect(body.getByText("Sending OTP...")).toBeInTheDocument();
    // No success/failure headings in loading mode.
    expect(body.queryByText(/Verified Successfully/i)).not.toBeInTheDocument();
    expect(body.queryByText(/Verification Failed/i)).not.toBeInTheDocument();
    // A spinning svg sits inside the portal.
    const svgs = document.body.querySelectorAll("svg.animate-spin");
    expect(svgs.length).toBe(1);
  });

  it("success mode: renders the verified heading and thank-you blurb", () => {
    render(
      <VerificationModal isLoading={false} isSuccess={true} statusMessage="OK" />
    );
    const body = within(document.body);
    expect(body.getByText(/Verified Successfully/i)).toBeInTheDocument();
    expect(body.getByText(/Thank you!/i)).toBeInTheDocument();
    expect(body.getByText(/all set to continue/i)).toBeInTheDocument();
  });

  it("failure mode: renders the failed heading and the provided error", () => {
    render(
      <VerificationModal
        isLoading={false}
        isSuccess={false}
        statusMessage="That number isn't registered."
      />
    );
    const body = within(document.body);
    expect(body.getByText(/Verification Failed/i)).toBeInTheDocument();
    expect(
      body.getByText("That number isn't registered.")
    ).toBeInTheDocument();
  });

  it("failure mode without statusMessage: falls back to the default copy", () => {
    render(<VerificationModal isLoading={false} isSuccess={false} />);
    const body = within(document.body);
    expect(body.getByText(/Verification Failed/i)).toBeInTheDocument();
    expect(
      body.getByText(/There seems to be an issue\. Please check and try again\./i)
    ).toBeInTheDocument();
  });

  it("mounts the dialog into document.body via portal (not inside the render container)", () => {
    const { container } = render(
      <VerificationModal isLoading={true} isSuccess={false} statusMessage="" />
    );
    // The container is the wrapper React created — it should be empty
    // because the modal lives elsewhere on document.body.
    expect(container.firstChild).toBeNull();
    // But the portal target is populated.
    expect(document.body.querySelector(".fixed.inset-0")).not.toBeNull();
  });

  it("includes the VideoraIQ brand logo with descriptive alt text", () => {
    render(
      <VerificationModal isLoading={false} isSuccess={true} statusMessage="" />
    );
    const img = document.body.querySelector("img[alt='VideoraIQ Logo']");
    expect(img).not.toBeNull();
    // Vite resolves the asset import to a URL — just confirm src is non-empty.
    expect(img.getAttribute("src")).toBeTruthy();
  });
});
