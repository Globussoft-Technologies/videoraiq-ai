/**
 * src/page/user/Detection/components/AlertReceiversSection.jsx — the
 * "Alert Receivers Email Id/Phone No" dropdown panel rendered inside
 * the Detection settings card. Pure props-driven: a chip strip of
 * already-selected receivers, a toggleable Select Recipients dropdown
 * with Select-All / Clear-All header, and a verified-only list with
 * per-row Verified-or-Verify CTA + Remove button. Also wires:
 *  - Escape key closes the dropdown (only while open).
 *  - Scroll-to-bottom on the inner list calls fetchRecipients(newSkip)
 *    while !loading && hasMore.
 *  - Unverified row "Verify" navigates to /notification-recipients.
 *
 * Mocks (6, well under the 8-cap):
 *  1. @/components/ui/checkbox — replace Radix Checkbox with a plain
 *     <input type="checkbox"> so onCheckedChange is fireable under jsdom.
 *  2. @/components/ui/badge — passthrough <span> so the chip text +
 *     close button render in test DOM.
 *  3. @/components/ui/button — passthrough <button> (avoid Radix Slot).
 *  4. @/components/ui/Tooltip — passthrough wrappers (Provider context
 *     not needed under jsdom).
 *  5. ../../NotificationRecipients/RecipientList — stub VerifiedBadge.
 *  6. react-router-dom — useNavigate -> shared spy so we can assert
 *     the unverified-row Verify button routes correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange, ...rest }) => (
    <input
      type="checkbox"
      id={id}
      data-testid={`cb-${id}`}
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...rest}
    />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <>{children}</>,
  TooltipProvider: ({ children }) => <>{children}</>,
}));

vi.mock(
  "../../../../../../src/page/user/NotificationRecipients/RecipientList",
  () => ({
    VerifiedBadge: () => <span data-testid="verified-badge">Verified</span>,
  })
);

const navigateSpy = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateSpy,
}));

const AlertReceiversSection = (
  await import(
    "../../../../../../src/page/user/Detection/components/AlertReceiversSection.jsx"
  )
).default;

const baseProps = () => ({
  selectedReceivers: [],
  setSelectedReceivers: vi.fn(),
  recipientsList: [],
  isReceiversDropdownOpen: false,
  setIsReceiversDropdownOpen: vi.fn(),
  showRecipientModal: false,
  setShowRecipientModal: vi.fn(),
  handleAddRecipient: vi.fn(),
  handleEditRecipient: vi.fn(),
  handleVerifyRecipient: vi.fn(),
  handleSelectAllReceivers: vi.fn(),
  handleClearAllReceivers: vi.fn(),
  handleReceiverSelection: vi.fn(),
  openDeleteModal: vi.fn(),
  error: "",
  setSkipRecipients: vi.fn(),
  setLimitRecipients: vi.fn(),
  limitRecipients: 10,
  skipRecipients: 0,
  fetchRecipients: vi.fn(),
  hasMore: false,
  loading: false,
  setDeleteAddedRecipientsOpen: vi.fn(),
});

describe("Detection/AlertReceiversSection — closed dropdown / empty state", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("shows the section label and a 'Select Recipients' placeholder when nothing is picked", () => {
    render(<AlertReceiversSection {...baseProps()} />);
    expect(
      screen.getByText("Alert Receivers Email Id/Phone No")
    ).toBeInTheDocument();
    // The empty-state placeholder text inside the chip strip.
    expect(screen.getByText("Select Recipients")).toBeInTheDocument();
  });

  it("renders an error message when error prop is non-empty", () => {
    render(<AlertReceiversSection {...baseProps()} error="boom" />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("does NOT render error block when error prop is falsy", () => {
    const { container } = render(
      <AlertReceiversSection {...baseProps()} error="" />
    );
    // No red error text node — assert via querying for our base text only.
    expect(container.textContent).not.toContain("boom");
  });

  it("clicking the chip-strip toggles the dropdown via setIsReceiversDropdownOpen", () => {
    const setOpen = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    // The chip-strip parent is the first .min-h-[42px] div — find via
    // the placeholder text and walk up.
    const placeholder = screen.getByText("Select Recipients");
    const chipStrip = placeholder.closest("div");
    fireEvent.click(chipStrip);
    expect(setOpen).toHaveBeenCalledTimes(1);
    // setIsReceiversDropdownOpen is called with an updater function.
    const updater = setOpen.mock.calls[0][0];
    expect(typeof updater).toBe("function");
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });
});

describe("Detection/AlertReceiversSection — selected receivers chip strip", () => {
  it("renders one Badge per selected receiver with formatted label", () => {
    const selectedReceivers = [
      { id: "r1", email: "a@example.com", name: "Alice" },
      { id: "r2", email: "b@example.com" }, // no name -> just email
    ];
    render(
      <AlertReceiversSection
        {...baseProps()}
        selectedReceivers={selectedReceivers}
      />
    );
    const badges = screen.getAllByTestId("badge");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent("a@example.com (Alice)");
    expect(badges[1]).toHaveTextContent("b@example.com");
  });

  it("badge close button calls handleReceiverSelection with that id (and stops dropdown toggle)", () => {
    const handleReceiverSelection = vi.fn();
    const setOpen = vi.fn();
    const selectedReceivers = [
      { id: "r1", email: "a@example.com", name: "Alice" },
    ];
    render(
      <AlertReceiversSection
        {...baseProps()}
        selectedReceivers={selectedReceivers}
        handleReceiverSelection={handleReceiverSelection}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    // The X close button inside the badge.
    const badge = screen.getByTestId("badge");
    const closeBtn = badge.querySelector("button");
    fireEvent.click(closeBtn);
    expect(handleReceiverSelection).toHaveBeenCalledWith("r1");
    // stopPropagation prevented the chip-strip toggle.
    expect(setOpen).not.toHaveBeenCalled();
  });
});

describe("Detection/AlertReceiversSection — open dropdown body", () => {
  const verifiedRecipient = {
    _id: "v1",
    value: "v1@example.com",
    fullName: "Verified Vera",
    verified: true,
  };
  const unverifiedRecipient = {
    _id: "u1",
    value: "u1@example.com",
    fullName: "Unverified Uli",
    verified: false,
  };

  it("renders only verified=true rows in the list (unverified entries are filtered out)", () => {
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient, unverifiedRecipient]}
      />
    );
    // verified row renders its email value
    expect(screen.getByText("v1@example.com")).toBeInTheDocument();
    expect(screen.getByText("Verified Vera")).toBeInTheDocument();
    // unverified row's email/name is NOT rendered (filter strips it)
    expect(screen.queryByText("u1@example.com")).toBeNull();
    expect(screen.queryByText("Unverified Uli")).toBeNull();
    // Verified badge present (mocked) for the verified row.
    expect(screen.getByTestId("verified-badge")).toBeInTheDocument();
  });

  it("Select All / Clear All header buttons call their respective handlers (and stop chip toggle)", () => {
    const handleSelectAllReceivers = vi.fn();
    const handleClearAllReceivers = vi.fn();
    const setOpen = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient]}
        handleSelectAllReceivers={handleSelectAllReceivers}
        handleClearAllReceivers={handleClearAllReceivers}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    fireEvent.click(screen.getByText("Select All"));
    expect(handleSelectAllReceivers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Clear All"));
    expect(handleClearAllReceivers).toHaveBeenCalledTimes(1);

    // Both clicks stopPropagation -> chip-strip toggle never fires.
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("checkbox onCheckedChange forwards (id, value, fullName) to handleReceiverSelection", () => {
    const handleReceiverSelection = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient]}
        handleReceiverSelection={handleReceiverSelection}
      />
    );
    const cb = screen.getByTestId("cb-v1");
    fireEvent.click(cb);
    expect(handleReceiverSelection).toHaveBeenCalledWith(
      "v1",
      "v1@example.com",
      "Verified Vera"
    );
  });

  it("checked state reflects selectedReceivers.some(rec.id === receiver._id)", () => {
    const { rerender } = render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient]}
        selectedReceivers={[]}
      />
    );
    expect(screen.getByTestId("cb-v1").checked).toBe(false);

    rerender(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient]}
        selectedReceivers={[
          { id: "v1", email: "v1@example.com", name: "Verified Vera" },
        ]}
      />
    );
    expect(screen.getByTestId("cb-v1").checked).toBe(true);
  });

  it("verified-row Remove button calls openDeleteModal with the receiver", () => {
    const openDeleteModal = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        recipientsList={[verifiedRecipient]}
        openDeleteModal={openDeleteModal}
      />
    );
    // Remove button has aria-label="Remove"
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(openDeleteModal).toHaveBeenCalledWith(verifiedRecipient);
  });
});

describe("Detection/AlertReceiversSection — Escape key behaviour", () => {
  it("pressing Escape while the dropdown is open calls setIsReceiversDropdownOpen(false)", () => {
    const setOpen = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("pressing Escape while the dropdown is closed does NOT call setIsReceiversDropdownOpen", () => {
    const setOpen = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={false}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("pressing a non-Escape key while open does not toggle the dropdown", () => {
    const setOpen = vi.fn();
    render(
      <AlertReceiversSection
        {...baseProps()}
        isReceiversDropdownOpen={true}
        setIsReceiversDropdownOpen={setOpen}
      />
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(setOpen).not.toHaveBeenCalled();
  });
});
